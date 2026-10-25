import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OpponentScoutingDossier,
  type OpponentTendencyData,
} from "../lib/opponent-scouting-dossier";

const apiMock = vi.fn();
vi.mock("../lib/api", () => ({
  api: (...args: unknown[]) => apiMock(...args),
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  },
}));

const MOCK_TENDENCY: OpponentTendencyData = {
  opponent: {
    id: "opp-123",
    name: "Kaunas Zalgiris",
  },
  sampleSize: 5,
  record: {
    wins: 4,
    losses: 1,
    winRate: 80,
  },
  paceAndScoring: {
    ppg: 88.4,
    oppPpg: 79.2,
    netDifferential: 9.2,
  },
  shotProfile: {
    twoPointRate: 58,
    threePointRate: 42,
    twoPointPct: 54,
    threePointPct: 39,
    freeThrowRate: 26,
  },
  ballControl: {
    assistsPerGame: 19.6,
    turnoversPerGame: 11.2,
    astToRatio: 1.8,
  },
  keyThreats: [
    {
      playerId: "p1",
      name: "Keenan Evans",
      gamesPlayed: 5,
      ppg: 17.4,
      rpg: 3.2,
      apg: 5.6,
      threePointRate: 48,
      roleTag: "Perimeter Sharpshooter",
    },
    {
      playerId: "p2",
      name: "Laurynas Birutis",
      gamesPlayed: 5,
      ppg: 12.8,
      rpg: 7.4,
      apg: 1.2,
      threePointRate: 0,
      roleTag: "Interior Glass Cleaner / Paint Finisher",
    },
  ],
  tacticalRecommendations: [
    "Over-the-screen PnR coverage to deny Keenan Evans pull-up 3-pointers.",
    "Trap sideline ball screens to disrupt 1.8 AST/TO flow.",
  ],
};

describe("OpponentScoutingDossier Component (Spec §10.2, §11.1, §11.4)", () => {
  const onReportGenerated = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders opponent name, record, pace cards, and shot breakdown", () => {
    render(
      <OpponentScoutingDossier
        data={MOCK_TENDENCY}
        teamId="my-team-01"
        onReportGenerated={onReportGenerated}
      />
    );

    expect(screen.getByText(/Kaunas Zalgiris — Opponent Scouting Dossier/i)).toBeDefined();
    expect(screen.getByText(/5 Games Evaluated/i)).toBeDefined();
    expect(screen.getByText(/Record: 4W – 1L \(80%\)/i)).toBeDefined();

    expect(screen.getByText("88.4")).toBeDefined();
    expect(screen.getByText("79.2")).toBeDefined();
    expect(screen.getByText("+9.2")).toBeDefined();

    expect(screen.getByText(/3-Point Rate \(42%\)/i)).toBeDefined();
    expect(screen.getByText(/39% 3P Accuracy/i)).toBeDefined();
    expect(screen.getAllByText(/1.8 AST\/TO/i).length).toBeGreaterThan(0);
  });

  it("renders key personnel threats and tactical recommendations", () => {
    render(
      <OpponentScoutingDossier
        data={MOCK_TENDENCY}
        teamId="my-team-01"
        onReportGenerated={onReportGenerated}
      />
    );

    expect(screen.getByText("Keenan Evans")).toBeDefined();
    expect(screen.getByText("Perimeter Sharpshooter")).toBeDefined();
    expect(screen.getByText("Laurynas Birutis")).toBeDefined();
    expect(screen.getByText("Interior Glass Cleaner / Paint Finisher")).toBeDefined();

    expect(screen.getByText(/Over-the-screen PnR coverage/i)).toBeDefined();
    expect(screen.getByText(/Trap sideline ball screens/i)).toBeDefined();
  });

  it("triggers report generation and displays success link", async () => {
    apiMock.mockResolvedValueOnce({
      report: { id: "report-new-777" },
    });

    render(
      <OpponentScoutingDossier
        data={MOCK_TENDENCY}
        teamId="my-team-01"
        onReportGenerated={onReportGenerated}
      />
    );

    const btn = screen.getByRole("button", { name: /Save as Tactical Report/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith(
        "/teams/my-team-01/scouting/opponents/opp-123/generate",
        expect.objectContaining({
          method: "POST",
          body: {
            title: "Tactical Dossier: Kaunas Zalgiris",
          },
        })
      );
    });

    expect(await screen.findByText(/Tactical Scouting Dossier saved to team reports!/i)).toBeDefined();
    const link = screen.getByRole("link", { name: /View Team Tactical Reports/i });
    expect(link.getAttribute("href")).toBe("/teams/my-team-01/reports");
    expect(onReportGenerated).toHaveBeenCalledWith("report-new-777");
  });
});
