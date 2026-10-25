import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  TacticalAnalysisWorkspace,
  type TacticalCandidateEvent,
  type PlaySimilarityMatch,
  type ScenarioSimulationResult,
  type TacticalModel,
} from "../lib/tactical-analysis-workspace";
import * as apiModule from "../lib/api";

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const mockTeams = {
  items: [{ id: "team-001", name: "Apex Raptors" }],
};

const mockCandidates: { candidates: TacticalCandidateEvent[]; count: number } = {
  candidates: [
    {
      id: "cand-001",
      gameId: "game-001",
      teamId: "team-001",
      eventType: "PICK_AND_ROLL",
      timestampSeconds: 145.2,
      courtCoordinates: { x: 0.5, y: 7.2 },
      involvedPlayerIds: ["player-1"],
      confidenceScore: 0.92,
      status: "CANDIDATE",
      modelVersion: "v1.2.0",
      createdAt: "2026-10-24T18:00:00Z",
    },
  ],
  count: 1,
};

const mockPlays = {
  items: [
    { id: "play-001", title: "Horns PnR" },
    { id: "play-002", title: "Horns Pop" },
  ],
};

const mockSimilarMatches: { matches: PlaySimilarityMatch[]; total: number } = {
  matches: [
    {
      play: {
        id: "play-002",
        title: "Horns Pop",
        category: "offense",
        courtMode: "half",
        tags: ["horns", "pick-and-pop"],
      },
      similarityScore: 0.8845,
      similarityPercent: 88,
      spatialFeatures: {
        primaryAction: "screen",
        startQuadrant: "top_key",
        endQuadrant: "wing",
        passCount: 1,
        screenCount: 1,
        trajectoryLengthMeters: 14.5,
      },
    },
  ],
  total: 1,
};

const mockSimulations: { simulations: ScenarioSimulationResult[]; count: number } = {
  simulations: [
    {
      id: "sim-001",
      teamId: "team-001",
      title: "Horns PnR vs Drop Coverage",
      coverageType: "DROP",
      simulationLevel: 3,
      offensiveSetup: { action: "SPREAD_HORNS_PNR" },
      defensiveResponse: {
        coverageType: "DROP",
        positions: [{ role: "DROP_BIG", x: 0, y: 3.5 }],
      },
      coverageMetrics: {
        spaceAdvantageScore: 74,
        contestedShotRisk: 26,
        openLaneCount: 1,
        secondaryHelpDelaySec: 1.2,
      },
      tacticalAnalysis: "Drop coverage keeps the rim protector in the paint to prevent layups.",
      disclaimer: "Level 3 Rule-Based Scenario Simulation — tactical schematic illustration, not an empirical outcome prediction.",
      createdAt: "2026-10-24T19:00:00Z",
    },
  ],
  count: 1,
};

const mockModels: { models: TacticalModel[]; count: number } = {
  models: [
    {
      id: "mod-001",
      modelVersion: "v1.2.0",
      modelType: "TACTICAL_CANDIDATE",
      benchmarkDataset: "NCAA-2026-VALIDATION",
      metrics: {
        accuracy: 0.924,
        f1Score: 0.912,
        precision: 0.935,
        recall: 0.891,
        sampleSize: 1500,
      },
      status: "ACTIVE",
      createdAt: "2026-10-24T12:00:00Z",
    },
  ],
  count: 1,
};

