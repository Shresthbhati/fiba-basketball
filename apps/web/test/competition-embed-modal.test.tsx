import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompetitionEmbedModal } from "../lib/competition-embed-modal";

describe("CompetitionEmbedModal Component (Spec §8.5, §15.2)", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders embed options, view selectors, and HTML snippet", () => {
    render(
      <CompetitionEmbedModal
        competitionId="comp-789"
        competitionName="City Championship 2026"
        onClose={onClose}
      />
    );

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText(/Embed Live Tournament Widget/i)).toBeDefined();
    expect(screen.getByText(/City Championship 2026/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /Full Overview/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Standings Table/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Playoff Bracket/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Schedule & Results/i })).toBeDefined();
    expect(screen.getByLabelText(/Theme Style/i)).toBeDefined();
    expect(screen.getByLabelText(/Compact Sidebar Mode/i)).toBeDefined();
    expect(screen.getByText(/<iframe src=/i)).toBeDefined();
  });

  it("updates snippet when switching view and theme", () => {
    render(
      <CompetitionEmbedModal
        competitionId="comp-789"
        competitionName="City Championship 2026"
        onClose={onClose}
      />
    );

    // Switch to standings view
    fireEvent.click(screen.getByRole("button", { name: /Standings Table/i }));
    expect(screen.getByText(/embed\/competitions\/comp-789\/standings/i)).toBeDefined();

    // Switch theme to light
    const themeSelect = screen.getByLabelText(/Theme Style/i);
    fireEvent.change(themeSelect, { target: { value: "light" } });
    expect(screen.getByText(/theme=light/i)).toBeDefined();

    // Toggle compact mode
    const compactCheck = screen.getByLabelText(/Compact Sidebar Mode/i);
    fireEvent.click(compactCheck);
    expect(screen.getByText(/compact=true/i)).toBeDefined();
  });

  it("copies snippet to clipboard when Copy Code is clicked", async () => {
    render(
      <CompetitionEmbedModal
        competitionId="comp-789"
        competitionName="City Championship 2026"
        onClose={onClose}
      />
    );

    const copyBtn = screen.getByRole("button", { name: /Copy Code/i });
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining('<iframe src="')
      );
    });

    expect(await screen.findByText(/Copied to Clipboard!/i)).toBeDefined();
  });

  it("calls onClose when Close button or X is clicked", () => {
    render(
      <CompetitionEmbedModal
        competitionId="comp-789"
        competitionName="City Championship 2026"
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
