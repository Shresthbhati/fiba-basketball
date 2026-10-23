import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GamePanel } from "../lib/game-panel";
import type { GameDetail } from "../lib/game-types";

const base: GameDetail = {
  id: "g1", title: "Evening run", courtId: "c1", startsAt: "2030-01-01T18:00:00Z", endsAt: "2030-01-01T20:00:00Z", capacity: 4, skillBand: null,
  confirmedCount: 1, spotsLeft: 3, phase: "OPEN", hostName: "Hana", checkInCount: 0, waitlistCount: 0, myStatus: null, isHost: false,
};

let game: GameDetail;
let calls: string[];
function mockApi(overrides: Record<string, () => Response> = {}) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string }) => {
    const key = `${init?.method ?? "GET"} ${url}`;
    calls.push(key);
    if (overrides[key]) return overrides[key]!();
    if (url === "/api/v1/courts/c1") return Response.json({ name: "Rucker Park" });
    if (url === "/api/v1/pickup/g1" && (init?.method ?? "GET") === "GET") return Response.json(game);
    return Response.json({}, { status: 200 });
  }));
}
beforeEach(() => { game = { ...base }; calls = []; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("GamePanel", () => {
  it("lets a visitor join, then shows they're in", async () => {
    mockApi({ "POST /api/v1/pickup/g1/rsvp": () => { game = { ...game, myStatus: "CONFIRMED", confirmedCount: 2, participants: [{ name: "Me", status: "CONFIRMED", checkedIn: false }] }; return Response.json({ status: "CONFIRMED" }); } });
    render(<GamePanel id="g1" />);
    expect(await screen.findByText("Evening run")).toBeTruthy();
    expect(screen.getByText("Join the game to see who's playing.")).toBeTruthy();
    fireEvent.click(screen.getByText("Join game"));
    expect(await screen.findByText("You're in.")).toBeTruthy();
    expect(screen.getByText(/Me/)).toBeTruthy();
    expect(calls).toContain("POST /api/v1/pickup/g1/rsvp");
    expect(screen.getByText("Leave game")).toBeTruthy();
    expect(screen.getByText("Check in")).toBeTruthy();
  });

  it("offers the waitlist when full and explains the waitlist state", async () => {
    game = { ...base, phase: "FULL", confirmedCount: 4, spotsLeft: 0 };
    mockApi();
    render(<GamePanel id="g1" />);
    expect(await screen.findByText("Join waitlist")).toBeTruthy();
    cleanup();
    game = { ...game, myStatus: "WAITLIST", waitlistCount: 1 };
    render(<GamePanel id="g1" />);
    expect(await screen.findByText(/You're on the waitlist/)).toBeTruthy();
    expect(screen.queryByText("Check in")).toBeNull(); // only confirmed players can check in
  });

  it("shows the host the confirm button once the game has ended, and never auto-completes", async () => {
    game = { ...base, isHost: true, myStatus: "CONFIRMED", phase: "UNCONFIRMED", participants: [] };
    mockApi();
    render(<GamePanel id="g1" />);
    expect(await screen.findByText(/waiting for host to confirm/)).toBeTruthy();
    expect(screen.getByText("Confirm it was played")).toBeTruthy();
    expect(screen.queryByText("Leave game")).toBeNull(); // hosts cancel, they don't leave
  });

  it("shows friendly errors for not-logged-in and missing games", async () => {
    mockApi({ "POST /api/v1/pickup/g1/rsvp": () => Response.json({ title: "Not signed in" }, { status: 401 }) });
    render(<GamePanel id="g1" />);
    fireEvent.click(await screen.findByText("Join game"));
    expect(await screen.findByText("Log in first.")).toBeTruthy();
    cleanup();
    mockApi({ "GET /api/v1/pickup/g1": () => Response.json({ title: "Not Found" }, { status: 404 }) });
    render(<GamePanel id="g1" />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/doesn't exist/));
  });

  it("hides actions for a finished game", async () => {
    game = { ...base, phase: "COMPLETED", myStatus: "CONFIRMED", participants: [] };
    mockApi();
    render(<GamePanel id="g1" />);
    expect(await screen.findByText("Completed")).toBeTruthy();
    expect(screen.queryByText("Check in")).toBeNull();
    expect(screen.queryByText("Join game")).toBeNull();
  });
});
