import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { DualCameraPlayer, type CameraFeedItem } from "../lib/dual-camera-player";

const PRIMARY_FEED: CameraFeedItem = {
  id: "cam-sagittal-1",
  cameraLabel: "PRIMARY_SAGITTAL",
  videoUrl: "https://storage.courtiq.net/mock-sagittal.mp4",
  syncOffsetMs: 0,
  resolution: "1080p",
  fps: 60,
  isPrimary: true,
};

const SECONDARY_FEED: CameraFeedItem = {
  id: "cam-frontal-1",
  cameraLabel: "SECONDARY_FRONTAL",
  videoUrl: "https://storage.courtiq.net/mock-frontal.mp4",
  syncOffsetMs: 120,
  resolution: "1080p",
  fps: 60,
  isPrimary: false,
};

describe("DualCameraPlayer Component (Spec §6.3, §9.2)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders synchronized multi-angle header, camera badges, and sync offset", () => {
    render(
      <DualCameraPlayer
        primaryStream={PRIMARY_FEED}
        secondaryStream={SECONDARY_FEED}
        protocolTitle="Shooting Form & Release Trajectory"
        confidence={0.94}
        kinematicMetrics={{
          releaseAngleDeg: 51.5,
          setPoint: "ABOVE_BROW",
          elbowFlareDeg: 8.2,
        }}
      />,
    );

    expect(screen.getByText(/Synchronized Multi-Angle Review \(Spec §6\.3, §9\.2\)/i)).toBeDefined();
    expect(screen.getByText(/Shooting Form & Release Trajectory/i)).toBeDefined();
    expect(screen.getByText(/CV_ESTIMATE 94%/i)).toBeDefined();
    expect(screen.getByText(/Sync Offset: \+120ms/i)).toBeDefined();

    // Viewport camera labels
    expect(screen.getByText(/Angle 1: PRIMARY SAGITTAL \(PRIMARY\)/i)).toBeDefined();
    expect(screen.getByText(/Angle 2: SECONDARY FRONTAL/i)).toBeDefined();

    // Kinematic HUD
    expect(screen.getByText(/Release: 51\.5°/i)).toBeDefined();
    expect(screen.getByText(/Set Point: ABOVE BROW/i)).toBeDefined();
    expect(screen.getByText(/Elbow Flare: 8\.2°/i)).toBeDefined();
  });

  it("toggles layout mode between Split, Picture-in-Picture, and Primary Only", () => {
    render(
      <DualCameraPlayer
        primaryStream={PRIMARY_FEED}
        secondaryStream={SECONDARY_FEED}
      />,
    );

    const primaryOnlyBtn = screen.getByRole("button", { name: /Primary Only/i });
    fireEvent.click(primaryOnlyBtn);

    // Secondary feed hidden in Primary Only
    expect(screen.queryByText(/Angle 2: SECONDARY FRONTAL/i)).toBeNull();

    const splitBtn = screen.getByRole("button", { name: /Dual Split/i });
    fireEvent.click(splitBtn);
    expect(screen.getByText(/Angle 2: SECONDARY FRONTAL/i)).toBeDefined();
  });

  it("scrubs video timeline and steps individual frames", () => {
    render(
      <DualCameraPlayer
        primaryStream={PRIMARY_FEED}
        secondaryStream={SECONDARY_FEED}
      />,
    );

    const playBtn = screen.getByRole("button", { name: /▶ Play Sync/i });
    fireEvent.click(playBtn);
    expect(screen.getByRole("button", { name: /❚❚ Pause/i })).toBeDefined();

    const nextFrameBtn = screen.getByRole("button", { name: /\+1 Frame ⏭/i });
    fireEvent.click(nextFrameBtn);

    const prevFrameBtn = screen.getByRole("button", { name: /⏮ -1 Frame/i });
    fireEvent.click(prevFrameBtn);
  });

  it("displays biomechanical observations, coaching cues, and ADR-0009 disclaimer", () => {
    render(
      <DualCameraPlayer
        primaryStream={PRIMARY_FEED}
        secondaryStream={SECONDARY_FEED}
        observations={["Consistent fluid energy transfer", "High release angle above contest"]}
        coachingCues={["Drive momentum into extension", "Hold follow-through"]}
      />,
    );

    expect(screen.getByText(/Consistent fluid energy transfer/i)).toBeDefined();
    expect(screen.getByText(/Drive momentum into extension/i)).toBeDefined();
    expect(screen.getByText(/Biomechanical Disclaimer \(ADR-0009\)/i)).toBeDefined();
  });
});
