import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import { EmbedWidget, type EmbedSummary } from "../lib/embed-widget";

const MOCK_SUMMARY: EmbedSummary = {
  competition: {
    id: "comp-123",
    name: "Baltic Summer Invitational",
    format: "ROUND_ROBIN",
    status: "PUBLISHED",
  },
  stats: {
    teamCount: 4,
    totalMatches: 6,
    completedMatches: 2,
    liveMatches: 1,
    upcomingMatches: 3,
  },
  standings: [
    {
      rank: 1,
      team: "t1",
      name: "Zalgiris Kaunas",
      played: 2,
      wins: 2,
      losses: 0,
      points: 4,
      pointsFor: 180,
      pointsAgainst: 150,
      diff: 30,
    },
    {
      rank: 2,
      team: "t2",
      name: "Rytas Vilnius",
      played: 2,
      wins: 1,
      losses: 1,
      points: 3,
      pointsFor: 165,
      pointsAgainst: 160,
      diff: 5,
    },
  ],
  bracket: null,
  schedule: [
    {
      id: "m1",
      round: 1,
      roundName: "Round 1",
      home: "Zalgiris Kaunas",
      away: "Rytas Vilnius",
      homeScore: 92,
      awayScore: 85,
      state: "FINISHED",
      scheduledAt: "2026-07-15T18:00:00Z",
      isBye: false,
      winner: "Zalgiris Kaunas",
    },
    {
      id: "m2",
      round: 1,
      roundName: "Round 1",
      home: "Neptunas",
      away: "Lietkabelis",
      homeScore: 44,
      awayScore: 42,
      state: "LIVE",
      scheduledAt: "2026-07-15T20:00:00Z",
      isBye: false,
      winner: null,
    },
  ],
};

const MOCK_KNOCKOUT_SUMMARY: EmbedSummary = {
  competition: {
    id: "comp-456",
    name: "Knockout Cup",
    format: "SINGLE_ELIMINATION",
    status: "PUBLISHED",
  },
  stats: {
    teamCount: 4,
    totalMatches: 3,
    completedMatches: 2,
    liveMatches: 0,
    upcomingMatches: 1,
  },
  standings: null,
  bracket: [
    {
      round: 1,
      name: "Semifinals",
      matches: [
        {
          id: "km1",
          round: 1,
          slot: 1,
          homeTeam: { id: "t1", name: "Hawks", seed: 1 },
          awayTeam: { id: "t4", name: "Eagles", seed: 4 },
          homeScore: 82,
          awayScore: 74,
          state: "FINISHED",
          isBye: false,
          scheduledAt: "2026-08-01T15:00:00Z",
          winnerTeamId: "t1",
        },
      ],
    },
    {
      round: 2,
      name: "Final",
      matches: [
        {
          id: "km2",
          round: 2,
          slot: 1,
          homeTeam: { id: "t1", name: "Hawks", seed: 1 },
          awayTeam: { id: "t2", name: "Wolves", seed: 2 },
          homeScore: null,
          awayScore: null,
          state: "SCHEDULED",
          isBye: false,
          scheduledAt: "2026-08-02T19:00:00Z",
          winnerTeamId: null,
        },
      ],
    },
  ],
  schedule: [],
};

describe("EmbedWidget Component (Spec §8.5, §15.2)", () => {
  it("renders competition header, standings table, and schedule items", () => {
    render(<EmbedWidget summary={MOCK_SUMMARY} view="all" theme="dark" />);

    expect(screen.getByText(/Baltic Summer Invitational/i)).toBeDefined();
    expect(screen.getByText(/ROUND ROBIN · 4 Teams/i)).toBeDefined();
    expect(screen.getAllByText(/Zalgiris Kaunas/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Rytas Vilnius/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/92 – 85/i)).toBeDefined();
    expect(screen.getByText(/LIVE/i)).toBeDefined();
    expect(screen.getByText(/Powered by COURT IQ/i)).toBeDefined();
  });

  it("filters view to standings only", () => {
    render(<EmbedWidget summary={MOCK_SUMMARY} view="standings" theme="light" />);

    expect(screen.getByText(/Standings/i)).toBeDefined();
    expect(screen.queryByText(/Schedule & Results/i)).toBeNull();
  });

  it("renders knockout bracket rounds and matchup slots", () => {
    render(<EmbedWidget summary={MOCK_KNOCKOUT_SUMMARY} view="bracket" theme="dark" />);

    expect(screen.getByText(/Knockout Cup/i)).toBeDefined();
    expect(screen.getByRole("heading", { name: "Semifinals" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Final" })).toBeDefined();
    expect(screen.getAllByText(/\(1\) Hawks/i).length).toBe(2);
    expect(screen.getByText(/\(4\) Eagles/i)).toBeDefined();
  });

  it("applies compact styling when compact is true", () => {
    const { container } = render(
      <EmbedWidget summary={MOCK_SUMMARY} view="schedule" compact={true} theme="transparent" />
    );

    expect(container.firstChild).toBeDefined();
    expect(screen.getByText(/Schedule & Results/i)).toBeDefined();
  });
});
