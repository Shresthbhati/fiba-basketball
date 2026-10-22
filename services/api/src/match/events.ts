import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { matchEvents, matches } from "../db/schema.js";
import { AuthError } from "../identity/service.js";
import type { MatchBus } from "./bus.js";
import { EventType, NEEDS_SIDE } from "./event-type.js";
import { project, type ScoreState, type ScoredEvent } from "./projection.js";

type Row = typeof matchEvents.$inferSelect;

export const eventInput = z.object({
  id: z.uuid(),
  localSeq: z.number().int().min(0),
  type: z.enum(EventType),
  side: z.enum(["home", "away"]).optional(),
  period: z.number().int().min(1).max(10),
  clockSeconds: z.number().int().min(0).max(3600).optional(),
  correctsEventId: z.uuid().optional(),
});
export const batchInput = z.object({
  baseVersion: z.number().int().min(0).optional(),
  events: z.array(eventInput).min(1).max(100),
});
export type BatchInput = z.infer<typeof batchInput>;

const tx = <T>(db: Db, fn: (t: Db) => Promise<T>) =>
  (db as unknown as { transaction: (f: (t: unknown) => Promise<T>) => Promise<T> }).transaction((t) => fn(t as Db));

const toScored = (r: Row): ScoredEvent => ({
  id: r.id, serverSeq: r.serverSeq, type: r.type as EventType, side: r.side as ScoredEvent["side"], period: r.period, correctsEventId: r.correctsEventId,
});
const publicEvent = (r: Row) => ({
  id: r.id, serverSeq: r.serverSeq, localSeq: r.localSeq, type: r.type, side: r.side, period: r.period,
  clockSeconds: r.clockSeconds, correctsEventId: r.correctsEventId, createdAt: r.createdAt,
});

export class ConflictError extends AuthError {
  constructor(public body: { currentVersion: number; state: ScoreState; newerEvents: ReturnType<typeof publicEvent>[] }) {
    super(409, "Another scorer changed this match since your last sync");
  }
}

export async function matchEventsOf(db: Db, matchId: string) {
  return db.select().from(matchEvents).where(eq(matchEvents.matchId, matchId)).orderBy(asc(matchEvents.serverSeq));
}

export async function matchState(db: Db, matchId: string) {
  const rows = await matchEventsOf(db, matchId);
  return project(rows.map(toScored));
}

export async function listEvents(db: Db, matchId: string, afterVersion = 0) {
  const rows = await db.select().from(matchEvents)
    .where(and(eq(matchEvents.matchId, matchId), gt(matchEvents.serverSeq, afterVersion))).orderBy(asc(matchEvents.serverSeq));
  return rows.map(publicEvent);
}

/**
 * Accepts a batch from a scorer's device. Safe to retry: events already stored (same client id) are skipped.
 * If `baseVersion` is older than events another scorer added, nothing is written and a 409 carries
 * what changed so the client can reconcile and resend.
 */
export async function submitEvents(db: Db, bus: MatchBus, matchId: string, userId: string, batch: BatchInput) {
  const result = await tx(db, async (t) => {
    const [m] = await t.select().from(matches).where(eq(matches.id, matchId)).for("update");
    if (!m) throw new AuthError(404, "Not Found");
    if (m.isBye || !m.homeTeamId || !m.awayTeamId) throw new AuthError(409, "Both teams must be known first");
    if (m.state === "FINISHED" || m.state === "LOCKED") throw new AuthError(409, "Match is finished; scoring is closed");

    const existing = await matchEventsOf(t, matchId);
    const known = new Map(existing.map((e) => [e.id, e]));
    const fresh = batch.events.filter((e) => !known.has(e.id));
    const version = existing.at(-1)?.serverSeq ?? 0;

    if (batch.baseVersion !== undefined && fresh.length > 0) {
      const newer = existing.filter((e) => e.serverSeq > batch.baseVersion! && e.createdBy !== userId);
      if (newer.length > 0) {
        throw new ConflictError({ currentVersion: version, state: project(existing.map(toScored)), newerEvents: newer.map(publicEvent) });
      }
    }

    let seq = version;
    const live = new Map(known);
    const toInsert: (typeof matchEvents.$inferInsert)[] = [];
    for (const e of fresh) {
      if (NEEDS_SIDE.has(e.type) && !e.side) throw new AuthError(422, `${e.type} needs a side`);
      if (e.type === "CORRECTION") {
        const target = e.correctsEventId ? live.get(e.correctsEventId) : undefined;
        if (!target) throw new AuthError(422, "CORRECTION must point at an event in this match");
        if (target.type === "CORRECTION") throw new AuthError(422, "A correction cannot be corrected");
        const alreadyVoided = [...live.values()].some((x) => x.type === "CORRECTION" && x.correctsEventId === target.id);
        if (alreadyVoided) throw new AuthError(422, "That event was already corrected");
      } else if (e.correctsEventId) {
        throw new AuthError(422, "Only CORRECTION events can reference another event");
      }
      const row = {
        id: e.id, matchId, serverSeq: ++seq, localSeq: e.localSeq, type: e.type, side: e.side ?? null, period: e.period,
        clockSeconds: e.clockSeconds ?? null, correctsEventId: e.correctsEventId ?? null, createdBy: userId,
      };
      toInsert.push(row);
      live.set(row.id, { ...row, createdAt: new Date() } as Row);
    }
    if (toInsert.length > 0) {
      await t.insert(matchEvents).values(toInsert);
      if (m.state === "SCHEDULED") await t.update(matches).set({ state: "LIVE" }).where(eq(matches.id, matchId));
    }
    const state = project([...live.values()].map(toScored));
    return { version: state.version, accepted: toInsert.length, duplicates: batch.events.length - fresh.length, state };
  });
  if (result.accepted > 0) bus.publish(matchId, "match.state.updated", result.version, result.state);
  return result;
}

export async function eventsByIds(db: Db, ids: string[]) {
  return ids.length === 0 ? [] : db.select().from(matchEvents).where(inArray(matchEvents.id, ids));
}
