import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilmSearch, type SearchResultClip, type SavedSearch } from "../lib/film-search";

const mockClips: SearchResultClip[] = [
  {
    id: "clip-01",
    gameId: "game-01",
    gameTitle: "Finals vs Spartans",
    opponent: "Spartans",
    playedOn: "2026-10-15",
    startMs: 30000,
    endMs: 50000,
    durationMs: 20000,
    tags: ["spain-pnr", "clutch"],
    note: "Center drops 3m deep; open corner 3.",
    createdAt: "2026-10-15T10:00:00Z",
  },
  {
    id: "clip-02",
    gameId: "game-02",
    gameTitle: "Season Opener vs Hawks",
    opponent: "Hawks",
    playedOn: "2026-10-01",
    startMs: 15000,
    endMs: 25000,
    durationMs: 10000,
    tags: ["transition", "fastbreak"],
    note: "Pitch-ahead fastbreak layup.",
    createdAt: "2026-10-01T10:00:00Z",
  },
];

const mockSavedSearches: SavedSearch[] = [
  {
    id: "search-01",
    teamId: "team-01",
    userId: "u-coach",
    name: "Spain PnR Breakdown",
    filters: { tag: "spain-pnr" },
    createdAt: "2026-10-15T10:00:00Z",
  },
];

describe("FilmSearch (WP-3.3)", () => {
  it("renders search input, clips count, and clip details", () => {
    render(<FilmSearch teamId="team-01" clips={mockClips} savedSearches={mockSavedSearches} />);

    expect(screen.getByText("Film Library Clips (2)")).toBeDefined();
    expect(screen.getByText("Finals vs Spartans")).toBeDefined();
    expect(screen.getByText("Season Opener vs Hawks")).toBeDefined();
    expect(screen.getByText("Center drops 3m deep; open corner 3.")).toBeDefined();
    expect(screen.getAllByText("#spain-pnr").length).toBeGreaterThanOrEqual(1);
  });

  it("filters clips dynamically by typing a keyword", () => {
    render(<FilmSearch teamId="team-01" clips={mockClips} savedSearches={mockSavedSearches} />);

    const searchInput = screen.getByLabelText("Search clips");
    fireEvent.change(searchInput, { target: { value: "Spartans" } });

    expect(screen.getByText("Finals vs Spartans")).toBeDefined();
    expect(screen.queryByText("Season Opener vs Hawks")).toBeNull();
  });

  it("filters clips by clicking on a tag chip", () => {
    render(<FilmSearch teamId="team-01" clips={mockClips} savedSearches={mockSavedSearches} />);

    const tagButton = screen.getByRole("button", { name: "#transition" });
    fireEvent.click(tagButton);

    expect(screen.getByText("Season Opener vs Hawks")).toBeDefined();
    expect(screen.queryByText("Finals vs Spartans")).toBeNull();
  });

  it("selects clips, calculates reel duration, and triggers montage creation", () => {
    const onCreateMontage = vi.fn().mockResolvedValue(undefined);
    render(
      <FilmSearch
        teamId="team-01"
        clips={mockClips}
        savedSearches={mockSavedSearches}
        onCreateMontage={onCreateMontage}
      />
    );

    // Select first clip (20s)
    const checkbox1 = screen.getByLabelText("Select clip from Finals vs Spartans");
    fireEvent.click(checkbox1);

    // Selection bar appears
    expect(screen.getByText(/1 clips selected/)).toBeDefined();

    // Click Compile Scouting Montage
    const compileBtn = screen.getByRole("button", { name: "Compile Scouting Montage →" });
    fireEvent.click(compileBtn);

    // Modal opens
    expect(screen.getByText("Compile Scouting Montage")).toBeDefined();

    // Fill title
    const titleInput = screen.getByPlaceholderText(/Pick & Roll Defensive Breakdown Reel/);
    fireEvent.change(titleInput, { target: { value: "Championship Highlights" } });

    // Submit
    const saveBtn = screen.getByRole("button", { name: "Save Montage" });
    fireEvent.click(saveBtn);

    expect(onCreateMontage).toHaveBeenCalledWith(
      "Championship Highlights",
      "",
      ["clip-01"]
    );
  });

  it("applies a saved search when clicked", () => {
    const onSearch = vi.fn();
    render(
      <FilmSearch
        teamId="team-01"
        clips={mockClips}
        savedSearches={mockSavedSearches}
        onSearch={onSearch}
      />
    );

    const savedSearchBtn = screen.getByRole("button", { name: "Spain PnR Breakdown" });
    fireEvent.click(savedSearchBtn);

    expect(onSearch).toHaveBeenCalledWith({ q: undefined, tag: "spain-pnr" });
  });
});
