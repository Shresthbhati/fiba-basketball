import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReadinessDashboard } from "../lib/readiness-dashboard";
import * as apiModule from "../lib/api";

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const mockReadiness = {
  athleteId: "50000000-0000-4000-8000-000000000001",
  athleteName: "Derrick Rose",
  asOf: "2026-10-24T12:00:00Z",
  workload: {
    acuteVolumeKg: 3200,
    chronicWeeklyVolumeKg: 3000,
    acwr: 1.07,
    acuteSessionsCount: 4,
    chronicSessionsCount: 14,
    averageRpe7d: 7.2,
    averageRpe28d: 7.5,
    volumeUnit: "kg",
    provenance: "SELF_REPORTED_AND_LOGGED",
  },
  safetyStop: {
    active: true,
    reason: "Recent wellness check reported elevated soreness or pain.",
    advice: "You reported pain in recent logs. Automatic progressions are locked to HOLD.",
  },
  combineSignature: {
    standingVerticalCm: 76,
    maxVerticalCm: 92,
    threeQuarterSprintSec: 3.15,
    laneAgilitySec: 10.8,
    proAgilitySec: 4.22,
    yoyoLevel: 19.2,
    latestTestedDate: "2026-10-15T00:00:00Z",
    provenance: "SENSOR",
  },
  gamePerformance: {
    gamesCount: 8,
    totalMinutes: 240,
    points: 184,
    pointsPerMinute: 0.77,
    trueShootingPercentage: 58.4,
    turnovers: 16,
    provenance: "OFFICIAL",
  },
  correlationalObservations: [
    {
      category: "VOLUME_PACING",
      observation: "Acute-to-chronic workload ratio of 1.07 indicates steady progressive volume loading.",
      sampleSize: "14 logged workout sessions",
      confidence: "DERIVED",
    },
  ],
  complianceNotice: "ADR-0009 COMPLIANT: This dashboard presents correlational training-to-game metrics only and does NOT output injury probability.",
};

describe("ReadinessDashboard Component (WP-6.3, ADR-0009)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders workload distribution, combine signature, and game efficiency", async () => {
    vi.spyOn(apiModule, "api").mockImplementation(async (url) => {
      if (typeof url === "string" && url.startsWith("/me/readiness")) {
        return mockReadiness as never;
      }
      return {} as never;
    });

    renderWithClient(<ReadinessDashboard />);

    await waitFor(() => {
      expect(screen.getByText("Training-to-Game Readiness & Correlation")).toBeDefined();
    });

    expect(screen.getByText("Athlete: Derrick Rose")).toBeDefined();
    expect(screen.getByText("3,200 kg")).toBeDefined();
    expect(screen.getByText("3,000 kg")).toBeDefined();
    expect(screen.getByText("92 cm")).toBeDefined();
    expect(screen.getByText("3.15s")).toBeDefined();
    expect(screen.getByText("58.4%")).toBeDefined();

    // Verify Safety Stop banner is visible
    expect(screen.getByText("⚠️ SAFETY STOP ACTIVE")).toBeDefined();
    expect(screen.getByText(mockReadiness.safetyStop.reason)).toBeDefined();

    // Verify ADR-0009 disclaimer
    expect(screen.getByText(/ADR-0009 Principle:/)).toBeDefined();
  });
});
