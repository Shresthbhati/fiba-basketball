import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CommunitiesView } from "../lib/communities-view";
import * as apiModule from "../lib/api";

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const mockCommunities = [
  {
    id: "comm-10000000-0000-4000-8000-000000000001",
    name: "Brooklyn Sunset Park Ballers",
    slug: "sunset-park-ballers",
    description: "Weekly Sunday morning runs, call your own fouls.",
    city: "Brooklyn, NY",
    primaryCourtId: null,
    isPrivate: false,
    creatorId: "user-creator-1",
    memberCount: 24,
    skillLevel: "INTERMEDIATE",
    createdAt: "2026-10-01T10:00:00Z",
  },
  {
    id: "comm-10000000-0000-4000-8000-000000000002",
    name: "Manhattan Elite Invitation Run",
    slug: "manhattan-elite-run",
    description: "Invitation-only competitive private squad.",
    city: "New York, NY",
    primaryCourtId: null,
    isPrivate: true,
    creatorId: "user-creator-2",
    memberCount: 15,
    skillLevel: "COMPETITIVE",
    createdAt: "2026-10-05T10:00:00Z",
  },
];

describe("CommunitiesView Component (WP-5.2)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders public and private basketball community squads", async () => {
    vi.spyOn(apiModule, "api").mockImplementation(async (url) => {
      if (typeof url === "string" && url.startsWith("/communities")) {
        return { items: mockCommunities } as never;
      }
      if (url === "/me") {
        return { id: "test-user-id", email: "player@test.com", displayName: "Hooper" } as never;
      }
      return {} as never;
    });

    renderWithClient(<CommunitiesView />);

    expect(screen.getByText("Basketball Communities & Squad Hubs")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Brooklyn Sunset Park Ballers")).toBeDefined();
      expect(screen.getByText("Manhattan Elite Invitation Run")).toBeDefined();
    });

    expect(screen.getByText("🌐 Public")).toBeDefined();
    expect(screen.getByText("🔒 Private")).toBeDefined();
    expect(screen.getByText(/24 ballers/)).toBeDefined();
  });

  it("filters squads by city and search term", async () => {
    vi.spyOn(apiModule, "api").mockImplementation(async (url) => {
      if (typeof url === "string" && url.startsWith("/communities")) {
        return { items: mockCommunities } as never;
      }
      return {} as never;
    });

    renderWithClient(<CommunitiesView />);

    await waitFor(() => {
      expect(screen.getByText("Brooklyn Sunset Park Ballers")).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText(/Search by name/i);
    fireEvent.change(searchInput, { target: { value: "Sunset" } });

    await waitFor(() => {
      expect(screen.getByText("Brooklyn Sunset Park Ballers")).toBeDefined();
      expect(screen.queryByText("Manhattan Elite Invitation Run")).toBeNull();
    });
  });
});
