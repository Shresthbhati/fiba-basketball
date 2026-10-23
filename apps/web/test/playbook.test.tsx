import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { PlaybookEditor, DEFAULT_HORNS_PLAY } from "../lib/playbook-editor";
import { interpolateKeyframes } from "../lib/play-animator";
import type { TacticalKeyframe } from "@courtiq/court-renderer";

describe("Playbook Tactical Lab (WP-4.2)", () => {
  it("renders editor with play title, tokens, and ADR-0007 simulation banner", () => {
    render(<PlaybookEditor initialPlay={DEFAULT_HORNS_PLAY} />);

    expect(screen.getByRole("heading", { name: /Horns Pick & Pop/i })).toBeDefined();

    // Mandatory ADR-0007 banner check
    const banner = screen.getByTestId("adr-0007-banner");
    expect(banner).toBeDefined();
    expect(banner.textContent).toContain("Diagrammatic illustration — not a predictive outcome");

    // Tokens rendered in initial step
    expect(screen.getByTestId("token-o1")).toBeDefined();
    expect(screen.getByTestId("token-o4")).toBeDefined();
    expect(screen.getByTestId("token-ball")).toBeDefined();
  });

  it("advances and steps through keyframes using playback controls", () => {
    render(<PlaybookEditor initialPlay={DEFAULT_HORNS_PLAY} />);

    // Initially in Step 1
    expect(screen.getByText(/Initial Horns Setup/i)).toBeDefined();

    // Click Next button
    const nextBtn = screen.getByRole("button", { name: "Next" });
    fireEvent.click(nextBtn);

    // Step 2 description displayed
    expect(screen.getByText(/Ball Screen & Pop/i)).toBeDefined();

    // Click Prev button
    const prevBtn = screen.getByRole("button", { name: "Prev" });
    fireEvent.click(prevBtn);
    expect(screen.getByText(/Initial Horns Setup/i)).toBeDefined();
  });

  it("toggles play/pause deterministic animation", () => {
    vi.useFakeTimers();
    render(<PlaybookEditor initialPlay={DEFAULT_HORNS_PLAY} />);

    const playBtn = screen.getByRole("button", { name: "Play" });
    fireEvent.click(playBtn);

    // Button updates to Pause
    expect(screen.getByRole("button", { name: "Pause" })).toBeDefined();

    // Advance timer slightly
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Pause animation
    const pauseBtn = screen.getByRole("button", { name: "Pause" });
    fireEvent.click(pauseBtn);
    expect(screen.getByRole("button", { name: "Play" })).toBeDefined();
    vi.useRealTimers();
  });

  it("adds a new keyframe step dynamically in authoring workbench", () => {
    render(<PlaybookEditor initialPlay={DEFAULT_HORNS_PLAY} />);

    const addStepBtn = screen.getByRole("button", { name: "+ Add Step" });
    fireEvent.click(addStepBtn);

    // Now has Step 4 button
    expect(screen.getByRole("button", { name: "Step 4" })).toBeDefined();
  });

  it("interpolates tokens deterministically between keyframes", () => {
    const kfs: TacticalKeyframe[] = [
      {
        step: 1,
        description: "Start",
        tokens: [{ id: "t1", type: "offense", label: "1", x: 0.0, y: 0.0 }],
        actions: [],
      },
      {
        step: 2,
        description: "Finish",
        tokens: [{ id: "t1", type: "offense", label: "1", x: 10.0, y: 10.0 }],
        actions: [],
      },
    ];

    // At progress = 0 (Step 1)
    const at0 = interpolateKeyframes(kfs, 0);
    expect(at0.tokens[0]!.x).toBe(0.0);
    expect(at0.tokens[0]!.y).toBe(0.0);

    // At progress = 1 (Step 2)
    const at1 = interpolateKeyframes(kfs, 1);
    expect(at1.tokens[0]!.x).toBe(10.0);
    expect(at1.tokens[0]!.y).toBe(10.0);

    // At progress = 0.5 (halfway between steps with quadratic easing)
    const atHalf = interpolateKeyframes(kfs, 0.5);
    // At t=0.5, easeInOutQuad(0.5) = 2 * 0.25 = 0.5 -> x = 5.0, y = 5.0
    expect(atHalf.tokens[0]!.x).toBeCloseTo(5.0, 1);
    expect(atHalf.tokens[0]!.y).toBeCloseTo(5.0, 1);
  });
});
