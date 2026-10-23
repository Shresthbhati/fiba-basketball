"use client";

import React, { useState, useMemo } from "react";
import { CourtRenderer, courtToSvg, type CourtPoint, type CourtViewport } from "@courtiq/court-renderer";
import { Badge, Card, SourceBadge, StatCard } from "@courtiq/design-system";

export type ShotZone =
  | "RESTRICTED_AREA"
  | "PAINT"
  | "MID_RANGE"
  | "CORNER_THREE_LEFT"
  | "CORNER_THREE_RIGHT"
  | "ABOVE_THE_BREAK_THREE"
  | "BACKCOURT";

export type ShotType = "TWO_POINT" | "THREE_POINT" | "FREE_THROW";

export interface ShotItem {
  id: string;
  type: string;
  shotType: ShotType;
  side: "home" | "away";
  period: number;
  clockSeconds: number | null;
  playerId: string | null;
  playerName?: string | null;
  jerseyNumber?: number | null;
  made: boolean;
  points: number;
  coordX: number;
  coordY: number;
  distanceMeters: number;
  zone: ShotZone;
}

export interface ZoneSummary {
  zone: ShotZone;
  label: string;
  makes: number;
  attempts: number;
  pct: number;
  points: number;
  frequencyPct: number;
}

export interface ShotChartSummary {
  totalShots: number;
  totalPoints: number;
  fgm: number;
  fga: number;
  fgPct: number;
  twoPm: number;
  twoPa: number;
  twoPPct: number;
  threePm: number;
  threePa: number;
  threePPct: number;
  ftm: number;
  fta: number;
  ftPct: number;
  eFgPct: number;
  tsPct: number;
}

export interface ShotChartData {
  matchId?: string;
  sourceType: string;
  shots: ShotItem[];
  zones: Record<ShotZone, ZoneSummary>;
  summary: ShotChartSummary;
  smallSample: boolean;
}

export interface ShotChartViewProps {
  data: ShotChartData;
  homeTeamName?: string;
  awayTeamName?: string;
  showZoneHeatmap?: boolean;
}

