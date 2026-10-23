import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandCenterPanel } from "../lib/command-center-panel";
import type { CommandCenterData, DelayImpactPreview } from "../lib/competition-types";

describe("CommandCenterPanel", () => {
  let mockData: CommandCenterData;
  let calls: { key: string; body?: unknown }[];

  beforeEach(() => {
    calls = [];
    mockData = {
      competition: { id: "c1", name: "State Cup", format: "ROUND_ROBIN", status: "PUBLISHED", mine: true },
      summary: { totalMatches: 4, scheduled: 2, live: 1, finished: 1, delayed: 1, unresolved: 1, officialsCount: 1 },
      officials: [
        { id: "o1", userId: "u1", role: "SCOREKEEPER", email: "scorer@test.com", displayName: "Sam Scorer", createdAt: "2027-01-01" },
      ],
      matches: [
        {
          id: "m1", round: 1, slot: 1, homeTeamId: "t1", awayTeamId: "t2", homeName: "Reds", awayName: "Blues",
          state: "SCHEDULED", isBye: false, homeScore: null, awayScore: null, scheduledAt: "2027-06-01T10:00:00.000Z",
          alerts: { delayed: true, unresolved: false, missingOfficials: false },
        },
        {
          id: "m2", round: 1, slot: 2, homeTeamId: "t3", awayTeamId: "t4", homeName: "Golds", awayName: "Greens",
          state: "LIVE", isBye: false, homeScore: 22, awayScore: 18, scheduledAt: "2027-06-01T11:00:00.000Z",
          alerts: { delayed: false, unresolved: true, missingOfficials: false },
        },
      ],
    };

    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const method = init?.method ?? "GET";
      const key = `${method} ${url.replace("/api/v1", "")}`;
      const body = init?.body ? JSON.parse(init.body) : undefined;
      calls.push({ key, body });

      if (key === "GET /competitions/c1/command-center") return Response.json(mockData);
      if (key === "POST /competitions/c1/delay-impact") {
        const preview: DelayImpactPreview = {
          matchId: (body as { matchId: string }).matchId,
          delayMinutes: (body as { delayMinutes: number }).delayMinutes,
          affectedCount: 2,
          simulations: [
            {
              matchId: "m1", round: 1, slot: 1, homeName: "Reds", awayName: "Blues", state: "SCHEDULED",
              currentScheduledAt: "2027-06-01T10:00:00.000Z", proposedScheduledAt: "2027-06-01T10:15:00.000Z", delayMinutes: 15,
            },
            {
              matchId: "m2", round: 1, slot: 2, homeName: "Golds", awayName: "Greens", state: "LIVE",
              currentScheduledAt: "2027-06-01T11:00:00.000Z", proposedScheduledAt: "2027-06-01T11:15:00.000Z", delayMinutes: 15,
            },
          ],
        };
        return Response.json(preview);
      }
      if (key === "POST /competitions/c1/apply-delay") return Response.json({ ok: true });
      if (key === "POST /competitions/c1/officials") {
        mockData.officials.push({
          id: "o2", userId: "u2", role: (body as { role: "SCOREKEEPER" | "REFEREE" }).role,
          email: (body as { email: string }).email, displayName: "New Official", createdAt: "2027-01-02",
        });
        mockData.summary.officialsCount++;
        return Response.json({ ok: true }, { status: 201 });
      }
      return Response.json({});
    }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders operations summary cards and active alerts", async () => {
    render(<CommandCenterPanel competitionId="c1" />);

    expect(await screen.findByText("Total Matches")).toBeTruthy();
    expect(screen.getByText("Live Now")).toBeTruthy();
    expect(screen.getByText("Delayed")).toBeTruthy();

    // Check alert banner for delayed match
    expect(screen.getByText(/Delayed Match:/)).toBeTruthy();
    expect(screen.getAllByText(/Reds vs Blues/).length).toBeGreaterThan(0);

    // Check assigned official listed
    expect(screen.getByText("Sam Scorer")).toBeTruthy();
    expect(screen.getByText("SCOREKEEPER")).toBeTruthy();
  });

  it("simulates schedule delay and applies it across downstream matches", async () => {
    render(<CommandCenterPanel competitionId="c1" />);

    expect(await screen.findByText("Schedule Delay Simulator")).toBeTruthy();

    // Target match dropdown should contain m1
    expect(screen.getByLabelText("Target match for delay")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Target match for delay"), { target: { value: "m1" } });

    // Select +15 min delay and preview
    fireEvent.change(screen.getByLabelText("Delay amount in minutes"), { target: { value: "15" } });
    fireEvent.click(screen.getByText("Preview impact"));

    // Verify preview impact table appears
    expect(await screen.findByText("Delay Impact: +15 minutes")).toBeTruthy();
    expect(screen.getByText(/2 downstream match\(es\) will be pushed back/)).toBeTruthy();
    expect(screen.getAllByText("+15m").length).toBe(2);

    // Apply delay
    fireEvent.click(screen.getByText("Apply delay to schedule"));

    await waitFor(() => {
      expect(calls.some((c) => c.key === "POST /competitions/c1/apply-delay")).toBe(true);
    });
    expect(calls.find((c) => c.key === "POST /competitions/c1/apply-delay")?.body).toEqual({
      matchId: "m1",
      delayMinutes: 15,
    });
    expect(await screen.findByText(/Successfully applied \+15m delay/)).toBeTruthy();
  });

  it("submits new official assignment", async () => {
    render(<CommandCenterPanel competitionId="c1" />);

    expect(await screen.findByLabelText("Official email to assign")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Official email to assign"), { target: { value: "ref@test.com" } });
    fireEvent.change(screen.getByLabelText("Official role"), { target: { value: "REFEREE" } });
    fireEvent.click(screen.getByText("Assign official"));

    await waitFor(() => {
      expect(calls.some((c) => c.key === "POST /competitions/c1/officials")).toBe(true);
    });
    expect(calls.find((c) => c.key === "POST /competitions/c1/officials")?.body).toEqual({
      email: "ref@test.com",
      role: "REFEREE",
    });
    expect(await screen.findByText(/Official ref@test.com assigned as REFEREE/)).toBeTruthy();
  });
});