describe("TacticalAnalysisWorkspace Component (Phase 7, WP-7.1–WP-7.4, ADR-0016)", () => {
  beforeEach(() => {
    vi.spyOn(apiModule, "api").mockImplementation((url: string) => {
      if (url.includes("/api/v1/teams/mine")) {
        return Promise.resolve(mockTeams);
      }
      if (url.includes("/candidates")) {
        return Promise.resolve(mockCandidates);
      }
      if (url.includes("/playbook/plays")) {
        return Promise.resolve(mockPlays);
      }
      if (url.includes("/similar")) {
        return Promise.resolve(mockSimilarMatches);
      }
      if (url.includes("/simulations")) {
        return Promise.resolve(mockSimulations);
      }
      if (url.includes("/models")) {
        return Promise.resolve(mockModels);
      }
      return Promise.resolve({});
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders workspace header with Phase 7 badge and navigation tabs", async () => {
    renderWithClient(<TacticalAnalysisWorkspace initialTeamId="team-001" />);

    expect(screen.getByText("Tactical Intelligence & Simulation Lab")).toBeDefined();
    expect(screen.getByText("Phase 7")).toBeDefined();
    expect(screen.getByText("Candidate Queue (WP-7.1)")).toBeDefined();
    expect(screen.getByText("Play Similarity (WP-7.2)")).toBeDefined();
    expect(screen.getByText("Coverage Simulator (WP-7.3)")).toBeDefined();
    expect(screen.getByText("Model Registry (WP-7.4)")).toBeDefined();
  });

  it("displays candidate tracking events and allows review confirmation (WP-7.1)", async () => {
    renderWithClient(<TacticalAnalysisWorkspace initialTeamId="team-001" />);

    await waitFor(() => {
      expect(screen.getByText("PICK AND ROLL")).toBeDefined();
    });

    expect(screen.getByText("92% Confidence")).toBeDefined();
    expect(screen.getByText("Confirm")).toBeDefined();
    expect(screen.getByText("Reject")).toBeDefined();

    fireEvent.click(screen.getByText("Confirm"));
    await waitFor(() => {
      expect(apiModule.api).toHaveBeenCalledWith(
        "/api/v1/tactical/candidates/cand-001/review",
        expect.objectContaining({ method: "PATCH" })
      );
    });
  });

  it("displays cosine play concept similarity (WP-7.2)", async () => {
    renderWithClient(<TacticalAnalysisWorkspace initialTeamId="team-001" />);

    // Switch to similarity tab
    fireEvent.click(screen.getByText("Play Similarity (WP-7.2)"));

    await waitFor(() => {
      expect(screen.getByText("Cosine Concept Similarity Engine")).toBeDefined();
      expect(screen.getByText("Horns PnR")).toBeDefined();
    });

    // Select play
    const select = screen.getByDisplayValue("-- Choose Play from Playbook --");
    fireEvent.change(select, { target: { value: "play-001" } });

    await waitFor(() => {
      expect(screen.getByText("88% Match")).toBeDefined();
      expect(screen.getAllByText("Horns Pop").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("displays Level 3 Rule-Based Scenario Simulator with disclaimer (WP-7.3)", async () => {
    renderWithClient(<TacticalAnalysisWorkspace initialTeamId="team-001" />);

    // Switch to simulator tab
    fireEvent.click(screen.getByText("Coverage Simulator (WP-7.3)"));

    await waitFor(() => {
      expect(screen.getByText("Level 3 Rule-Based Scenario Simulator")).toBeDefined();
      expect(screen.getByText("Horns PnR vs Drop Coverage")).toBeDefined();
    });

    expect(screen.getByText("74/100")).toBeDefined(); // space advantage
    expect(screen.getByText("26/100")).toBeDefined(); // contested shot risk
    expect(
      screen.getByText(/Level 3 Rule-Based Scenario Simulation — tactical schematic illustration/i)
    ).toBeDefined();
  });

  it("displays Model Registry and allows rollback dialog trigger (WP-7.4)", async () => {
    renderWithClient(<TacticalAnalysisWorkspace initialTeamId="team-001" />);

    // Switch to models tab
    fireEvent.click(screen.getByText("Model Registry (WP-7.4)"));

    await waitFor(() => {
      expect(screen.getByText("Audited Model Registry & Rollback Governance")).toBeDefined();
      expect(screen.getByText("Version v1.2.0")).toBeDefined();
    });

    expect(screen.getByText("92.4%")).toBeDefined(); // accuracy
    expect(screen.getByText("Rollback Model")).toBeDefined();

    // Trigger rollback dialog
    fireEvent.click(screen.getByText("Rollback Model"));

    await waitFor(() => {
      expect(screen.getByText("Rollback Model v1.2.0")).toBeDefined();
      expect(screen.getByText("Confirm Rollback")).toBeDefined();
    });
  });
});
