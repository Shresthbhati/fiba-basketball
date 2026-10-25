"use client";

import React, { useCallback, useEffect, useState } from "react";

export interface EmbedTeamDto {
  id: string;
  name: string;
  seed?: number | null;
}

export interface EmbedMatchScoreboardData {
  match: {
    id: string;
    competitionId: string;
    competitionName: string;
    round: number;
    slot: number;
    stage: string;
    groupName: string | null;
    courtName: string | null;
    scheduledAt: string | null;
    state: "SCHEDULED" | "LIVE" | "FINISHED" | "LOCKED" | string;
    isBye: boolean;
  };
  competition: {
    id: string;
    name: string;
    format: string;
    status: string;
  };
  homeTeam: EmbedTeamDto | null;
  awayTeam: EmbedTeamDto | null;
  score: {
    homeScore: number;
    awayScore: number;
    period: number;
    clockSeconds: number | null;
    teamFouls: Record<number, { home: number; away: number }>;
    timeouts: { home: number; away: number };
    periodScores: Array<{ period: number; label: string; home: number; away: number }>;
    currentRun: { side: "home" | "away"; points: number; unanswered: boolean } | null;
    lastScoringSide: "home" | "away" | null;
    gameEnded: boolean;
    version: number;
  };
  streamUrl?: string;
}

export interface LiveScoreboardWidgetProps {
  initialData: EmbedMatchScoreboardData;
  theme?: "dark" | "light" | "transparent";
  compact?: boolean;
  enableSse?: boolean;
  onRefresh?: () => void;
}

