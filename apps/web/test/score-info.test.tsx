import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NetworkError } from "../lib/api";
import { ScorePanel, loadMatchInfo } from "../lib/score-panel";
import { ScoreQueue, type Post, type Saved, type Store } from "../lib/score-queue";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* ignore */ } });
const store = (): Store => { const d = new Map<string, Saved>(); return { load: (k) => d.get(k) ?? null, save: (k, v) => void d.set(k, v) }; };
const offline: Post = async () => { throw new NetworkError("offline"); };

describe("scorer match info", () => {
  it("labels the sides with team names and shows competition and time", async () => {
    const q = new ScoreQueue("m", offline, store());
    render(<ScorePanel queue={q} info={{ homeName: "Reds", awayName: "Blues", competitionName: "Summer Cup", scheduledAt: "2030-06-01T18:30:00.000Z" }} />);
    expect(screen.getByLabelText("Reds")).toBeTruthy();
    expect(screen.getByLabelText("Blues")).toBeTruthy();
    expect(screen.getByLabelText("Match details").textContent).toMatch(/Summer Cup/);
    expect(screen.getByLabelText("Match details").textContent).toMatch(/Scheduled for/);
    await act(async () => { fireEvent.click(screen.getByLabelText("Reds +3 points")); });
    expect(screen.getByLabelText("Reds").textContent).toContain("3");
  });

  it("falls back to Home/Away and keeps scoring when the match fetch fails offline", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const info = await loadMatchInfo("m-off");
    expect(info).toBeNull();
    const q = new ScoreQueue("m-off", offline, store());
    render(<ScorePanel queue={q} info={info} />);
    expect(screen.getByLabelText("Home")).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByLabelText("Away +2 points")); });
    expect(screen.getByLabelText("Away").textContent).toContain("2");
  });

  it("loads names from GET /matches/:id and reuses the cached copy when later offline", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string }) => {
      expect(`${init?.method ?? "GET"} ${url}`).toBe("GET /api/v1/matches/m1");
      return Response.json({ competitionName: "Cup", scheduledAt: null, home: { id: "a", name: "Reds" }, away: null });
    }));
    expect(await loadMatchInfo("m1")).toMatchObject({ homeName: "Reds", awayName: "Away", competitionName: "Cup" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline"); }));
    expect(await loadMatchInfo("m1")).toMatchObject({ homeName: "Reds" });
  });
});
