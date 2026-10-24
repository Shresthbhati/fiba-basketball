import { and, asc, eq, inArray, or } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { competitionRosters, competitions, filmGames, filmSyncPoints, matchEvents, matches, teams, users } from "../db/schema.js";
import { AuthError } from "../identity/service.js";
import { POINTS, type EventType } from "../match/event-type.js";
import { findGame } from "./service.js";

type Event = typeof matchEvents.$inferSelect;

/** Where an event falls in the video, given one known pairing of an event time with a video position. Real time passes 1:1 from that point. */
export const MAX_SYNC_POINTS = 20;

export const videoMsOf = (eventAt: Date, anchorAt: Date, anchorVideoMs: number) => anchorVideoMs + (eventAt.getTime() - anchorAt.getTime());

export async function matchesOfTeam(db: Db, teamId: string) {
  const rows = await db.select().from(matches)
    .where(or(eq(matches.homeTeamId, teamId), eq(matches.awayTeamId, teamId)))
    .orderBy(asc(matches.scheduledAt), asc(matches.round));
  const ids = new Set(rows.flatMap((m) => [m.homeTeamId, m.awayTeamId]).filter((x): x is string => !!x));
  const names = new Map(ids.size === 0 ? [] : (await db.select({ id: teams.id, name: teams.name }).from(teams).where(inArray(teams.id, [...ids]))).map((t) => [t.id, t.name]));
  const compIds = [...new Set(rows.map((m) => m.competitionId))];
  const comps = new Map(compIds.length === 0 ? [] : (await db.select({ id: competitions.id, name: competitions.name }).from(competitions).where(inArray(competitions.id, compIds))).map((c) => [c.id, c.name]));
  return rows.filter((m) => !m.isBye && m.homeTeamId && m.awayTeamId).map((m) => ({
    id: m.id, competition: comps.get(m.competitionId) ?? "", state: m.state, scheduledAt: m.scheduledAt,
    home: names.get(m.homeTeamId!) ?? "", away: names.get(m.awayTeamId!) ?? "", homeScore: m.homeScore, awayScore: m.awayScore,
  }));
}

export async function linkMatch(db: Db, gameId: string, matchId: string) {
  const g = await findGame(db, gameId);
  if (!g) throw new AuthError(404, "Not Found");
  const [m] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!m || (m.homeTeamId !== g.teamId && m.awayTeamId !== g.teamId)) throw new AuthError(409, "Choose a match your team played in");
  await db.delete(filmSyncPoints).where(eq(filmSyncPoints.gameId, gameId)); // points belong to the old match
  await db.update(filmGames).set({ matchId }).where(eq(filmGames.id, gameId));
}

export async function unlinkMatch(db: Db, gameId: string) {
  await db.delete(filmSyncPoints).where(eq(filmSyncPoints.gameId, gameId));
  await db.update(filmGames).set({ matchId: null }).where(eq(filmGames.id, gameId));
}

export async function setSync(db: Db, gameId: string, eventId: string, videoMs: number) {
  const g = await findGame(db, gameId);
  if (!g || !g.matchId) throw new AuthError(409, "Link the film to a match first");
  const [e] = await db.select().from(matchEvents).where(and(eq(matchEvents.id, eventId), eq(matchEvents.matchId, g.matchId)));
  if (!e || e.type === "CORRECTION") throw new AuthError(409, "Choose an event from this match");
  if (!e.occurredAt) throw new AuthError(409, "That event has no recorded time, so it can't be used to line up the video");
  const existing = await db.select({ eventId: filmSyncPoints.eventId }).from(filmSyncPoints).where(eq(filmSyncPoints.gameId, gameId));
  if (existing.length >= MAX_SYNC_POINTS && !existing.some((p) => p.eventId === eventId)) throw new AuthError(409, `At most ${MAX_SYNC_POINTS} sync points`);
  await db.insert(filmSyncPoints).values({ gameId, eventId, videoMs })
    .onConflictDoUpdate({ target: [filmSyncPoints.gameId, filmSyncPoints.eventId], set: { videoMs } });
}

export async function removeSync(db: Db, gameId: string, eventId: string) {
  const gone = await db.delete(filmSyncPoints).where(and(eq(filmSyncPoints.gameId, gameId), eq(filmSyncPoints.eventId, eventId))).returning({ e: filmSyncPoints.eventId });
  if (gone.length === 0) throw new AuthError(404, "Not Found");
}

/**
 * The match's events as a timeline. Needs a linked match; video positions are filled in once a sync point is set.
 * Only events that carry a recorded time can be placed. Corrected events and the corrections themselves are left out.
 * Jersey numbers are shown for everyone on the film's team; names only for the film team's own side.
 */
export async function timeline(db: Db, gameId: string) {
  const g = await findGame(db, gameId);
  if (!g) throw new AuthError(404, "Not Found");
  if (!g.matchId) return { linked: false as const };
  const [m] = await db.select().from(matches).where(eq(matches.id, g.matchId));
  if (!m) return { linked: false as const };
  const ours: "home" | "away" = m.homeTeamId === g.teamId ? "home" : "away";
  const all: Event[] = await db.select().from(matchEvents).where(eq(matchEvents.matchId, m.id)).orderBy(asc(matchEvents.serverSeq));
  const voided = new Set(all.filter((e) => e.type === "CORRECTION" && e.correctsEventId).map((e) => e.correctsEventId!));
  const live = all.filter((e) => e.type !== "CORRECTION" && !voided.has(e.id));

  const roster = await db.select().from(competitionRosters).where(eq(competitionRosters.competitionId, m.competitionId));
  const jersey = new Map(roster.map((r) => [r.userId, r.jersey]));
  const ownIds = new Set(roster.filter((r) => r.teamId === g.teamId).map((r) => r.userId));
  const names = new Map(ownIds.size === 0 ? [] : (await db.select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, [...ownIds]))).map((u) => [u.id, u.name]));

  // Each event is placed from the sync point nearest to it in time, so a pause or cut in the video only skews what is near it.
  const byId = new Map(all.map((e) => [e.id, e]));
  const points = (await db.select().from(filmSyncPoints).where(eq(filmSyncPoints.gameId, gameId)))
    .flatMap((p) => { const at = byId.get(p.eventId)?.occurredAt; return at ? [{ eventId: p.eventId, videoMs: p.videoMs, at }] : []; });
  const synced = points.length > 0;
  const nearest = (t: Date) => points.reduce((best, p) => (Math.abs(p.at.getTime() - t.getTime()) < Math.abs(best.at.getTime() - t.getTime()) ? p : best));
  let home = 0, away = 0;
  const items = [];
  let untimed = 0;
  for (const e of live) {
    const pts = POINTS[e.type as EventType];
    if (pts && e.side === "home") home += pts;
    if (pts && e.side === "away") away += pts;
    if (!e.occurredAt) { untimed++; continue; }
    const a = synced ? nearest(e.occurredAt) : null;
    const videoMs = a ? videoMsOf(e.occurredAt, a.at, a.videoMs) : null;
    items.push({
      id: e.id, type: e.type, side: e.side, period: e.period, videoMs: videoMs !== null && videoMs >= 0 ? videoMs : null,
      playerId: e.playerId ?? null,
      jersey: e.playerId ? (jersey.get(e.playerId) ?? null) : null,
      ...(e.playerId && e.side === ours && names.get(e.playerId) ? { playerName: names.get(e.playerId) } : {}),
      homeScore: home, awayScore: away,
    });
  }
  return { linked: true as const, synced, ours, items, untimed, syncPoints: points.map((p) => ({ eventId: p.eventId, videoMs: p.videoMs })) };
}
