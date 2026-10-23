import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CareerPanel } from "../lib/career-panel";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const line = (over: object = {}) => ({ points: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, rebounds: 0, assists: 0, turnovers: 0, fouls: 0, ...over });
const stub = (status: number, body: object) => vi.stubGlobal("fetch", vi.fn(async () => Response.json(body, { status })));

describe("CareerPanel", () => {
  it("says it is private and explains an empty record", async () => {
    stub(200, { games: 0, totals: line(), perGame: null, competitions: [] });
    render(<CareerPanel />);
    expect(await screen.findByText(/No official games yet/)).toBeTruthy();
    expect(screen.getByText(/Only you can see this/)).toBeTruthy();
  });

  it("shows totals, per-game averages, and each competition's recent games", async () => {
    stub(200, {
      games: 2, totals: line({ points: 7, fgm: 2, fga: 3, tpm: 1, tpa: 1, rebounds: 1, assists: 1 }), perGame: { points: 3.5, rebounds: 0.5, assists: 0.5, turnovers: 0, fouls: 0 },
      minutes: { games: 1, total: 8, perGame: 8 },
      competitions: [{ name: "Cup One", games: 1, totals: line({ points: 5 }), recent: [{ matchId: "m1", opponent: "Bravo", scheduledAt: null, line: line({ points: 5, rebounds: 1 }), seconds: 480 }] }],
    });
    render(<CareerPanel />);
    const totals = await screen.findByRole("region", { name: "Career totals" });
    expect(within(totals).getByText(/Games played/).parentElement!.textContent).toContain("2");
    expect(within(totals).getByText("Points 7 · 3.5 per game")).toBeTruthy();
    expect(within(totals).getByText("2/3 FG · 1/1 3P · 0/0 FT")).toBeTruthy();
    const cup = screen.getByRole("region", { name: "Cup One" });
    expect(within(cup).getByText(/vs Bravo — 8 min, 5 pts, 1 reb, 0 ast/)).toBeTruthy();
    expect(within(totals).getByText("Minutes 8 · 8 per game (1 game with a recorded lineup)")).toBeTruthy();
  });

  it("asks signed-out visitors to log in, and shows server errors", async () => {
    stub(401, { title: "Unauthorized" });
    render(<CareerPanel />);
    expect(await screen.findByRole("link", { name: "Log in" })).toBeTruthy();
    cleanup();
    stub(500, { title: "Server error" });
    render(<CareerPanel />);
    expect((await screen.findByRole("alert")).textContent).toBe("Server error");
  });
});
