import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FilmRoom } from "../lib/film-room";

type Call = { key: string; body?: unknown; headers?: Record<string, string> };
let calls: Call[];
let game: object;
let clips: object[];

function mockApi(status = 200) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string; body?: unknown; headers?: Record<string, string> }) => {
    const key = `${init?.method ?? "GET"} ${url.replace("/api/v1", "")}`;
    calls.push({ key, body: init?.body, headers: init?.headers });
    if (status !== 200 && key.startsWith("GET /film/games/g1") && !key.includes("clips")) return new Response("{}", { status });
    if (key === "GET /film/games/g1") return Response.json(game);
    if (key.startsWith("GET /film/games/g1/clips")) return Response.json({ items: clips });
    if (key === "PUT /film/games/g1/video") return new Response(null, { status: 204 });
    if (key === "POST /film/games/g1/clips") return Response.json({ id: "c9" }, { status: 201 });
    return new Response(null, { status: 204 });
  }));
}
const base = { id: "g1", teamId: "t1", title: "vs Lions", opponent: "Lions", playedOn: null };
beforeEach(() => { calls = []; clips = []; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("FilmRoom", () => {
  it("a player can watch and filter clips but sees no upload, mark or delete controls", async () => {
    game = { ...base, video: { status: "READY", type: "video/mp4", bytes: 10 }, canManage: false };
    clips = [{ id: "c1", startMs: 65_000, endMs: 70_000, tags: ["turnover"], note: "Late rotation" }];
    mockApi();
    render(<FilmRoom gameId="g1" />);
    expect(await screen.findByLabelText("Game video")).toBeTruthy();
    expect(await screen.findByText("Late rotation")).toBeTruthy();
    expect(screen.getByText(/1:05–1:10/)).toBeTruthy();
    expect(screen.queryByText(/Upload video|Replace video/)).toBeNull();
    expect(screen.queryByText("Mark start")).toBeNull();
    expect(screen.queryByRole("button", { name: /Delete clip/ })).toBeNull();
    fireEvent.change(screen.getByLabelText("Filter by tag"), { target: { value: "turnover" } });
    await waitFor(() => expect(calls.some((c) => c.key === "GET /film/games/g1/clips?tag=turnover")).toBe(true));
  });

  it("a coach uploads a video with its declared type and refuses other file types without calling the server", async () => {
    game = { ...base, video: { status: "NONE", type: null, bytes: null }, canManage: true };
    mockApi();
    render(<FilmRoom gameId="g1" />);
    const input = (await screen.findByLabelText(/Upload video/)) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "notes.txt", { type: "text/plain" })] } });
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Choose an mp4, webm or mov video.");
    expect(calls.some((c) => c.key.startsWith("PUT"))).toBe(false);
    fireEvent.change(input, { target: { files: [new File(["abc"], "game.mp4", { type: "video/mp4" })] } });
    await waitFor(() => expect(calls.some((c) => c.key === "PUT /film/games/g1/video")).toBe(true));
    expect(calls.find((c) => c.key.startsWith("PUT"))?.headers).toEqual({ "content-type": "video/mp4" });
  });

  it("a coach marks a start and end and saves a tagged clip; saving without marks explains why", async () => {
    game = { ...base, video: { status: "READY", type: "video/mp4", bytes: 10 }, canManage: true };
    mockApi();
    render(<FilmRoom gameId="g1" />);
    await screen.findByLabelText("Game video");
    const form = await screen.findByRole("form", { name: "Add a clip" });
    fireEvent.click(screen.getByText("Save clip"));
    expect((await screen.findByRole("alert")).textContent).toContain("Mark where the clip starts and ends");
    const v = screen.getByLabelText("Game video") as HTMLVideoElement;
    Object.defineProperty(v, "currentTime", { value: 12, configurable: true });
    fireEvent.click(screen.getByText("Mark start"));
    Object.defineProperty(v, "currentTime", { value: 18.5, configurable: true });
    fireEvent.click(screen.getByText("Mark end"));
    fireEvent.change(form.querySelector("input[placeholder]")!, { target: { value: "Fast Break, turnover" } });
    fireEvent.click(screen.getByText("Save clip"));
    await waitFor(() => expect(calls.some((c) => c.key === "POST /film/games/g1/clips")).toBe(true));
    expect(JSON.parse(calls.find((c) => c.key === "POST /film/games/g1/clips")!.body as string)).toEqual({ startMs: 12000, endMs: 18500, tags: ["Fast Break", "turnover"] });
  });

  it("shows a friendly not-found message instead of leaking whether the game exists", async () => {
    game = base;
    mockApi(404);
    render(<FilmRoom gameId="g1" />);
    expect((await screen.findByText(/could not find that game/)).textContent).toContain("you may not be on the team");
  });
});
