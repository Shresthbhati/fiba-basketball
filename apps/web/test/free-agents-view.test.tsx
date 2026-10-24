import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FreeAgentsView } from "../lib/free-agents-view";
import * as apiModule from "../lib/api";

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const mockFreeAgents = [
  {
    id: "fa-101",
    userId: "user-pg-1",
    displayName: "Speedy Hooper",
    city: "New York, NY",
    primaryPosition: "PG",
    secondaryPositions: ["SG"],
    skillLevel: "COMPETITIVE",
    experienceYears: 4,
    availability: "WEEKENDS",
    bio: "Floor general looking for a competitive Sunday team.",
    status: "ACTIVE",
    linkedCommunityId: null,
    createdAt: "2026-10-20T10:00:00Z",
  },
  {
    id: "fa-102",
    userId: "user-c-2",
    displayName: "Big Shot Center",
    city: "Brooklyn, NY",
    primaryPosition: "C",
    secondaryPositions: ["PF"],
    skillLevel: "INTERMEDIATE",
    experienceYears: 6,
    availability: "ANYTIME",
    bio: "Rim protector and paint rebounder.",
    status: "ACTIVE",
    linkedCommunityId: null,
    createdAt: "2026-10-22T10:00:00Z",
  },
];

const mockInvitations = [
  {
    id: "inv-201",
    teamId: "team-bronx-1",
    teamName: "Bronx Bombers",
    role: "PLAYER",
    message: "We need a starting PG for the city tournament!",
    status: "PENDING",
    createdAt: "2026-10-24T09:00:00Z",
  },
];

describe("FreeAgentsView Component (WP-5.5)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders free agent directory with player names and positions", async () => {
    vi.spyOn(apiModule, "api").mockImplementation(async (url) => {
      if (typeof url === "string" && url.startsWith("/free-agents/mine")) {
        return { item: null } as never;
      }
      if (typeof url === "string" && url.startsWith("/free-agents")) {
        return { items: mockFreeAgents } as never;
      }
      if (typeof url === "string" && url.startsWith("/me/team-invitations")) {
        return { items: mockInvitations } as never;
      }
      if (url === "/me") {
        return { id: "my-user-id", email: "player@test.com", displayName: "Ada" } as never;
      }
      return { items: [] } as never;
    });

    renderWithClient(<FreeAgentsView />);

    expect(screen.getByText("Pickup-to-Team Pathway & Free Agents")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Speedy Hooper")).toBeDefined();
      expect(screen.getByText("Big Shot Center")).toBeDefined();
    });

    expect(screen.getByText("PG")).toBeDefined();
    expect(screen.getByText("C")).toBeDefined();
    expect(screen.getByText(/4y experience/)).toBeDefined();
  });

  it("switches to My Status tab and displays team invitations", async () => {
    vi.spyOn(apiModule, "api").mockImplementation(async (url) => {
      if (typeof url === "string" && url.startsWith("/free-agents/mine")) {
        return { item: mockFreeAgents[0] } as never;
      }
      if (typeof url === "string" && url.startsWith("/free-agents")) {
        return { items: mockFreeAgents } as never;
      }
      if (typeof url === "string" && url.startsWith("/me/team-invitations")) {
        return { items: mockInvitations } as never;
      }
      if (url === "/me") {
        return { id: "user-pg-1", email: "player@test.com", displayName: "Speedy Hooper" } as never;
      }
      return { items: [] } as never;
    });

    renderWithClient(<FreeAgentsView />);

    const myStatusBtn = await waitFor(() => screen.getByText(/My Status/i));
    fireEvent.click(myStatusBtn);

    await waitFor(() => {
      expect(screen.getByText("Bronx Bombers")).toBeDefined();
      expect(screen.getByText(/We need a starting PG for the city tournament!/i)).toBeDefined();
    });

    expect(screen.getByText("Accept Invitation")).toBeDefined();
    expect(screen.getByText("Decline")).toBeDefined();
  });
});
