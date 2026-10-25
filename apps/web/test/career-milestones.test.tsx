import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CareerMilestones, type MilestoneProgressItem } from "../lib/career-milestones";

describe("CareerMilestones Component (Spec §11.1, §11.3)", () => {
  const sampleMilestones: MilestoneProgressItem[] = [
    {
      key: "CENTURY_CLUB_100_PTS",
      title: "Century Club (100 Career Points)",
      category: "SCORING",
      targetValue: 100,
      currentValue: 100,
      progressPct: 100,
      unit: "Points",
      description: "Surpassed 100 total career points in official matches.",
      isUnlocked: true,
      unlockedAt: "2026-10-24T18:00:00.000Z",
    },
    {
      key: "PERIMETER_THREAT_25_3PM",
      title: "Perimeter Threat (25 3-Pointers Made)",
      category: "SHOOTING",
      targetValue: 25,
      currentValue: 15,
      progressPct: 60,
      unit: "3PM",
      description: "Drained 25 three-pointers in official match play.",
      isUnlocked: false,
      unlockedAt: null,
    },
    {
      key: "FLOOR_GENERAL_50_AST",
      title: "Floor General (50 Career Assists)",
      category: "PLAYMAKING",
      targetValue: 50,
      currentValue: 25,
      progressPct: 50,
      unit: "Assists",
      description: "Dished out 50 career assists in official matches.",
      isUnlocked: false,
      unlockedAt: null,
    },
  ];

  it("renders unlocked badges and progress percentage for locked milestones", () => {
    render(
      <CareerMilestones
        achievements={[]}
        milestones={sampleMilestones}
      />
    );

    expect(screen.getByText(/1 \/ 3 Unlocked/i)).toBeDefined();
    expect(screen.getByText(/Century Club \(100 Career Points\)/i)).toBeDefined();
    expect(screen.getByText(/✓ Unlocked/i)).toBeDefined();

    // In-progress item check
    expect(screen.getByText(/Perimeter Threat \(25 3-Pointers Made\)/i)).toBeDefined();
    expect(screen.getByText(/15 \/ 25 3PM/i)).toBeDefined();
    expect(screen.getByText(/60%/i)).toBeDefined();
  });

  it("filters milestones by Unlocked and In Progress tabs", () => {
    render(
      <CareerMilestones
        achievements={[]}
        milestones={sampleMilestones}
      />
    );

    // Switch to Unlocked tab
    const unlockedTab = screen.getByRole("button", { name: /Unlocked \(1\)/i });
    fireEvent.click(unlockedTab);

    expect(screen.getByText(/Century Club \(100 Career Points\)/i)).toBeDefined();
    expect(screen.queryByText(/Perimeter Threat \(25 3-Pointers Made\)/i)).toBeNull();

    // Switch to In Progress tab
    const inProgressTab = screen.getByRole("button", { name: /In Progress \(2\)/i });
    fireEvent.click(inProgressTab);

    expect(screen.queryByText(/Century Club \(100 Career Points\)/i)).toBeNull();
    expect(screen.getByText(/Perimeter Threat \(25 3-Pointers Made\)/i)).toBeDefined();
    expect(screen.getByText(/Floor General \(50 Career Assists\)/i)).toBeDefined();
  });

  it("calls onRefresh when refresh button is clicked", () => {
    const handleRefresh = vi.fn();
    render(
      <CareerMilestones
        achievements={[]}
        milestones={sampleMilestones}
        onRefresh={handleRefresh}
      />
    );

    const refreshBtn = screen.getByRole("button", { name: /Refresh Badges/i });
    fireEvent.click(refreshBtn);
    expect(handleRefresh).toHaveBeenCalledTimes(1);
  });
});
