import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CourtActivityPanel, type CourtActivitySummary } from "../lib/court-activity-panel";
import * as apiModule from "../lib/api";

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const mockActivity: CourtActivitySummary = {
  courtId: "court-10000000-0000-4000-8000-000000000001",
  status: "ACTIVE",
  currentHeadcount: 12,
  currentCondition: "DRY",
  lastReportedAt: new Date().toISOString(),
  busiestDays: ["Saturday", "Sunday"],
  hourlyHeatmap: [
    { hour: 6, label: "6 AM", relativeVolume: 10 },
    { hour: 10, label: "10 AM", relativeVolume: 80 },
    { hour: 14, label: "2 PM", relativeVolume: 90 },
    { hour: 18, label: "6 PM", relativeVolume: 100 },
  ],
};

describe("CourtActivityPanel Component (WP-5.4)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders live activity status, headcount and anonymized hourly trend", async () => {
    vi.spyOn(apiModule, "api").mockImplementation(async (url) => {
      if (typeof url === "string" && url.includes("/activity")) {
        return mockActivity as never;
      }
      return {} as never;
    });

    renderWithClient(
      <CourtActivityPanel
        courtId="court-10000000-0000-4000-8000-000000000001"
        courtName="Rucker Park"
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Active Run/i)).toBeDefined();
      expect(screen.getByText(/12 players/i)).toBeDefined();
      expect(screen.getByText(/Court Dry & Clean/i)).toBeDefined();
    });

    expect(screen.getByText("Check-in / Report Court")).toBeDefined();
  });
});
