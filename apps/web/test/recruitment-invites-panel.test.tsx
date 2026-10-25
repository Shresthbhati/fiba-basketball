import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  PickupScoutModal,
  RecruitmentInvitesPanel,
  type RecruitmentInviteItem,
} from "../lib/recruitment-invites-panel";
import * as apiModule from "../lib/api";

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const mockInvites: RecruitmentInviteItem[] = [
  {
    id: "inv-001",
    pickupGameId: "game-001",
    pickupGameTitle: "Friday Elite Run",
    playedStartsAt: "2026-11-10T18:00:00Z",
    courtName: "Rucker Park",
    coachId: "coach-001",
    coachName: "Coach Marcus",
    teamId: "team-001",
    teamName: "Harlem Crowns",
    inviteType: "TRYOUT",
    message: "Great defense and transition passing. Come try out for our varsity squad.",
    tryoutDate: "2026-11-15T19:00:00Z",
    location: "Barclays Practice Facility",
    status: "PENDING",
    expiresAt: "2026-11-20T00:00:00Z",
    respondedAt: null,
    createdAt: "2026-11-10T21:00:00Z",
  },
  {
    id: "inv-002",
    pickupGameId: "game-002",
    pickupGameTitle: "Sunday Morning Run",
    playedStartsAt: "2026-11-05T09:00:00Z",
    courtName: "Venice Beach",
    coachId: "coach-002",
    coachName: "Coach Taylor",
    teamId: "team-002",
    teamName: "LA Waves",
    inviteType: "ROSTER_SPOT",
    message: "Direct roster invitation for the upcoming season.",
    tryoutDate: null,
    location: null,
    status: "ACCEPTED",
    expiresAt: "2026-11-19T00:00:00Z",
    respondedAt: "2026-11-06T12:00:00Z",
    createdAt: "2026-11-05T12:00:00Z",
  },
];

describe("RecruitmentInvitesPanel Component (WP-5.5)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders list of incoming scouting invitations with team and pickup details", async () => {
    vi.spyOn(apiModule, "api").mockImplementation(async (path) => {
      if (typeof path === "string" && path.startsWith("/recruitment/invites")) {
        return { items: mockInvites };
      }
      return {};
    });

    renderWithClient(<RecruitmentInvitesPanel />);

    expect(screen.getByText("Pickup Scouting Invitations")).toBeDefined();
    expect(await screen.findByText("Harlem Crowns")).toBeDefined();
    expect(screen.getByText("LA Waves")).toBeDefined();
    expect(screen.getByText(/Coach Marcus/)).toBeDefined();
    expect(screen.getByText(/Friday Elite Run/)).toBeDefined();
    expect(screen.getByText(/"Great defense and transition passing. Come try out for our varsity squad."/)).toBeDefined();
    expect(screen.getByText("Accept & Join Team")).toBeDefined();
    expect(screen.getByText("Decline")).toBeDefined();
  });

  it("handles accepting an invitation and displays success message", async () => {
    vi.spyOn(apiModule, "api").mockImplementation(async (path) => {
      if (path === "/recruitment/invites/inv-001/accept") {
        return { id: "inv-001", status: "ACCEPTED" };
      }
      if (typeof path === "string" && path.startsWith("/recruitment/invites")) {
        return { items: mockInvites };
      }
      return {};
    });

    renderWithClient(<RecruitmentInvitesPanel />);

    const acceptBtn = await screen.findByText("Accept & Join Team");
    fireEvent.click(acceptBtn);

    await waitFor(() => {
      expect(screen.getByText(/Invitation accepted! You have been added to the team roster./)).toBeDefined();
    });
  });

  it("handles declining an invitation and displays decline message", async () => {
    vi.spyOn(apiModule, "api").mockImplementation(async (path) => {
      if (path === "/recruitment/invites/inv-001/decline") {
        return { id: "inv-001", status: "DECLINED" };
      }
      if (typeof path === "string" && path.startsWith("/recruitment/invites")) {
        return { items: mockInvites };
      }
      return {};
    });

    renderWithClient(<RecruitmentInvitesPanel />);

    const declineBtn = await screen.findByText("Decline");
    fireEvent.click(declineBtn);

    await waitFor(() => {
      expect(screen.getByText(/Invitation declined./)).toBeDefined();
    });
  });

  it("filters invitations by status tab", async () => {
    let requestedPath = "";
    vi.spyOn(apiModule, "api").mockImplementation(async (path) => {
      if (typeof path === "string" && path.startsWith("/recruitment/invites")) {
        requestedPath = path;
        if (path.includes("status=ACCEPTED")) {
          return { items: [mockInvites[1]!] };
        }
        return { items: mockInvites };
      }
      return {};
    });

    renderWithClient(<RecruitmentInvitesPanel />);

    await screen.findByText("Harlem Crowns");

    const acceptedTab = screen.getByText("Accepted");
    fireEvent.click(acceptedTab);

    await waitFor(() => {
      expect(requestedPath).toBe("/recruitment/invites?status=ACCEPTED");
    });
  });

  it("renders PickupScoutModal and submits recruitment invite for coach", async () => {
    const mockCoachTeams = [{ id: "team-001", name: "Harlem Crowns" }];
    let submittedBody: unknown = null;

    vi.spyOn(apiModule, "api").mockImplementation(async (path, init) => {
      if (path === "/pickup/game-001/scouting-roster") {
        return { coachTeams: mockCoachTeams, candidates: [] };
      }
      if (path === "/pickup/game-001/scout-invites") {
        submittedBody = JSON.parse(init?.body as string);
        return { id: "new-inv-123", status: "PENDING" };
      }
      return {};
    });

    const onClose = vi.fn();
    const onSuccess = vi.fn();

    renderWithClient(
      <PickupScoutModal
        gameId="game-001"
        gameTitle="Friday Elite Run"
        candidateUserId="player-123"
        candidateName="Jordan Miles"
        isOpen={true}
        onClose={onClose}
        onSuccess={onSuccess}
      />,
    );

    expect(await screen.findByText("Scout & Invite: Jordan Miles")).toBeDefined();
    expect(await screen.findByText(/Harlem Crowns/)).toBeDefined();

    const noteInput = screen.getByLabelText(/Personal Scouting Note/);
    fireEvent.change(noteInput, {
      target: { value: "Outstanding perimeter shooting today. We invite you to team tryouts." },
    });

    const submitBtn = screen.getByText("Send Invitation");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    expect(submittedBody).toMatchObject({
      athleteId: "player-123",
      teamId: "team-001",
      inviteType: "TRYOUT",
      message: "Outstanding perimeter shooting today. We invite you to team tryouts.",
    });
  });
});
