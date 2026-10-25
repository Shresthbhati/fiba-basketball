"use client";

import React from "react";

export interface EmbedTeam {
  id: string;
  name: string;
  seed: number | null;
}

export interface EmbedMatch {
  id: string;
  round: number;
  slot: number;
  homeTeam: EmbedTeam | null;
  awayTeam: EmbedTeam | null;
  homeScore: number | null;
  awayScore: number | null;
  state: string;
  isBye: boolean;
  scheduledAt: string | null;
  winnerTeamId: string | null;
}

export interface EmbedBracketRound {
  round: number;
  name: string;
  matches: EmbedMatch[];
}

export interface EmbedScheduleItem {
  id: string;
  round: number;
  roundName: string;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  state: string;
  scheduledAt: string | null;
  isBye: boolean;
  winner: string | null;
}

export interface EmbedSummary {
  competition: {
    id: string;
    name: string;
    format: string;
    status: string;
  };
  stats: {
    teamCount: number;
    totalMatches: number;
    completedMatches: number;
    liveMatches: number;
    upcomingMatches: number;
  };
  standings: Array<{
    rank: number;
    team: string;
    name: string;
    played: number;
    wins: number;
    losses: number;
    points: number;
    pointsFor: number;
    pointsAgainst: number;
    diff: number;
  }> | null;
  bracket: EmbedBracketRound[] | null;
  schedule: EmbedScheduleItem[];
}

export interface EmbedWidgetProps {
  summary: EmbedSummary;
  view?: "all" | "standings" | "bracket" | "schedule";
  theme?: "dark" | "light" | "transparent";
  compact?: boolean;
}

