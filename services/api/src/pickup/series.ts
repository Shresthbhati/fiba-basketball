import { and, eq, gt, inArray } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { courts, pickupGames, pickupParticipants, pickupSeries } from "../db/schema.js";
import { notifyGameCancelled } from "./service.js";
import { AuthError } from "../identity/service.js";

export const HORIZON_DAYS = 28;
const DAY_MS = 86_400_000;

type Series = typeof pickupSeries.$inferSelect;
const tx = <T>(db: Db, fn: (t: Db) => Promise<T>) =>
  (db as unknown as { transaction: (f: (t: unknown) => Promise<T>) => Promise<T> }).transaction((t) => fn(t as Db));

export function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const wallFields = (instant: Date, tz: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(instant).map((p) => [p.type, Number(p.value)]),
  ) as Record<string, number>;
  return Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
};

/**
 * The UTC instant at which the wall clock in `tz` reads `y-m-d hh:mm`. Handles daylight-saving offsets; a local time that
 * does not exist (spring-forward gap) lands on the instant just after the gap, and an ambiguous one (fall-back) picks the first.
 */
export function zonedTimeToUtc(y: number, m: number, d: number, hh: number, mm: number, tz: string): Date {
  const target = Date.UTC(y, m - 1, d, hh, mm);
  let guess = target;
  for (let i = 0; i < 3; i++) guess = target - (wallFields(new Date(guess), tz) - guess);
  return new Date(guess);
}

/** Start instants of the series within the next `days` days that are still in the future. */
export function occurrences(s: Pick<Series, "weekday" | "startTime" | "timezone">, now: Date, days = HORIZON_DAYS): Date[] {
  const [hh, mm] = s.startTime.split(":").map(Number) as [number, number];
  const today = wallFields(now, s.timezone);
  const startOfToday = today - (today % DAY_MS);
  const out: Date[] = [];
  for (let i = 0; i <= days; i++) {
    const day = new Date(startOfToday + i * DAY_MS);
    if (day.getUTCDay() !== s.weekday) continue;
    const at = zonedTimeToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hh, mm, s.timezone);
    if (at > now && at.getTime() <= now.getTime() + days * DAY_MS) out.push(at);
  }
  return out;
}

export type NewSeries = {
  courtId: string; title: string; weekday: number; startTime: string; durationMin: number;
  timezone: string; capacity: number; skillBand?: string | undefined;
};

export async function createSeries(db: Db, hostId: string, input: NewSeries, now = new Date()) {
  if (!validTimezone(input.timezone)) throw new AuthError(400, "Unknown time zone");
  const [court] = await db.select({ id: courts.id }).from(courts).where(eq(courts.id, input.courtId));
  if (!court) throw new AuthError(404, "Court not found");
  const [s] = await db.insert(pickupSeries).values({
    hostId, courtId: input.courtId, title: input.title, weekday: input.weekday, startTime: input.startTime,
    durationMin: input.durationMin, timezone: input.timezone, capacity: input.capacity, skillBand: input.skillBand ?? null,
  }).returning();
  const created = await materialize(db, s!, now);
  return { ...seriesView(s!), createdGames: created };
}

const seriesView = (s: Series) => ({
  id: s.id, courtId: s.courtId, title: s.title, weekday: s.weekday, startTime: s.startTime, durationMin: s.durationMin,
  timezone: s.timezone, capacity: s.capacity, skillBand: s.skillBand, active: s.active,
});

/** Creates any missing games for the coming weeks. Safe to run repeatedly: (series, start time) is unique. */
export async function materialize(db: Db, s: Series, now = new Date()): Promise<number> {
  if (!s.active) return 0;
  let created = 0;
  for (const startsAt of occurrences(s, now)) {
    const endsAt = new Date(startsAt.getTime() + s.durationMin * 60_000);
    created += await tx(db, async (t) => {
      const [g] = await t.insert(pickupGames).values({
        hostId: s.hostId, courtId: s.courtId, title: s.title, startsAt, endsAt, capacity: s.capacity, skillBand: s.skillBand, seriesId: s.id,
      }).onConflictDoNothing().returning();
      if (!g) return 0;
      await t.insert(pickupParticipants).values({ gameId: g.id, userId: s.hostId, status: "CONFIRMED" });
      return 1;
    });
  }
  return created;
}

export async function materializeAll(db: Db, now = new Date()): Promise<number> {
  let total = 0;
  for (const s of await db.select().from(pickupSeries).where(eq(pickupSeries.active, true))) total += await materialize(db, s, now);
  return total;
}

export async function mySeries(db: Db, hostId: string) {
  return (await db.select().from(pickupSeries).where(and(eq(pickupSeries.hostId, hostId), eq(pickupSeries.active, true)))).map(seriesView);
}

/** Stops the series and cancels every future game that has not started. Games already played are untouched. */
export async function cancelSeries(db: Db, seriesId: string, hostId: string, now = new Date()) {
  const [s] = await db.select().from(pickupSeries).where(eq(pickupSeries.id, seriesId));
  if (!s || s.hostId !== hostId) throw new AuthError(404, "Not Found");
  await db.update(pickupSeries).set({ active: false }).where(eq(pickupSeries.id, seriesId));
  const upcoming = await db.select().from(pickupGames)
    .where(and(eq(pickupGames.seriesId, seriesId), eq(pickupGames.status, "OPEN"), gt(pickupGames.startsAt, now)));
  if (upcoming.length > 0) {
    await db.update(pickupGames).set({ status: "CANCELLED" }).where(inArray(pickupGames.id, upcoming.map((g) => g.id)));
    for (const g of upcoming) await notifyGameCancelled(db, g);
  }
  return { cancelledGames: upcoming.length };
}
