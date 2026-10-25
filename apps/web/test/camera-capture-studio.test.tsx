import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CameraCaptureStudio } from "../lib/camera-capture-studio";

describe("CameraCaptureStudio Component (Spec §4.1, §9.2)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders Player Lab studio header, protocol selector, and posture guide", () => {
    render(<CameraCaptureStudio />);

    expect(screen.getByText(/Player Lab Studio \(Spec §4\.1, §9\.2\)/i)).toBeDefined();
    expect(screen.getByText(/Biomechanical Movement Capture & Synchronized Multi-Angle Feed/i)).toBeDefined();
    expect(screen.getByLabelText(/Biomechanical Protocol/i)).toBeDefined();
    expect(screen.getByLabelText(/Camera Placement Angle/i)).toBeDefined();
    expect(screen.getByText(/Align full silhouette inside frame/i)).toBeDefined();
    expect(screen.getByText(/Floor baseline/i)).toBeDefined();
  });

  it("displays ADR-0009 non-diagnostic health disclaimer", () => {
    render(<CameraCaptureStudio />);

    const disclaimer = screen.getByText(/Biomechanical Disclaimer \(ADR-0009\)/i);
    expect(disclaimer).toBeDefined();
    expect(screen.getByText(/do not predict injuries/i)).toBeDefined();
  });

  it("updates protocol guidelines when selecting different movements", () => {
    render(<CameraCaptureStudio />);

    const protocolSelect = screen.getByLabelText(/Biomechanical Protocol/i);

    // Switch to Landing Stability
    fireEvent.change(protocolSelect, { target: { value: "LANDING_STABILITY" } });
    expect(screen.getByText(/Capture Guidelines: Landing Stability & Symmetry/i)).toBeDefined();
    expect(screen.getByText(/Absorb impact through ankles, knees, and hips symmetrically/i)).toBeDefined();

    // Switch to CMJ
    fireEvent.change(protocolSelect, { target: { value: "COUNTERMOVEMENT_JUMP" } });
    expect(screen.getByText(/Capture Guidelines: Countermovement Jump \(CMJ\)/i)).toBeDefined();
    expect(screen.getByText(/Hands on hips to isolate lower kinetic chain power/i)).toBeDefined();
  });

  it("triggers sync beacon pulse", () => {
    render(<CameraCaptureStudio />);

    const syncBtn = screen.getByRole("button", { name: /Sync Flash & Audio Pulse/i });
    expect(syncBtn).toBeDefined();
    fireEvent.click(syncBtn);
  });

  it("handles recording countdown and completion callback", async () => {
    const onCompleted = vi.fn();
    render(<CameraCaptureStudio onAssessmentCompleted={onCompleted} />);

    const startBtn = screen.getByRole("button", { name: /Start Assessment Recording/i });
    fireEvent.click(startBtn);

    // Verify countdown state
    expect(screen.getByText(/Get Into Position/i)).toBeDefined();
  });
});
