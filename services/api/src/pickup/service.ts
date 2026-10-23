import { and, asc, between, eq, gte, ne, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { courts, pickupGames, pickupParticipants, users } from "../db/schema.js";
import { MAX_RESULTS, boundingBox, haversineMeters, roundDistance } from "../geo/distance.js";
import { AuthError } from "../identity/service.js";
import { CHECK_IN_EARLY_MS, phaseOf, type StoredStatus } from "./phase.js";
import { notify } from "../notifications/service.js";
import { hiddenUserIds, isBlockedEitherWay } from "../trust/service.js";

type Game = typeof pickupGames.$inferSelect;
const tx = <T>(db: Db, fn: (t: Db) => Promise<T>) =>
  (db as unknown as { transaction: (f: (t: unknown) => Promise<T>) => Promise<T> }).transaction((t) => fn(t as Db));

async function confirmedCount(db: Db, gameId: string) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(pickupParticipants)
    .where(and(eq(pickupParticipants.gameId, gameId), eq(pickupParticipants.status, "CONFIRMED")));
  return r?.n ?? 0;
}

const summary = (g: Game, n: number, now: Date) => ({
  id: g.id, title: g.title, courtId: g.courtId, startsAt: g.startsAt, endsAt: g.endsAt, capacity: g.capacity,
  skillBand: g.skillBand, confirmedCount: n, spotsLeft: Math.max(0, g.capacity - n),
  phase: phaseOf({ ...g, status: g.status as StoredStatus }, n, now), hostConfirmedAt: g.hostConfirmedAt, seriesId: g.seriesId,
});

export type NewGame = { courtId: string; title: string; startsAt: Date; endsAt: Date; capacity: number; skillBand?: string | undefined };

export async function createGame(db: Db, hostId: string, input: NewGame, now = new Date()) {
  if (input.startsAt <= now) throw new AuthError(400, "Game must start in the future");
  const hours = (input.endsAt.getTime() - input.startsAt.getTime()) / 3_600_000;
  if (hours <= 0 || hours > 6) throw new AuthError(400, "Game must last between 0 and 6 hours");
  const [court] = await db.select({ id: courts.id }).from(courts).where(eq(courts.id, input.courtId));
  if (!court) throw new AuthError(404, "Court not found");
  return tx(db, async (t) => {
    const [g] = await t.insert(pickupGames).values({
      hostId, courtId: input.courtId, title: input.title, startsAt: input.startsAt, endsAt: input.endsAt,
      capacity: input.capacity, skillBand: input.skillBand ?? null,
    }).returning();
    await t.insert(pickupParticipants).values({ gameId: g!.id, userId: hostId, status: "CONFIRMED" });
    return summary(g!, 1, now);
  });
}

export async function searchGames(
  db: Db,
  q: { lat: number; lng: number; radiusM: number; from?: Date | undefined; to?: Date | undefined },
  now = new Date(),
) {
  const box = boundingBox(q, q.radiusM);
  const rows = await db
    .select({ g: pickupGames, c: courts })
    .from(pickupGames)
    .innerJoin(courts, eq(courts.id, pickupGames.courtId))
    .where(and(
      between(courts.lat, box.minLat, box.maxLat),
      between(courts.lng, box.minLng, box.maxLng),
      ne(pickupGames.status, "CANCELLED"),
      gte(pickupGames.endsAt, q.from && q.from > now ? q.from : now), // only games not yet over
      q.to ? sql`${pickupGames.startsAt} <= ${q.to}` : undefined,
    ));
  const out = [];
  for (const { g, c } of rows) {
    const d = haversineMeters(q, c);
    if (d > q.radiusM) continue;
    out.push({ d, item: { ...summary(g, await confirmedCount(db, g.id), now), courtName: c.name, distanceM: roundDistance(d) } });
  }
  return out.sort((a, b) => a.item.startsAt.getTime() - b.item.startsAt.getTime()).slice(0, MAX_RESULTS).map((x) => x.item);
}

