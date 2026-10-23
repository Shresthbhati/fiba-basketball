import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilmRoom } from "../lib/film-room";
import { timelineLabel, type Timeline } from "../lib/film-types";

let calls: { key: string; body?: unknown }[];
let game: Record<string, unknown>;
let timeline: Timeline;
let matches: object[];

beforeEach(() => {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string; body?: unknown }) => {
    const key = `${init?.method ?? "GET"} ${url.replace("/api/v1", "")}`;
    calls.push({ key, body: init?.body });
    if (key === "GET /film/games/g1") return Response.json(game);
    if (key.startsWith("GET /film/games/g1/clips")) return Response.json({ items: [] });
    if (key === "GET /film/games/g1/timeline") return Response.json(timeline);
    if (key === "GET /teams/t1/matches") return Response.json({ items: matches });
    return new Response(null, { status: 204 });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const base = { id: "g1", teamId: "t1", title: "vs Bravo", opponent: null, playedOn: null, video: { status: "READY", type: "video/mp4", bytes: 10 } };
const item = (over: object) => ({ id: "e", type: "FIELD_GOAL", side: "home", period: 1, videoMs: null, jersey: null, homeScore: 2, awayScore: 0, ...over });

describe("timelineLabel", () => {
  it("says whose event it is, the player (name only when sent), and the score", () => {
    expect(timelineLabel(item({ jersey: 7, playerName: "Ann" }) as never, "home")).toBe("Q1 · our +2 #7 Ann · 2–0");
    expect(timelineLabel(item({ type: "THREE_POINT", side: "away", period: 5, jersey: 11, homeScore: 2, awayScore: 3 }) as never, "home")).toBe("OT1 · their +3 #11 · 2–3");
    expect(timelineLabel(item({ type: "PERIOD_START", side: null, period: 2 }) as never, "home")).toBe("Q2 · period starts · 2–0");
  });
});

describe("FilmRoom scorebook", () => {
  it("a coach links the film to one of the team's matches", async () => {
    game = { ...base, canManage: true, matchId: null, synced: false };
    timeline = { linked: false };
    matches = [{ id: "m1", competition: "Cup", state: "FINISHED", scheduledAt: null, home: "Alpha", away: "Bravo", homeScore: 60, awayScore: 55 }];
    render(<FilmRoom gameId="g1" />);
    const form = await screen.findByRole("form", { name: "Link a match" });
    fireEvent.change(within(form).getByLabelText("Official match"), { target: { value: "m1" } });
    fireEvent.click(within(form).getByText("Link film to match"));
    await waitFor(() => expect(calls.find((c) => c.key === "PUT /film/games/g1/match")?.body).toBe(JSON.stringify({ matchId: "m1" })));
  });

  it("once linked, a coach lines up the video using the current video time and a chosen basket", async () => {
    game = { ...base, canManage: true, matchId: "m1", synced: false };
    timeline = { linked: true, synced: false, ours: "home", untimed: 1, syncEventId: null, items: [item({ id: "e1" }), item({ id: "e2", type: "TIMEOUT", side: "home" })] as never };
    render(<FilmRoom gameId="g1" />);
    const form = await screen.findByRole("form", { name: "Line up the video" });
    expect(within(form).queryByText(/timeout/)).toBeNull(); // only baskets can be used to line up
    expect(screen.getByText(/1 scorebook event\(s\) have no recorded time/)).toBeTruthy();
    Object.defineProperty(screen.getByLabelText("Game video"), "currentTime", { value: 130.5, configurable: true });
    fireEvent.change(within(form).getByLabelText("Basket"), { target: { value: "e1" } });
    fireEvent.click(within(form).getByText(/Use the current video time/));
    await waitFor(() => expect(calls.find((c) => c.key === "PUT /film/games/g1/sync")?.body).toBe(JSON.stringify({ eventId: "e1", videoMs: 130500 })));
  });

  it("a synced film shows a clickable timeline that jumps the video; players can use it but not change it", async () => {
    game = { ...base, canManage: false, matchId: "m1", synced: true };
    timeline = { linked: true, synced: true, ours: "home", untimed: 0, syncEventId: "e1", items: [
      item({ id: "e1", videoMs: 130_000, jersey: 7, playerName: "Ann" }), item({ id: "e3", type: "THREE_POINT", side: "away", videoMs: 225_000, homeScore: 2, awayScore: 3 }),
      item({ id: "e4", videoMs: null }), // before the video starts: not listed
    ] as never };
    render(<FilmRoom gameId="g1" />);
    const list = await screen.findByRole("list", { name: "Scorebook timeline" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByRole("form", { name: "Line up the video" })).toBeNull();
    expect(screen.queryByText("Unlink match")).toBeNull();
    const video = screen.getByLabelText("Game video") as HTMLVideoElement;
    video.play = vi.fn(async () => undefined);
    fireEvent.click(within(list).getByText("3:45"));
    expect(video.currentTime).toBe(225);
    expect(within(list).getByText(/our \+2 #7 Ann/)).toBeTruthy();
  });

  it("players are told when the coach hasn't lined the film up yet", async () => {
    game = { ...base, canManage: false, matchId: "m1", synced: false };
    timeline = { linked: true, synced: false, ours: "home", untimed: 0, syncEventId: null, items: [] };
    render(<FilmRoom gameId="g1" />);
    expect(await screen.findByText(/has not lined this film up/)).toBeTruthy();
  });
});
