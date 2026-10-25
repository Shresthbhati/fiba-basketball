"use client";

import React, { useState } from "react";
import { api, ApiError } from "./api";

export interface AutoClipModalProps {
  gameId: string;
  gameTitle: string;
  onClipsGenerated: () => void;
  onClose: () => void;
}

export type AutoCategory =
  | "THREE_POINTERS"
  | "ALL_SCORING"
  | "ASSISTS"
  | "TURNOVERS"
  | "REBOUNDS";

export function AutoClipModal({
  gameId,
  gameTitle,
  onClipsGenerated,
  onClose,
}: AutoClipModalProps) {
  const [category, setCategory] = useState<AutoCategory>("ALL_SCORING");
  const [sideFilter, setSideFilter] = useState<"OUR_TEAM" | "OPPONENT" | "BOTH">("OUR_TEAM");
  const [leadSeconds, setLeadSeconds] = useState(4);
  const [lagSeconds, setLagSeconds] = useState(2);
  const [maxClips, setMaxClips] = useState(30);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [createdMontageId, setCreatedMontageId] = useState<string | null>(null);

  const handleGenerateClips = async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await api<{ generatedCount: number }>(`/film/games/${gameId}/auto-clip`, {
        method: "POST",
        body: {
          category,
          sideFilter,
          leadSeconds,
          lagSeconds,
          maxClips,
        },
      });

      setSuccessMsg(`Successfully generated ${res.generatedCount} synchronized event clips!`);
      onClipsGenerated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate event clips");
    } finally {
      setLoading(false);
    }
  };

  const handleAssembleMontage = async () => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await api<{ id: string; clipCount: number; title: string }>(
        `/film/games/${gameId}/auto-montage`,
        {
          method: "POST",
          body: {
            title: `${gameTitle} - ${category.replace(/_/g, " ")} Highlights`,
            category,
            leadSeconds,
            lagSeconds,
          },
        }
      );

      setCreatedMontageId(res.id);
      setSuccessMsg(`Highlight Reel created with ${res.clipCount} clips!`);
      onClipsGenerated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to assemble highlight reel");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-labelledby="auto-clip-title"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: 16,
      }}
    >
      <div
        style={{
          background: "var(--cq-surface, #1e293b)",
          color: "var(--cq-text, #f8fafc)",
          borderRadius: 12,
          padding: 24,
          maxWidth: 540,
          width: "100%",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 id="auto-clip-title" style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
            ⚡ Automated Event-to-Clip Studio
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              background: "transparent",
              border: "none",
              color: "#94a3b8",
              fontSize: 20,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 0, marginBottom: 16 }}>
          Extract video clips directly from the scorebook events timeline with custom pre-roll and post-roll lead times (Spec §6.2).
        </p>

        {error && (
          <div
            role="alert"
            style={{
              background: "#ef444422",
              color: "#f87171",
              border: "1px solid #ef444455",
              padding: "10px 14px",
              borderRadius: 6,
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        {successMsg && (
          <div
            role="status"
            style={{
              background: "#10b98122",
              color: "#34d399",
              border: "1px solid #10b98155",
              padding: "10px 14px",
              borderRadius: 6,
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            {successMsg}
            {createdMontageId && (
              <div style={{ marginTop: 8 }}>
                <a
                  href={`/film/montages/${createdMontageId}`}
                  style={{ color: "#38bdf8", textDecoration: "underline", fontWeight: 600 }}
                >
                  ▶ Open Highlight Reel Player
                </a>
              </div>
            )}
          </div>
        )}

        {/* Category Presets */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            Event Preset
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button
              type="button"
              onClick={() => setCategory("ALL_SCORING")}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid",
                borderColor: category === "ALL_SCORING" ? "#38bdf8" : "rgba(255, 255, 255, 0.15)",
                background: category === "ALL_SCORING" ? "#0284c722" : "rgba(255, 255, 255, 0.05)",
                color: category === "ALL_SCORING" ? "#38bdf8" : "#e2e8f0",
                fontSize: 13,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              🏀 All Scoring Plays
            </button>
            <button
              type="button"
              onClick={() => setCategory("THREE_POINTERS")}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid",
                borderColor: category === "THREE_POINTERS" ? "#38bdf8" : "rgba(255, 255, 255, 0.15)",
                background: category === "THREE_POINTERS" ? "#0284c722" : "rgba(255, 255, 255, 0.05)",
                color: category === "THREE_POINTERS" ? "#38bdf8" : "#e2e8f0",
                fontSize: 13,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              🎯 All 3-Pointers
            </button>
            <button
              type="button"
              onClick={() => setCategory("TURNOVERS")}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid",
                borderColor: category === "TURNOVERS" ? "#38bdf8" : "rgba(255, 255, 255, 0.15)",
                background: category === "TURNOVERS" ? "#0284c722" : "rgba(255, 255, 255, 0.05)",
                color: category === "TURNOVERS" ? "#38bdf8" : "#e2e8f0",
                fontSize: 13,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              🛡️ Turnovers & Stops
            </button>
            <button
              type="button"
              onClick={() => setCategory("ASSISTS")}
              style={{
                padding: "8px 12px",
                borderRadius: 6,
                border: "1px solid",
                borderColor: category === "ASSISTS" ? "#38bdf8" : "rgba(255, 255, 255, 0.15)",
                background: category === "ASSISTS" ? "#0284c722" : "rgba(255, 255, 255, 0.05)",
                color: category === "ASSISTS" ? "#38bdf8" : "#e2e8f0",
                fontSize: 13,
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              👟 Assists & Dime Passes
            </button>
          </div>
        </div>

        {/* Side Filter */}
        <div style={{ marginBottom: 16 }}>
          <label htmlFor="side-filter-select" style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            Team Scope
          </label>
          <select
            id="side-filter-select"
            value={sideFilter}
            onChange={(e) => setSideFilter(e.target.value as "OUR_TEAM" | "OPPONENT" | "BOTH")}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 6,
              background: "#0f172a",
              color: "#f8fafc",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              fontSize: 13,
            }}
          >
            <option value="OUR_TEAM">Our Team Only</option>
            <option value="OPPONENT">Opponent Only</option>
            <option value="BOTH">Both Teams</option>
          </select>
        </div>

        {/* Sliders: Pre-roll and Post-roll */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <label htmlFor="lead-time-slider" style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              Pre-Roll Lead: {leadSeconds}s
            </label>
            <input
              id="lead-time-slider"
              type="range"
              min={1}
              max={12}
              value={leadSeconds}
              onChange={(e) => setLeadSeconds(Number(e.target.value))}
              style={{ width: "100%" }}
            />
            <span style={{ fontSize: 11, color: "#64748b" }}>Before event whistle/basket</span>
          </div>
          <div>
            <label htmlFor="lag-time-slider" style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
              Post-Roll Lag: {lagSeconds}s
            </label>
            <input
              id="lag-time-slider"
              type="range"
              min={1}
              max={8}
              value={lagSeconds}
              onChange={(e) => setLagSeconds(Number(e.target.value))}
              style={{ width: "100%" }}
            />
            <span style={{ fontSize: 11, color: "#64748b" }}>After play outcome</span>
          </div>
        </div>

        {/* Max clips */}
        <div style={{ marginBottom: 20 }}>
          <label htmlFor="max-clips-input" style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            Max Clips Cap
          </label>
          <input
            id="max-clips-input"
            type="number"
            min={1}
            max={60}
            value={maxClips}
            onChange={(e) => setMaxClips(Number(e.target.value))}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 6,
              background: "#0f172a",
              color: "#f8fafc",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              fontSize: 13,
            }}
          />
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              padding: "10px 16px",
              borderRadius: 6,
              border: "1px solid rgba(255, 255, 255, 0.2)",
              background: "transparent",
              color: "#94a3b8",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAssembleMontage}
            disabled={loading}
            style={{
              padding: "10px 16px",
              borderRadius: 6,
              border: "1px solid #10b981",
              background: "#10b98122",
              color: "#34d399",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            🎬 Create Highlight Reel
          </button>
          <button
            type="button"
            onClick={handleGenerateClips}
            disabled={loading}
            style={{
              padding: "10px 16px",
              borderRadius: 6,
              border: "none",
              background: "#2563eb",
              color: "#ffffff",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            {loading ? "Generating..." : "⚡ Generate Clips"}
          </button>
        </div>
      </div>
    </div>
  );
}
