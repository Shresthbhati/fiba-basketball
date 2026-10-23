"use client";

import React, { useState } from "react";
import Link from "next/link";
import { formatMs } from "./film-search";

export interface MontageClip {
  clipId: string;
  gameId: string;
  order: number;
  startMs: number;
  endMs: number;
  title?: string | undefined;
  note?: string | undefined;
  tags?: string[] | undefined;
}

export interface ScoutingMontageData {
  id: string;
  teamId: string;
  title: string;
  description?: string | null;
  tags: string[];
  items: MontageClip[];
  totalDurationMs: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScoutingMontageViewProps {
  montage: ScoutingMontageData;
  onUpdate?: (updated: ScoutingMontageData) => Promise<void>;
  readOnly?: boolean;
}

export const ScoutingMontageView: React.FC<ScoutingMontageViewProps> = ({
  montage,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [copied, setCopied] = useState(false);

  const activeClip = montage.items[currentIndex] || montage.items[0];

  const handleNext = () => {
    if (currentIndex < montage.items.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleCopyShareLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header Card */}
      <div
        style={{
          border: "1px solid var(--cq-border, #e5e7eb)",
          borderRadius: 12,
          padding: 24,
          background: "var(--cq-card-bg, #ffffff)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  padding: "2px 8px",
                  borderRadius: 6,
                  background: "#dcfce7",
                  color: "#166534",
                }}
              >
                Team Scouting Reel
              </span>
              <span style={{ fontSize: 13, color: "var(--cq-text-muted, #6b7280)" }}>
                {montage.items.length} sequenced clips
              </span>
            </div>
            <h1 style={{ margin: "0 0 8px 0", fontSize: 26, fontWeight: 800 }}>{montage.title}</h1>
            {montage.description && (
              <p style={{ margin: 0, fontSize: 14, color: "#4b5563", lineHeight: 1.5, maxWidth: 700 }}>
                {montage.description}
              </p>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div
              style={{
                textAlign: "right",
                padding: "8px 16px",
                background: "var(--cq-bg-muted, #f9fafb)",
                borderRadius: 8,
                border: "1px solid var(--cq-border, #e5e7eb)",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--cq-text-muted, #6b7280)", textTransform: "uppercase" }}>
                Total Reel Duration
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--cq-primary, #1e3a8a)" }}>
                {formatMs(montage.totalDurationMs)}
              </div>
            </div>

            <button
              type="button"
              onClick={handleCopyShareLink}
              style={{
                padding: "8px 14px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                background: "#ffffff",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {copied ? "Link Copied ✓" : "🔗 Share with Team"}
            </button>
          </div>
        </div>

        {/* Tags */}
        {montage.tags.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
            {montage.tags.map((t) => (
              <span
                key={t}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: "#f3f4f6",
                  color: "#4b5563",
                }}
              >
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Reel Player & Sequenced Playlist Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1.4fr) minmax(280px, 1fr)", gap: 20 }}>
        {/* Left Column: Player Display & Playback Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              aspectRatio: "16/9",
              background: "#0f172a",
              borderRadius: 12,
              overflow: "hidden",
              position: "relative",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              color: "#ffffff",
            }}
          >
            {activeClip ? (
              <div style={{ textAlign: "center", padding: 24 }}>
                <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 6 }}>
                  Clip {currentIndex + 1} of {montage.items.length}
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
                  {activeClip.title || `Clip #${activeClip.order}`}
                </div>
                <div style={{ fontSize: 14, color: "#cbd5e1", marginBottom: 16 }}>
                  ⏱ {formatMs(activeClip.startMs)} – {formatMs(activeClip.endMs)} ({Math.round((activeClip.endMs - activeClip.startMs) / 1000)}s)
                </div>
                <div style={{ display: "inline-flex", gap: 10 }}>
                  <Link
                    href={`/film/${activeClip.gameId}`}
                    style={{
                      fontSize: 12,
                      padding: "6px 12px",
                      borderRadius: 6,
                      background: "rgba(255,255,255,0.15)",
                      color: "#ffffff",
                      textDecoration: "none",
                    }}
                  >
                    Open in Full Film Room ↗
                  </Link>
                </div>
              </div>
            ) : (
              <div>No clips in montage.</div>
            )}
          </div>

          {/* Reel Playback Controls Bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 12,
              background: "var(--cq-card-bg, #ffffff)",
              border: "1px solid var(--cq-border, #e5e7eb)",
              borderRadius: 8,
            }}
          >
            <button
              type="button"
              disabled={currentIndex === 0}
              onClick={handlePrev}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                background: currentIndex === 0 ? "#f3f4f6" : "#ffffff",
                color: currentIndex === 0 ? "#9ca3af" : "#111827",
                cursor: currentIndex === 0 ? "not-allowed" : "pointer",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              ◀ Prev Clip
            </button>

            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              style={{
                padding: "6px 20px",
                borderRadius: 6,
                border: "none",
                background: "#1e3a8a",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              {isPlaying ? "⏸ Pause Reel" : "▶ Play Reel"}
            </button>

            <button
              type="button"
              disabled={currentIndex >= montage.items.length - 1}
              onClick={handleNext}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                background: currentIndex >= montage.items.length - 1 ? "#f3f4f6" : "#ffffff",
                color: currentIndex >= montage.items.length - 1 ? "#9ca3af" : "#111827",
                cursor: currentIndex >= montage.items.length - 1 ? "not-allowed" : "pointer",
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              Next Clip ▶
            </button>
          </div>
        </div>

        {/* Right Column: Sequenced Clips Playlist */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h3 style={{ fontSize: 16, margin: "0 0 4px 0", fontWeight: 700 }}>Sequenced Clips ({montage.items.length})</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 480, overflowY: "auto" }}>
            {montage.items.map((item, index) => {
              const isActive = index === currentIndex;
              const durationSec = Math.round((item.endMs - item.startMs) / 1000);
              return (
                <div
                  key={item.clipId || index}
                  onClick={() => setCurrentIndex(index)}
                  style={{
                    padding: 12,
                    borderRadius: 8,
                    border: isActive ? "2px solid #1e3a8a" : "1px solid var(--cq-border, #e5e7eb)",
                    background: isActive ? "#eff6ff" : "#ffffff",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    transition: "all 0.15s ease",
                  }}
                >
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      background: isActive ? "#1e3a8a" : "#e5e7eb",
                      color: isActive ? "#ffffff" : "#4b5563",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: 12,
                      flexShrink: 0,
                    }}
                  >
                    {index + 1}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: isActive ? "#1e3a8a" : "#111827" }}>
                        {item.title || `Clip #${index + 1}`}
                      </span>
                      <span style={{ fontSize: 12, color: "#6b7280" }}>
                        ⏱ {durationSec}s
                      </span>
                    </div>

                    {item.note && (
                      <p style={{ margin: "2px 0 4px 0", fontSize: 13, color: "#4b5563", lineHeight: 1.3 }}>
                        {item.note}
                      </p>
                    )}

                    <div style={{ fontSize: 11, color: "#9ca3af" }}>
                      {formatMs(item.startMs)} – {formatMs(item.endMs)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
