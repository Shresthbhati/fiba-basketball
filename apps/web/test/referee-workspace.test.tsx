import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RefereeWorkspace, type AssignedMatchItem } from "../lib/referee-workspace";
import * as apiModule from "../lib/api";

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const mockAssignedMatches: AssignedMatchItem[] = [
  {
    id: "match-ref-101",
    competitionId: "comp-metropolitan-1",
    competitionName: "Metropolitan Championship 2026",
    round: 1,
    slot: 1,
    homeTeam: "Harlem Hawks",
    awayTeam: "Queens Knights",
    homeScore: 84,
    awayScore: 78,
    state: "FINISHED",
    scheduledAt: "2026-10-24T18:00:00Z",
    pregameCompleted: true,
    signedOff: false,
  },
  {
    id: "match-ref-102",
    competitionId: "comp-metropolitan-1",
    competitionName: "Metropolitan Championship 2026",
    round: 1,
    slot: 2,
    homeTeam: "Brooklyn Ballers",
    awayTeam: "Bronx Bombers",
    homeScore: null,
    awayScore: null,
    state: "SCHEDULED",
    scheduledAt: "2026-10-24T20:00:00Z",
    pregameCompleted: false,
    signedOff: false,
  },
];

describe("RefereeWorkspace Component (Spec §23.2, §16.4)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders assigned matches with teams, status badges, and score", async () => {
    vi.spyOn(apiModule, "api").mockImplementation(async (url) => {
      if (typeof url === "string" && url.startsWith("/referee/matches")) {
        return { items: mockAssignedMatches } as never;
      }
      if (url === "/me") {
        return { id: "ref-user-id", email: "ref@test.com", displayName: "Ref Dave" } as never;
      }
      return { items: [] } as never;
    });

    renderWithClient(<RefereeWorkspace />);

    expect(screen.getByText("Referee Workspace & Officiating Hub")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Harlem Hawks vs Queens Knights")).toBeDefined();
      expect(screen.getByText("Brooklyn Ballers vs Bronx Bombers")).toBeDefined();
    });

    expect(screen.getByText(/84 – 78/)).toBeDefined();
    expect(screen.getByText("✓ Pre-game Done")).toBeDefined();
    expect(screen.getByText("⚠️ Pre-game Pending")).toBeDefined();
  });

  it("opens pre-game safety checklist dialog", async () => {
    vi.spyOn(apiModule, "api").mockImplementation(async (url) => {
      if (typeof url === "string" && url.startsWith("/referee/matches")) {
        return { items: mockAssignedMatches } as never;
      }
      if (url === "/me") {
        return { id: "ref-user-id", email: "ref@test.com", displayName: "Ref Dave" } as never;
      }
      return { items: [] } as never;
    });

    renderWithClient(<RefereeWorkspace />);

    const pregameBtns = await waitFor(() => screen.getAllByText("Pre-game Safety"));
    fireEvent.click(pregameBtns[0]!);

    await waitFor(() => {
      expect(screen.getByText("FIBA Pre-Game Safety & Protocol Verification")).toBeDefined();
      expect(screen.getByText(/Court floor clean, dry, and free of moisture/i)).toBeDefined();
      expect(screen.getByText(/Perimeter run-off zone clear/i)).toBeDefined();
      expect(screen.getByText(/Game balls inspected & pressure checked/i)).toBeDefined();
    });

    expect(screen.getByText("Save Checklist")).toBeDefined();
  });

  it("opens official sign-off dialog for finished matches", async () => {
    vi.spyOn(apiModule, "api").mockImplementation(async (url) => {
      if (typeof url === "string" && url.startsWith("/referee/matches")) {
        return { items: mockAssignedMatches } as never;
      }
      if (url === "/me") {
        return { id: "ref-user-id", email: "ref@test.com", displayName: "Ref Dave" } as never;
      }
      return { items: [] } as never;
    });

    renderWithClient(<RefereeWorkspace />);

    const signoffBtn = await waitFor(() => screen.getByText("Official Sign-Off"));
    fireEvent.click(signoffBtn);

    await waitFor(() => {
      expect(screen.getByText("Official Scorebook Verification & Sign-Off")).toBeDefined();
      expect(screen.getByText(/Signing off certifies that the scorebook events/i)).toBeDefined();
      expect(screen.getByText(/Final score and winner certified/i)).toBeDefined();
    });

    expect(screen.getByText("Confirm Sign-Off & Lock Match")).toBeDefined();
  });
});