async function loadGame(db: Db, id: string) {
  const [g] = await db.select().from(pickupGames).where(eq(pickupGames.id, id));
  if (!g) throw new AuthError(404, "Not Found");
  return g;
}

export async function getGame(db: Db, id: string, viewerId: string | null, now = new Date()) {
  const g = await loadGame(db, id);
  const [host] = await db.select({ name: users.displayName }).from(users).where(eq(users.id, g.hostId));
  const roster = await db
    .select({ userId: pickupParticipants.userId, name: users.displayName, status: pickupParticipants.status, checkedInAt: pickupParticipants.checkedInAt })
    .from(pickupParticipants)
    .innerJoin(users, eq(users.id, pickupParticipants.userId))
    .where(eq(pickupParticipants.gameId, id))
    .orderBy(asc(pickupParticipants.joinedAt));
  const mine = roster.find((r) => r.userId === viewerId);
  const hidden = viewerId ? await hiddenUserIds(db, viewerId) : new Set<string>();
  const confirmed = roster.filter((r) => r.status === "CONFIRMED").length;
  return {
    ...summary(g, confirmed, now),
    hostName: host?.name ?? null,
    checkInCount: roster.filter((r) => r.checkedInAt !== null).length,
    waitlistCount: roster.filter((r) => r.status === "WAITLIST").length,
    myStatus: mine?.status ?? null,
    isHost: g.hostId === viewerId,
    // Names are only visible to people who are in the game.
    participants: mine && mine.status !== "CANCELLED"
      ? roster.filter((r) => r.status !== "CANCELLED" && !hidden.has(r.userId)).map((r) => ({ name: r.name, status: r.status, checkedIn: r.checkedInAt !== null }))
      : undefined,
  };
}

export async function rsvp(db: Db, gameId: string, userId: string, now = new Date()) {
  return tx(db, async (t) => {
    const [g] = await t.select().from(pickupGames).where(eq(pickupGames.id, gameId)).for("update");
    if (!g) throw new AuthError(404, "Not Found");
    if (g.status !== "OPEN" || now > g.endsAt) throw new AuthError(409, "Game is not open for RSVPs");
    // A block between the host and this user reads as "no such game" so the block is not revealed.
    if (await isBlockedEitherWay(t as unknown as Db, userId, g.hostId)) throw new AuthError(404, "Not Found");
    const [existing] = await t.select().from(pickupParticipants)
      .where(and(eq(pickupParticipants.gameId, gameId), eq(pickupParticipants.userId, userId)));
    if (existing && existing.status !== "CANCELLED") return { status: existing.status };
    const status = (await confirmedCount(t, gameId)) < g.capacity ? "CONFIRMED" : "WAITLIST";
    if (existing) {
      await t.update(pickupParticipants).set({ status, joinedAt: now, checkedInAt: null })
        .where(and(eq(pickupParticipants.gameId, gameId), eq(pickupParticipants.userId, userId)));
    } else {
      await t.insert(pickupParticipants).values({ gameId, userId, status, joinedAt: now });
    }
    return { status };
  });
}