export function EmbedWidget({
  summary,
  view = "all",
  theme = "dark",
  compact = false,
}: EmbedWidgetProps) {
  const isLight = theme === "light";
  const isTransparent = theme === "transparent";

  const bgColor = isTransparent ? "transparent" : isLight ? "#ffffff" : "#0f172a";
  const cardBg = isTransparent ? "rgba(255,255,255,0.05)" : isLight ? "#f8fafc" : "#1e293b";
  const textColor = isLight ? "#0f172a" : "#f8fafc";
  const mutedColor = isLight ? "#64748b" : "#94a3b8";
  const borderColor = isLight ? "#e2e8f0" : "rgba(255,255,255,0.1)";

  return (
    <div
      style={{
        background: bgColor,
        color: textColor,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        padding: compact ? 8 : 16,
        borderRadius: compact ? 0 : 8,
        maxWidth: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: `1px solid ${borderColor}`,
          paddingBottom: 10,
          marginBottom: 16,
        }}
      >
        <div>
          <h1 style={{ fontSize: compact ? 16 : 20, fontWeight: 700, margin: 0 }}>
            {summary.competition.name}
          </h1>
          <span style={{ fontSize: 12, color: mutedColor }}>
            {summary.competition.format.replace(/_/g, " ")} · {summary.stats.teamCount} Teams
          </span>
        </div>
        <div style={{ textAlign: "right" }}>
          <span
            style={{
              display: "inline-block",
              padding: "2px 8px",
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              background: summary.competition.status === "COMPLETED" ? "#10b98122" : "#3b82f622",
              color: summary.competition.status === "COMPLETED" ? "#34d399" : "#60a5fa",
            }}
          >
            {summary.competition.status}
          </span>
        </div>
      </div>

      {/* Standings View */}
      {(view === "all" || view === "standings") && summary.standings && summary.standings.length > 0 && (
        <section aria-label="Tournament Standings" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: mutedColor, textTransform: "uppercase", marginBottom: 8 }}>
            Standings
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${borderColor}`, color: mutedColor, fontSize: 11 }}>
                  <th style={{ padding: "6px 8px", width: 32 }}>#</th>
                  <th style={{ padding: "6px 8px" }}>Team</th>
                  <th style={{ padding: "6px 8px", textAlign: "center" }}>GP</th>
                  <th style={{ padding: "6px 8px", textAlign: "center" }}>W</th>
                  <th style={{ padding: "6px 8px", textAlign: "center" }}>L</th>
                  <th style={{ padding: "6px 8px", textAlign: "center" }}>DIFF</th>
                  <th style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>PTS</th>
                </tr>
              </thead>
              <tbody>
                {summary.standings.map((row) => (
                  <tr key={row.team} style={{ borderBottom: `1px solid ${borderColor}` }}>
                    <td style={{ padding: "8px", fontWeight: 600, color: mutedColor }}>{row.rank}</td>
                    <td style={{ padding: "8px", fontWeight: 600 }}>{row.name}</td>
                    <td style={{ padding: "8px", textAlign: "center" }}>{row.played}</td>
                    <td style={{ padding: "8px", textAlign: "center", color: "#34d399" }}>{row.wins}</td>
                    <td style={{ padding: "8px", textAlign: "center", color: "#f87171" }}>{row.losses}</td>
                    <td style={{ padding: "8px", textAlign: "center" }}>
                      {row.diff > 0 ? `+${row.diff}` : row.diff}
                    </td>
                    <td style={{ padding: "8px", textAlign: "right", fontWeight: 700, color: "#38bdf8" }}>
                      {row.points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Bracket View */}
      {(view === "all" || view === "bracket") && summary.bracket && summary.bracket.length > 0 && (
        <section aria-label="Playoff Bracket" style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: mutedColor, textTransform: "uppercase", marginBottom: 8 }}>
            Playoff Bracket
          </h2>
          <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 8 }}>
            {summary.bracket.map((round) => (
              <div key={round.round} style={{ minWidth: 200, flex: "1 0 auto" }}>
                <h3 style={{ fontSize: 12, fontWeight: 600, color: mutedColor, margin: "0 0 8px 0" }}>
                  {round.name}
                </h3>
                <div style={{ display: "grid", gap: 8 }}>
                  {round.matches.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        background: cardBg,
                        border: `1px solid ${borderColor}`,
                        borderRadius: 6,
                        padding: 8,
                        fontSize: 12,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "2px 0",
                          fontWeight: m.winnerTeamId === m.homeTeam?.id ? 700 : 400,
                          color: m.winnerTeamId === m.homeTeam?.id ? "#34d399" : textColor,
                        }}
                      >
                        <span>
                          {m.homeTeam?.seed ? `(${m.homeTeam.seed}) ` : ""}
                          {m.homeTeam?.name ?? "TBD"}
                        </span>
                        <span>{m.homeScore ?? "-"}</span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "2px 0",
                          fontWeight: m.winnerTeamId === m.awayTeam?.id ? 700 : 400,
                          color: m.winnerTeamId === m.awayTeam?.id ? "#34d399" : textColor,
                        }}
                      >
                        <span>
                          {m.isBye ? "BYE" : m.awayTeam?.seed ? `(${m.awayTeam.seed}) ` : ""}
                          {m.isBye ? "BYE" : m.awayTeam?.name ?? "TBD"}
                        </span>
                        <span>{m.isBye ? "-" : m.awayScore ?? "-"}</span>
                      </div>
                      <div style={{ marginTop: 4, fontSize: 10, color: mutedColor, textAlign: "right" }}>
                        {m.state}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Schedule View */}
      {(view === "all" || view === "schedule") && summary.schedule.length > 0 && (
        <section aria-label="Tournament Schedule" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: mutedColor, textTransform: "uppercase", marginBottom: 8 }}>
            Schedule & Results
          </h2>
          <div style={{ display: "grid", gap: 6 }}>
            {summary.schedule.map((item) => (
              <div
                key={item.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: cardBg,
                  border: `1px solid ${borderColor}`,
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 13,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, color: mutedColor, width: 64 }}>
                    {item.roundName}
                  </span>
                  <span style={{ fontWeight: item.winner === item.home ? 700 : 500 }}>
                    {item.home}
                  </span>
                  <span style={{ color: mutedColor, fontSize: 11 }}>vs</span>
                  <span style={{ fontWeight: item.winner === item.away ? 700 : 500 }}>
                    {item.away}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {item.homeScore !== null && item.awayScore !== null ? (
                    <span style={{ fontWeight: 700, color: "#38bdf8" }}>
                      {item.homeScore} – {item.awayScore}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: mutedColor }}>
                      {item.scheduledAt ? new Date(item.scheduledAt).toLocaleDateString() : "Scheduled"}
                    </span>
                  )}
                  <span
                    style={{
                      fontSize: 10,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: item.state === "FINISHED" ? "#10b98122" : item.state === "LIVE" ? "#ef444422" : "#64748b22",
                      color: item.state === "FINISHED" ? "#34d399" : item.state === "LIVE" ? "#f87171" : mutedColor,
                      fontWeight: 600,
                    }}
                  >
                    {item.state}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Powered by Footer */}
      <footer
        style={{
          borderTop: `1px solid ${borderColor}`,
          paddingTop: 8,
          fontSize: 11,
          color: mutedColor,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>⚡ Powered by COURT IQ</span>
        <a
          href="https://courtiq.net"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: mutedColor, textDecoration: "none" }}
        >
          courtiq.net
        </a>
      </footer>
    </div>
  );
}
