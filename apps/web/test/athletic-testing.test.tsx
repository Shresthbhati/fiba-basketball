import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import {
  AthleticTestingView,
  type CombineProfile,
  type Protocol,
  type TestSession,
} from "../lib/athletic-testing";

const mockProtocols: Protocol[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    slug: "standing-vertical-jump",
    name: "Standing Vertical Jump",
    category: "JUMP",
    description: "Bilateral countermovement jump with no approach step.",
    primaryMetricUnit: "cm",
    sortDirection: "DESC",
    equipmentRequirements: "Calibrated Vertec vanes.",
    warmupRecommendations: "Dynamic mobility, 3 jumps.",
    standardAttempts: 3,
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    slug: "three-quarter-court-sprint",
    name: "3/4 Court Sprint (22.86m)",
    category: "SPEED",
    description: "Linear transition sprint from baseline to opposite free-throw line.",
    primaryMetricUnit: "seconds",
    sortDirection: "ASC",
    equipmentRequirements: "Dual-beam timing gates.",
    warmupRecommendations: "Sprint build-ups.",
    standardAttempts: 3,
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    slug: "lane-agility-drill",
    name: "Lane Agility Drill (5.8m x 4.9m)",
    category: "AGILITY",
    description: "Perimeter key agility drill.",
    primaryMetricUnit: "seconds",
    sortDirection: "ASC",
    equipmentRequirements: "Timing gates, 4 cones.",
    warmupRecommendations: "Defensive slides.",
    standardAttempts: 2,
  },
];

const mockProfile: CombineProfile = {
  athlete: {
    id: "user-1",
    displayName: "Marcus Smart",
  },
  cohort: "COLLEGIATE_MALE",
  signature: {
    powerPercentile: 65,
    speedPercentile: 75,
    agilityPercentile: 70,
    conditioningPercentile: null,
    combineIndex: 70,
    testsCompleted: 3,
  },
  personalBests: [
    {
      slug: "standing-vertical-jump",
      name: "Standing Vertical Jump",
      category: "JUMP",
      unit: "cm",
      bestValue: 74.0,
      percentile: 65,
      instrumentType: "VERTEC_VANES",
      sourceType: "OFFICIAL",
      achievedDate: "2026-10-20",
      sessionId: "sess-1",
    },
    {
      slug: "three-quarter-court-sprint",
      name: "3/4 Court Sprint (22.86m)",
      category: "SPEED",
      unit: "seconds",
      bestValue: 3.20,
      percentile: 75,
      instrumentType: "TIMING_GATES_DUAL_BEAM",
      sourceType: "OFFICIAL",
      achievedDate: "2026-10-20",
      sessionId: "sess-1",
    },
  ],
};

const mockSessions: TestSession[] = [
  {
    id: "sess-1",
    testDate: "2026-10-20",
    location: "Center Court",
    surface: "HARDWOOD",
    notes: "Official team combine",
    attemptCount: 6,
  },
];