export function formatClock(
  clockSeconds: number | null,
  period: number,
  state: string,
  gameEnded: boolean
): string {
  if (state === "FINISHED" || state === "LOCKED" || gameEnded) {
    return "FINAL";
  }
  if (state === "SCHEDULED") {
    return "UPCOMING";
  }
  const periodLabel = period <= 4 ? `Q${period}` : `OT${period - 4}`;
  if (clockSeconds === null) {
    return `${periodLabel} LIVE`;
  }
  const mins = Math.floor(clockSeconds / 60);
  const secs = clockSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${periodLabel} ${pad(mins)}:${pad(secs)}`;
}

export function LiveScoreboardWidget({
  initialData,
  theme = "dark",
  compact = false,
  enableSse = true,
  onRefresh,
}: LiveScoreboardWidgetProps) {
  const [data, setData] = useState<EmbedMatchScoreboardData>(initialData);
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "reconnecting" | "polling" | "idle">(
    enableSse && initialData.match.state === "LIVE" ? "connected" : "idle"
  );
  const [copied, setCopied] = useState(false);
  const [showEmbedCode, setShowEmbedCode] = useState(false);

  // Sync data whenever initialData changes from parent
  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  // Real-time Server-Sent Events (SSE) Listener (Spec §16.3, §22.1)
  useEffect(() => {
    if (!enableSse || data.match.state !== "LIVE" || typeof window === "undefined" || !("EventSource" in window)) {
      return;
    }

    const streamUrl = data.streamUrl || `/api/v1/streams/matches/${data.match.id}`;
    const es = new EventSource(streamUrl);

    es.onopen = () => {
      setConnectionStatus("connected");
    };

    es.onmessage = () => {
      // Event hint received over SSE: trigger refresh
      if (onRefresh) {
        onRefresh();
      }
    };

    es.onerror = () => {
      setConnectionStatus("reconnecting");
    };

    return () => {
      es.close();
    };
  }, [enableSse, data.match.id, data.match.state, data.streamUrl, onRefresh]);

  const isLight = theme === "light";
  const isTransparent = theme === "transparent";

  const bgColor = isTransparent ? "transparent" : isLight ? "#ffffff" : "#0f172a";
  const cardBg = isTransparent ? "rgba(255,255,255,0.06)" : isLight ? "#f8fafc" : "#1e293b";
  const textColor = isLight ? "#0f172a" : "#f8fafc";
  const mutedColor = isLight ? "#64748b" : "#94a3b8";
  const borderColor = isLight ? "#e2e8f0" : "rgba(255,255,255,0.12)";
  const accentColor = "#3b82f6";

  const { match, competition, homeTeam, awayTeam, score } = data;
  const isLive = match.state === "LIVE";
  const isFinal = match.state === "FINISHED" || match.state === "LOCKED" || score.gameEnded;

  const currentFouls = score.teamFouls[score.period] ?? { home: 0, away: 0 };
  const homeInBonus = currentFouls.home >= 5;
  const awayInBonus = currentFouls.away >= 5;

  const handleCopyEmbed = useCallback(() => {
    if (typeof window === "undefined") return;
    const origin = window.location.origin;
    const code = `<iframe src="${origin}/embed/competitions/${match.competitionId}/match/${match.id}?theme=${theme}" width="100%" height="450" frameborder="0"></iframe>`;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }, [match.competitionId, match.id, theme]);

  return (
    <div
      data-testid="live-scoreboard-widget"
      style={{
        background: bgColor,
        color: textColor,
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        borderRadius: isTransparent ? 0 : 16,
        border: isTransparent ? "none" : `1px solid ${borderColor}`,
        overflow: "hidden",
        padding: compact ? "16px" : "24px",
        boxSizing: "border-box",
        width: "100%",
        maxWidth: 720,
        margin: "0 auto",
      }}
    >
      {/* Top Bar: Competition Details & Game Clock Status */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 16,
          borderBottom: `1px solid ${borderColor}`,
          paddingBottom: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: accentColor, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {competition.name}
          </div>
          <div style={{ fontSize: 12, color: mutedColor }}>
            {match.stage === "GROUP" ? `Group ${match.groupName ?? "Stage"}` : `Round ${match.round}`}
            {match.courtName ? ` • ${match.courtName}` : ""}
            {match.scheduledAt ? ` • ${new Date(match.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
          </div>
        </div>

        {/* Live / Status Pill */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {isLive && (
            <span
              data-testid="live-indicator"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "rgba(239, 68, 68, 0.15)",
                color: "#ef4444",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                padding: "3px 10px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.5,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "#ef4444",
                  boxShadow: "0 0 8px #ef4444",
                }}
              />
              LIVE
            </span>
          )}

          {isFinal && (
            <span
              style={{
                background: "rgba(100, 116, 139, 0.2)",
                color: mutedColor,
                padding: "3px 10px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              FINAL
            </span>
          )}

          {connectionStatus === "connected" && (
            <span
              data-testid="connection-status"
              style={{ fontSize: 11, color: "#10b981", display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              ● Connected
            </span>
          )}
          {connectionStatus === "reconnecting" && (
            <span
              data-testid="connection-status"
              style={{ fontSize: 11, color: "#f59e0b", display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              ◌ Reconnecting…
            </span>
          )}
        </div>
      </div>

      {/* Main Scoreboard Arena Display */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 16,
          background: cardBg,
          borderRadius: 14,
          padding: compact ? "16px 12px" : "24px 20px",
          border: `1px solid ${borderColor}`,
          marginBottom: 20,
        }}
      >
        {/* Home Team */}
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 4 }}>
            {score.lastScoringSide === "home" && isLive && (
              <span data-testid="possession-home" title="Ball Possession" style={{ fontSize: 14 }}>
                🏀
              </span>
            )}
            <h2
              style={{
                margin: 0,
                fontSize: compact ? 17 : 20,
                fontWeight: 800,
                lineHeight: 1.2,
                color: textColor,
              }}
            >
              {homeTeam?.name ?? "Home Team"}
            </h2>
          </div>

          <div style={{ fontSize: 11, color: mutedColor, marginBottom: 8 }}>
            HOME {homeTeam?.seed ? `(#${homeTeam.seed})` : ""}
          </div>

          <div
            data-testid="home-score"
            style={{
              fontSize: compact ? 38 : 52,
              fontWeight: 900,
              letterSpacing: -1,
              lineHeight: 1,
              color: isLive ? (score.homeScore >= score.awayScore ? "#22c55e" : textColor) : textColor,
            }}
          >
            {score.homeScore}
          </div>

          {/* Team Fouls & Timeouts */}
          <div style={{ marginTop: 10, display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", fontSize: 11 }}>
            <span
              style={{
                padding: "2px 6px",
                borderRadius: 4,
                background: homeInBonus ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.08)",
                color: homeInBonus ? "#ef4444" : mutedColor,
                fontWeight: homeInBonus ? 700 : 500,
              }}
            >
              Fouls: {currentFouls.home} {homeInBonus ? "(BONUS)" : ""}
            </span>
            <span style={{ padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,0.08)", color: mutedColor }}>
              TO: {score.timeouts.home}
            </span>
          </div>
        </div>

        {/* Center: Clock & Game Status */}
        <div style={{ textAlign: "center", minWidth: 90 }}>
          <div
            data-testid="game-clock"
            style={{
              fontSize: compact ? 15 : 17,
              fontWeight: 800,
              color: isLive ? "#ef4444" : textColor,
              letterSpacing: 0.5,
              marginBottom: 4,
            }}
          >
            {formatClock(score.clockSeconds, score.period, match.state, score.gameEnded)}
          </div>
          <div style={{ fontSize: 11, color: mutedColor, textTransform: "uppercase" }}>
            {score.period <= 4 ? `Period ${score.period}` : `Overtime ${score.period - 4}`}
          </div>
        </div>

        {/* Away Team */}
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 4 }}>
            <h2
              style={{
                margin: 0,
                fontSize: compact ? 17 : 20,
                fontWeight: 800,
                lineHeight: 1.2,
                color: textColor,
              }}
            >
              {awayTeam?.name ?? "Away Team"}
            </h2>
            {score.lastScoringSide === "away" && isLive && (
              <span data-testid="possession-away" title="Ball Possession" style={{ fontSize: 14 }}>
                🏀
              </span>
            )}
          </div>

          <div style={{ fontSize: 11, color: mutedColor, marginBottom: 8 }}>
            AWAY {awayTeam?.seed ? `(#${awayTeam.seed})` : ""}
          </div>

          <div
            data-testid="away-score"
            style={{
              fontSize: compact ? 38 : 52,
              fontWeight: 900,
              letterSpacing: -1,
              lineHeight: 1,
              color: isLive ? (score.awayScore >= score.homeScore ? "#22c55e" : textColor) : textColor,
            }}
          >
            {score.awayScore}
          </div>

          {/* Team Fouls & Timeouts */}
          <div style={{ marginTop: 10, display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap", fontSize: 11 }}>
            <span
              style={{
                padding: "2px 6px",
                borderRadius: 4,
                background: awayInBonus ? "rgba(239,68,68,0.2)" : "rgba(255,255,255,0.08)",
                color: awayInBonus ? "#ef4444" : mutedColor,
                fontWeight: awayInBonus ? 700 : 500,
              }}
            >
              Fouls: {currentFouls.away} {awayInBonus ? "(BONUS)" : ""}
            </span>
            <span style={{ padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,0.08)", color: mutedColor }}>
              TO: {score.timeouts.away}
            </span>
          </div>
        </div>
      </div>

      {/* Momentum Scoring Run Banner (Spec §16.3, §17.2) */}
      {score.currentRun && score.currentRun.points >= 4 && isLive && (
        <div
          data-testid="momentum-run-banner"
          style={{
            background: "linear-gradient(90deg, rgba(245, 158, 11, 0.15), rgba(239, 68, 68, 0.15))",
            border: "1px solid rgba(245, 158, 11, 0.4)",
            color: "#f59e0b",
            borderRadius: 8,
            padding: "8px 14px",
            textAlign: "center",
            fontSize: 13,
            fontWeight: 700,
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <span>🔥</span>
          <span>
            {score.currentRun.points}-0 UNANSWERED RUN BY{" "}
            {score.currentRun.side === "home" ? homeTeam?.name ?? "HOME" : awayTeam?.name ?? "AWAY"}
          </span>
        </div>
      )}

      {/* Period / Quarter-by-Quarter Linescore Table */}
      <div style={{ marginBottom: 20, overflowX: "auto" }}>
        <table
          data-testid="linescore-table"
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12,
            textAlign: "center",
          }}
        >
          <thead>
            <tr style={{ color: mutedColor, borderBottom: `1px solid ${borderColor}` }}>
              <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600 }}>TEAM</th>
              {score.periodScores.map((ps) => (
                <th
                  key={ps.period}
                  style={{
                    padding: "8px 10px",
                    fontWeight: ps.period === score.period ? 800 : 600,
                    color: ps.period === score.period && isLive ? accentColor : mutedColor,
                  }}
                >
                  {ps.label}
                </th>
              ))}
              <th style={{ padding: "8px 10px", fontWeight: 800, color: textColor }}>TOTAL</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: `1px solid ${borderColor}` }}>
              <td style={{ textAlign: "left", padding: "10px", fontWeight: 700 }}>
                {homeTeam?.name ?? "Home Team"}
              </td>
              {score.periodScores.map((ps) => (
                <td key={ps.period} style={{ padding: "10px", color: textColor }}>
                  {ps.home}
                </td>
              ))}
              <td style={{ padding: "10px", fontWeight: 800, color: textColor }}>
                {score.homeScore}
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: "left", padding: "10px", fontWeight: 700 }}>
                {awayTeam?.name ?? "Away Team"}
              </td>
              {score.periodScores.map((ps) => (
                <td key={ps.period} style={{ padding: "10px", color: textColor }}>
                  {ps.away}
                </td>
              ))}
              <td style={{ padding: "10px", fontWeight: 800, color: textColor }}>
                {score.awayScore}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer & Embed Code Actions */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
          borderTop: `1px solid ${borderColor}`,
          paddingTop: 12,
          fontSize: 11,
          color: mutedColor,
        }}
      >
        <span>COURT IQ LIVE SCOREBOARD • OFFICIAL DATA</span>
        <button
          type="button"
          onClick={() => setShowEmbedCode(!showEmbedCode)}
          style={{
            background: "none",
            border: `1px solid ${borderColor}`,
            color: mutedColor,
            borderRadius: 6,
            padding: "4px 10px",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          {showEmbedCode ? "Hide Embed" : "</> Embed Scoreboard"}
        </button>
      </div>

      {showEmbedCode && (
        <div style={{ marginTop: 12, padding: 12, background: cardBg, borderRadius: 8, border: `1px solid ${borderColor}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Embed Code:</span>
            <button
              type="button"
              onClick={handleCopyEmbed}
              style={{
                background: accentColor,
                color: "#ffffff",
                border: "none",
                borderRadius: 4,
                padding: "3px 10px",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {copied ? "Copied!" : "Copy HTML"}
            </button>
          </div>
          <code
            style={{
              display: "block",
              padding: 8,
              background: isLight ? "#e2e8f0" : "#020617",
              borderRadius: 6,
              fontSize: 11,
              wordBreak: "break-all",
              color: textColor,
            }}
          >
            {typeof window !== "undefined"
              ? `<iframe src="${window.location.origin}/embed/competitions/${match.competitionId}/match/${match.id}?theme=${theme}" width="100%" height="450" frameborder="0"></iframe>`
              : `<iframe src="/embed/competitions/${match.competitionId}/match/${match.id}?theme=${theme}" width="100%" height="450" frameborder="0"></iframe>`}
          </code>
        </div>
      )}
    </div>
  );
}
