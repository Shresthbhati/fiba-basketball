"use client";

import React, { useState } from "react";
import Link from "next/link";

export interface SearchResultClip {
  id: string;
  gameId: string;
  gameTitle: string;
  opponent?: string | null;
  playedOn?: string | null;
  startMs: number;
  endMs: number;
  durationMs: number;
  tags: string[];
  note?: string | null;
  createdAt: string;
}

export interface SavedSearch {
  id: string;
  teamId: string;
  userId: string;
  name: string;
  filters: {
    q?: string | undefined;
    tag?: string | undefined;
    gameId?: string | undefined;
    minDurationMs?: number | undefined;
    maxDurationMs?: number | undefined;
  };
  createdAt: string;
}

export interface FilmSearchProps {
  teamId: string;
  clips: SearchResultClip[];
  savedSearches?: SavedSearch[];
  onSearch?: (filters: { q?: string; tag?: string }) => void;
  onSaveSearch?: (name: string, filters: { q?: string; tag?: string }) => Promise<void>;
  onDeleteSavedSearch?: (id: string) => Promise<void>;
  onCreateMontage?: (title: string, description: string, clipIds: string[]) => Promise<void>;
}

export function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

export const FilmSearch: React.FC<FilmSearchProps> = ({
  clips,
  savedSearches = [],
  onSearch,
  onSaveSearch,
  onDeleteSavedSearch,
  onCreateMontage,
}) => {
  const [keyword, setKeyword] = useState("");
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedClips, setSelectedClips] = useState<SearchResultClip[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newSearchName, setNewSearchName] = useState("");
  const [showMontageModal, setShowMontageModal] = useState(false);
  const [montageTitle, setMontageTitle] = useState("");
  const [montageDesc, setMontageDesc] = useState("");
  const [savingMontage, setSavingMontage] = useState(false);

  // Extract unique tags from clips
  const allTags = Array.from(new Set(clips.flatMap((c) => c.tags)));

  const handleKeywordChange = (val: string) => {
    setKeyword(val);
    if (onSearch) onSearch({ q: val || undefined, tag: selectedTag || undefined });
  };

  const handleTagToggle = (tag: string) => {
    const next = selectedTag === tag ? null : tag;
    setSelectedTag(next);
    if (onSearch) onSearch({ q: keyword || undefined, tag: next || undefined });
  };

  const handleApplySavedSearch = (s: SavedSearch) => {
    setKeyword(s.filters.q || "");
    setSelectedTag(s.filters.tag || null);
    if (onSearch) onSearch({ q: s.filters.q, tag: s.filters.tag });
  };

  const handleToggleSelectClip = (clip: SearchResultClip) => {
    if (selectedClips.some((c) => c.id === clip.id)) {
      setSelectedClips(selectedClips.filter((c) => c.id !== clip.id));
    } else {
      setSelectedClips([...selectedClips, clip]);
    }
  };

  const totalMontageDurationMs = selectedClips.reduce((sum, c) => sum + c.durationMs, 0);

  const handleSaveSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSearchName.trim() || !onSaveSearch) return;
    await onSaveSearch(newSearchName.trim(), {
      q: keyword || undefined,
      tag: selectedTag || undefined,
    });
    setNewSearchName("");
    setShowSaveModal(false);
  };

  const handleCreateMontageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!montageTitle.trim() || !onCreateMontage) return;
    setSavingMontage(true);
    try {
      await onCreateMontage(
        montageTitle.trim(),
        montageDesc.trim(),
        selectedClips.map((c) => c.id)
      );
      setSelectedClips([]);
      setShowMontageModal(false);
      setMontageTitle("");
      setMontageDesc("");
    } finally {
      setSavingMontage(false);
    }
  };

  // Local filtering if no server-side handler provided
  const displayClips = clips.filter((clip) => {
    if (selectedTag && !clip.tags.includes(selectedTag)) return false;
    if (keyword) {
      const q = keyword.toLowerCase();
      const matchNote = clip.note?.toLowerCase().includes(q) ?? false;
      const matchGame = clip.gameTitle.toLowerCase().includes(q);
      const matchOpponent = clip.opponent?.toLowerCase().includes(q) ?? false;
      const matchTags = clip.tags.some((t) => t.toLowerCase().includes(q));
      if (!matchNote && !matchGame && !matchOpponent && !matchTags) return false;
    }
    return true;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Search Bar & Controls */}
      <div
        style={{
          border: "1px solid var(--cq-border, #e5e7eb)",
          borderRadius: 12,
          padding: 20,
          background: "var(--cq-card-bg, #ffffff)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <input
              type="text"
              aria-label="Search clips"
              placeholder="Search by notes, opponent, game, or tactical tags..."
              value={keyword}
              onChange={(e) => handleKeywordChange(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                fontSize: 14,
              }}
            />
          </div>

          <button
            type="button"
            onClick={() => setShowSaveModal(true)}
            style={{
              padding: "9px 14px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "#f9fafb",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            💾 Save Search
          </button>
        </div>

        {/* Saved Searches Pills */}
        {savedSearches.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--cq-text-muted, #6b7280)" }}>
              Saved Searches:
            </span>
            {savedSearches.map((s) => (
              <span
                key={s.id}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "3px 10px",
                  borderRadius: 16,
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  fontSize: 12,
                  color: "#1e40af",
                  cursor: "pointer",
                }}
              >
                <button
                  type="button"
                  onClick={() => handleApplySavedSearch(s)}
                  style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", padding: 0, fontWeight: 600 }}
                >
                  {s.name}
                </button>
                {onDeleteSavedSearch && (
                  <button
                    type="button"
                    aria-label={`Delete saved search ${s.name}`}
                    onClick={() => onDeleteSavedSearch(s.id)}
                    style={{ background: "none", border: "none", color: "#9ca3af", cursor: "pointer", padding: 0, fontSize: 12 }}
                  >
                    ✕
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {/* Tag Filters */}
        {allTags.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--cq-text-muted, #6b7280)" }}>
              Filter by Tag:
            </span>
            {allTags.map((tag) => {
              const active = selectedTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleTagToggle(tag)}
                  style={{
                    padding: "3px 8px",
                    borderRadius: 6,
                    fontSize: 12,
                    border: active ? "1px solid #1e3a8a" : "1px solid #e5e7eb",
                    background: active ? "#1e3a8a" : "#f3f4f6",
                    color: active ? "#ffffff" : "#374151",
                    fontWeight: active ? 700 : 500,
                    cursor: "pointer",
                  }}
                >
                  #{tag}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Results Header & Montage Selection Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontSize: 18, margin: 0, fontWeight: 700 }}>
            Film Library Clips ({displayClips.length})
          </h2>
          <span style={{ fontSize: 13, color: "var(--cq-text-muted, #6b7280)" }}>
            Select clips to compile a shareable scouting montage reel.
          </span>
        </div>

        {selectedClips.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "6px 14px",
              background: "#f0fdf4",
              border: "1px solid #86efac",
              borderRadius: 8,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: "#166534" }}>
              {selectedClips.length} clips selected ({formatMs(totalMontageDurationMs)})
            </span>
            <button
              type="button"
              onClick={() => setShowMontageModal(true)}
              style={{
                padding: "6px 12px",
                background: "#166534",
                color: "#ffffff",
                border: "none",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Compile Scouting Montage →
            </button>
          </div>
        )}
      </div>

      {/* Results List */}
      {displayClips.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", border: "2px dashed #d1d5db", borderRadius: 12, color: "#6b7280" }}>
          <p style={{ margin: "0 0 6px 0", fontSize: 16, fontWeight: 600 }}>No film clips match your search filters.</p>
          <span style={{ fontSize: 13 }}>Try clearing your tag filter or searching for another keyword.</span>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {displayClips.map((clip) => {
            const isSelected = selectedClips.some((c) => c.id === clip.id);
            return (
              <div
                key={clip.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14,
                  padding: 16,
                  borderRadius: 8,
                  border: isSelected ? "2px solid #1e3a8a" : "1px solid var(--cq-border, #e5e7eb)",
                  background: isSelected ? "#f8fafc" : "#ffffff",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                }}
              >
                {/* Select Checkbox */}
                <input
                  type="checkbox"
                  aria-label={`Select clip from ${clip.gameTitle}`}
                  checked={isSelected}
                  onChange={() => handleToggleSelectClip(clip)}
                  style={{ width: 18, height: 18, marginTop: 3, cursor: "pointer" }}
                />

                {/* Main Clip Meta */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <Link
                      href={`/film/${clip.gameId}`}
                      style={{ fontSize: 15, fontWeight: 700, color: "#1e3a8a", textDecoration: "none" }}
                    >
                      {clip.gameTitle}
                    </Link>
                    {clip.opponent && (
                      <span style={{ fontSize: 13, color: "#6b7280" }}>
                        vs. {clip.opponent}
                      </span>
                    )}
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: 12,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 12,
                        background: "#f3f4f6",
                        color: "#374151",
                      }}
                    >
                      ⏱ {formatMs(clip.startMs)} – {formatMs(clip.endMs)} ({Math.round(clip.durationMs / 1000)}s)
                    </span>
                  </div>

                  {clip.note && (
                    <p style={{ margin: "4px 0 8px 0", fontSize: 14, color: "#374151", lineHeight: 1.4 }}>
                      {clip.note}
                    </p>
                  )}

                  {/* Tags */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {clip.tags.map((t) => (
                      <span
                        key={t}
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "1px 6px",
                          borderRadius: 4,
                          background: "#e0f2fe",
                          color: "#0369a1",
                        }}
                      >
                        #{t}
                      </span>
                    ))}
                    {clip.playedOn && (
                      <span style={{ fontSize: 12, color: "#9ca3af", marginLeft: "auto" }}>
                        📅 {clip.playedOn}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Save Search Modal */}
      {showSaveModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Save Search Filter"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
        >
          <form
            onSubmit={handleSaveSearchSubmit}
            style={{
              background: "#ffffff",
              borderRadius: 12,
              padding: 24,
              maxWidth: 450,
              width: "100%",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
          >
            <h3 style={{ margin: "0 0 12px 0", fontSize: 18, fontWeight: 700 }}>Save Search Filter</h3>
            <p style={{ margin: "0 0 16px 0", fontSize: 13, color: "#6b7280" }}>
              Save current keyword ({keyword ? `"${keyword}"` : "None"}) and tag filter ({selectedTag ? `#${selectedTag}` : "None"}) to quick-access later.
            </p>
            <input
              type="text"
              required
              aria-label="Search name"
              placeholder="e.g. Q4 Clutch Sets, Spain PnR Defense"
              value={newSearchName}
              onChange={(e) => setNewSearchName(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                marginBottom: 16,
                fontSize: 14,
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid #d1d5db", background: "#f9fafb", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "#1e3a8a", color: "#ffffff", fontWeight: 600, cursor: "pointer" }}
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Compile Montage Modal */}
      {showMontageModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create Scouting Montage"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: 16,
          }}
        >
          <form
            onSubmit={handleCreateMontageSubmit}
            style={{
              background: "#ffffff",
              borderRadius: 12,
              padding: 24,
              maxWidth: 500,
              width: "100%",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
            }}
          >
            <h3 style={{ margin: "0 0 8px 0", fontSize: 18, fontWeight: 700 }}>Compile Scouting Montage</h3>
            <p style={{ margin: "0 0 16px 0", fontSize: 13, color: "#6b7280" }}>
              Sequence {selectedClips.length} clips ({formatMs(totalMontageDurationMs)}) into a shareable team scouting montage.
            </p>

            <div style={{ marginBottom: 14 }}>
              <label htmlFor="montage-title-input" style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Montage Title</label>
              <input
                id="montage-title-input"
                type="text"
                required
                placeholder="e.g. Pick & Roll Defensive Breakdown Reel"
                value={montageTitle}
                onChange={(e) => setMontageTitle(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14 }}
              />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label htmlFor="montage-notes-input" style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Description / Coaching Notes</label>
              <textarea
                id="montage-notes-input"
                rows={3}
                placeholder="Key focal points for the squad before tomorrow's shootaround..."
                value={montageDesc}
                onChange={(e) => setMontageDesc(e.target.value)}
                style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: 14 }}
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => setShowMontageModal(false)}
                style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid #d1d5db", background: "#f9fafb", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingMontage}
                style={{
                  padding: "8px 18px",
                  borderRadius: 6,
                  border: "none",
                  background: "#166534",
                  color: "#ffffff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {savingMontage ? "Compiling..." : "Save Montage"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
