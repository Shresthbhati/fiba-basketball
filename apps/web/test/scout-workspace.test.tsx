import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ScoutWorkspace } from "../lib/scout-workspace";
import * as apiModule from "../lib/api";

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const mockCandidates = [
  {
    athleteId: "40000000-0000-4000-8000-000000000001",
    displayName: "Marcus King",
    isMinor: false,
    stats: {
      gamesCount: 14,
      pointsPerGame: 22.4,
      fgPercentage: 51.2,
      provenance: "OFFICIAL",
    },
    combineTesting: {
      maxVerticalJumpCm: 88,
      threeQuarterSprintSec: 3.22,
      provenance: "SENSOR",
    },
    provenanceNotice: "Pure empirical data per ADR-0008; no automated scout score.",
  },
];

const mockShortlists = [
  {
    id: "list-1",
    name: "2027 Point Guard Targets",
    description: "Elite transition playmakers",
    isSharedWithOrg: false,
    memberCount: 3,
    createdAt: "2026-10-24T00:00:00Z",
  },
];

describe("ScoutWorkspace Component (WP-8.4)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders empirical talent search candidates with official box scores and combine metrics", async () => {
    vi.spyOn(apiModule, "api").mockImplementation(async (url) => {
      if (typeof url === "string" && url.startsWith("/scout/talent-search")) {
        return { items: mockCandidates } as never;
      }
      if (typeof url === "string" && url.startsWith("/scout/shortlists")) {
        return { items: mockShortlists } as never;
      }
      return {} as never;
    });

    renderWithClient(<ScoutWorkspace />);

    expect(screen.getByText("Scout Workspace")).toBeDefined();
    expect(screen.getByText("Talent Search")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("Marcus King")).toBeDefined();
    });

    expect(screen.getByText("22.4 PPG")).toBeDefined();
    expect(screen.getByText("51.2%")).toBeDefined();
    expect(screen.getByText("88 cm")).toBeDefined();
    expect(screen.getByText("3.22s")).toBeDefined();
    expect(screen.getByText("+ Add to Shortlist")).toBeDefined();
  });

  it("switches to shortlists tab and displays shortlist cards", async () => {
    vi.spyOn(apiModule, "api").mockImplementation(async (url) => {
      if (typeof url === "string" && url.startsWith("/scout/talent-search")) {
        return { items: mockCandidates } as never;
      }
      if (typeof url === "string" && url.startsWith("/scout/shortlists")) {
        return { items: mockShortlists } as never;
      }
      return {} as never;
    });

    renderWithClient(<ScoutWorkspace />);

    await waitFor(() => {
      expect(screen.getByText("Shortlists (1)")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Shortlists (1)"));

    expect(screen.getByText("My Talent Shortlists")).toBeDefined();
    expect(screen.getByText("2027 Point Guard Targets")).toBeDefined();
  });
});
