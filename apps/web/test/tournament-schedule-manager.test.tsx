import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TournamentScheduleManager,
  type ScheduleConflictItem,
  type TournamentMatchItem,
} from "../lib/tournament-schedule-manager";

const apiMock = vi.fn();
vi.mock("../lib/api", () => ({
  api: (...args: unknown[]) => apiMock(...args),
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  },
}));

const MOCK_MATCHES: TournamentMatchItem[] = [
  {
    id: "match-101",
    round: 1,
    slot: 1,
    homeTeamId: "team-1",
    awayTeamId: "team-2",
    homeName: "Golden State Warriors",
    awayName: "Boston Celtics",
    courtName: "Court 1",
    scheduledAt: "2026-11-01T10:00:00Z",
    estimatedDurationMinutes: 60,
    state: "SCHEDULED",
  },
  {
    id: "match-102",
    round: 1,
    slot: 2,
    homeTeamId: "team-3",
    awayTeamId: "team-4",
    homeName: "Miami Heat",
    awayName: "Denver Nuggets",
    courtName: "Court 2",
    scheduledAt: "2026-11-01T10:00:00Z",
    estimatedDurationMinutes: 60,
    state: "SCHEDULED",
  },
  {
    id: "match-103",
    round: 2,
    slot: 1,
    homeTeamId: "team-1",
    awayTeamId: "team-3",
    homeName: "Golden State Warriors",
    awayName: "Miami Heat",
    courtName: "Court 1",
    scheduledAt: "2026-11-01T10:45:00Z",
    estimatedDurationMinutes: 60,
    state: "SCHEDULED",
  },
];

const MOCK_CONFLICTS: ScheduleConflictItem[] = [
  {
    type: "COURT_OVERLAP",
    severity: "ERROR",
    matchIds: ["match-101", "match-103"],
    courtName: "Court 1",
    description: "Court 1 is double-booked between Match #1 and Match #3.",
    suggestedResolution: "Shift Match #3 start time by 15 minutes.",
  },
];

describe("TournamentScheduleManager Component (Spec §10.2, §17.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders tournament matches and conflict alerts banner", async () => {
    apiMock
      .mockResolvedValueOnce({ items: MOCK_MATCHES })
      .mockResolvedValueOnce({ conflicts: MOCK_CONFLICTS });

    render(<TournamentScheduleManager competitionId="comp-123" canManage={true} />);

    expect(screen.getByText(/Multi-Court Tournament Schedule/i)).toBeDefined();

    // Verify loaded matches appear
    await waitFor(() => {
      expect(screen.getAllByText("Golden State Warriors")).toHaveLength(2);
      expect(screen.getAllByText("Miami Heat")).toHaveLength(2);
      expect(screen.getByText(/Court 1 is double-booked/i)).toBeDefined();
    });

    // Conflict pill badge
    expect(screen.getByText("1 Conflict")).toBeDefined();
  });

  it("filters matches by selected court dropdown", async () => {
    render(
      <TournamentScheduleManager
        competitionId="comp-123"
        initialMatches={MOCK_MATCHES}
        initialConflicts={[]}
      />
    );

    expect(screen.getByText("Denver Nuggets")).toBeDefined();

    // Filter to Court 1 only
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "Court 1" } });

    // Denver Nuggets (Court 2) should no longer appear
    expect(screen.queryByText("Denver Nuggets")).toBeNull();
    // Golden State Warriors (Court 1) still appears
    expect(screen.getAllByText("Golden State Warriors")).toHaveLength(2);
  });

  it("opens auto-schedule wizard and triggers auto-assign request", async () => {
    apiMock.mockResolvedValueOnce({ items: MOCK_MATCHES }).mockResolvedValueOnce({ conflicts: [] });

    render(<TournamentScheduleManager competitionId="comp-123" canManage={true} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Auto-Schedule Wizard/i })).toBeDefined();
    });

    // Open modal
    fireEvent.click(screen.getByRole("button", { name: /Auto-Schedule Wizard/i }));

    expect(screen.getByText("⚡ Multi-Court Automated Scheduler")).toBeDefined();

    apiMock.mockResolvedValueOnce({
      assignments: [],
      validation: { valid: true, conflictCount: 0 },
    });

    // Submit wizard
    fireEvent.click(screen.getByRole("button", { name: /Generate & Apply Schedule/i }));

    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith(
        "/competitions/comp-123/schedule/auto-assign",
        expect.objectContaining({ method: "POST" })
      );
    });
  });

  it("opens edit slot dialog and saves manual match schedule adjustment", async () => {
    render(
      <TournamentScheduleManager
        competitionId="comp-123"
        canManage={true}
        initialMatches={MOCK_MATCHES}
        initialConflicts={[]}
      />
    );

    // Click Edit Slot on first match
    const editBtns = screen.getAllByRole("button", { name: /Edit Slot/i });
    fireEvent.click(editBtns[0]!);

    expect(screen.getByText("Edit Match #1 Slot")).toBeDefined();

    apiMock.mockResolvedValueOnce({ id: "match-101", courtName: "Court 3" });
    apiMock.mockResolvedValueOnce({ items: MOCK_MATCHES }).mockResolvedValueOnce({ conflicts: [] });

    // Save
    fireEvent.click(screen.getByRole("button", { name: /Save Match Slot/i }));

    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith(
        "/matches/match-101",
        expect.objectContaining({ method: "PATCH" })
      );
    });
  });
});
