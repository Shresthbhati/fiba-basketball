"use client";

import React, { useState } from "react";
import { api, ApiError } from "./api";

export interface PlayerThreat {
  playerId: string;
  name: string;
  gamesPlayed: number;
  ppg: number;
  rpg: number;
  apg: number;
  threePointRate: number;
  roleTag: string;
}

export interface OpponentTendencyData {
  opponent: {
    id: string;
    name: string;
  };
  sampleSize: number;
  record: {
    wins: number;
    losses: number;
    winRate: number;
  };
  paceAndScoring: {
    ppg: number;
    oppPpg: number;
    netDifferential: number;
  };
  shotProfile: {
    twoPointRate: number;
    threePointRate: number;
    twoPointPct: number;
    threePointPct: number;
    freeThrowRate: number;
  };
  ballControl: {
    assistsPerGame: number;
    turnoversPerGame: number;
    astToRatio: number;
  };
  keyThreats: PlayerThreat[];
  tacticalRecommendations: string[];
}

export interface OpponentScoutingDossierProps {
  data: OpponentTendencyData;
  teamId: string;
  onReportGenerated?: (reportId: string) => void;
}

export function OpponentScoutingDossier({
  data,
  teamId,
  onReportGenerated,
}: OpponentScoutingDossierProps) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);

  const handleGenerateReport = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await api<{ report: { id: string } }>(
        `/teams/${teamId}/scouting/opponents/${data.opponent.id}/generate`,
        {
          method: "POST",
          body: {
            title: `Tactical Dossier: ${data.opponent.name}`,
          },
        }
      );
      setReportId(res.report.id);
      onReportGenerated?.(res.report.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to generate scouting report");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div
      style={{
        background: "var(--cq-surface, #1e293b)",
        color: "var(--cq-text, #f8fafc)",
        borderRadius: 12,
        padding: 24,
        border: "1px solid rgba(255, 255, 255, 0.1)",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
          paddingBottom: 16,
          marginBottom: 20,
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
              🎯 {data.opponent.name} — Opponent Scouting Dossier
            </h1>
            <span
              style={{
                fontSize: 12,
                padding: "2px 8px",
                borderRadius: 4,
                background: "#0284c722",
                color: "#38bdf8",
                fontWeight: 600,
              }}
            >
              {data.sampleSize} Games Evaluated
            </span>
          </div>
          <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "#94a3b8" }}>
            Tactical tendencies, shot distribution profile, personnel threats, and defensive counter-schemes (Spec §10.2, §11.1).
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 6,
              background: data.record.winRate >= 50 ? "#10b98122" : "#f59e0b22",
              color: data.record.winRate >= 50 ? "#34d399" : "#fbbf24",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            Record: {data.record.wins}W – {data.record.losses}L ({data.record.winRate}%)
          </span>
          <button
            type="button"
            onClick={handleGenerateReport}
            disabled={generating}
            style={{
              padding: "8px 14px",
              borderRadius: 6,
              background: "#2563eb",
              color: "#ffffff",
              border: "none",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {generating ? "Generating..." : "⚡ Save as Tactical Report"}
          </button>
        </div>
      </div>

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

      {reportId && (
        <div
          role="status"
          style={{
            background: "#10b98122",
            color: "#34d399",
            border: "1px solid #10b98155",
            padding: "10px 14px",
            borderRadius: 6,
            fontSize: 13,
            marginBottom: 20,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>✓ Tactical Scouting Dossier saved to team reports!</span>
          <a
            href={`/teams/${teamId}/reports`}
            style={{ color: "#38bdf8", textDecoration: "underline", fontWeight: 600, fontSize: 13 }}
          >
            ▶ View Team Tactical Reports
          </a>
        </div>
      )}

      {/* Pace & Scoring Grid */}
      <section aria-label="Pace and Scoring Profile" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", marginBottom: 12 }}>
          Pace & Scoring Profile
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <div style={{ background: "#0f172a", padding: 14, borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.08)" }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>Points Per Game</span>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#f8fafc", marginTop: 4 }}>
              {data.paceAndScoring.ppg}
            </div>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>Offensive output</span>
          </div>

          <div style={{ background: "#0f172a", padding: 14, borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.08)" }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>Points Allowed Per Game</span>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#f8fafc", marginTop: 4 }}>
              {data.paceAndScoring.oppPpg}
            </div>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>Defensive allowance</span>
          </div>

          <div style={{ background: "#0f172a", padding: 14, borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.08)" }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>Net Point Differential</span>
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: data.paceAndScoring.netDifferential >= 0 ? "#34d399" : "#f87171",
                marginTop: 4,
              }}
            >
              {data.paceAndScoring.netDifferential > 0 ? `+${data.paceAndScoring.netDifferential}` : data.paceAndScoring.netDifferential}
            </div>
            <span style={{ fontSize: 11, color: "#94a3b8" }}>Margin of victory/defeat</span>
          </div>
        </div>
      </section>

      {/* Shot Distribution & Spacing */}
      <section aria-label="Shot Profile & Ball Control" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", marginBottom: 12 }}>
          Shot Selection & Ball Security
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {/* Shot Breakdown */}
          <div style={{ background: "#0f172a", padding: 16, borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.08)" }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 12px 0", color: "#e2e8f0" }}>
              Shot Frequency & Efficiency
            </h3>
            <div style={{ display: "grid", gap: 10 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span>3-Point Rate ({data.shotProfile.threePointRate}%)</span>
                  <span style={{ fontWeight: 600, color: "#38bdf8" }}>{data.shotProfile.threePointPct}% 3P Accuracy</span>
                </div>
                <div style={{ height: 6, background: "#1e293b", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${data.shotProfile.threePointRate}%`, height: "100%", background: "#38bdf8" }} />
                </div>
              </div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                  <span>2-Point Inside Arc ({data.shotProfile.twoPointRate}%)</span>
                  <span style={{ fontWeight: 600, color: "#34d399" }}>{data.shotProfile.twoPointPct}% 2P Accuracy</span>
                </div>
                <div style={{ height: 6, background: "#1e293b", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${data.shotProfile.twoPointRate}%`, height: "100%", background: "#34d399" }} />
                </div>
              </div>

              <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "#94a3b8" }}>Free Throw Generation Rate:</span>
                <span style={{ fontWeight: 600 }}>{data.shotProfile.freeThrowRate}% FT/FGA</span>
              </div>
            </div>
          </div>

          {/* Ball Control */}
          <div style={{ background: "#0f172a", padding: 16, borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.08)" }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 12px 0", color: "#e2e8f0" }}>
              Ball Control & Decision Making
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <span style={{ fontSize: 11, color: "#64748b" }}>Assists / Game</span>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#38bdf8" }}>
                  {data.ballControl.assistsPerGame}
                </div>
              </div>
              <div>
                <span style={{ fontSize: 11, color: "#64748b" }}>Turnovers / Game</span>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#f87171" }}>
                  {data.ballControl.turnoversPerGame}
                </div>
              </div>
            </div>
            <div style={{ borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>Assist-to-Turnover Ratio:</span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: data.ballControl.astToRatio >= 1.5 ? "#34d399" : data.ballControl.astToRatio >= 1.0 ? "#fbbf24" : "#f87171",
                }}
              >
                {data.ballControl.astToRatio} AST/TO
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Key Personnel Threats */}
      {data.keyThreats.length > 0 && (
        <section aria-label="Key Personnel Matchup Threats" style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", marginBottom: 12 }}>
            Key Personnel Matchup Threats
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(data.keyThreats.length, 3)}, 1fr)`, gap: 12 }}>
            {data.keyThreats.map((player) => (
              <div
                key={player.playerId}
                style={{
                  background: "#0f172a",
                  padding: 14,
                  borderRadius: 8,
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{player.name}</div>
                  <span
                    style={{
                      fontSize: 10,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: "#3b82f622",
                      color: "#60a5fa",
                      fontWeight: 600,
                    }}
                  >
                    {player.roleTag}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
                  <span><strong style={{ color: "#f8fafc" }}>{player.ppg}</strong> PPG</span>
                  <span><strong style={{ color: "#f8fafc" }}>{player.rpg}</strong> RPG</span>
                  <span><strong style={{ color: "#f8fafc" }}>{player.apg}</strong> APG</span>
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
                  3PT Share: {player.threePointRate}% of shot volume
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Tactical Scheme Recommendations */}
      <section aria-label="Tactical Scheme Counters">
        <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", color: "#94a3b8", marginBottom: 12 }}>
          Tactical Recommendations & Defensive Counters
        </h2>
        <div style={{ background: "#0f172a", padding: 16, borderRadius: 8, border: "1px solid rgba(255, 255, 255, 0.08)" }}>
          <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8, fontSize: 13, color: "#cbd5e1" }}>
            {data.tacticalRecommendations.map((rec, i) => (
              <li key={i}>{rec}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
