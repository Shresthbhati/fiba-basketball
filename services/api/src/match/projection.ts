import { POINTS, type EventType } from "./event-type.js";

export type Side = "home" | "away";
export type ScoredEvent = {
  id: string;
  serverSeq: number;
  type: EventType;
  side: Side | null;
  period: number;
  clockSeconds?: number | null;
  correctsEventId: string | null;
};

export type PeriodScore = {
  period: number;
  label: string;
  home: number;
  away: number;
};

export type MomentumRun = {
  side: Side;
  points: number;
  unanswered: boolean;
};

export type ScoreState = {
  version: number;
  homeScore: number;
  awayScore: number;
  period: number;
  clockSeconds: number | null;
  teamFouls: Record<number, { home: number; away: number }>;
  timeouts: { home: number; away: number };
  gameEnded: boolean;
  periodScores: PeriodScore[];
  currentRun: MomentumRun | null;
  lastScoringSide: Side | null;
};

/**
 * The score is always rebuilt from the event log, never stored separately, so it cannot drift.
 * A CORRECTION cancels the event it points at; nothing is deleted or edited.
 */
export function project(events: ScoredEvent[]): ScoreState {
  const ordered = [...events].sort((a, b) => a.serverSeq - b.serverSeq);
  const voided = new Set(
    ordered.filter((e) => e.type === "CORRECTION" && e.correctsEventId).map((e) => e.correctsEventId!)
  );

  const s: ScoreState = {
    version: ordered.at(-1)?.serverSeq ?? 0,
    homeScore: 0,
    awayScore: 0,
    period: 1,
    clockSeconds: null,
    teamFouls: {},
    timeouts: { home: 0, away: 0 },
    gameEnded: false,
    periodScores: [],
    currentRun: null,
    lastScoringSide: null,
  };

  const periodScoresMap: Record<number, { home: number; away: number }> = {};
  let runSide: Side | null = null;
  let runPoints = 0;

  for (const e of ordered) {
    if (e.type === "CORRECTION" || voided.has(e.id)) continue;

    if (typeof e.clockSeconds === "number") {
      s.clockSeconds = e.clockSeconds;
    }

    const pts = POINTS[e.type];
    if (pts && e.side === "home") s.homeScore += pts;
    if (pts && e.side === "away") s.awayScore += pts;

    if (pts && e.side) {
      const ps = (periodScoresMap[e.period] ??= { home: 0, away: 0 });
      ps[e.side] += pts;
      s.lastScoringSide = e.side;

      if (runSide === e.side) {
        runPoints += pts;
      } else {
        runSide = e.side;
        runPoints = pts;
      }
    }

    if (
      (e.type === "PLAYER_FOUL" || e.type === "TECHNICAL_FOUL" || e.type === "TEAM_FOUL") &&
      e.side
    ) {
      const p = (s.teamFouls[e.period] ??= { home: 0, away: 0 });
      p[e.side]++;
    }

    if (e.type === "TIMEOUT" && e.side) s.timeouts[e.side]++;
    if (e.type === "PERIOD_START") s.period = Math.max(s.period, e.period);
    if (e.type === "GAME_END") s.gameEnded = true;
  }

  const maxPeriod = Math.max(s.period, 4);
  for (let p = 1; p <= maxPeriod; p++) {
    s.periodScores.push({
      period: p,
      label: p <= 4 ? `Q${p}` : `OT${p - 4}`,
      home: periodScoresMap[p]?.home ?? 0,
      away: periodScoresMap[p]?.away ?? 0,
    });
  }

  if (runSide && runPoints > 0) {
    s.currentRun = {
      side: runSide,
      points: runPoints,
      unanswered: true,
    };
  }

  return s;
}