describe("AthleticTestingView", () => {
  it("renders the combine athletic signature, combine index, and pillar percentiles", () => {
    render(
      <AthleticTestingView
        initialProtocols={mockProtocols}
        initialProfile={mockProfile}
        initialSessions={mockSessions}
      />,
    );

    expect(screen.getByTestId("athletic-testing-workbench")).toBeDefined();
    expect(screen.getByText("Athletic Performance Combine & Testing Battery")).toBeDefined();
    expect(screen.getByTestId("combine-index-value").textContent).toBe("70");

    // Pillar labels
    expect(screen.getByText("Explosive Power")).toBeDefined();
    expect(screen.getByText("65th")).toBeDefined();
    expect(screen.getByText("Transition Speed")).toBeDefined();
    expect(screen.getByText("75th")).toBeDefined();
    expect(screen.getByText("Change of Direction")).toBeDefined();
    expect(screen.getByText("70th")).toBeDefined();
  });

  it("renders protocol cards with personal bests and provenance badges", () => {
    render(
      <AthleticTestingView
        initialProtocols={mockProtocols}
        initialProfile={mockProfile}
        initialSessions={mockSessions}
      />,
    );

    const vertCard = screen.getByTestId("protocol-card-standing-vertical-jump");
    expect(vertCard).toBeDefined();
    expect(vertCard.textContent).toContain("74 cm");
    expect(vertCard.textContent).toContain("65th %ile");
    expect(vertCard.textContent).toContain("Official");

    const sprintCard = screen.getByTestId("protocol-card-three-quarter-court-sprint");
    expect(sprintCard).toBeDefined();
    expect(sprintCard.textContent).toContain("3.2 seconds");
    expect(sprintCard.textContent).toContain("75th %ile");

    // Untested protocol
    const laneCard = screen.getByTestId("protocol-card-lane-agility-drill");
    expect(laneCard).toBeDefined();
    expect(laneCard.textContent).toContain("No recorded attempts yet");
  });

  it("filters protocol cards by category buttons", () => {
    render(
      <AthleticTestingView
        initialProtocols={mockProtocols}
        initialProfile={mockProfile}
        initialSessions={mockSessions}
      />,
    );

    expect(screen.getByTestId("protocol-card-standing-vertical-jump")).toBeDefined();
    expect(screen.getByTestId("protocol-card-three-quarter-court-sprint")).toBeDefined();

    // Click JUMP filter
    fireEvent.click(screen.getByRole("button", { name: "JUMP" }));
    expect(screen.getByTestId("protocol-card-standing-vertical-jump")).toBeDefined();
    expect(screen.queryByTestId("protocol-card-three-quarter-court-sprint")).toBeNull();

    // Click All Protocols
    fireEvent.click(screen.getByRole("button", { name: "All Protocols" }));
    expect(screen.getByTestId("protocol-card-three-quarter-court-sprint")).toBeDefined();
  });

  it("switches to sessions history tab and displays past sessions", () => {
    render(
      <AthleticTestingView
        initialProtocols={mockProtocols}
        initialProfile={mockProfile}
        initialSessions={mockSessions}
      />,
    );

    fireEvent.click(screen.getByTestId("tab-history"));
    expect(screen.getByTestId("sessions-history")).toBeDefined();
    expect(screen.getByTestId("session-row-sess-1").textContent).toContain("2026-10-20");
    expect(screen.getByTestId("session-row-sess-1").textContent).toContain("Center Court");
    expect(screen.getByTestId("session-row-sess-1").textContent).toContain("6 attempts");
  });

  it("opens modal and records a valid athletic test attempt", async () => {
    const handleSave = vi.fn().mockResolvedValue(undefined);

    render(
      <AthleticTestingView
        initialProtocols={mockProtocols}
        initialProfile={mockProfile}
        initialSessions={mockSessions}
        onSaveAttempt={handleSave}
      />,
    );

    fireEvent.click(screen.getByTestId("log-test-button"));
    expect(screen.getByTestId("logging-modal")).toBeDefined();

    // Fill in measurement: 77.5 cm
    const rawInput = screen.getByTestId("modal-raw-value-input");
    fireEvent.change(rawInput, { target: { value: "77.5" } });

    // Submit form
    fireEvent.click(screen.getByTestId("modal-submit-button"));

    expect(handleSave).toHaveBeenCalledWith({
      protocolId: "10000000-0000-4000-8000-000000000001",
      rawValue: 77.5,
      isFault: false,
      faultReason: undefined,
      instrumentType: "VERTEC_VANES",
      sourceType: "SELF_REPORTED",
      notes: undefined,
    });
  });

  it("records a fault attempt with reason without requiring raw measurement", async () => {
    const handleSave = vi.fn().mockResolvedValue(undefined);

    render(
      <AthleticTestingView
        initialProtocols={mockProtocols}
        initialProfile={mockProfile}
        initialSessions={mockSessions}
        onSaveAttempt={handleSave}
      />,
    );

    fireEvent.click(screen.getByTestId("log-test-button"));

    // Check fault box
    const faultBox = screen.getByTestId("modal-fault-checkbox");
    fireEvent.click(faultBox);

    // Fill in fault reason
    const reasonInput = screen.getByTestId("modal-fault-reason-input");
    fireEvent.change(reasonInput, { target: { value: "False start triggered sensor" } });

    // Submit form
    fireEvent.click(screen.getByTestId("modal-submit-button"));

    expect(handleSave).toHaveBeenCalledWith({
      protocolId: "10000000-0000-4000-8000-000000000001",
      rawValue: 0,
      isFault: true,
      faultReason: "False start triggered sensor",
      instrumentType: "VERTEC_VANES",
      sourceType: "SELF_REPORTED",
      notes: undefined,
    });
  });
});
