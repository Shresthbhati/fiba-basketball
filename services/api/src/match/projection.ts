import { POINTS, type EventType } from "./event-type.js";

export type Side = "home" | "away";
export type ScoredEvent = {
  id: string; serverSeq: number; type: EventType; side: Side | null; period: number; correctsEventId: string | null;
};
export type ScoreState = {
  version: number;
  homeScore: number;
  awayScore: number;
  period: number;
  teamFouls: Record<number, { home: number; away: number }>;
  timeouts: { home: number; away: number };
  gameEnded: boolean;
};

/**
 * The score is always rebuilt from the event log, never stored separately, so it cannot drift.
 * A CORRECTION cancels the event it points at; nothing is deleted or edited.
 */
export function project(events: ScoredEvent[]): ScoreState {
  const ordered = [...events].sort((a, b) => a.serverSeq - b.serverSeq);
  const voided = new Set(ordered.filter((e) => e.type === "CORRECTION" && e.correctsEventId).map((e) => e.correctsEventId!));
  const s: ScoreState = {
    version: ordered.at(-1)?.serverSeq ?? 0, homeScore: 0, awayScore: 0, period: 1, teamFouls: {},
    timeouts: { home: 0, away: 0 }, gameEnded: false,
  };
  for (const e of ordered) {
    if (e.type === "CORRECTION" || voided.has(e.id)) continue;
    const pts = POINTS[e.type];
    if (pts && e.side === "home") s.homeScore += pts;
    if (pts && e.side === "away") s.awayScore += pts;
    if ((e.type === "PLAYER_FOUL" || e.type === "TECHNICAL_FOUL" || e.type === "TEAM_FOUL") && e.side) {
      const p = (s.teamFouls[e.period] ??= { home: 0, away: 0 });
      p[e.side]++;
    }
    if (e.type === "TIMEOUT" && e.side) s.timeouts[e.side]++;
    if (e.type === "PERIOD_START") s.period = Math.max(s.period, e.period);
    if (e.type === "GAME_END") s.gameEnded = true;
  }
  return s;
}
