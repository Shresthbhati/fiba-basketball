import { describe, expect, it } from "vitest";
import { Lineup, type LineupChange, type LineupStore } from "../lib/lineup";

const mem = (): LineupStore => { let v: LineupChange[] | null = null; return { load: () => v, save: (_k, x) => { v = [...x]; } }; };

describe("Lineup", () => {
  it("fills the court with starters up to five, then swaps players", () => {
    const l = new Lineup("k", mem());
    for (const id of ["a", "b", "c", "d", "e"]) expect(l.addStarter({ eventId: `s${id}`, side: "home", inId: id })).toBe(true);
    expect(l.addStarter({ eventId: "sf", side: "home", inId: "f" })).toBe(false); // court is full
    expect(l.addStarter({ eventId: "dup", side: "away", inId: "a" })).toBe(true); // other side is independent
    expect(l.substitute({ eventId: "x1", side: "home", inId: "f", outId: "b" })).toBe(true);
    expect(l.onCourt("home")).toEqual(["a", "c", "d", "e", "f"]);
    expect(l.substitute({ eventId: "x2", side: "home", inId: "g", outId: "b" })).toBe(false); // b already left
    expect(l.substitute({ eventId: "x3", side: "home", inId: "a", outId: "c" })).toBe(false); // a is already on court
  });

  it("undoing a change restores the previous lineup, and the lineup survives a reload", () => {
    const store = mem();
    const l = new Lineup("k", store);
    l.addStarter({ eventId: "s1", side: "home", inId: "a" });
    l.addStarter({ eventId: "s2", side: "home", inId: "b" });
    l.substitute({ eventId: "x1", side: "home", inId: "c", outId: "a" });
    expect(l.onCourt("home")).toEqual(["b", "c"]);
    expect(new Lineup("k", store).onCourt("home")).toEqual(["b", "c"]);
    l.undo("x1");
    expect(l.onCourt("home")).toEqual(["a", "b"]);
  });
});
