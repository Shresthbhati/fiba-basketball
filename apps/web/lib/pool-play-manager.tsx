"use client";

import { useState } from "react";
import type { MatchRow, StandingRow, GroupStandingsMap } from "./competition-types";

export interface PoolPlayManagerProps {
  competitionId: string;
  competitionName: string;
  groupStandings: GroupStandingsMap;
  matches: MatchRow[];
  teamNames: Record<string, string>;
  advancePerGroup?: number;
}

export function PoolPlayManager({
  competitionId: _competitionId,
  competitionName,
  groupStandings,
  matches,
  teamNames,
  advancePerGroup = 2,
}: PoolPlayManagerProps) {
  const [activeTab, setActiveTab] = useState<"GROUPS" | "PLAYOFFS" | "ALL">("GROUPS");
  const groupNames = Object.keys(groupStandings).sort();

  const groupMatches = matches.filter((m) => m.stage === "GROUP");
  const playoffMatches = matches.filter((m) => m.stage === "PLAYOFF");

  const playoffRounds = Array.from(new Set(playoffMatches.map((m) => m.round))).sort((a, b) => a - b);

  function getRoundTitle(round: number, totalRounds: number) {
    if (round === totalRounds) return "Championship Final";
    if (round === totalRounds - 1) return "Semifinals";
    if (round === totalRounds - 2) return "Quarterfinals";
    return `Playoffs Round ${round}`;
  }

  return (
    <div
      style={{
        display: "grid",
        gap: "1.5rem",
        backgroundColor: "var(--bg-surface, #141418)",
        borderRadius: 8,
        border: "1px solid var(--border, #2a2a32)",
        padding: "1.25rem",
        color: "var(--text, #f0f0f4)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700 }}>
            {competitionName} — Pool Play &amp; Playoffs
          </h2>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.875rem", color: "var(--muted, #8a8a98)" }}>
            Top {advancePerGroup} teams from each pool advance to the knockout playoffs.
          </p>
        </div>

        {/* Tab Controls */}
        <div role="tablist" style={{ display: "flex", gap: "0.5rem", backgroundColor: "var(--bg-canvas, #0a0a0c)", padding: 4, borderRadius: 6 }}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "GROUPS"}
            onClick={() => setActiveTab("GROUPS")}
            style={{
              padding: "0.4rem 0.85rem",
              borderRadius: 4,
              border: "none",
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: 600,
              backgroundColor: activeTab === "GROUPS" ? "var(--accent, #f97316)" : "transparent",
              color: activeTab === "GROUPS" ? "#fff" : "var(--muted, #8a8a98)",
            }}
          >
            Pool Standings
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "PLAYOFFS"}
            onClick={() => setActiveTab("PLAYOFFS")}
            style={{
              padding: "0.4rem 0.85rem",
              borderRadius: 4,
              border: "none",
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: 600,
              backgroundColor: activeTab === "PLAYOFFS" ? "var(--accent, #f97316)" : "transparent",
              color: activeTab === "PLAYOFFS" ? "#fff" : "var(--muted, #8a8a98)",
            }}
          >
            Playoff Bracket ({playoffMatches.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "ALL"}
            onClick={() => setActiveTab("ALL")}
            style={{
              padding: "0.4rem 0.85rem",
              borderRadius: 4,
              border: "none",
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: 600,
              backgroundColor: activeTab === "ALL" ? "var(--accent, #f97316)" : "transparent",
              color: activeTab === "ALL" ? "#fff" : "var(--muted, #8a8a98)",
            }}
          >
            All Fixtures ({matches.length})
          </button>
        </div>
      </div>

      {/* POOL STANDINGS VIEW */}
      {activeTab === "GROUPS" && (
        <div
          role="tabpanel"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "1.25rem",
          }}
        >
          {groupNames.length === 0 ? (
            <div style={{ color: "var(--muted, #8a8a98)", fontStyle: "italic", padding: "1rem" }}>
              No pool standings calculated yet. Generate tournament schedule to assign teams to pools.
            </div>
          ) : (
            groupNames.map((gName) => {
              const rows: StandingRow[] = groupStandings[gName] ?? [];
              return (
                <div
                  key={gName}
                  style={{
                    backgroundColor: "var(--bg-canvas, #0a0a0c)",
                    border: "1px solid var(--border, #2a2a32)",
                    borderRadius: 6,
                    padding: "1rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                    <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "var(--accent, #f97316)" }}>
                      {gName}
                    </h3>
                    <span style={{ fontSize: "0.75rem", color: "var(--muted, #8a8a98)" }}>
                      Top {advancePerGroup} advance
                    </span>
                  </div>

                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border, #2a2a32)", color: "var(--muted, #8a8a98)", textAlign: "left" }}>
                        <th style={{ padding: "0.4rem 0.25rem" }}>#</th>
                        <th style={{ padding: "0.4rem 0.5rem" }}>Team</th>
                        <th style={{ padding: "0.4rem 0.25rem", textAlign: "center" }}>P</th>
                        <th style={{ padding: "0.4rem 0.25rem", textAlign: "center" }}>W</th>
                        <th style={{ padding: "0.4rem 0.25rem", textAlign: "center" }}>L</th>
                        <th style={{ padding: "0.4rem 0.25rem", textAlign: "center" }}>+/-</th>
                        <th style={{ padding: "0.4rem 0.5rem", textAlign: "right" }}>Pts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const qualifies = row.rank <= advancePerGroup;
                        return (
                          <tr
                            key={row.name}
                            style={{
                              borderBottom: "1px solid rgba(255,255,255,0.05)",
                              backgroundColor: qualifies ? "rgba(249, 115, 22, 0.07)" : "transparent",
                            }}
                          >
                            <td style={{ padding: "0.5rem 0.25rem", fontWeight: 600 }}>{row.rank}</td>
                            <td style={{ padding: "0.5rem 0.5rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                              <span style={{ fontWeight: 600 }}>{row.name}</span>
                              {qualifies && (
                                <span
                                  style={{
                                    fontSize: "0.65rem",
                                    padding: "0.1rem 0.35rem",
                                    backgroundColor: "rgba(34, 197, 94, 0.15)",
                                    color: "#4ade80",
                                    borderRadius: 3,
                                    fontWeight: 700,
                                  }}
                                >
                                  ADV
                                </span>
                              )}
                            </td>
                            <td style={{ padding: "0.5rem 0.25rem", textAlign: "center" }}>{row.played}</td>
                            <td style={{ padding: "0.5rem 0.25rem", textAlign: "center", color: "#4ade80" }}>{row.wins}</td>
                            <td style={{ padding: "0.5rem 0.25rem", textAlign: "center", color: "#f87171" }}>{row.losses}</td>
                            <td style={{ padding: "0.5rem 0.25rem", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                              {row.pointsFor - row.pointsAgainst > 0 ? `+${row.pointsFor - row.pointsAgainst}` : row.pointsFor - row.pointsAgainst}
                            </td>
                            <td style={{ padding: "0.5rem 0.5rem", textAlign: "right", fontWeight: 700 }}>{row.points}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* PLAYOFF BRACKET VIEW */}
      {activeTab === "PLAYOFFS" && (
        <div
          role="tabpanel"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${playoffRounds.length || 1}, minmax(240px, 1fr))`,
            gap: "1.5rem",
            overflowX: "auto",
            padding: "0.5rem 0",
          }}
        >
          {playoffRounds.length === 0 ? (
            <div style={{ color: "var(--muted, #8a8a98)", fontStyle: "italic", padding: "1rem" }}>
              No playoff bracket fixtures scheduled yet.
            </div>
          ) : (
            playoffRounds.map((round) => {
              const roundMatches = playoffMatches.filter((m) => m.round === round);
              const title = getRoundTitle(round, playoffRounds.length);

              return (
                <div key={round} style={{ display: "grid", gap: "1rem", alignContent: "start" }}>
                  <div
                    style={{
                      fontSize: "0.9rem",
                      fontWeight: 700,
                      color: "var(--accent, #f97316)",
                      borderBottom: "2px solid var(--accent, #f97316)",
                      paddingBottom: "0.25rem",
                    }}
                  >
                    {title}
                  </div>

                  <div style={{ display: "grid", gap: "0.75rem" }}>
                    {roundMatches.map((m) => {
                      const home = m.homeTeamId ? teamNames[m.homeTeamId] ?? "Team" : "TBD (Group Qualifier)";
                      const away = m.awayTeamId ? teamNames[m.awayTeamId] ?? "Team" : "TBD (Group Qualifier)";
                      const isComplete = m.state === "FINISHED" || m.state === "LOCKED";

                      return (
                        <div
                          key={m.id}
                          style={{
                            backgroundColor: "var(--bg-canvas, #0a0a0c)",
                            border: "1px solid var(--border, #2a2a32)",
                            borderRadius: 6,
                            padding: "0.75rem",
                            fontSize: "0.85rem",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.4rem", color: "var(--muted, #8a8a98)", fontSize: "0.75rem" }}>
                            <span>Slot {m.slot}</span>
                            <span>{m.state}</span>
                          </div>

                          <div style={{ display: "grid", gap: "0.35rem" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                              <span style={{ color: m.homeTeamId ? "var(--text, #f0f0f4)" : "var(--muted, #8a8a98)" }}>{home}</span>
                              {isComplete && <span>{m.homeScore}</span>}
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                              <span style={{ color: m.awayTeamId ? "var(--text, #f0f0f4)" : "var(--muted, #8a8a98)" }}>{away}</span>
                              {isComplete && <span>{m.awayScore}</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ALL FIXTURES VIEW */}
      {activeTab === "ALL" && (
        <div role="tabpanel" style={{ display: "grid", gap: "1rem" }}>
          <div>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "0 0 0.5rem", color: "var(--accent, #f97316)" }}>
              Group Stage Matches ({groupMatches.length})
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.75rem" }}>
              {groupMatches.map((m) => {
                const home = m.homeTeamId ? teamNames[m.homeTeamId] ?? "?" : "TBD";
                const away = m.awayTeamId ? teamNames[m.awayTeamId] ?? "?" : "TBD";
                return (
                  <div
                    key={m.id}
                    style={{
                      backgroundColor: "var(--bg-canvas, #0a0a0c)",
                      border: "1px solid var(--border, #2a2a32)",
                      borderRadius: 6,
                      padding: "0.75rem",
                      fontSize: "0.85rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--muted, #8a8a98)", marginBottom: "0.25rem" }}>
                      <span>{m.groupName} · R{m.round}</span>
                      <span>{m.state}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                      <span>{home} vs {away}</span>
                      {m.homeScore !== null && <span>{m.homeScore} - {m.awayScore}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, margin: "1rem 0 0.5rem", color: "var(--accent, #f97316)" }}>
              Playoff Knockout Matches ({playoffMatches.length})
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.75rem" }}>
              {playoffMatches.map((m) => {
                const home = m.homeTeamId ? teamNames[m.homeTeamId] ?? "TBD" : "TBD (Qualifier)";
                const away = m.awayTeamId ? teamNames[m.awayTeamId] ?? "TBD" : "TBD (Qualifier)";
                return (
                  <div
                    key={m.id}
                    style={{
                      backgroundColor: "var(--bg-canvas, #0a0a0c)",
                      border: "1px solid var(--border, #2a2a32)",
                      borderRadius: 6,
                      padding: "0.75rem",
                      fontSize: "0.85rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--muted, #8a8a98)", marginBottom: "0.25rem" }}>
                      <span>Playoff R{m.round}</span>
                      <span>{m.state}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                      <span>{home} vs {away}</span>
                      {m.homeScore !== null && <span>{m.homeScore} - {m.awayScore}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
