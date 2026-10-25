import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TelestratorCanvas,
  type FilmAnnotation,
} from "../lib/telestrator-canvas";

const apiMock = vi.fn();
vi.mock("../lib/api", () => ({
  api: (...args: unknown[]) => apiMock(...args),
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  },
}));

const MOCK_ANNOTATIONS: FilmAnnotation[] = [
  {
    id: "annot-111",
    gameId: "game-123",
    clipId: null,
    timestampMs: 14200,
    durationMs: 3000,
    title: "Backdoor Cut & Help Rotation",
    category: "TACTICAL",
    shapes: [
      {
        id: "s1",
        type: "ARROW",
        color: "#ef4444",
        coordinates: { x1: 25, y1: 50, x2: 45, y2: 60 },
      },
    ],
    notes: "Watch the help defender cheating too high.",
    createdBy: "coach-1",
    createdAt: "2026-10-25T10:00:00Z",
  },
  {
    id: "annot-222",
    gameId: "game-123",
    clipId: null,
    timestampMs: 38500,
    durationMs: 5000,
    title: "Zone Breakdown",
    category: "DEFENSIVE_BREAKDOWN",
    shapes: [
      {
        id: "s2",
        type: "SPOTLIGHT",
        color: "#3b82f6",
        coordinates: { x1: 50, y1: 50, radius: 15 },
      },
    ],
    notes: "High post gap wide open.",
    createdBy: "coach-1",
    createdAt: "2026-10-25T10:05:00Z",
  },
];

describe("TelestratorCanvas Component (Spec §6.3, §6.8, WP-3.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders toolbar, tools palette, color picker, and loaded annotations", async () => {
    apiMock.mockResolvedValueOnce({ items: MOCK_ANNOTATIONS });

    render(<TelestratorCanvas gameId="game-123" currentTimestampMs={15000} />);

    expect(screen.getByText("Telestrator Studio")).toBeDefined();
    expect(screen.getByRole("toolbar", { name: /Telestrator drawing tools/i })).toBeDefined();

    // Tools available
    expect(screen.getByRole("button", { name: "Arrow" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Circle" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Spotlight" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Rectangle" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Freehand" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Text" })).toBeDefined();

    // Verify loaded annotations appear in list
    await waitFor(() => {
      expect(screen.getByText("Backdoor Cut & Help Rotation")).toBeDefined();
      expect(screen.getByText("Zone Breakdown")).toBeDefined();
    });
  });

  it("allows selecting drawing tools and seeking to keyframe timestamp on click", async () => {
    apiMock.mockResolvedValueOnce({ items: MOCK_ANNOTATIONS });
    const seekSpy = vi.fn();

    render(
      <TelestratorCanvas
        gameId="game-123"
        currentTimestampMs={10000}
        onSeek={seekSpy}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Backdoor Cut & Help Rotation")).toBeDefined();
    });

    // Click first annotation
    const annotItem = screen.getByText("Backdoor Cut & Help Rotation");
    fireEvent.click(annotItem);

    // Verify onSeek was called with 14200 ms
    expect(seekSpy).toHaveBeenCalledWith(14200);

    // Switch tool to Spotlight
    const spotlightBtn = screen.getByRole("button", { name: "Spotlight" });
    fireEvent.click(spotlightBtn);
    expect(spotlightBtn.className).toContain("bg-emerald-600");
  });

  it("handles empty annotations list gracefully", async () => {
    apiMock.mockResolvedValueOnce({ items: [] });

    render(<TelestratorCanvas gameId="game-123" currentTimestampMs={5000} />);

    await waitFor(() => {
      expect(screen.getByText(/No telestrator annotations yet for this game/i)).toBeDefined();
    });
  });

  it("filters keyframes by category", async () => {
    apiMock.mockResolvedValueOnce({ items: MOCK_ANNOTATIONS });

    render(<TelestratorCanvas gameId="game-123" />);

    await waitFor(() => {
      expect(screen.getByText("Backdoor Cut & Help Rotation")).toBeDefined();
      expect(screen.getByText("Zone Breakdown")).toBeDefined();
    });

    // Select category filter DEFENSIVE_BREAKDOWN
    const filterSelect = screen.getByDisplayValue("All Categories");
    fireEvent.change(filterSelect, { target: { value: "DEFENSIVE_BREAKDOWN" } });

    expect(screen.queryByText("Backdoor Cut & Help Rotation")).toBeNull();
    expect(screen.getByText("Zone Breakdown")).toBeDefined();
  });
});
