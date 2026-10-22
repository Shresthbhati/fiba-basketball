import { describe, expect, it } from "vitest";
import { roundRobin, singleElimination } from "../src/competition/schedule.js";
import { standings, type Result } from "../src/competition/standings.js";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `T${i + 1}`);
const key = (a: string, b: string) => [a, b].sort().join("-");

describe("roundRobin", () => {
  for (const n of [2, 3, 4, 5, 6, 7, 8, 11]) {
    it(`${n} teams: every pair meets exactly once and nobody plays twice in a round`, () => {
      const p = roundRobin(ids(n));
      expect(p).toHaveLength((n * (n - 1)) / 2);
      expect(new Set(p.map((m) => key(m.home, m.away))).size).toBe(p.length);
      const perRound = new Map<number, string[]>();
      for (const m of p) perRound.set(m.round, [...(perRound.get(m.round) ?? []), m.home, m.away]);
      for (const teams of perRound.values()) expect(new Set(teams).size).toBe(teams.length);
      expect(Math.max(...p.map((m) => m.round))).toBe(n % 2 === 0 ? n - 1 : n);
    });
  }
  it("double round robin plays each pair twice with venues swapped", () => {
    const p = roundRobin(ids(4), { doubleRound: true });
    expect(p).toHaveLength(12);
    const homes = p.filter((m) => key(m.home, m.away) === key("T1", "T2")).map((m) => m.home);
    expect(new Set(homes).size).toBe(2);
  });
  it("rejects duplicates and handles tiny fields", () => {
    expect(() => roundRobin(["a", "a"])).toThrow();
    expect(roundRobin(["a"])).toEqual([]);
  });
});

describe("singleElimination", () => {
  it("8 teams: 7 matches, seeds 1 and 2 on opposite halves", () => {
    const m = singleElimination(ids(8));
    expect(m).toHaveLength(7);
    const r1 = m.filter((x) => x.round === 1);
    expect(r1.map((x) => [x.a, x.b])).toEqual([["T1", "T8"], ["T4", "T5"], ["T2", "T7"], ["T3", "T6"]]);
  });
  it("6 teams: padded to 8 and the top two seeds get byes", () => {
    const r1 = singleElimination(ids(6)).filter((x) => x.round === 1);
    const byes = r1.filter((x) => x.a === "BYE" || x.b === "BYE");
    expect(byes).toHaveLength(2);
    expect(byes.flatMap((x) => [x.a, x.b]).filter((t) => t !== "BYE").sort()).toEqual(["T1", "T2"]);
  });
  it("every real team appears exactly once in round 1", () => {
    for (const n of [2, 3, 5, 9, 16]) {
      const teams = singleElimination(ids(n)).filter((x) => x.round === 1).flatMap((x) => [x.a, x.b]).filter((t) => t !== "BYE");
      expect(teams.sort()).toEqual(ids(n).sort());
    }
  });
});

describe("standings", () => {
  const r = (home: string, away: string, homeScore: number, awayScore: number, forfeit = false): Result => ({ home, away, homeScore, awayScore, forfeit });

  it("awards 2 for a win, 1 for a loss, 0 for a forfeit loss", () => {
    const s = standings(["A", "B", "C"], [r("A", "B", 80, 70), r("B", "C", 60, 0, true) ]);
    const get = (t: string) => s.find((x) => x.team === t)!;
    expect(get("A").points).toBe(2);
    expect(get("B").points).toBe(1 + 2);
    expect(get("C").points).toBe(0);
  });

  it("breaks a two-way tie on head-to-head before point difference", () => {
    // A and B both finish 2W-1L (C and D 1W-2L). B beat A head-to-head, but A has the far better overall diff.
    const results = [r("A", "B", 70, 71), r("A", "C", 100, 50), r("A", "D", 100, 50), r("B", "C", 60, 59), r("B", "D", 59, 60), r("C", "D", 90, 50)];
    const order = standings(["A", "B", "C", "D"], results).map((x) => x.team);
    expect(order.slice(0, 2)).toEqual(["B", "A"]);
    // With head-to-head switched off, the better diff puts A first.
    expect(standings(["A", "B", "C", "D"], results, ["diff"]).map((x) => x.team).slice(0, 2)).toEqual(["A", "B"]);
  });

  it("uses only games among the tied teams for a three-way tie", () => {
    // A>B, B>C, C>A in a cycle, and all three beat D. The mini-table is level, so overall diff decides: C +20, B +10, A 0.
    const results = [r("A", "B", 80, 70), r("B", "C", 80, 70), r("C", "A", 90, 70), r("A", "D", 50, 40), r("B", "D", 50, 40), r("C", "D", 50, 40)];
    const order = standings(["A", "B", "C", "D"], results).map((x) => x.team);
    expect(order[3]).toBe("D");
    expect(order).toEqual(["C", "B", "A", "D"]);
  });

  it("respects a custom tie-breaker order", () => {
    // A>B, B>C, C>A: everyone 1W-1L, so only the tie-breaker order decides.
    const results = [r("A", "B", 71, 70), r("B", "C", 50, 49), r("C", "A", 100, 60)];
    expect(standings(["A", "B", "C"], results, ["diff"]).map((x) => x.team)).toEqual(["C", "B", "A"]);
    expect(standings(["A", "B", "C"], results, ["pointsFor"]).map((x) => x.team)).toEqual(["C", "A", "B"]);
  });

  it("rejects tied scores", () => {
    expect(() => standings(["A", "B"], [r("A", "B", 50, 50)])).toThrow();
  });
});
