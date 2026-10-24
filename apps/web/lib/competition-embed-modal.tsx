"use client";

import React, { useState } from "react";

export interface CompetitionEmbedModalProps {
  competitionId: string;
  competitionName: string;
  onClose: () => void;
}

export type EmbedViewType = "all" | "standings" | "bracket" | "schedule";
export type EmbedTheme = "dark" | "light" | "transparent";

export function CompetitionEmbedModal({
  competitionId,
  competitionName,
  onClose,
}: CompetitionEmbedModalProps) {
  const [viewType, setViewType] = useState<EmbedViewType>("all");
  const [theme, setTheme] = useState<EmbedTheme>("dark");
  const [compact, setCompact] = useState(false);
  const [width, setWidth] = useState("100%");
  const [height, setHeight] = useState("600");
  const [copied, setCopied] = useState(false);

  const getEmbedPath = () => {
    const base = `/embed/competitions/${competitionId}`;
    const sub = viewType === "all" ? "" : `/${viewType}`;
    const params = new URLSearchParams();
    if (theme !== "dark") params.set("theme", theme);
    if (compact) params.set("compact", "true");
    const query = params.toString();
    return `${base}${sub}${query ? `?${query}` : ""}`;
  };

  const origin = typeof window !== "undefined" ? window.location.origin : "https://app.courtiq.net";
  const embedUrl = `${origin}${getEmbedPath()}`;
  const embedSnippet = `<iframe src="${embedUrl}" width="${width}" height="${height}" frameborder="0" style="border:none;border-radius:8px;overflow:hidden;" allowfullscreen></iframe>`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(embedSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <div
      role="dialog"
      aria-labelledby="embed-modal-title"
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
          maxWidth: 680,
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 id="embed-modal-title" style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
            🌐 Embed Live Tournament Widget (Spec §8.5, §15.2)
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
          Embed live standings, elimination brackets, and game schedules on club websites, sponsor portals, and blogs for <strong>{competitionName}</strong>.
        </p>

        {/* View Type Selector */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            Widget View
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {(
              [
                ["all", "Full Overview"],
                ["standings", "Standings Table"],
                ["bracket", "Playoff Bracket"],
                ["schedule", "Schedule & Results"],
              ] as const
            ).map(([type, label]) => (
              <button
                key={type}
                type="button"
                onClick={() => setViewType(type)}
                style={{
                  padding: "8px 6px",
                  borderRadius: 6,
                  border: "1px solid",
                  borderColor: viewType === type ? "#38bdf8" : "rgba(255, 255, 255, 0.15)",
                  background: viewType === type ? "#0284c722" : "rgba(255, 255, 255, 0.05)",
                  color: viewType === type ? "#38bdf8" : "#e2e8f0",
                  fontSize: 12,
                  fontWeight: viewType === type ? 600 : 400,
                  cursor: "pointer",
                  textAlign: "center",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Configuration Row: Theme, Compact, Dimensions */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <label htmlFor="embed-theme-select" style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Theme Style
            </label>
            <select
              id="embed-theme-select"
              value={theme}
              onChange={(e) => setTheme(e.target.value as EmbedTheme)}
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
              <option value="dark">Dark Theme</option>
              <option value="light">Light Theme</option>
              <option value="transparent">Transparent Background</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Layout Options
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginTop: 8 }}>
              <input
                type="checkbox"
                checked={compact}
                onChange={(e) => setCompact(e.target.checked)}
              />
              <span>Compact Sidebar Mode</span>
            </label>
          </div>
        </div>

        {/* Dimensions */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <label htmlFor="embed-width-input" style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>
              Width
            </label>
            <input
              id="embed-width-input"
              value={width}
              onChange={(e) => setWidth(e.target.value)}
              placeholder="100%"
              style={{
                width: "100%",
                padding: "6px 10px",
                borderRadius: 6,
                background: "#0f172a",
                color: "#f8fafc",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                fontSize: 13,
              }}
            />
          </div>
          <div>
            <label htmlFor="embed-height-input" style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>
              Height (px)
            </label>
            <input
              id="embed-height-input"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="600"
              style={{
                width: "100%",
                padding: "6px 10px",
                borderRadius: 6,
                background: "#0f172a",
                color: "#f8fafc",
                border: "1px solid rgba(255, 255, 255, 0.2)",
                fontSize: 13,
              }}
            />
          </div>
        </div>

        {/* Embed Code Snippet */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>HTML Embed Snippet</label>
            <button
              type="button"
              onClick={handleCopy}
              style={{
                padding: "4px 10px",
                borderRadius: 4,
                border: "1px solid #38bdf8",
                background: copied ? "#10b98122" : "#0284c722",
                color: copied ? "#34d399" : "#38bdf8",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {copied ? "✓ Copied to Clipboard!" : "📋 Copy Code"}
            </button>
          </div>
          <pre
            style={{
              background: "#090d16",
              padding: 12,
              borderRadius: 6,
              fontSize: 12,
              overflowX: "auto",
              color: "#38bdf8",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
              margin: 0,
            }}
          >
            {embedSnippet}
          </pre>
        </div>

        {/* Action Buttons */}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
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
            Close
          </button>
          <a
            href={getEmbedPath()}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              padding: "10px 16px",
              borderRadius: 6,
              border: "none",
              background: "#2563eb",
              color: "#ffffff",
              fontWeight: 600,
              textDecoration: "none",
              fontSize: 13,
              display: "inline-block",
            }}
          >
            ↗ Open Widget in New Tab
          </a>
        </div>
      </div>
    </div>
  );
}
