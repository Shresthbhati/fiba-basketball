"use client";

import React, { useState } from "react";

export interface CompetencyScore {
  present: number; // 20-80
  future: number;  // 20-80
  stdDev?: number; // for consensus view
}

export interface ScoutEvaluationCardProps {
  athleteName: string;
  athletePosition?: string;
  scoutName?: string;
  organization?: string;
  evalDate?: string;
  gameContext?: string;
  projectedRole: string;
  playerComparison?: string;
  overallPresent: number;
  overallFuture: number;
  competencies: {
    shooting: CompetencyScore;
    finishing: CompetencyScore;
    playmaking: CompetencyScore;
    perimeterDefense: CompetencyScore;
    interiorDefense: CompetencyScore;
    rebounding: CompetencyScore;
    athleticism: CompetencyScore;
    basketballIq: CompetencyScore;
  };
  strengthsSummary: string;
  weaknessesSummary: string;
  swingSkills?: string;
  intangiblesNotes?: string;
  consensus?: {
    uniqueScouts: number;
    totalEvaluations: number;
    agreementStdDev: number;
  };
  onEdit?: () => void;
  onExport?: () => void;
}

export function getGradeBadgeColor(grade: number): { bg: string; text: string; label: string } {
  if (grade >= 70) return { bg: "rgba(147, 51, 234, 0.2)", text: "#c084fc", label: "Elite (70-80)" };
  if (grade >= 60) return { bg: "rgba(59, 130, 246, 0.2)", text: "#60a5fa", label: "Plus (60-65)" };
  if (grade >= 55) return { bg: "rgba(16, 185, 129, 0.2)", text: "#34d399", label: "Above Avg (55)" };
  if (grade >= 50) return { bg: "rgba(234, 179, 8, 0.2)", text: "#fde047", label: "Average (50)" };
  if (grade >= 40) return { bg: "rgba(249, 115, 22, 0.2)", text: "#fb923c", label: "Below Avg (40-45)" };
  return { bg: "rgba(239, 68, 68, 0.2)", text: "#f87171", label: "Poor (20-35)" };
}

