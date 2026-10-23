import { describe, expect, it } from "vitest";
import { GameClock, formatClock, parseClock, type ClockSaved, type ClockStore } from "../lib/game-clock";

function setup() {
  let t = 1_000_000;
  const saved = new Map<string, ClockSaved>();
  const store: ClockStore = { load: (k) => saved.get(k) ?? null, save: (k, v) => { saved.set(k, { ...v }); } };
  return { store, saved, advance: (ms: number) => { t += ms; }, make: () => new GameClock("k", store, () => t) };
}

describe("GameClock", () => {
  it("counts down only while running, and keeps the time when stopped", () => {
    const { make, advance } = setup();
    const c = make();
    expect(c.seconds).toBe(600);
    advance(5000);
    expect(c.seconds).toBe(600); // not started
    c.start();
    advance(30_000);
    expect(c.seconds).toBe(570);
    c.stop();
    advance(60_000);
    expect(c.seconds).toBe(570);
    expect(c.running).toBe(false);
  });

  it("stops itself at zero and will not restart there", () => {
    const { make, advance } = setup();
    const c = make();
    c.set(3);
    c.start();
    advance(10_000);
    expect(c.seconds).toBe(0);
    expect(c.running).toBe(false);
    c.tick();
    c.start();
    expect(c.running).toBe(false);
  });

  it("survives a reload while running, and a period change resets it", () => {
    const { make, advance, store } = setup();
    const c = make();
    c.start();
    advance(20_000);
    const again = new GameClock("k", store, (() => { const base = 1_000_000 + 20_000; return () => base + 10_000; })());
    expect(again.seconds).toBe(570);
    again.startPeriod(2);
    expect(again.seconds).toBe(600);
    expect(again.running).toBe(false);
    again.startPeriod(5);
    expect(again.seconds).toBe(300); // overtime is shorter
    again.setLength(480);
    expect(again.period).toBe(5);
    expect(again.seconds).toBe(480);
  });

  it("set() corrects the clock without losing the running state", () => {
    const { make, advance } = setup();
    const c = make();
    c.start();
    advance(10_000);
    c.set(300);
    advance(5000);
    expect(c.seconds).toBe(295);
    expect(c.running).toBe(true);
  });

  it("formats and parses times", () => {
    expect(formatClock(570)).toBe("9:30");
    expect(formatClock(5)).toBe("0:05");
    expect(parseClock("9:30")).toBe(570);
    expect(parseClock("45")).toBe(45);
    expect(parseClock("9:75")).toBeNull();
    expect(parseClock("abc")).toBeNull();
  });
});
