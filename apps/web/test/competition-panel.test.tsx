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
    if (key === "GET /competitions/c1/standings")
      return Response.json({ items: [{ rank: 1, name: "Reds", played: 1, wins: 1, losses: 0, points: 2, pointsFor: 80, pointsAgainst: 70, diff: 10 }] });
    if (key === "POST /teams") return Response.json({ id: "t-new" }, { status: 201 });
    return Response.json({}, { status: 201 });
  }));
}
const base: CompetitionDetail = { id: "c1", name: "Summer Cup", format: "ROUND_ROBIN", status: "DRAFT", mine: true, canManage: true, teams: [] };
beforeEach(() => { comp = { ...base }; matches = []; calls = []; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("CompetitionPanel", () => {
  it("organizer adds a team: creates it, then registers it with a seed", async () => {
    mockApi({ "POST /competitions/c1/teams": () => { comp = { ...comp, teams: [{ id: "t-new", name: "Reds", seed: 1 }] }; return Response.json({ ok: true }, { status: 201 }); } });
    render(<CompetitionPanel id="c1" />);
    expect(await screen.findByText("Summer Cup")).toBeTruthy();
    expect(screen.getByText("Add at least 2 teams to create the schedule.")).toBeTruthy();
    expect((screen.getByText("Create schedule and publish") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Team name"), { target: { value: "Reds" } });
    fireEvent.click(screen.getByText("Add team"));
    expect(await screen.findByText("Reds")).toBeTruthy();
    expect(calls.map((c) => c.key)).toEqual(expect.arrayContaining(["POST /teams", "POST /competitions/c1/teams"]));
    expect(calls.find((c) => c.key === "POST /teams")!.body).toEqual({ name: "Reds" });
    expect(calls.find((c) => c.key === "POST /competitions/c1/teams")!.body).toEqual({ teamId: "t-new", seed: 1 });
  });

  it("enables scheduling with 2+ teams, then shows rounds with team names and a scorer link", async () => {
    comp = { ...comp, teams: [{ id: "a", name: "Reds", seed: 1 }, { id: "b", name: "Blues", seed: 2 }] };
    mockApi({
      "POST /competitions/c1/schedule": () => {
        comp = { ...comp, status: "PUBLISHED" };
        matches = [{ id: "m1", round: 1, slot: 1, homeTeamId: "a", awayTeamId: "b", state: "SCHEDULED", isBye: false, homeScore: null, awayScore: null }];
        return Response.json({ items: matches }, { status: 201 });
      },
    });
    render(<CompetitionPanel id="c1" />);
    const btn = (await screen.findByText("Create schedule and publish")) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    const round = await screen.findByLabelText("Round 1");
    expect(within(round).getByText("Reds")).toBeTruthy();
    expect(within(round).getByText("Blues")).toBeTruthy();
    expect(within(round).getByText("Open scorer").getAttribute("href")).toBe("/score/m1");
    expect(screen.queryByText("Create schedule and publish")).toBeNull(); // can't schedule twice
    expect(screen.getByLabelText("Scorekeepers")).toBeTruthy();
  });

  it("names knockout rounds, shows byes and TBD slots", async () => {
    comp = { ...base, format: "SINGLE_ELIMINATION", status: "PUBLISHED", teams: [{ id: "a", name: "Reds", seed: 1 }, { id: "b", name: "Blues", seed: 2 }, { id: "c", name: "Greens", seed: 3 }] };
    matches = [
      { id: "m1", round: 1, slot: 1, homeTeamId: "a", awayTeamId: null, state: "FINISHED", isBye: true, homeScore: null, awayScore: null },
      { id: "m2", round: 1, slot: 2, homeTeamId: "b", awayTeamId: "c", state: "SCHEDULED", isBye: false, homeScore: null, awayScore: null },
      { id: "m3", round: 2, slot: 1, homeTeamId: "a", awayTeamId: null, state: "SCHEDULED", isBye: false, homeScore: null, awayScore: null },
    ];
    mockApi();
    render(<CompetitionPanel id="c1" />);
    expect(await screen.findByLabelText("Semi-finals")).toBeTruthy();
    expect(screen.getByLabelText("Final")).toBeTruthy();
    expect(screen.getByText(/Reds — bye/)).toBeTruthy();
    expect(within(screen.getByLabelText("Final")).getByText("TBD")).toBeTruthy();
    expect(within(screen.getByLabelText("Final")).queryByText("Open scorer")).toBeNull(); // opponent unknown yet
    expect(screen.queryByLabelText("Standings")).toBeNull(); // knockout has no table
  });

  it("shows standings to a non-organizer and hides every management control", async () => {
    comp = { ...base, status: "PUBLISHED", canManage: false, teams: [{ id: "a", name: "Reds", seed: 1 }, { id: "b", name: "Blues", seed: 2 }] };
    matches = [{ id: "m1", round: 1, slot: 1, homeTeamId: "a", awayTeamId: "b", state: "FINISHED", isBye: false, homeScore: 80, awayScore: 70 }];
    mockApi();
    render(<CompetitionPanel id="c1" />);
    const table = await screen.findByLabelText("Standings");
    expect(within(table).getByText("Reds")).toBeTruthy();
    expect(screen.getByText("Final")).toBeTruthy();
    expect(screen.queryByText("Open scorer")).toBeNull();
    expect(screen.queryByLabelText("Team name")).toBeNull();
    expect(screen.queryByLabelText("Scorekeepers")).toBeNull();
  });

  it("explains a missing or unpublished competition and surfaces server errors", async () => {
    mockApi({ "GET /competitions/c1": () => Response.json({ title: "Not Found" }, { status: 404 }) });
    render(<CompetitionPanel id="c1" />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/doesn't exist or isn't published/));
    cleanup();

    comp = { ...base, status: "PUBLISHED" };
    mockApi({ "POST /competitions/c1/officials": () => Response.json({ title: "No account with that email" }, { status: 404 }) });
    render(<CompetitionPanel id="c1" />);
    fireEvent.change(await screen.findByLabelText("Scorekeeper email"), { target: { value: "nobody@example.com" } });
    fireEvent.click(screen.getByText("Add"));
    expect(await screen.findByText("No account with that email")).toBeTruthy();
  });
});