export async function cancelRsvp(db: Db, gameId: string, userId: string) {
  let promoted: { userId: string; game: Game } | null = null;
  const result = await tx(db, async (t) => {
    const [g] = await t.select().from(pickupGames).where(eq(pickupGames.id, gameId)).for("update");
    if (!g) throw new AuthError(404, "Not Found");
    if (g.hostId === userId) throw new AuthError(409, "Hosts must cancel the game instead");
    const [p] = await t.select().from(pickupParticipants)
      .where(and(eq(pickupParticipants.gameId, gameId), eq(pickupParticipants.userId, userId)));
    if (!p || p.status === "CANCELLED") return { status: "CANCELLED" as const };
    await t.update(pickupParticipants).set({ status: "CANCELLED" })
      .where(and(eq(pickupParticipants.gameId, gameId), eq(pickupParticipants.userId, userId)));
    if (p.status === "CONFIRMED") {
      const [next] = await t.select().from(pickupParticipants)
        .where(and(eq(pickupParticipants.gameId, gameId), eq(pickupParticipants.status, "WAITLIST")))
        .orderBy(asc(pickupParticipants.joinedAt)).limit(1);
      if (next) {
        await t.update(pickupParticipants).set({ status: "CONFIRMED" })
          .where(and(eq(pickupParticipants.gameId, gameId), eq(pickupParticipants.userId, next.userId)));
        promoted = { userId: next.userId, game: g };
      }
    }
    return { status: "CANCELLED" as const };
  });
  // After the transaction commits, so a notification problem can never undo the promotion.
  const p = promoted as { userId: string; game: Game } | null;
  if (p) await notify(db, [p.userId], { kind: "WAITLIST_PROMOTED", title: `You're in: a spot opened up in "${p.game.title}"`, link: `/pickup/${p.game.id}`, data: { startsAt: p.game.startsAt.toISOString() } });
  return result;
}

export async function checkIn(db: Db, gameId: string, userId: string, now = new Date()) {
  const g = await loadGame(db, gameId);
  if (g.status !== "OPEN") throw new AuthError(409, "Game is not active");
  if (now.getTime() < g.startsAt.getTime() - CHECK_IN_EARLY_MS || now > g.endsAt) {
    throw new AuthError(409, "Check-in is only open from 30 minutes before start until the game ends");
  }
  const [p] = await db.select().from(pickupParticipants)
    .where(and(eq(pickupParticipants.gameId, gameId), eq(pickupParticipants.userId, userId)));
  if (!p || p.status !== "CONFIRMED") throw new AuthError(403, "Only confirmed players can check in");
  if (p.checkedInAt) return { checkedInAt: p.checkedInAt };
  await db.update(pickupParticipants).set({ checkedInAt: now })
    .where(and(eq(pickupParticipants.gameId, gameId), eq(pickupParticipants.userId, userId)));
  return { checkedInAt: now };
}

async function hostOnly(db: Db, gameId: string, userId: string) {
  const g = await loadGame(db, gameId);
  if (g.hostId !== userId) throw new AuthError(404, "Not Found");
  return g;
}

export async function cancelGame(db: Db, gameId: string, hostId: string) {
  const g = await hostOnly(db, gameId, hostId);
  if (g.status === "COMPLETED") throw new AuthError(409, "Game already completed");
  await db.update(pickupGames).set({ status: "CANCELLED" }).where(eq(pickupGames.id, gameId));
  await notifyGameCancelled(db, g);
}

/** Tells everyone who was in (or waiting for) a game that it is cancelled. The host already knows, so is left out. */
export async function notifyGameCancelled(db: Db, g: { id: string; title: string; hostId: string; startsAt: Date }) {
  const people = await db.select({ userId: pickupParticipants.userId }).from(pickupParticipants)
    .where(and(eq(pickupParticipants.gameId, g.id), ne(pickupParticipants.status, "CANCELLED")));
  await notify(db, people.map((p) => p.userId).filter((id) => id !== g.hostId), {
    kind: "GAME_CANCELLED", title: `Cancelled: "${g.title}"`, link: `/pickup/${g.id}`, data: { startsAt: g.startsAt.toISOString() },
  });
}

/** Only an explicit host confirmation completes a game — never the clock. */
export async function confirmComplete(db: Db, gameId: string, hostId: string, now = new Date()) {
  const g = await hostOnly(db, gameId, hostId);
  if (g.status !== "OPEN") throw new AuthError(409, "Game is not active");
  if (now < g.startsAt) throw new AuthError(409, "Game has not started");
  await db.update(pickupGames).set({ status: "COMPLETED", hostConfirmedAt: now }).where(eq(pickupGames.id, gameId));
  return getGame(db, gameId, hostId, now);
}
