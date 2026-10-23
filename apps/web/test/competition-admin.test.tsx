import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompetitionPanel } from "../lib/competition-panel";
import type { CompetitionDetail, MatchRow } from "../lib/competition-types";

let comp: CompetitionDetail;
let matches: MatchRow[];
let calls: { key: string; body?: unknown }[];

function mockApi(extra: Record<string, (body: unknown) => Response> = {}) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? "GET";
    const key = `${method} ${url.replace("/api/v1", "")}`;
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ key, body });
    if (extra[key]) return extra[key]!(body);
    if (key === "GET /competitions/c1") return Response.json(comp);
    if (key === "GET /competitions/c1/matches") return Response.json({ items: matches });
    if (key === "GET /competitions/c1/standings") return Response.json({ items: [] });
    return Response.json({}, { status: 200 });
  }));
}
const m1: MatchRow = { id: "m1", round: 1, slot: 1, homeTeamId: "a", awayTeamId: "b", state: "SCHEDULED", isBye: false, homeScore: null, awayScore: null, scheduledAt: null };
const base: CompetitionDetail = {
  id: "c1", name: "Summer Cup", format: "ROUND_ROBIN", status: "PUBLISHED", mine: true, canManage: true,
  teams: [{ id: "a", name: "Reds", seed: 1 }, { id: "b", name: "Blues", seed: 2 }],
};
const card = async () => within(await screen.findByLabelText("Match Reds vs Blues"));

beforeEach(() => { comp = { ...base }; matches = [{ ...m1 }]; calls = []; vi.spyOn(window, "confirm").mockReturnValue(true); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("CompetitionPanel match administration", () => {
  it("shows a scheduled time to everyone, but time controls only to organizers", async () => {
    matches = [{ ...m1, scheduledAt: "2030-06-01T18:30:00.000Z" }];
    comp = { ...comp, canManage: false };
    mockApi();
    render(<CompetitionPanel id="c1" />);
    expect((await card()).getByText(/Scheduled for/)).toBeTruthy();
    expect(screen.queryByLabelText("Match time")).toBeNull();
    expect(screen.queryByText("Record forfeit")).toBeNull();
    expect(screen.queryByText("Enter final score")).toBeNull();
  });

  it("organizer sets and clears a match time via PATCH", async () => {
    mockApi({ "PATCH /matches/m1": (body) => { matches = [{ ...m1, scheduledAt: (body as { scheduledAt: string | null }).scheduledAt }]; return Response.json({}); } });
    render(<CompetitionPanel id="c1" />);
    const c = await card();
    fireEvent.change(c.getByLabelText("Match time"), { target: { value: "2030-06-01T18:30" } });
    fireEvent.click(c.getByText("Set time"));
    await waitFor(() => expect(calls.find((x) => x.key === "PATCH /matches/m1")).toBeTruthy());
    expect((calls.find((x) => x.key === "PATCH /matches/m1")!.body as { scheduledAt: string }).scheduledAt).toBe(new Date("2030-06-01T18:30").toISOString());
    fireEvent.click((await card()).getByText("Clear time"));
    await waitFor(() => expect(calls.filter((x) => x.key === "PATCH /matches/m1")).toHaveLength(2));
    expect(calls.filter((x) => x.key === "PATCH /matches/m1")[1]!.body).toEqual({ scheduledAt: null });
  });

  it("enters a final score, then corrects it and locks it", async () => {
    mockApi({
      "POST /matches/m1/result": (body) => {
        const b = body as { homeScore: number; awayScore: number };
        matches = [{ ...m1, state: "FINISHED", homeScore: b.homeScore, awayScore: b.awayScore }];
        return Response.json({});
      },
      "POST /matches/m1/lock": () => { matches = [{ ...matches[0]!, state: "LOCKED" }]; return Response.json({}); },
    });
    render(<CompetitionPanel id="c1" />);
    let c = await card();
    fireEvent.change(c.getByLabelText("Home score"), { target: { value: "70" } });
    fireEvent.change(c.getByLabelText("Away score"), { target: { value: "60" } });
    fireEvent.click(c.getByText("Enter final score"));
    await waitFor(async () => expect((await card()).getByText("Correct score")).toBeTruthy());
    expect(calls.find((x) => x.key === "POST /matches/m1/result")!.body).toEqual({ homeScore: 70, awayScore: 60 });

    c = await card();
    fireEvent.change(c.getByLabelText("Away score"), { target: { value: "75" } });
    fireEvent.click(c.getByText("Correct score"));
    await waitFor(() => expect(calls.filter((x) => x.key === "POST /matches/m1/result")).toHaveLength(2));
    expect(calls.filter((x) => x.key === "POST /matches/m1/result")[1]!.body).toEqual({ homeScore: 70, awayScore: 75 });

    fireEvent.click((await card()).getByText("Lock result"));
    await waitFor(async () => expect((await card()).queryByText("Lock result")).toBeNull());
    expect((await card()).queryByText("Correct score")).toBeNull();
    expect((await card()).getByText("Final (locked)")).toBeTruthy();
  });

  it("records a forfeit after confirming, sending the opposite team as winner", async () => {
    mockApi({ "POST /matches/m1/forfeit": () => { matches = [{ ...m1, state: "FINISHED", homeScore: 0, awayScore: 20, forfeit: true }]; return Response.json({}); } });
    render(<CompetitionPanel id="c1" />);
    const c = await card();
    fireEvent.change(c.getByLabelText("Team that forfeits"), { target: { value: "home" } });
    fireEvent.click(c.getByText("Record forfeit"));
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(calls.find((x) => x.key === "POST /matches/m1/forfeit")).toBeTruthy());
    expect(calls.find((x) => x.key === "POST /matches/m1/forfeit")!.body).toEqual({ winner: "away" });
    expect(await screen.findByText(/Final \(forfeit\)/)).toBeTruthy();
  });

  it("does nothing when the forfeit confirmation is declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    mockApi();
    render(<CompetitionPanel id="c1" />);
    fireEvent.click((await card()).getByText("Record forfeit"));
    expect(calls.some((x) => x.key.includes("forfeit"))).toBe(false);
  });

  it("shows server refusals in plain language", async () => {
    matches = [{ ...m1, state: "FINISHED", homeScore: 70, awayScore: 60 }];
    mockApi({ "POST /matches/m1/result": () => Response.json({ title: "The next round has already been played; correct that result first" }, { status: 409 }) });
    render(<CompetitionPanel id="c1" />);
    const c = await card();
    fireEvent.change(c.getByLabelText("Away score"), { target: { value: "80" } });
    fireEvent.click(c.getByText("Correct score"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/next round has already been played/);
  });
});