export function ShotChartView({
  data,
  homeTeamName = "Home",
  awayTeamName = "Away",
  showZoneHeatmap: initialShowHeatmap = false,
}: ShotChartViewProps) {
  const [selectedSide, setSelectedSide] = useState<"all" | "home" | "away">("all");
  const [selectedOutcome, setSelectedOutcome] = useState<"all" | "made" | "missed">("all");
  const [selectedType, setSelectedType] = useState<"all" | "TWO_POINT" | "THREE_POINT">("all");
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>("all");
  const [hoveredShot, setHoveredShot] = useState<ShotItem | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(initialShowHeatmap);

  // Unique players in the shot dataset
  const playerOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; jersey: number | null }>();
    for (const s of data.shots) {
      if (s.playerId && !map.has(s.playerId)) {
        map.set(s.playerId, {
          id: s.playerId,
          name: s.playerName || `Player #${s.jerseyNumber ?? ""}`,
          jersey: s.jerseyNumber ?? null,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => (a.jersey ?? 99) - (b.jersey ?? 99));
  }, [data.shots]);

  // Filtered shots
  const filteredShots = useMemo(() => {
    return data.shots.filter((s) => {
      if (selectedSide !== "all" && s.side !== selectedSide) return false;
      if (selectedOutcome === "made" && !s.made) return false;
      if (selectedOutcome === "missed" && s.made) return false;
      if (selectedType !== "all" && s.shotType !== selectedType) return false;
      if (selectedPlayerId !== "all" && s.playerId !== selectedPlayerId) return false;
      return true;
    });
  }, [data.shots, selectedSide, selectedOutcome, selectedType, selectedPlayerId]);

  // Dynamically recalculated metrics for the filtered subset
  const filteredSummary = useMemo(() => {
    let twoPm = 0, twoPa = 0, threePm = 0, threePa = 0, ftm = 0, fta = 0, totalPoints = 0;
    for (const s of filteredShots) {
      if (s.shotType === "TWO_POINT") {
        twoPa++;
        if (s.made) { twoPm++; totalPoints += 2; }
      } else if (s.shotType === "THREE_POINT") {
        threePa++;
        if (s.made) { threePm++; totalPoints += 3; }
      } else if (s.shotType === "FREE_THROW") {
        fta++;
        if (s.made) { ftm++; totalPoints += 1; }
      }
    }
    const fga = twoPa + threePa;
    const fgm = twoPm + threePm;
    const fgPct = fga > 0 ? Math.round((fgm / fga) * 1000) / 10 : 0;
    const eFgPct = fga > 0 ? Math.round(((fgm + 0.5 * threePm) / fga) * 1000) / 10 : 0;
    const tsDenom = 2 * (fga + 0.44 * fta);
    const tsPct = tsDenom > 0 ? Math.round((totalPoints / tsDenom) * 1000) / 10 : 0;
    return {
      fga,
      fgm,
      fgPct,
      twoPa,
      twoPm,
      twoPPct: twoPa > 0 ? Math.round((twoPm / twoPa) * 1000) / 10 : 0,
      threePa,
      threePm,
      threePPct: threePa > 0 ? Math.round((threePm / threePa) * 1000) / 10 : 0,
      eFgPct,
      tsPct,
      ftm,
      fta,
      totalPoints,
      smallSample: fga < 10,
    };
  }, [filteredShots]);

  const courtViewport: CourtViewport = {
    width: 700,
    height: 480,
    padding: 24,
    mode: "half",
    orientation: "horizontal",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header & Provenance */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "var(--foreground)" }}>
              Shot Chart & Zone Efficiency
            </h1>
            <SourceBadge sourceType="OFFICIAL" confidence={1.0} />
          </div>
          <p style={{ margin: "4px 0 0 0", color: "var(--muted-foreground)", fontSize: 13 }}>
            Official FIBA 28m × 15m metric coordinate mapping from verified scorebook events.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setShowHeatmap(!showHeatmap)}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              backgroundColor: showHeatmap ? "var(--primary)" : "var(--accent)",
              color: showHeatmap ? "var(--primary-foreground)" : "var(--foreground)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {showHeatmap ? "Hide Zone Table" : "Show Zone Table"}
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div
        style={{
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
          padding: "12px 16px",
          borderRadius: 8,
          backgroundColor: "var(--accent)",
          border: "1px solid var(--border)",
          alignItems: "center",
        }}
      >
        {/* Team Side */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)" }}>Team:</span>
          {(["all", "home", "away"] as const).map((side) => (
            <button
              key={side}
              onClick={() => setSelectedSide(side)}
              style={{
                padding: "3px 10px",
                borderRadius: 16,
                fontSize: 12,
                cursor: "pointer",
                border: "1px solid",
                borderColor: selectedSide === side ? "var(--primary)" : "var(--border)",
                backgroundColor: selectedSide === side ? "var(--primary)" : "transparent",
                color: selectedSide === side ? "var(--primary-foreground)" : "var(--foreground)",
              }}
            >
              {side === "all" ? "Both Teams" : side === "home" ? homeTeamName : awayTeamName}
            </button>
          ))}
        </div>

        {/* Outcome */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)" }}>Outcome:</span>
          {(["all", "made", "missed"] as const).map((outcome) => (
            <button
              key={outcome}
              onClick={() => setSelectedOutcome(outcome)}
              style={{
                padding: "3px 10px",
                borderRadius: 16,
                fontSize: 12,
                cursor: "pointer",
                border: "1px solid",
                borderColor: selectedOutcome === outcome ? "var(--primary)" : "var(--border)",
                backgroundColor: selectedOutcome === outcome ? "var(--primary)" : "transparent",
                color: selectedOutcome === outcome ? "var(--primary-foreground)" : "var(--foreground)",
              }}
            >
              {outcome === "all" ? "All Shots" : outcome === "made" ? "Makes" : "Misses"}
            </button>
          ))}
        </div>

        {/* Shot Range */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)" }}>Type:</span>
          {(["all", "TWO_POINT", "THREE_POINT"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setSelectedType(t)}
              style={{
                padding: "3px 10px",
                borderRadius: 16,
                fontSize: 12,
                cursor: "pointer",
                border: "1px solid",
                borderColor: selectedType === t ? "var(--primary)" : "var(--border)",
                backgroundColor: selectedType === t ? "var(--primary)" : "transparent",
                color: selectedType === t ? "var(--primary-foreground)" : "var(--foreground)",
              }}
            >
              {t === "all" ? "All" : t === "TWO_POINT" ? "2PT" : "3PT"}
            </button>
          ))}
        </div>

        {/* Player Dropdown */}
        {playerOptions.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)" }}>Player:</span>
            <select
              value={selectedPlayerId}
              onChange={(e) => setSelectedPlayerId(e.target.value)}
              style={{
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                fontSize: 12,
                backgroundColor: "var(--background)",
                color: "var(--foreground)",
              }}
            >
              <option value="all">All Players</option>
              {playerOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* KPI Cards Strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14 }}>
        <StatCard
          label="Field Goal %"
          value={`${filteredSummary.fgPct}%`}
          hint={`${filteredSummary.fgm} / ${filteredSummary.fga} made`}
        />
        <StatCard
          label="Effective FG% (eFG)"
          value={`${filteredSummary.eFgPct}%`}
          hint="Adjusts for 3PT value"
        />
        <StatCard
          label="True Shooting % (TS)"
          value={`${filteredSummary.tsPct}%`}
          hint="Comprehensive shooting"
        />
        <StatCard
          label="2-Point FG%"
          value={`${filteredSummary.twoPPct}%`}
          hint={`${filteredSummary.twoPm} / ${filteredSummary.twoPa}`}
        />
        <StatCard
          label="3-Point FG%"
          value={`${filteredSummary.threePPct}%`}
          hint={`${filteredSummary.threePm} / ${filteredSummary.threePa}`}
        />
      </div>

      {/* Sample Size Alert if N < 10 */}
      {filteredSummary.smallSample && (
        <div
          style={{
            padding: "8px 14px",
            borderRadius: 6,
            backgroundColor: "rgba(234, 179, 8, 0.1)",
            border: "1px solid rgba(234, 179, 8, 0.3)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 12,
            color: "#eab308",
          }}
        >
          <span>⚠️</span>
          <span>
            <strong>Small sample size:</strong> Filter matches {filteredSummary.fga} field goal attempts. Analytical conclusions require cautious interpretation (ADR-0008).
          </span>
        </div>
      )}

      {/* Visual Court & Shot Markers */}
      <Card style={{ padding: 16, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
        <div style={{ position: "relative", width: "100%", maxWidth: 700, margin: "0 auto" }}>
          <CourtRenderer
            mode="half"
            orientation="horizontal"
            theme="dark"
            width={700}
            height={480}
            padding={24}
          >
            {/* Overlay SVG Shot Elements */}
            <g className="shot-markers">
              {filteredShots.map((shot) => {
                const pt: CourtPoint = { x: shot.coordX, y: shot.coordY };
                const svgCoords = courtToSvg(pt, courtViewport);

                return (
                  <g
                    key={shot.id}
                    onMouseEnter={() => setHoveredShot(shot)}
                    onMouseLeave={() => setHoveredShot(null)}
                    style={{ cursor: "pointer" }}
                  >
                    {shot.made ? (
                      // Made shot: Green circle with dark border
                      <circle
                        cx={svgCoords.x}
                        cy={svgCoords.y}
                        r={7}
                        fill="#22c55e"
                        stroke="#0f172a"
                        strokeWidth={2}
                        opacity={0.9}
                      />
                    ) : (
                      // Missed shot: Red/orange 'X' mark
                      <g stroke="#ef4444" strokeWidth={2.5} strokeLinecap="round" opacity={0.85}>
                        <line x1={svgCoords.x - 5} y1={svgCoords.y - 5} x2={svgCoords.x + 5} y2={svgCoords.y + 5} />
                        <line x1={svgCoords.x + 5} y1={svgCoords.y - 5} x2={svgCoords.x - 5} y2={svgCoords.y + 5} />
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          </CourtRenderer>

          {/* Interactive Tooltip Card */}
          {hoveredShot && (
            <div
              style={{
                position: "absolute",
                top: 16,
                right: 16,
                backgroundColor: "rgba(15, 23, 42, 0.95)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 12,
                color: "#f8fafc",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
                pointerEvents: "none",
                zIndex: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: hoveredShot.made ? "#22c55e" : "#ef4444",
                  }}
                />
                <strong>{hoveredShot.made ? "MADE" : "MISSED"} {hoveredShot.shotType}</strong>
              </div>
              <div>{hoveredShot.playerName || `Player #${hoveredShot.jerseyNumber ?? ""}`} ({hoveredShot.side.toUpperCase()})</div>
              <div>Distance: <strong>{hoveredShot.distanceMeters}m</strong> ({Math.round(hoveredShot.distanceMeters * 3.28084)} ft)</div>
              <div>Zone: {hoveredShot.zone.replace(/_/g, " ")}</div>
              <div style={{ color: "var(--muted-foreground)" }}>
                Period {hoveredShot.period} {hoveredShot.clockSeconds != null ? `• ${Math.floor(hoveredShot.clockSeconds / 60)}:${(hoveredShot.clockSeconds % 60).toString().padStart(2, "0")}` : ""}
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 24, marginTop: 12, fontSize: 13, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ display: "inline-block", width: 12, height: 12, borderRadius: "50%", backgroundColor: "#22c55e" }} />
            <span>Made Shot ({filteredShots.filter((s) => s.made).length})</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#ef4444", fontWeight: 700, fontSize: 16 }}>✕</span>
            <span>Missed Shot ({filteredShots.filter((s) => !s.made).length})</span>
          </div>
          <div style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
            Total plotted: {filteredShots.length} shots
          </div>
        </div>
      </Card>

      {/* Zone Efficiency Table */}
      {showHeatmap && (
        <Card style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Zone Efficiency Breakdown</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                  <th style={{ padding: "8px 12px" }}>Court Zone</th>
                  <th style={{ padding: "8px 12px" }}>Makes / Attempts</th>
                  <th style={{ padding: "8px 12px" }}>FG%</th>
                  <th style={{ padding: "8px 12px" }}>Points</th>
                  <th style={{ padding: "8px 12px" }}>Frequency%</th>
                  <th style={{ padding: "8px 12px" }}>Efficiency Rating</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(data.zones).map((z) => {
                  const rating =
                    z.attempts === 0
                      ? "neutral"
                      : z.pct >= 50
                      ? "success"
                      : z.pct >= 38
                      ? "warning"
                      : "neutral";
                  return (
                    <tr key={z.zone} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px 12px", fontWeight: 500 }}>{z.label}</td>
                      <td style={{ padding: "8px 12px" }}>{z.makes} / {z.attempts}</td>
                      <td style={{ padding: "8px 12px", fontWeight: 600 }}>{z.pct}%</td>
                      <td style={{ padding: "8px 12px" }}>{z.points} pts</td>
                      <td style={{ padding: "8px 12px" }}>{z.frequencyPct}%</td>
                      <td style={{ padding: "8px 12px" }}>
                        <Badge variant={rating}>
                          {z.attempts === 0 ? "No shots" : z.pct >= 50 ? "Hot (>50%)" : z.pct >= 38 ? "Average" : "Cold"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
