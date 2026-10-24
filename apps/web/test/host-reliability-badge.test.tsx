import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  HostReliabilityBadge,
  PostRunReviewModal,
  type HostReliabilityMetrics,
} from "../lib/host-reliability-badge";
import * as apiModule from "../lib/api";

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const mockMetrics: HostReliabilityMetrics = {
  hostId: "host-10000000-0000-4000-8000-000000000001",
  hostName: "Coach Marcus",
  totalGamesHosted: 14,
  completedGames: 13,
  cancelledGames: 1,
  completionRatePercent: 93,
  reviewsCount: 11,
  averageRating: 4.8,
  runConfirmationPercent: 100,
  onTimePercent: 91,
  reliabilityScore: 94,
  hostTier: "PROVEN_COMMUNITY_LEADER",
};

describe("HostReliabilityBadge Component (WP-5.3)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders host tier pill and reliability metrics", async () => {
    vi.spyOn(apiModule, "api").mockImplementation(async (url) => {
      if (typeof url === "string" && url.includes("/reliability")) {
        return mockMetrics as never;
      }
      return {} as never;
    });

    renderWithClient(
      <HostReliabilityBadge hostId="host-10000000-0000-4000-8000-000000000001" />
    );

    await waitFor(() => {
      expect(screen.getByText("Proven Leader")).toBeDefined();
      expect(screen.getByText("94% reliability")).toBeDefined();
      expect(screen.getByText(/4.8/)).toBeDefined();
    });
  });

  it("renders post-run review modal for participants", () => {
    const onClose = vi.fn();
    renderWithClient(
      <PostRunReviewModal
        gameId="game-1"
        gameTitle="Saturday Run"
        hostName="Coach Marcus"
        isOpen={true}
        onClose={onClose}
      />
    );

    expect(screen.getByText(/Post-Run Review: Saturday Run/i)).toBeDefined();
    expect(screen.getByText(/Did the run actually happen as posted?/i)).toBeDefined();
    expect(screen.getByText("Submit Review")).toBeDefined();
  });
});