export function formatRoleTitle(role: string): string {
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ScoutEvaluationCard({
  athleteName,
  athletePosition = "G/F",
  scoutName = "Staff Scout",
  organization = "COURT IQ Scouting Network",
  evalDate = new Date().toISOString().split("T")[0],
  gameContext = "LIVE_GAME",
  projectedRole,
  playerComparison,
  overallPresent,
  overallFuture,
  competencies,
  strengthsSummary,
  weaknessesSummary,
  swingSkills,
  intangiblesNotes,
  consensus,
  onEdit,
  onExport,
}: ScoutEvaluationCardProps) {
  const [activeTab, setActiveTab] = useState<"card" | "consensus">("card");

  const overallPresentBadge = getGradeBadgeColor(overallPresent);
  const overallFutureBadge = getGradeBadgeColor(overallFuture);

  const competencyList: Array<{ key: keyof typeof competencies; title: string }> = [
    { key: "shooting", title: "Shooting & Touch" },
    { key: "finishing", title: "Rim Finishing" },
    { key: "playmaking", title: "Playmaking & Passing" },
    { key: "perimeterDefense", title: "Perimeter Defense" },
    { key: "interiorDefense", title: "Interior Rim Protection" },
    { key: "rebounding", title: "Rebounding Instincts" },
    { key: "athleticism", title: "Motor & Functional Athleticism" },
    { key: "basketballIq", title: "Basketball IQ & Anticipation" },
  ];

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
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "16px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
          paddingBottom: "16px",
          marginBottom: "20px",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>
              📋 {athleteName}
            </h1>
            <span
              style={{
                fontSize: "12px",
                padding: "2px 8px",
                borderRadius: "4px",
                background: "rgba(59, 130, 246, 0.2)",
                color: "#60a5fa",
                fontWeight: 600,
              }}
            >
              {athletePosition}
            </span>
            <span
              style={{
                fontSize: "12px",
                padding: "2px 8px",
                borderRadius: "4px",
                background: "rgba(255, 255, 255, 0.08)",
                color: "#94a3b8",
                fontWeight: 500,
              }}
            >
              {gameContext.replace(/_/g, " ")}
            </span>
          </div>
          <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#94a3b8" }}>
            Evaluated by <strong style={{ color: "#e2e8f0" }}>{scoutName}</strong> ({organization}) • {evalDate}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {consensus && (
            <div style={{ display: "flex", background: "#0f172a", borderRadius: "6px", padding: "2px" }}>
              <button
                type="button"
                onClick={() => setActiveTab("card")}
                style={{
                  padding: "6px 12px",
                  borderRadius: "4px",
                  background: activeTab === "card" ? "#334155" : "transparent",
                  color: "#f8fafc",
                  border: "none",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Scout Card
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("consensus")}
                style={{
                  padding: "6px 12px",
                  borderRadius: "4px",
                  background: activeTab === "consensus" ? "#334155" : "transparent",
                  color: "#f8fafc",
                  border: "none",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Consensus ({consensus.uniqueScouts} Scouts)
              </button>
            </div>
          )}

          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              style={{
                padding: "8px 12px",
                borderRadius: "6px",
                background: "rgba(255, 255, 255, 0.08)",
                color: "#f8fafc",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ✏️ Edit
            </button>
          )}

          {onExport && (
            <button
              type="button"
              onClick={onExport}
              style={{
                padding: "8px 14px",
                borderRadius: "6px",
                background: "#2563eb",
                color: "#ffffff",
                border: "none",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              📥 Export Dossier
            </button>
          )}
        </div>
      </div>

      {/* Projection summary banners */}
      <section
        aria-label="Projection Summary"
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr 1fr",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            background: "#0f172a",
            padding: "16px",
            borderRadius: "8px",
            border: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <span style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
            Projected Role & Pro Comp
          </span>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "#f8fafc", marginTop: "4px" }}>
            🎯 {formatRoleTitle(projectedRole)}
          </div>
          {playerComparison && (
            <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#38bdf8" }}>
              Comparison Archetype: <strong>{playerComparison}</strong>
            </p>
          )}
        </div>

        <div
          style={{
            background: "#0f172a",
            padding: "16px",
            borderRadius: "8px",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            textAlign: "center",
          }}
        >
          <span style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
            Present Grade
          </span>
          <div style={{ fontSize: "28px", fontWeight: 800, color: overallPresentBadge.text, marginTop: "2px" }}>
            {overallPresent}
          </div>
          <span
            style={{
              fontSize: "11px",
              padding: "2px 6px",
              borderRadius: "4px",
              background: overallPresentBadge.bg,
              color: overallPresentBadge.text,
              fontWeight: 600,
            }}
          >
            {overallPresentBadge.label}
          </span>
        </div>

        <div
          style={{
            background: "#0f172a",
            padding: "16px",
            borderRadius: "8px",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            textAlign: "center",
          }}
        >
          <span style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase", fontWeight: 700 }}>
            Future Ceiling
          </span>
          <div style={{ fontSize: "28px", fontWeight: 800, color: overallFutureBadge.text, marginTop: "2px" }}>
            {overallFuture}
          </div>
          <span
            style={{
              fontSize: "11px",
              padding: "2px 6px",
              borderRadius: "4px",
              background: overallFutureBadge.bg,
              color: overallFutureBadge.text,
              fontWeight: 600,
            }}
          >
            {overallFutureBadge.label}
          </span>
        </div>
      </section>

      {/* 20-80 Scale Competency Grid */}
      <section aria-label="Competency Grades" style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
          <h2 style={{ fontSize: "14px", fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", margin: 0 }}>
            Standardized 20-80 Scale Evaluations (Spec §13.2)
          </h2>
          <span style={{ fontSize: "12px", color: "#64748b" }}>
            Scale: 20 (Poor) → 50 (Major League Avg) → 80 (Elite)
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "12px",
          }}
        >
          {competencyList.map(({ key, title }) => {
            const score = competencies[key];
            const presColor = getGradeBadgeColor(score.present);
            const futColor = getGradeBadgeColor(score.future);

            return (
              <div
                key={key}
                style={{
                  background: "#0f172a",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#e2e8f0" }}>{title}</span>
                  {score.stdDev !== undefined && (
                    <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                      σ {score.stdDev}
                    </span>
                  )}
                </div>

                {/* Present vs Future grade meters */}
                <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "12px" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                      <span style={{ color: "#94a3b8", fontSize: "11px" }}>Present:</span>
                      <strong style={{ color: presColor.text }}>{score.present}</strong>
                    </div>
                    <div style={{ height: "6px", background: "rgba(255, 255, 255, 0.1)", borderRadius: "3px", overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${((score.present - 20) / 60) * 100}%`,
                          height: "100%",
                          background: presColor.text,
                          borderRadius: "3px",
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
                      <span style={{ color: "#94a3b8", fontSize: "11px" }}>Future:</span>
                      <strong style={{ color: futColor.text }}>{score.future}</strong>
                    </div>
                    <div style={{ height: "6px", background: "rgba(255, 255, 255, 0.1)", borderRadius: "3px", overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${((score.future - 20) / 60) * 100}%`,
                          height: "100%",
                          background: futColor.text,
                          borderRadius: "3px",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Scouting Narrative & Intangibles */}
      <section
        aria-label="Scouting Narrative"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px",
        }}
      >
        <div
          style={{
            background: "#0f172a",
            padding: "16px",
            borderRadius: "8px",
            border: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <h3 style={{ fontSize: "13px", fontWeight: 700, margin: "0 0 8px 0", color: "#34d399", textTransform: "uppercase" }}>
            Key Strengths & Functional Habits
          </h3>
          <p style={{ margin: 0, fontSize: "13px", color: "#cbd5e1", lineHeight: 1.5 }}>
            {strengthsSummary}
          </p>

          {swingSkills && (
            <div style={{ marginTop: "12px", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "8px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#60a5fa", textTransform: "uppercase" }}>
                🎯 Primary Swing Skill:
              </span>
              <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#94a3b8" }}>
                {swingSkills}
              </p>
            </div>
          )}
        </div>

        <div
          style={{
            background: "#0f172a",
            padding: "16px",
            borderRadius: "8px",
            border: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <h3 style={{ fontSize: "13px", fontWeight: 700, margin: "0 0 8px 0", color: "#f87171", textTransform: "uppercase" }}>
            Development Focus & Deficiencies
          </h3>
          <p style={{ margin: 0, fontSize: "13px", color: "#cbd5e1", lineHeight: 1.5 }}>
            {weaknessesSummary}
          </p>

          {intangiblesNotes && (
            <div style={{ marginTop: "12px", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "8px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#fbbf24", textTransform: "uppercase" }}>
                🧠 Intangibles & On-Court Motor:
              </span>
              <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "#94a3b8" }}>
                {intangiblesNotes}
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
