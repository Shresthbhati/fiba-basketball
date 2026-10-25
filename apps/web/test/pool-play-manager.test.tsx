import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PoolPlayManager } from "../lib/pool-play-manager";
import type { GroupStandingsMap, MatchRow } from "../lib/competition-types";

describe("PoolPlayManager Component (Spec §10.1, §10.2, WP-1.7)", () => {
  const mockGroupStandings: GroupStandingsMap = {
    "Group A": [
      { rank: 1, name: "Eagles", played: 2, wins: 2, losses: 0, pointsFor: 160, pointsAgainst: 135, points: 4, groupName: "Group A" },
      { rank: 2, name: "Tigers", played: 2, wins: 1, losses: 1, pointsFor: 145, pointsAgainst: 145, points: 3, groupName: "Group A" },
      { rank: 3, name: "Bears", played: 2, wins: 0, losses: 2, pointsFor: 130, pointsAgainst: 155, points: 2, groupName: "Group A" },
    ],
    "Group B": [
      { rank: 1, name: "Hawks", played: 2, wins: 2, losses: 0, pointsFor: 178, pointsAgainst: 154, points: 4, groupName: "Group B" },
      { rank: 2, name: "Lions", played: 2, wins: 1, losses: 1, pointsFor: 155, pointsAgainst: 155, points: 3, groupName: "Group B" },
      { rank: 3, name: "Wolves", played: 2, wins: 0, losses: 2, pointsFor: 140, pointsAgainst: 164, points: 2, groupName: "Group B" },
    ],
  };

  const mockMatches: MatchRow[] = [
    // Group A matches
    { id: "m1", round: 1, slot: 1, homeTeamId: "t1", awayTeamId: "t2", state: "FINISHED", isBye: false, homeScore: 80, awayScore: 70, stage: "GROUP", groupName: "Group A" },
    { id: "m2", round: 2, slot: 2, homeTeamId: "t1", awayTeamId: "t3", state: "FINISHED", isBye: false, homeScore: 85, awayScore: 65, stage: "GROUP", groupName: "Group A" },
    { id: "m3", round: 3, slot: 3, homeTeamId: "t2", awayTeamId: "t3", state: "FINISHED", isBye: false, homeScore: 75, awayScore: 70, stage: "GROUP", groupName: "Group A" },
    // Group B matches
    { id: "m4", round: 1, slot: 4, homeTeamId: "t4", awayTeamId: "t5", state: "FINISHED", isBye: false, homeScore: 90, awayScore: 80, stage: "GROUP", groupName: "Group B" },
    { id: "m5", round: 2, slot: 5, homeTeamId: "t4", awayTeamId: "t6", state: "FINISHED", isBye: false, homeScore: 88, awayScore: 74, stage: "GROUP", groupName: "Group B" },
    { id: "m6", round: 3, slot: 6, homeTeamId: "t5", awayTeamId: "t6", state: "FINISHED", isBye: false, homeScore: 80, awayScore: 75, stage: "GROUP", groupName: "Group B" },
    // Playoff matches
    { id: "sf1", round: 1, slot: 1, homeTeamId: "t1", awayTeamId: "t5", state: "SCHEDULED", isBye: false, homeScore: null, awayScore: null, stage: "PLAYOFF" },
    { id: "sf2", round: 1, slot: 2, homeTeamId: "t4", awayTeamId: "t2", state: "SCHEDULED", isBye: false, homeScore: null, awayScore: null, stage: "PLAYOFF" },
    { id: "fn1", round: 2, slot: 1, homeTeamId: null, awayTeamId: null, state: "SCHEDULED", isBye: false, homeScore: null, awayScore: null, stage: "PLAYOFF" },
  ];

  const teamNames: Record<string, string> = {
    t1: "Eagles",
    t2: "Tigers",
    t3: "Bears",
    t4: "Hawks",
    t5: "Lions",
    t6: "Wolves",
  };

  it("renders pool standings for Group A and Group B with qualification indicators", () => {
    render(
      <PoolPlayManager
        competitionId="comp-1"
        competitionName="Athens Summer Invitational"
        groupStandings={mockGroupStandings}
        matches={mockMatches}
        teamNames={teamNames}
        advancePerGroup={2}
      />
    );

    // Header check
    expect(screen.getByText("Athens Summer Invitational — Pool Play & Playoffs")).toBeDefined();
    expect(screen.getByText("Group A")).toBeDefined();
    expect(screen.getByText("Group B")).toBeDefined();

    // Teams rendered
    expect(screen.getByText("Eagles")).toBeDefined();
    expect(screen.getByText("Tigers")).toBeDefined();
    expect(screen.getByText("Hawks")).toBeDefined();
    expect(screen.getByText("Lions")).toBeDefined();

    // ADV (qualification) badges rendered for top 2 in each group (4 total)
    const advBadges = screen.getAllByText("ADV");
    expect(advBadges).toHaveLength(4);
  });

  it("switches to the Playoff Bracket tab and displays playoff rounds", () => {
    render(
      <PoolPlayManager
        competitionId="comp-1"
        competitionName="Athens Summer Invitational"
        groupStandings={mockGroupStandings}
        matches={mockMatches}
        teamNames={teamNames}
        advancePerGroup={2}
      />
    );

    // Switch to Playoff Bracket tab
    const playoffTab = screen.getByRole("tab", { name: /playoff bracket/i });
    fireEvent.click(playoffTab);

    expect(screen.getByText("Semifinals")).toBeDefined();
    expect(screen.getByText("Championship Final")).toBeDefined();

    // Semifinal matchups
    expect(screen.getByText("Eagles")).toBeDefined();
    expect(screen.getByText("Lions")).toBeDefined();
    expect(screen.getByText("Hawks")).toBeDefined();
    expect(screen.getByText("Tigers")).toBeDefined();

    // Final is waiting for qualifiers
    expect(screen.getAllByText("TBD (Group Qualifier)")).toHaveLength(2);
  });

  it("switches to All Fixtures tab and displays grouped match lists", () => {
    render(
      <PoolPlayManager
        competitionId="comp-1"
        competitionName="Athens Summer Invitational"
        groupStandings={mockGroupStandings}
        matches={mockMatches}
        teamNames={teamNames}
        advancePerGroup={2}
      />
    );

    const allFixturesTab = screen.getByRole("tab", { name: /all fixtures/i });
    fireEvent.click(allFixturesTab);

    expect(screen.getByText(/group stage matches \(6\)/i)).toBeDefined();
    expect(screen.getByText(/playoff knockout matches \(3\)/i)).toBeDefined();
  });

  it("renders empty state message when no group standings are available yet", () => {
    render(
      <PoolPlayManager
        competitionId="comp-empty"
        competitionName="Draft Tournament"
        groupStandings={{}}
        matches={[]}
        teamNames={{}}
      />
    );

    expect(
      screen.getByText(/no pool standings calculated yet/i)
    ).toBeDefined();
  });
});
