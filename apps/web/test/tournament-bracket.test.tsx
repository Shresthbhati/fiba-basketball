import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MatchRow } from "../lib/competition-types";
import { TournamentBracket } from "../lib/tournament-bracket";

describe("TournamentBracket", () => {
  const teams = [
    { id: "t1", name: "Alpha" },
    { id: "t2", name: "Bravo" },
    { id: "t3", name: "Charlie" },
    { id: "t4", name: "Delta" },
  ];

  it("renders round titles and match-up cards with scores", () => {
    const matches: MatchRow[] = [
      { id: "m1", round: 1, slot: 1, homeTeamId: "t1", awayTeamId: "t2", state: "FINISHED", isBye: false, homeScore: 78, awayScore: 72 },
      { id: "m2", round: 1, slot: 2, homeTeamId: "t3", awayTeamId: "t4", state: "FINISHED", isBye: false, homeScore: 65, awayScore: 80 },
      { id: "m3", round: 2, slot: 1, homeTeamId: "t1", awayTeamId: "t4", state: "LIVE", isBye: false, homeScore: 42, awayScore: 40 },
    ];

    render(<TournamentBracket matches={matches} teams={teams} />);

    // Round labels (round 1 is Semi-finals, round 2 is Final)
    expect(screen.getByText("Semi-finals")).toBeTruthy();
    expect(screen.getByText("Final")).toBeTruthy();

    // Teams in round 1
    expect(screen.getByLabelText("Bracket match Alpha vs Bravo")).toBeTruthy();
    expect(screen.getByLabelText("Bracket match Charlie vs Delta")).toBeTruthy();
    expect(screen.getByText("78")).toBeTruthy();
    expect(screen.getByText("72")).toBeTruthy();

    // Live indicator on final
    expect(screen.getByText("● LIVE")).toBeTruthy();
  });

  it("renders byes with clear indicators", () => {
    const matches: MatchRow[] = [
      { id: "m1", round: 1, slot: 1, homeTeamId: "t1", awayTeamId: null, state: "FINISHED", isBye: true, homeScore: null, awayScore: null },
      { id: "m2", round: 1, slot: 2, homeTeamId: "t2", awayTeamId: "t3", state: "SCHEDULED", isBye: false, homeScore: null, awayScore: null },
    ];

    render(<TournamentBracket matches={matches} teams={teams} />);

    expect(screen.getByLabelText("Bye slot for Alpha")).toBeTruthy();
    expect(screen.getByText("BYE")).toBeTruthy();
  });
});
