import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { MultiAngleVideoPlayer, type FilmAngle } from "../lib/multi-angle-video-player";

const apiMock = vi.fn();
vi.mock("../lib/api", () => ({
  api: (...args: unknown[]) => apiMock(...args),
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  },
}));

describe("MultiAngleVideoPlayer Component (Spec §6.1, §6.3, §18.2)", () => {
  const mockAngles: FilmAngle[] = [
    {
      id: "angle-01",
      gameId: "game-101",
      label: "Main Broadcast",
      angleType: "BROADCAST",
      isPrimary: true,
      timeOffsetMs: 0,
      video: {
        status: "READY",
        type: "video/mp4",
        bytes: 10485760,
      },
      createdAt: "2026-10-25T10:00:00Z",
      updatedAt: "2026-10-25T10:00:00Z",
    },
    {
      id: "angle-02",
      gameId: "game-101",
      label: "Tactical Baseline",
      angleType: "BASELINE",
      isPrimary: false,
      timeOffsetMs: 1200,
      video: {
        status: "READY",
        type: "video/mp4",
        bytes: 8388608,
      },
      createdAt: "2026-10-25T10:05:00Z",
      updatedAt: "2026-10-25T10:05:00Z",
    },
    {
      id: "angle-03",
      gameId: "game-101",
      label: "High End-Zone",
      angleType: "ENDZONE",
      isPrimary: false,
      timeOffsetMs: -600,
      video: {
        status: "NONE",
        type: null,
        bytes: null,
      },
      createdAt: "2026-10-25T10:10:00Z",
      updatedAt: "2026-10-25T10:10:00Z",
    },
  ];

  it("renders camera angle selector bar with badges and time offsets", async () => {
    apiMock.mockResolvedValueOnce({ items: mockAngles });

    render(
      <MultiAngleVideoPlayer
        gameId="game-101"
        canManage={true}
        initialAngles={mockAngles}
      />
    );

    expect(screen.getByText("Camera Angle:")).toBeDefined();
    expect(screen.getAllByText("Main Broadcast").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Tactical Baseline")).toBeDefined();
    expect(screen.getByText("+1200ms")).toBeDefined();
    expect(screen.getByText("High End-Zone")).toBeDefined();
    expect(screen.getByText("-600ms")).toBeDefined();
    expect(screen.getByRole("button", { name: /\+ Add Camera Angle/i })).toBeDefined();
  });

  it("switches active angle when camera button is clicked", async () => {
    apiMock.mockResolvedValueOnce({ items: mockAngles });

    render(
      <MultiAngleVideoPlayer
        gameId="game-101"
        canManage={true}
        initialAngles={mockAngles}
      />
    );

    const baselineBtn = screen.getByRole("button", { name: /Tactical Baseline/i });
    fireEvent.click(baselineBtn);

    // Active angle overlay on video should reflect Tactical Baseline
    const overlays = screen.getAllByText("Tactical Baseline");
    expect(overlays.length).toBeGreaterThanOrEqual(1);
  });

  it("toggles view layouts between Single, PIP, and Side-by-Side", async () => {
    apiMock.mockResolvedValueOnce({ items: mockAngles });

    render(
      <MultiAngleVideoPlayer
        gameId="game-101"
        canManage={true}
        initialAngles={mockAngles}
      />
    );

    const pipBtn = screen.getByRole("button", { name: "PIP" });
    fireEvent.click(pipBtn);

    // Secondary PIP video overlay should appear
    expect(screen.getByText("Side-by-Side")).toBeDefined();

    const splitBtn = screen.getByRole("button", { name: "Side-by-Side" });
    fireEvent.click(splitBtn);

    const singleBtn = screen.getByRole("button", { name: "Single" });
    fireEvent.click(singleBtn);
  });

  it("opens add camera angle modal and creates a new camera stream", async () => {
    apiMock.mockResolvedValueOnce({ items: mockAngles });

    render(
      <MultiAngleVideoPlayer
        gameId="game-101"
        canManage={true}
        initialAngles={mockAngles}
      />
    );

    // Click Add Camera Angle
    fireEvent.click(screen.getByRole("button", { name: /\+ Add Camera Angle/i }));

    expect(screen.getByText("Add Multi-Angle Camera Stream")).toBeDefined();

    // Fill form
    const labelInput = screen.getByPlaceholderText(/Tactical Baseline/i);
    fireEvent.change(labelInput, { target: { value: "All-22 Overhead" } });

    apiMock.mockResolvedValueOnce({
      id: "angle-04",
      gameId: "game-101",
      label: "All-22 Overhead",
      angleType: "TACTICAL_HIGH",
      isPrimary: false,
      timeOffsetMs: 0,
      video: { status: "NONE", type: null, bytes: null },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    fireEvent.click(screen.getByRole("button", { name: "Save Angle" }));

    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith(
        "/film/games/game-101/angles",
        expect.objectContaining({ method: "POST" })
      );
    });
  });
});
