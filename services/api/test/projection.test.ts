import { beforeEach, describe, expect, it } from "vitest";
import type { EventType } from "../src/match/event-type.js";
import { project, type ScoredEvent } from "../src/match/projection.js";

let n = 0;
const ev = (type: EventType, side: "home" | "away" | null, over: Partial<ScoredEvent> = {}): ScoredEvent => ({
  id: `e${++n}`, serverSeq: n, type, side, period: 1, correctsEventId: null, ...over,
});

describe("project", () => {
  beforeEach(() => { n = 0; });
  it("sums points by side and ignores misses", () => {
    const s = project([ev("FIELD_GOAL", "home"), ev("THREE_POINT", "away"), ev("FREE_THROW", "home"), ev("FIELD_GOAL_MISSED", "home")]);
    expect([s.homeScore, s.awayScore]).toEqual([3, 3]);
  });
  it("a correction cancels the event it points at, without deleting it", () => {
    const bad = ev("THREE_POINT", "home");
    const s = project([bad, ev("FIELD_GOAL", "away"), ev("CORRECTION", null, { correctsEventId: bad.id })]);
    expect([s.homeScore, s.awayScore]).toEqual([0, 2]);
    expect(s.version).toBe(3);
  });
  it("counts team fouls per period and timeouts, and tracks period and game end", () => {
    const s = project([
      ev("PLAYER_FOUL", "home", { period: 1 }), ev("TECHNICAL_FOUL", "home", { period: 1 }), ev("PLAYER_FOUL", "away", { period: 2 }),
      ev("TIMEOUT", "away"), ev("PERIOD_START", null, { period: 2 }), ev("GAME_END", null),
    ]);
    expect(s.teamFouls).toEqual({ 1: { home: 2, away: 0 }, 2: { home: 0, away: 1 } });
    expect(s.timeouts).toEqual({ home: 0, away: 1 });
    expect(s.period).toBe(2);
    expect(s.gameEnded).toBe(true);
  });
  it("orders by server sequence, not array order", () => {
    const a = ev("FIELD_GOAL", "home");
    const b = ev("CORRECTION", null, { correctsEventId: a.id });
    expect(project([b, a]).homeScore).toBe(0);
  });
  it("is zero for an empty log", () => {
    expect(project([])).toMatchObject({ version: 0, homeScore: 0, awayScore: 0, period: 1, gameEnded: false });
  });
});
