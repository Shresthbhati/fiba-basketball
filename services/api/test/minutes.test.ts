import { describe, expect, it } from "vitest";
import type { EventType } from "../src/match/event-type.js";
import { secondsOnCourt, type MinuteEvent } from "../src/match/minutes.js";

let n = 0;
const ev = (type: EventType, period: number, clockSeconds: number | null, extra: Partial<MinuteEvent> = {}): MinuteEvent =>
  ({ id: `e${++n}`, type, side: "home", period, clockSeconds, playerId: null, playerOutId: null, correctsEventId: null, ...extra });
const sub = (period: number, clock: number | null, inId: string, outId: string | null = null) => ev("SUBSTITUTION", period, clock, { playerId: inId, playerOutId: outId });

describe("secondsOnCourt", () => {
  it("is null when no lineup was recorded", () => {
    expect(secondsOnCourt([ev("PERIOD_START", 1, 600), ev("FIELD_GOAL", 1, 500, { playerId: "a" })])).toBeNull();
  });

  it("credits starters from the period length and subs from when they came on, to 0:00", () => {
    const m = secondsOnCourt([
      ev("PERIOD_START", 1, 600), sub(1, 600, "a"), sub(1, 600, "b"),
      sub(1, 420, "c", "a"), // a: 180s, c on at 7:00
      sub(1, 120, "a", "c"), // c: 300s, a back on at 2:00
    ])!;
    expect(m.get("a")).toBe(180 + 120);
    expect(m.get("b")).toBe(600);
    expect(m.get("c")).toBe(300);
  });

  it("carries the lineup into the next period, using its own length, and counts an early PERIOD_END", () => {
    const m = secondsOnCourt([
      ev("PERIOD_START", 1, 600), sub(1, 600, "a"), sub(1, 600, "b"),
      ev("PERIOD_START", 2, 300), sub(2, 200, "c", "b"), // period 2 is 5:00 long
      ev("PERIOD_END", 2, 60),
    ])!;
    expect(m.get("a")).toBe(600 + (300 - 60));
    expect(m.get("b")).toBe(600 + (300 - 200));
    expect(m.get("c")).toBe(200 - 60);
  });

  it("ignores corrected substitutions, tolerates a missing clock, and keeps each side apart", () => {
    const wrong = sub(1, 300, "c", "a");
    const m = secondsOnCourt([
      ev("PERIOD_START", 1, 600), sub(1, 600, "a"), wrong,
      ev("CORRECTION", 1, null, { side: null, correctsEventId: wrong.id }),
      ev("FIELD_GOAL", 1, 400, { playerId: "a" }),
      sub(1, null, "b", "a"), // no clock: applied at the last clock seen (6:40)
      sub(1, 600, "x", null),
    ].map((e) => (e.playerId === "x" ? { ...e, side: "away" as const } : e)))!;
    expect(m.get("a")).toBe(600 - 400);
    expect(m.get("b")).toBe(400);
    expect(m.has("c")).toBe(false);
  });

  it("never gives negative time when clocks are out of order", () => {
    const m = secondsOnCourt([ev("PERIOD_START", 1, 600), sub(1, 100, "a"), sub(1, 500, "b", "a")])!;
    expect(m.get("a")).toBe(0);
  });
});
