import { describe, expect, it } from "vitest";
import { RULES, suggestProgression, type LoggedSet, type SessionSets } from "../src/training/progression.js";

const sets = (load: number | null, reps: number[], rpe: number | null = 7): LoggedSet[] => reps.map((r) => ({ reps: r, loadKg: load, rpe }));
const session = (date: string, s: LoggedSet[]): SessionSets => ({ date, sets: s });

describe("suggestProgression", () => {
  const table: { name: string; sessions: SessionSets[]; extra?: { targetReps?: number; painReportedRecently?: boolean }; action: string; load?: number }[] = [
    { name: "no sessions", sessions: [], action: "INSUFFICIENT_DATA" },
    { name: "one session is not enough", sessions: [session("2030-01-02", sets(60, [8, 8, 8]))], action: "INSUFFICIENT_DATA" },
    { name: "sessions with no sets are ignored", sessions: [session("2030-01-02", []), session("2030-01-01", sets(60, [8]))], action: "INSUFFICIENT_DATA" },
    { name: "bodyweight (no load) cannot be progressed", sessions: [session("b", sets(null, [10, 10])), session("a", sets(null, [10, 10]))], action: "INSUFFICIENT_DATA" },
    { name: "hit reps twice at easy effort -> increase 2.5% (60 -> 61.25 -> rounds to step 1.25)", sessions: [session("b", sets(60, [8, 8, 8], 7)), session("a", sets(60, [8, 9, 8], 8))], action: "INCREASE", load: 61.25 },
    { name: "increase is at least one plate step for light loads", sessions: [session("b", sets(10, [8, 8], 6)), session("a", sets(10, [8, 8], 6))], action: "INCREASE", load: 11.25 },
    { name: "increase is capped at 5 kg for heavy loads", sessions: [session("b", sets(300, [8, 8], 6)), session("a", sets(300, [8, 8], 6))], action: "INCREASE", load: 305 },
    { name: "hit reps twice but RPE too high -> hold", sessions: [session("b", sets(60, [8, 8], 9)), session("a", sets(60, [8, 8], 7))], action: "HOLD" },
    { name: "hit reps twice but RPE missing -> hold and ask for RPE", sessions: [session("b", sets(60, [8, 8], null)), session("a", sets(60, [8, 8], null))], action: "HOLD" },
    { name: "hit reps in only the latest session -> hold", sessions: [session("b", sets(60, [8, 8])), session("a", sets(60, [8, 6]))], action: "HOLD" },
    { name: "missed reps in only the latest session -> hold", sessions: [session("b", sets(60, [6, 8])), session("a", sets(60, [8, 8]))], action: "HOLD" },
    { name: "missed target in two sessions in a row -> decrease 5%", sessions: [session("b", sets(60, [6, 5])), session("a", sets(60, [7, 6]))], action: "DECREASE", load: 57.5 },
    { name: "decrease always lowers the load by at least one step", sessions: [session("b", sets(10, [4])), session("a", sets(10, [4]))], action: "DECREASE", load: 8.75 },
    { name: "pain reported recently pauses everything, even when an increase would be due", sessions: [session("b", sets(60, [8, 8], 6)), session("a", sets(60, [8, 8], 6))], extra: { painReportedRecently: true }, action: "HOLD" },
    { name: "pain pause wins over thin data too", sessions: [], extra: { painReportedRecently: true }, action: "HOLD" },
    { name: "custom target reps respected (10)", sessions: [session("b", sets(40, [10, 10], 7)), session("a", sets(40, [10, 11], 7))], extra: { targetReps: 10 }, action: "INCREASE", load: 41.25 },
    { name: "only the heaviest sets count (a light back-off set below target doesn't block an increase)", sessions: [session("b", [...sets(60, [8, 8], 7), ...sets(40, [5], 7)]), session("a", [...sets(60, [8, 8], 7), ...sets(40, [5], 7)])], action: "INCREASE", load: 61.25 },
  ];

  for (const c of table) {
    it(c.name, () => {
      const r = suggestProgression({ sessions: c.sessions, ...(c.extra ?? {}) });
      expect(r.action).toBe(c.action);
      if (c.load !== undefined) expect(r.suggestedLoadKg).toBeCloseTo(c.load, 5);
      expect(r.explanation.length).toBeGreaterThan(10);
      if (r.action === "HOLD" || r.action === "INSUFFICIENT_DATA") expect(r.suggestedLoadKg).toBeUndefined();
    });
  }

  it("never uses language that diagnoses or predicts injury", () => {
    const all = table.map((c) => suggestProgression({ sessions: c.sessions, ...(c.extra ?? {}) }).explanation.toLowerCase());
    for (const text of all) expect(text).not.toMatch(/injur|diagnos|risk of|likely to get/);
  });

  it("exposes its rules so they can be documented", () => {
    expect(RULES.maxIncreaseKg).toBe(5);
    expect(RULES.minSessions).toBe(2);
  });
});
