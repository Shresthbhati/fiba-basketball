"use client";
import Link from "next/link";
import { useMemo } from "react";
import type { MatchRow } from "./competition-types";

type Props = {
  matches: MatchRow[];
  teams: { id: string; name: string }[];
  canManage?: boolean;
};

export function TournamentBracket({ matches, teams, canManage = false }: Props) {
  const teamMap = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);
  const teamName = (id: string | null) => (id ? teamMap.get(id) ?? "?" : "TBD");

  const rounds = useMemo(() => {
    const map = new Map<number, MatchRow[]>();
    for (const m of matches) {
      if (!map.has(m.round)) map.set(m.round, []);
      map.get(m.round)!.push(m);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([round, list]) => ({
        round,
        matches: list.sort((a, b) => a.slot - b.slot),
      }));
  }, [matches]);

  const totalRounds = rounds.length;
  const roundLabel = (r: number) => {
    if (r === totalRounds) return "Final";
    if (r === totalRounds - 1) return "Semi-finals";
    if (r === totalRounds - 2) return "Quarter-finals";
    return `Round ${r}`;
  };

  if (matches.length === 0) {
    return <p style={{ color: "var(--muted)" }}>No bracket available yet.</p>;
  }

  return (
    <section aria-label="Tournament Bracket" style={{ overflowX: "auto", paddingBottom: 16 }}>
      <div style={{ display: "flex", gap: 32, minWidth: rounds.length * 260 }}>
        {rounds.map(({ round, matches: roundMatches }) => (
          <div key={round} style={{ flex: 1, minWidth: 240, display: "flex", flexDirection: "column" }}>
            <h3 style={{ borderBottom: "2px solid var(--accent, #f97316)", paddingBottom: 6, marginBottom: 16, fontSize: "0.95rem", textTransform: "uppercase", letterSpacing: 0.5 }}>
              {roundLabel(round)}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-around", flex: 1, gap: 16 }}>
              {roundMatches.map((m) => {
                const homeWon = m.homeScore !== null && m.awayScore !== null && m.homeScore > m.awayScore;
                const awayWon = m.homeScore !== null && m.awayScore !== null && m.awayScore > m.homeScore;
                const isFinished = m.state === "FINISHED" || m.state === "LOCKED";
                const isLive = m.state === "LIVE";

                if (m.isBye) {
                  return (
                    <div
                      key={m.id}
                      aria-label={`Bye slot for ${teamName(m.homeTeamId ?? m.awayTeamId)}`}
                      style={{
                        background: "var(--surface, #141418)",
                        border: "1px dashed var(--muted, #444)",
                        borderRadius: 8,
                        padding: 10,
                        fontSize: "0.85rem",
                      }}
                    >
                      <div style={{ color: "var(--muted)" }}>Slot {m.slot}</div>
                      <strong>{teamName(m.homeTeamId ?? m.awayTeamId)}</strong>
                      <span style={{ marginLeft: 8, fontSize: "0.75rem", background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: 4 }}>
                        BYE
                      </span>
                    </div>
                  );
                }

                return (
                  <div
                    key={m.id}
                    aria-label={`Bracket match ${teamName(m.homeTeamId)} vs ${teamName(m.awayTeamId)}`}
                    style={{
                      background: "var(--surface, #141418)",
                      border: isLive ? "1px solid #f97316" : "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 8,
                      overflow: "hidden",
                      boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 8px", background: "rgba(255,255,255,0.03)", fontSize: "0.75rem", color: "var(--muted)" }}>
                      <span>M{m.round}.{m.slot}</span>
                      {isLive && <span style={{ color: "#f97316", fontWeight: "bold" }}>● LIVE</span>}
                      {isFinished && <span>FINAL</span>}
                      {m.state === "SCHEDULED" && m.scheduledAt && (
                        <span>{new Date(m.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      )}
                    </div>
                    <div style={{ padding: "8px 10px" }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontWeight: homeWon ? "bold" : "normal",
                          color: homeWon ? "var(--text, #fff)" : isFinished ? "var(--muted, #888)" : "inherit",
                          padding: "2px 0",
                        }}
                      >
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 }}>
                          {teamName(m.homeTeamId)}
                        </span>
                        <span>{m.homeScore ?? (isLive ? 0 : "–")}</span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          fontWeight: awayWon ? "bold" : "normal",
                          color: awayWon ? "var(--text, #fff)" : isFinished ? "var(--muted, #888)" : "inherit",
                          padding: "2px 0",
                          borderTop: "1px solid rgba(255,255,255,0.05)",
                          marginTop: 4,
                        }}
                      >
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 }}>
                          {teamName(m.awayTeamId)}
                        </span>
                        <span>{m.awayScore ?? (isLive ? 0 : "–")}</span>
                      </div>
                    </div>
                    {canManage && (
                      <div style={{ padding: "4px 8px", background: "rgba(0,0,0,0.2)", fontSize: "0.75rem", textAlign: "right", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                        <Link href={`/score/${m.id}`} style={{ color: "var(--accent, #f97316)" }}>
                          {m.state === "FINISHED" ? "Review" : "Score"}
                        </Link>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
