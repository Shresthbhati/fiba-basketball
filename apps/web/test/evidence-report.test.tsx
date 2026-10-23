import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { EvidenceReportView, type TacticalReport } from "../lib/evidence-report";

const mockReport: TacticalReport = {
  id: "rep-101",
  teamId: "team-001",
  title: "Transition Defense vs Lions",
  summary: "Comprehensive scouting report analyzing transition breakdowns and pick & roll coverage.",
  createdBy: "user-coach",
  tags: ["scouting", "transition", "defense"],
  version: 2,
  createdAt: "2026-10-23T10:00:00Z",
  updatedAt: "2026-10-23T12:00:00Z",
  blocks: [
    {
      id: "b1",
      title: "Cross-Match Confusion in Semi-Transition",
      claimType: "OBSERVED",
      statement: "Opponent guard attacks mismatch before our 4 can cross-match on defensive retreat.",
      citations: [
        { citationType: "CLIP", targetId: "clip-01", gameId: "game-99", timestampMs: 75000, note: "Q2 4:10 fastbreak" },
      ],
    },
    {
      id: "b2",
      title: "Transition Efficiency Differential",
      claimType: "DERIVED",
      statement: "Our team allowed 1.42 points per possession when failing to get 3 players back on the shot.",
      sampleSize: 18,
      confidence: 0.94,
      citations: [
        { citationType: "METRIC", targetId: "PPP_TRANSITION_ALLOWED", note: "Computed from official box score play log" },
      ],
    },
    {
      id: "b3",
      title: "Corner Crash Crumbles Defensive Balance",
      claimType: "HYPOTHESIS",
      statement: "Crashing the offensive glass from weakside corner leaves floor unbalanced for transition.",
      citations: [
        { citationType: "EVENT", targetId: "evt-55", note: "Turnover leading to fastbreak layup" },
      ],
    },
  ],
};

describe("EvidenceReportView (WP-3.5)", () => {
  it("renders report title, summary, version, and tags", () => {
    render(<EvidenceReportView report={mockReport} />);

    expect(screen.getByRole("heading", { name: /Transition Defense vs Lions/i })).toBeDefined();
    expect(screen.getByText(/Comprehensive scouting report/i)).toBeDefined();
    expect(screen.getByText("v2")).toBeDefined();
    expect(screen.getByText("#scouting")).toBeDefined();
    expect(screen.getByText("#transition")).toBeDefined();
  });

  it("renders claim blocks with OBSERVED, DERIVED, and HYPOTHESIS badges", () => {
    render(<EvidenceReportView report={mockReport} />);

    expect(screen.getByTestId("claim-type-observed")).toBeDefined();
    expect(screen.getByTestId("claim-type-derived")).toBeDefined();
    expect(screen.getByTestId("claim-type-hypothesis")).toBeDefined();

    expect(screen.getByText("OBSERVED EVIDENCE")).toBeDefined();
    expect(screen.getByText("DERIVED METRIC")).toBeDefined();
    expect(screen.getByText("TACTICAL HYPOTHESIS")).toBeDefined();
  });

  it("displays sample size and confidence metrics for derived claims", () => {
    render(<EvidenceReportView report={mockReport} />);

    expect(screen.getByText("n = 18")).toBeDefined();
    expect(screen.getByText("94% conf")).toBeDefined();
  });

  it("renders evidence citations with formatted timestamps", () => {
    render(<EvidenceReportView report={mockReport} />);

    // 75000 ms -> 01:15
    expect(screen.getByText(/Play Clip \(01:15\)/i)).toBeDefined();
    expect(screen.getByText(/Q2 4:10 fastbreak/i)).toBeDefined();
    expect(screen.getByText(/PPP_TRANSITION_ALLOWED/i)).toBeDefined();
    expect(screen.getByText(/evt-55/i)).toBeDefined();
  });
});
