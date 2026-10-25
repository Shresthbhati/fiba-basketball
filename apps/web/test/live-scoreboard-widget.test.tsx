import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  LiveScoreboardWidget,
  formatClock,
  type EmbedMatchScoreboardData,
} from "../lib/live-scoreboard-widget";

const mockScoreboardData: EmbedMatchScoreboardData = {
  match: {
    id: "match-123",
    competitionId: "comp-456",
    competitionName: "FIBA World League 2026",
    round: 1,
    slot: 1,
    stage: "GROUP",
    groupName: "A",
    courtName: "Center Court",
    scheduledAt: "2026-10-25T18:00:00Z",
    state: "LIVE",
    isBye: false,
  },
  competition: {
    id: "comp-456",
    name: "FIBA World League 2026",
    format: "GROUPS_TO_PLAYOFFS",
    status: "PUBLISHED",
  },
  homeTeam: {
    id: "team-home",
    name: "USA Basketball",
    seed: 1,
  },
  awayTeam: {
    id: "team-away",
    name: "Spain",
    seed: 2,
  },
  score: {
    homeScore: 84,
    awayScore: 78,
    period: 4,
    clockSeconds: 145, // 02:25
    teamFouls: {
      4: { home: 5, away: 3 }, // Home in bonus (5 fouls)
    },
    timeouts: {
      home: 2,
      away: 1,
    },
    periodScores: [
      { period: 1, label: "Q1", home: 22, away: 20 },
      { period: 2, label: "Q2", home: 24, away: 22 },
      { period: 3, label: "Q3", home: 18, away: 21 },
      { period: 4, label: "Q4", home: 20, away: 15 },
    ],
    currentRun: {
      side: "home",
      points: 8,
      unanswered: true,
    },
    lastScoringSide: "home",
    gameEnded: false,
    version: 42,
  },
  streamUrl: "/api/v1/streams/matches/match-123",
};

describe("formatClock helper", () => {
  it("formats standard period countdown clock", () => {
    expect(formatClock(600, 1, "LIVE", false)).toBe("Q1 10:00");
    expect(formatClock(145, 4, "LIVE", false)).toBe("Q4 02:25");
    expect(formatClock(45, 5, "LIVE", false)).toBe("OT1 00:45");
  });

  it("handles upcoming and finished game states", () => {
    expect(formatClock(null, 1, "SCHEDULED", false)).toBe("UPCOMING");
    expect(formatClock(null, 4, "FINISHED", true)).toBe("FINAL");
    expect(formatClock(0, 4, "LOCKED", false)).toBe("FINAL");
  });
});

describe("LiveScoreboardWidget", () => {
  it("renders match details, team names, scores, and live indicators", () => {
    render(<LiveScoreboardWidget initialData={mockScoreboardData} enableSse={false} />);

    expect(screen.getByText("FIBA World League 2026")).toBeDefined();
    expect(screen.getAllByText("USA Basketball").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Spain").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("home-score").textContent).toBe("84");
    expect(screen.getByTestId("away-score").textContent).toBe("78");
    expect(screen.getByTestId("live-indicator")).toBeDefined();
    expect(screen.getByTestId("game-clock").textContent).toBe("Q4 02:25");
  });

  it("renders momentum scoring run banner when a team is on a run >= 4 points", () => {
    render(<LiveScoreboardWidget initialData={mockScoreboardData} enableSse={false} />);

    const runBanner = screen.getByTestId("momentum-run-banner");
    expect(runBanner).toBeDefined();
    expect(runBanner.textContent).toContain("8-0 UNANSWERED RUN BY USA Basketball");
  });

  it("renders team fouls and indicates BONUS when a team reaches 5 fouls in a period", () => {
    render(<LiveScoreboardWidget initialData={mockScoreboardData} enableSse={false} />);

    expect(screen.getByText(/Fouls: 5 \(BONUS\)/)).toBeDefined();
    expect(screen.getByText(/Fouls: 3/)).toBeDefined();
  });

  it("renders linescore breakdown table with all periods and totals", () => {
    render(<LiveScoreboardWidget initialData={mockScoreboardData} enableSse={false} />);

    const table = screen.getByTestId("linescore-table");
    expect(table).toBeDefined();
    expect(screen.getByText("Q1")).toBeDefined();
    expect(screen.getByText("Q2")).toBeDefined();
    expect(screen.getByText("Q3")).toBeDefined();
    expect(screen.getByText("Q4")).toBeDefined();
    expect(screen.getByText("TOTAL")).toBeDefined();
  });

  it("toggles embed code snippet display", () => {
    render(<LiveScoreboardWidget initialData={mockScoreboardData} enableSse={false} />);

    const embedBtn = screen.getByText("</> Embed Scoreboard");
    fireEvent.click(embedBtn);

    expect(screen.getByText("Embed Code:")).toBeDefined();
    expect(screen.getByText("Copy HTML")).toBeDefined();
  });
});
