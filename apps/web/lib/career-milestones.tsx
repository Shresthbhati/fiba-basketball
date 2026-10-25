"use client";

import React, { useState } from "react";
import {
  VerifiedAchievementBadge,
  type VerifiedAchievementItem,
} from "./verified-achievement-badge";

export interface MilestoneProgressItem {
  key: string;
  title: string;
  category: "SCORING" | "SHOOTING" | "PLAYMAKING" | "REBOUNDING" | "VERSATILITY" | "ENDURANCE";
  targetValue: number;
  currentValue: number;
  progressPct: number;
  unit: string;
  description: string;
  isUnlocked: boolean;
  unlockedAt: string | null;
}

export type { VerifiedAchievementItem };

export interface CareerMilestonesProps {
  achievements: VerifiedAchievementItem[];
  milestones: MilestoneProgressItem[];
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

const CATEGORY_ICONS: Record<string, string> = {
  SCORING: "🎯",
  SHOOTING: "🔥",
  PLAYMAKING: "⚡",
  REBOUNDING: "🛡️",
  VERSATILITY: "⭐",
  ENDURANCE: "🏃",
};

export function CareerMilestones({
  achievements,
  milestones,
  onRefresh,
  isRefreshing = false,
}: CareerMilestonesProps) {
  const [filter, setFilter] = useState<"ALL" | "UNLOCKED" | "IN_PROGRESS">("ALL");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");

  const unlockedCount = milestones.filter((m) => m.isUnlocked).length;
  const inProgressCount = milestones.filter((m) => !m.isUnlocked).length;

  const filteredMilestones = milestones.filter((m) => {
    if (filter === "UNLOCKED" && !m.isUnlocked) return false;
    if (filter === "IN_PROGRESS" && m.isUnlocked) return false;
    if (selectedCategory !== "ALL" && m.category !== selectedCategory) return false;
    return true;
  });

  return (
    <div
      style={{
        background: "var(--cq-surface, #1e293b)",
        color: "var(--cq-text, #f8fafc)",
        borderRadius: "12px",
        padding: "24px",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
          paddingBottom: "16px",
          marginBottom: "20px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h2 style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}>
              🏆 Career Milestones & Verified Badges
            </h2>
            <span
              style={{
                fontSize: "12px",
                padding: "2px 8px",
                borderRadius: "4px",
                background: "rgba(16, 185, 129, 0.15)",
                color: "#34d399",
                fontWeight: 600,
              }}
            >
              {unlockedCount} / {milestones.length} Unlocked
            </span>
          </div>
          <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#94a3b8" }}>
            Automated progression milestones verified from official competition records (Spec §11.1, §11.3).
          </p>
        </div>

        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            style={{
              padding: "8px 14px",
              borderRadius: "6px",
              background: "#2563eb",
              color: "#ffffff",
              border: "none",
              fontSize: "13px",
              fontWeight: 600,
              cursor: isRefreshing ? "wait" : "pointer",
              opacity: isRefreshing ? 0.7 : 1,
            }}
          >
            {isRefreshing ? "Syncing..." : "🔄 Refresh Badges"}
          </button>
        )}
      </div>

      {/* Verified Awards & Honors */}
      {achievements.length > 0 && (
        <section aria-label="Official Awards & Honors" style={{ marginBottom: "20px" }}>
          <h3 style={{ fontSize: "13px", fontWeight: 700, textTransform: "uppercase", color: "#fbbf24", margin: "0 0 10px 0" }}>
            ⭐ Verified Awards & Tournament Honors
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "10px" }}>
            {achievements.map((a) => (
              <VerifiedAchievementBadge key={a.id} achievement={a} compact={true} />
            ))}
          </div>
        </section>
      )}

      {/* Filter and Tab controls */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          marginBottom: "20px",
        }}
      >
        <div style={{ display: "flex", background: "#0f172a", borderRadius: "6px", padding: "2px" }}>
          <button
            type="button"
            onClick={() => setFilter("ALL")}
            style={{
              padding: "6px 12px",
              borderRadius: "4px",
              background: filter === "ALL" ? "#334155" : "transparent",
              color: "#f8fafc",
              border: "none",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            All ({milestones.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("UNLOCKED")}
            style={{
              padding: "6px 12px",
              borderRadius: "4px",
              background: filter === "UNLOCKED" ? "#334155" : "transparent",
              color: "#34d399",
              border: "none",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Unlocked ({unlockedCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter("IN_PROGRESS")}
            style={{
              padding: "6px 12px",
              borderRadius: "4px",
              background: filter === "IN_PROGRESS" ? "#334155" : "transparent",
              color: "#60a5fa",
              border: "none",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            In Progress ({inProgressCount})
          </button>
        </div>

        {/* Category selector */}
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          aria-label="Filter by Category"
          style={{
            background: "#0f172a",
            color: "#f8fafc",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            padding: "6px 12px",
            borderRadius: "6px",
            fontSize: "12px",
          }}
        >
          <option value="ALL">All Categories</option>
          <option value="SCORING">Scoring</option>
          <option value="SHOOTING">Shooting</option>
          <option value="PLAYMAKING">Playmaking</option>
          <option value="REBOUNDING">Rebounding</option>
          <option value="VERSATILITY">Versatility</option>
          <option value="ENDURANCE">Endurance</option>
        </select>
      </div>

      {/* Milestones list */}
      <section aria-label="Milestones List">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "14px",
          }}
        >
          {filteredMilestones.map((m) => {
            const icon = CATEGORY_ICONS[m.category] ?? "🏅";
            return (
              <div
                key={m.key}
                style={{
                  background: "#0f172a",
                  padding: "16px",
                  borderRadius: "8px",
                  border: m.isUnlocked
                    ? "1px solid rgba(52, 211, 153, 0.3)"
                    : "1px solid rgba(255, 255, 255, 0.08)",
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "20px" }}>{icon}</span>
                      <h3 style={{ fontSize: "14px", fontWeight: 700, margin: 0, color: "#f8fafc" }}>
                        {m.title}
                      </h3>
                    </div>
                    {m.isUnlocked ? (
                      <span
                        style={{
                          fontSize: "10px",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          background: "rgba(16, 185, 129, 0.2)",
                          color: "#34d399",
                          fontWeight: 700,
                          textTransform: "uppercase",
                        }}
                      >
                        ✓ Unlocked
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: "10px",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          background: "rgba(255, 255, 255, 0.08)",
                          color: "#94a3b8",
                          fontWeight: 600,
                        }}
                      >
                        {m.progressPct}%
                      </span>
                    )}
                  </div>

                  <p style={{ margin: "0 0 12px 0", fontSize: "12px", color: "#94a3b8", lineHeight: 1.4 }}>
                    {m.description}
                  </p>
                </div>

                <div>
                  {/* Progress bar */}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginBottom: "4px" }}>
                    <span style={{ color: "#64748b" }}>Progress:</span>
                    <strong style={{ color: m.isUnlocked ? "#34d399" : "#38bdf8" }}>
                      {m.currentValue} / {m.targetValue} {m.unit}
                    </strong>
                  </div>
                  <div
                    style={{
                      height: "6px",
                      background: "rgba(255, 255, 255, 0.1)",
                      borderRadius: "3px",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${m.progressPct}%`,
                        height: "100%",
                        background: m.isUnlocked ? "#34d399" : "#38bdf8",
                        borderRadius: "3px",
                      }}
                    />
                  </div>

                  {m.unlockedAt && (
                    <div style={{ marginTop: "8px", fontSize: "10px", color: "#64748b" }}>
                      Verified on {new Date(m.unlockedAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
