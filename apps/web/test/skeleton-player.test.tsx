import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { SkeletonPlayer, generateSampleFrames } from "../lib/skeleton-player";

describe("SkeletonPlayer (WP-2.7)", () => {
  it("renders viewport with HUD metrics and frame counter", () => {
    const frames = generateSampleFrames("BODYWEIGHT_SQUAT");
    render(<SkeletonPlayer protocol="BODYWEIGHT_SQUAT" frames={frames} />);

    expect(screen.getAllByText("STANDING").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Knee Flexion:/)).toBeDefined();
    expect(screen.getByText(/Trunk Lean:/)).toBeDefined();
    expect(screen.getByText(/Frame 1 \/ 30/)).toBeDefined();
  });

  it("steps forward and backward through kinematic frames", () => {
    const frames = generateSampleFrames("BODYWEIGHT_SQUAT");
    const onFrameChange = vi.fn();
    render(<SkeletonPlayer protocol="BODYWEIGHT_SQUAT" frames={frames} onFrameChange={onFrameChange} />);

    expect(screen.getByText(/Frame 1 \/ 30/)).toBeDefined();

    // Step forward 1 frame
    const nextBtn = screen.getByRole("button", { name: "Next frame" });
    fireEvent.click(nextBtn);

    expect(screen.getByText(/Frame 2 \/ 30/)).toBeDefined();
    expect(onFrameChange).toHaveBeenCalledTimes(1);

    // Step backward 1 frame
    const prevBtn = screen.getByRole("button", { name: "Previous frame" });
    fireEvent.click(prevBtn);

    expect(screen.getByText(/Frame 1 \/ 30/)).toBeDefined();
  });

  it("jumps directly to peak flexion / lowest depth keyframe", () => {
    const frames = generateSampleFrames("BODYWEIGHT_SQUAT");
    render(<SkeletonPlayer protocol="BODYWEIGHT_SQUAT" frames={frames} />);

    const peakBtn = screen.getByRole("button", { name: "Peak Flexion / Depth" });
    fireEvent.click(peakBtn);

    // Should now be in INFLECTION phase
    expect(screen.getAllByText("INFLECTION").length).toBeGreaterThanOrEqual(1);
  });

  it("toggles play/pause state", () => {
    const frames = generateSampleFrames("BODYWEIGHT_SQUAT");
    render(<SkeletonPlayer protocol="BODYWEIGHT_SQUAT" frames={frames} />);

    const playBtn = screen.getByRole("button", { name: "▶ Play" });
    fireEvent.click(playBtn);

    expect(screen.getByRole("button", { name: "⏸ Pause" })).toBeDefined();
  });
});
