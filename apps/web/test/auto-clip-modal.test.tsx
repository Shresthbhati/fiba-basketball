import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutoClipModal } from "../lib/auto-clip-modal";

const apiMock = vi.fn();
vi.mock("../lib/api", () => ({
  api: (...args: unknown[]) => apiMock(...args),
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  },
}));

describe("AutoClipModal Component (Spec §6.2, §6.4)", () => {
  const onClipsGenerated = vi.fn();
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders modal with presets, sliders, and action buttons", () => {
    render(
      <AutoClipModal
        gameId="game-123"
        gameTitle="Finals Game 7"
        onClipsGenerated={onClipsGenerated}
        onClose={onClose}
      />
    );

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText(/Automated Event-to-Clip Studio/i)).toBeDefined();
    expect(screen.getByText(/All Scoring Plays/i)).toBeDefined();
    expect(screen.getByText(/All 3-Pointers/i)).toBeDefined();
    expect(screen.getByText(/Turnovers & Stops/i)).toBeDefined();
    expect(screen.getByText(/Assists & Dime Passes/i)).toBeDefined();

    expect(screen.getByLabelText(/Pre-Roll Lead/i)).toBeDefined();
    expect(screen.getByLabelText(/Post-Roll Lag/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Generate Clips/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Create Highlight Reel/i })).toBeDefined();
  });

  it("selects category presets and updates slider values", () => {
    render(
      <AutoClipModal
        gameId="game-123"
        gameTitle="Finals Game 7"
        onClipsGenerated={onClipsGenerated}
        onClose={onClose}
      />
    );

    // Switch preset
    const threePtBtn = screen.getByText(/All 3-Pointers/i);
    fireEvent.click(threePtBtn);

    // Adjust pre-roll lead slider
    const leadSlider = screen.getByLabelText(/Pre-Roll Lead/i);
    fireEvent.change(leadSlider, { target: { value: "6" } });
    expect(screen.getByText(/Pre-Roll Lead: 6s/i)).toBeDefined();

    // Adjust post-roll lag slider
    const lagSlider = screen.getByLabelText(/Post-Roll Lag/i);
    fireEvent.change(lagSlider, { target: { value: "4" } });
    expect(screen.getByText(/Post-Roll Lag: 4s/i)).toBeDefined();
  });

  it("successfully triggers automated clip generation", async () => {
    apiMock.mockResolvedValueOnce({ generatedCount: 6 });

    render(
      <AutoClipModal
        gameId="game-123"
        gameTitle="Finals Game 7"
        onClipsGenerated={onClipsGenerated}
        onClose={onClose}
      />
    );

    const generateBtn = screen.getByRole("button", { name: /Generate Clips/i });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith(
        "/film/games/game-123/auto-clip",
        expect.objectContaining({
          method: "POST",
          body: expect.objectContaining({
            category: "ALL_SCORING",
            leadSeconds: 4,
            lagSeconds: 2,
          }),
        })
      );
    });

    expect(await screen.findByText(/Successfully generated 6 synchronized event clips!/i)).toBeDefined();
    expect(onClipsGenerated).toHaveBeenCalledTimes(1);
  });

  it("successfully triggers automated highlight montage reel creation", async () => {
    apiMock.mockResolvedValueOnce({
      id: "montage-999",
      clipCount: 8,
      title: "Finals Game 7 - ALL SCORING Highlights",
    });

    render(
      <AutoClipModal
        gameId="game-123"
        gameTitle="Finals Game 7"
        onClipsGenerated={onClipsGenerated}
        onClose={onClose}
      />
    );

    const montageBtn = screen.getByRole("button", { name: /Create Highlight Reel/i });
    fireEvent.click(montageBtn);

    await waitFor(() => {
      expect(apiMock).toHaveBeenCalledWith(
        "/film/games/game-123/auto-montage",
        expect.objectContaining({
          method: "POST",
          body: expect.objectContaining({
            category: "ALL_SCORING",
          }),
        })
      );
    });

    expect(await screen.findByText(/Highlight Reel created with 8 clips!/i)).toBeDefined();
    const link = screen.getByRole("link", { name: /Open Highlight Reel Player/i });
    expect(link).toBeDefined();
    expect(link.getAttribute("href")).toBe("/film/montages/montage-999");
    expect(onClipsGenerated).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Cancel is clicked", () => {
    render(
      <AutoClipModal
        gameId="game-123"
        gameTitle="Finals Game 7"
        onClipsGenerated={onClipsGenerated}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
