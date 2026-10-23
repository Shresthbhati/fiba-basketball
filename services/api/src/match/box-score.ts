import type { EventType } from "./event-type.js";

export type StatEvent = { id: string; type: EventType; side: "home" | "away" | null; playerId: string | null; correctsEventId: string | null };
export type Line = {
  points: number; fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number;
  rebounds: number; assists: number; turnovers: number; fouls: number;
};
const blank = (): Line => ({ points: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, rebounds: 0, assists: 0, turnovers: 0, fouls: 0 });

function add(l: Line, type: EventType) {
  switch (type) {
    case "FIELD_GOAL": l.fgm++; l.fga++; l.points += 2; break;
    case "FIELD_GOAL_MISSED": l.fga++; break;
    case "THREE_POINT": l.tpm++; l.tpa++; l.points += 3; break;
    case "THREE_POINT_MISSED": l.tpa++; break;
    case "FREE_THROW": l.ftm++; l.fta++; l.points += 1; break;
    case "FREE_THROW_MISSED": l.fta++; break;
    case "REBOUND": l.rebounds++; break;
    case "ASSIST": l.assists++; break;
    case "TURNOVER": l.turnovers++; break;
    case "PLAYER_FOUL": case "TECHNICAL_FOUL": l.fouls++; break;
    default: break;
  }
}

/**
 * Per-player and per-side lines from the event log. Corrected events are ignored, like the score. `unattributed` holds
 * what was recorded for a side without naming a player, so a side's total always equals the sum of its players plus that line.
 */
export function boxScore(events: StatEvent[]) {
  const voided = new Set(events.filter((e) => e.type === "CORRECTION" && e.correctsEventId).map((e) => e.correctsEventId!));
  const players = new Map<string, { side: "home" | "away"; line: Line }>();
  const unattributed = { home: blank(), away: blank() };
  const totals = { home: blank(), away: blank() };
  for (const e of events) {
    if (e.type === "CORRECTION" || voided.has(e.id) || !e.side) continue;
    add(totals[e.side], e.type);
    if (e.playerId) {
      const p = players.get(e.playerId) ?? { side: e.side, line: blank() };
      add(p.line, e.type);
      players.set(e.playerId, p);
    } else add(unattributed[e.side], e.type);
  }
  return { players, unattributed, totals };
}
