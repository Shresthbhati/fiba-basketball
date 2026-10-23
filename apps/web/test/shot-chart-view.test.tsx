import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ShotChartView, type ShotChartData } from "../lib/shot-chart-view";

const mockShotChartData: ShotChartData = {
  matchId: "match-1",
  sourceType: "OFFICIAL",
  smallSample: false,
  shots: [
    {
      id: "s1",
      type: "FIELD_GOAL",
      shotType: "TWO_POINT",
      side: "home",
      period: 1,
      clockSeconds: 580,
      playerId: "p1",
      playerName: "Marcus Vance",
      jerseyNumber: 4,
      made: true,
      points: 2,
      coordX: 12.8,
      coordY: 0.2,
      distanceMeters: 0.42,
      zone: "RESTRICTED_AREA",
    },
    {
      id: "s2",
      type: "FIELD_GOAL_MISSED",
      shotType: "TWO_POINT",
      side: "home",
      period: 1,
      clockSeconds: 510,
      playerId: "p1",
      playerName: "Marcus Vance",
      jerseyNumber: 4,
      made: false,
      points: 0,
      coordX: 10.2,
      coordY: 1.5,
      distanceMeters: 2.69,
      zone: "PAINT",
    },
    {
      id: "s3",
      type: "THREE_POINT",
      shotType: "THREE_POINT",
      side: "away",
      period: 2,
      clockSeconds: 440,
      playerId: "p2",
      playerName: "David Kim",
      jerseyNumber: 11,
      made: true,
      points: 3,
      coordX: 5.5,
      coordY: 0.0,
      distanceMeters: 6.93,
      zone: "ABOVE_THE_BREAK_THREE",
    },
  ],
  zones: {
    RESTRICTED_AREA: {
      zone: "RESTRICTED_AREA",
      label: "Restricted Area (Under Rim)",
      makes: 1,
      attempts: 1,
      pct: 100.0,
      points: 2,
      frequencyPct: 33.3,
    },
    PAINT: {
      zone: "PAINT",
      label: "In The Paint (Non-RA)",
      makes: 0,
      attempts: 1,
      pct: 0,
      points: 0,
      frequencyPct: 33.3,
    },
    MID_RANGE: {
      zone: "MID_RANGE",
      label: "Mid-Range",
      makes: 0,
      attempts: 0,
      pct: 0,
      points: 0,
      frequencyPct: 0,
    },
    CORNER_THREE_LEFT: {
      zone: "CORNER_THREE_LEFT",
      label: "Left Corner 3",
      makes: 0,
      attempts: 0,
      pct: 0,
      points: 0,
      frequencyPct: 0,
    },
    CORNER_THREE_RIGHT: {
      zone: "CORNER_THREE_RIGHT",
      label: "Right Corner 3",
      makes: 0,
      attempts: 0,
      pct: 0,
      points: 0,
      frequencyPct: 0,
    },
    ABOVE_THE_BREAK_THREE: {
      zone: "ABOVE_THE_BREAK_THREE",
      label: "Above The Break 3",
      makes: 1,
      attempts: 1,
      pct: 100.0,
      points: 3,
      frequencyPct: 33.3,
    },
    BACKCOURT: {
      zone: "BACKCOURT",
      label: "Backcourt (Heave)",
      makes: 0,
      attempts: 0,
      pct: 0,
      points: 0,
      frequencyPct: 0,
    },
  },
  summary: {
    totalShots: 3,
    totalPoints: 5,
    fgm: 2,
    fga: 3,
    fgPct: 66.7,
    twoPm: 1,
    twoPa: 2,
    twoPPct: 50.0,
    threePm: 1,
    threePa: 1,
    threePPct: 100.0,
    ftm: 0,
    fta: 0,
    ftPct: 0,
    eFgPct: 83.3,
    tsPct: 83.3,
  },
};

describe("ShotChartView component (WP-3.4)", () => {
  it("renders court diagram, OFFICIAL provenance badge, and shooting stats", () => {
    render(<ShotChartView data={mockShotChartData} homeTeamName="Warriors" awayTeamName="Hawks" />);

    expect(screen.getByText("Shot Chart & Zone Efficiency")).toBeDefined();
    expect(screen.getByText("Official")).toBeDefined();
    expect(screen.getByText("Field Goal %")).toBeDefined();
    expect(screen.getByText("Effective FG% (eFG)")).toBeDefined();
    expect(screen.getByText("True Shooting % (TS)")).toBeDefined();
  });

  it("filters shots by team side", () => {
    render(<ShotChartView data={mockShotChartData} homeTeamName="Warriors" awayTeamName="Hawks" />);

    // Click Hawks button (away side)
    const hawksBtn = screen.getByRole("button", { name: "Hawks" });
    fireEvent.click(hawksBtn);

    // Filter summary should reflect only away team shots (1 shot made)
    expect(screen.getByText("1 / 1 made")).toBeDefined();
  });

  it("filters shots by outcome (Makes only)", () => {
    render(<ShotChartView data={mockShotChartData} />);

    const makesBtn = screen.getByRole("button", { name: "Makes" });
    fireEvent.click(makesBtn);

    expect(screen.getByText("2 / 2 made")).toBeDefined();
  });

  it("displays small sample size warning when N < 10", () => {
    render(<ShotChartView data={mockShotChartData} />);

    // Since mock data has 3 shots (< 10), small sample alert should be visible
    expect(screen.getByText(/Small sample size:/i)).toBeDefined();
  });

  it("toggles zone efficiency breakdown table", () => {
    render(<ShotChartView data={mockShotChartData} />);

    const toggleBtn = screen.getByRole("button", { name: "Show Zone Table" });
    fireEvent.click(toggleBtn);

    expect(screen.getByText("Zone Efficiency Breakdown")).toBeDefined();
    expect(screen.getByText("Restricted Area (Under Rim)")).toBeDefined();
    expect(screen.getByText("Above The Break 3")).toBeDefined();
  });
});
