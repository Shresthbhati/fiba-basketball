import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { PassportView, type PassportData } from "../lib/passport-view";

const mockPassportData: PassportData = {
  athlete: {
    displayName: "Breanna Stewart",
  },
  grant: {
    token: "tok-abc-123",
    label: "WNBA Scout Preview",
    expiresAt: "2026-11-15T00:00:00Z",
    permissions: {
      includeAverages: true,
      includeShootingSplits: true,
      includeMinutes: true,
      includeGameLog: true,
      includeBiometrics: true,
    },
  },
  provenance: {
    matchStatsSource: "OFFICIAL",
    verifiedAchievementsCount: 2,
  },
  achievements: [
    {
      id: "ach-1",
      title: "Finals MVP",
      category: "AWARD",
      issuer: "EuroLeague Women",
      verifiedAt: "2026-05-10T00:00:00Z",
    },
    {
      id: "ach-2",
      title: "EuroLeague Champion",
      category: "CHAMPIONSHIP",
      issuer: "EuroLeague Women",
      verifiedAt: "2026-05-10T00:00:00Z",
    },
  ],
  career: {
    games: 28,
    totals: {
      points: 580,
      fgm: 210,
      fga: 420,
      tpm: 55,
      tpa: 140,
      ftm: 105,
      fta: 120,
      rebounds: 252,
      assists: 98,
      turnovers: 42,
      fouls: 56,
    },
    perGame: {
      points: 20.7,
      rebounds: 9.0,
      assists: 3.5,
      turnovers: 1.5,
      fouls: 2.0,
    },
    minutes: {
      games: 28,
      total: 896,
      perGame: 32.0,
    },
    competitions: [
      {
        name: "EuroLeague Women 2026",
        games: 28,
        totals: {
          points: 580,
          fgm: 210,
          fga: 420,
          tpm: 55,
          tpa: 140,
          ftm: 105,
          fta: 120,
          rebounds: 252,
          assists: 98,
          turnovers: 42,
          fouls: 56,
        },
        recent: [],
      },
    ],
  },
  biometrics: [
    {
      protocol: "COUNTERMOVEMENT_JUMP",
      status: "ACCEPTED",
      sourceType: "CV_ESTIMATE",
      confidence: 0.94,
      repCount: 3,
      metrics: { maxJumpHeightInches: 28.2 },
      createdAt: "2026-09-01T00:00:00Z",
    },
  ],
};

describe("PassportView (WP-8.1)", () => {
  it("renders athlete display name, verified achievements, and official badge", () => {
    render(<PassportView data={mockPassportData} />);

    expect(screen.getByRole("heading", { name: /Breanna Stewart/i })).toBeDefined();
    expect(screen.getByText("Finals MVP")).toBeDefined();
    expect(screen.getByText("EuroLeague Champion")).toBeDefined();
    expect(screen.getByText("WNBA Scout Preview")).toBeDefined();
  });

  it("renders per-game averages when includeAverages is true", () => {
    render(<PassportView data={mockPassportData} />);

    expect(screen.getByText("20.7")).toBeDefined();
    expect(screen.getByText("PTS / Game")).toBeDefined();
    expect(screen.getByText("9")).toBeDefined();
    expect(screen.getByText("REB / Game")).toBeDefined();
    expect(screen.getByText("3.5")).toBeDefined();
    expect(screen.getByText("AST / Game")).toBeDefined();
  });

  it("renders shooting splits when includeShootingSplits is true", () => {
    render(<PassportView data={mockPassportData} />);

    const splits = screen.getByTestId("passport-shooting-splits");
    expect(splits).toBeDefined();
    expect(splits.textContent).toContain("210/420 FG (50%)");
    expect(splits.textContent).toContain("55/140 3P (39%)");
  });

  it("hides shooting splits when includeShootingSplits is false", () => {
    const hiddenSplitsData: PassportData = {
      ...mockPassportData,
      grant: {
        ...mockPassportData.grant,
        permissions: {
          ...mockPassportData.grant.permissions,
          includeShootingSplits: false,
        },
      },
    };

    render(<PassportView data={hiddenSplitsData} />);
    expect(screen.queryByTestId("passport-shooting-splits")).toBeNull();
  });

  it("renders verified biometrics with CV_ESTIMATE provenance chip", () => {
    render(<PassportView data={mockPassportData} />);

    expect(screen.getByText(/countermovement jump/i)).toBeDefined();
    expect(screen.getByText(/maxJumpHeightInches: 28.2/i)).toBeDefined();
    expect(screen.getByTestId("passport-biometric-0")).toBeDefined();
  });
});
