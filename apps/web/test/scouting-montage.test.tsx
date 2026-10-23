import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScoutingMontageView, type ScoutingMontageData } from "../lib/scouting-montage";

const sampleMontage: ScoutingMontageData = {
  id: "montage-101",
  teamId: "team-001",
  title: "Playoff Transition Scouting Montage",
  description: "Highlighting transition fastbreak pace and rim-running spacing.",
  tags: ["playoffs", "transition", "fastbreak"],
  totalDurationMs: 35000,
  createdBy: "user-coach",
  createdAt: "2026-10-23T10:00:00Z",
  updatedAt: "2026-10-23T10:00:00Z",
  items: [
    {
      clipId: "c1",
      gameId: "g1",
      order: 1,
      startMs: 10000,
      endMs: 25000,
      title: "Corner Flare 3PT",
      note: "Wing sprint to corner",
    },
    {
      clipId: "c2",
      gameId: "g2",
      order: 2,
      startMs: 40000,
      endMs: 60000,
      title: "Pitch Ahead Layup",
      note: "Outlet pass beats press",
    },
  ],
};

describe("ScoutingMontageView (WP-3.3)", () => {
  it("renders montage title, description, total duration, and initial clip", () => {
    render(<ScoutingMontageView montage={sampleMontage} />);

    expect(screen.getByText("Playoff Transition Scouting Montage")).toBeDefined();
    expect(screen.getByText(/Highlighting transition fastbreak pace/)).toBeDefined();
    expect(screen.getByText("00:35")).toBeDefined(); // 35000ms = 35s
    expect(screen.getAllByText("Corner Flare 3PT").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Clip 1 of 2")).toBeDefined();
  });

  it("advances to next clip on clicking Next Clip button", () => {
    render(<ScoutingMontageView montage={sampleMontage} />);

    expect(screen.getByText("Clip 1 of 2")).toBeDefined();

    const nextBtn = screen.getByRole("button", { name: "Next Clip ▶" });
    fireEvent.click(nextBtn);

    expect(screen.getByText("Clip 2 of 2")).toBeDefined();
    expect(screen.getAllByText("Pitch Ahead Layup").length).toBeGreaterThanOrEqual(1);
  });

  it("toggles play/pause state", () => {
    render(<ScoutingMontageView montage={sampleMontage} />);

    const playBtn = screen.getByRole("button", { name: "▶ Play Reel" });
    fireEvent.click(playBtn);

    expect(screen.getByRole("button", { name: "⏸ Pause Reel" })).toBeDefined();
  });

  it("selects clip directly by clicking playlist item", () => {
    render(<ScoutingMontageView montage={sampleMontage} />);

    // Click on second playlist item
    const secondClipItem = screen.getByText("Outlet pass beats press");
    fireEvent.click(secondClipItem);

    expect(screen.getByText("Clip 2 of 2")).toBeDefined();
  });
});
