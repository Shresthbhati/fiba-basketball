import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { competitions, matchEvents, matches, teams } from "../db/schema.js";
import { boxScore, type Line, type StatEvent } from "../match/box-score.js";

const blank = (): Line => ({ points: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, rebounds: 0, assists: 0, turnovers: 0, fouls: 0 });
const addLine = (a: Line, b: Line) => { for (const k of Object.keys(a) as (keyof Line)[]) a[k] += b[k]; };

/**
 * A player's own record, built from official results only (matches that are FINISHED or LOCKED). Corrected events are ignored,
 * as in the box score. A game counts if at least one event was credited to the player. Private: only the player gets this.
 */
export async function myCareer(db: Db, userId: string) {
  const credited = await db.select({ matchId: matchEvents.matchId }).from(matchEvents).where(eq(matchEvents.playerId, userId));
  const matchIds = [...new Set(credited.map((c) => c.matchId))];
  if (matchIds.length === 0) return { games: 0, totals: blank(), perGame: null, competitions: [] };

  const official = await db.select().from(matches).where(and(inArray(matches.id, matchIds), inArray(matches.state, ["FINISHED", "LOCKED"])));
  const compIds = [...new Set(official.map((m) => m.competitionId))];
  const compNames = new Map(compIds.length === 0 ? [] : (await db.select({ id: competitions.id, name: competitions.name }).from(competitions).where(inArray(competitions.id, compIds))).map((c) => [c.id, c.name]));
  const teamIds = [...new Set(official.flatMap((m) => [m.homeTeamId, m.awayTeamId]).filter((x): x is string => !!x))];
  const teamNames = new Map(teamIds.length === 0 ? [] : (await db.select({ id: teams.id, name: teams.name }).from(teams).where(inArray(teams.id, teamIds))).map((t) => [t.id, t.name]));

  const perComp = new Map<string, { name: string; games: number; totals: Line; recent: { matchId: string; opponent: string; scheduledAt: Date | null; line: Line }[] }>();
  for (const m of official) {
    const events = await db.select().from(matchEvents).where(eq(matchEvents.matchId, m.id)).orderBy(asc(matchEvents.serverSeq));
    const stats = boxScore(events.map((e): StatEvent => ({ id: e.id, type: e.type as never, side: e.side as never, playerId: e.playerId, correctsEventId: e.correctsEventId })));
    const mine = stats.players.get(userId);
    if (!mine) continue; // every credited event was later corrected
    const opponentId = mine.side === "home" ? m.awayTeamId : m.homeTeamId;
    const c = perComp.get(m.competitionId) ?? { name: compNames.get(m.competitionId) ?? "", games: 0, totals: blank(), recent: [] };
    c.games++;
    addLine(c.totals, mine.line);
    c.recent.push({ matchId: m.id, opponent: opponentId ? (teamNames.get(opponentId) ?? "") : "", scheduledAt: m.scheduledAt, line: mine.line });
    perComp.set(m.competitionId, c);
  }

  const totals = blank();
  let games = 0;
  for (const c of perComp.values()) { games += c.games; addLine(totals, c.totals); }
  const avg = (n: number) => Math.round((n / games) * 10) / 10;
  return {
    games, totals,
    perGame: games === 0 ? null : { points: avg(totals.points), rebounds: avg(totals.rebounds), assists: avg(totals.assists), turnovers: avg(totals.turnovers), fouls: avg(totals.fouls) },
    competitions: [...perComp.values()].map((c) => ({ ...c, recent: c.recent.slice(-10).reverse() })),
  };
}
