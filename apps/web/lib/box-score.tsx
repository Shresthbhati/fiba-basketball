"use client";
import { useState } from "react";
import { ApiError, api } from "./api";

type Line = { points: number; fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number; rebounds: number; assists: number; turnovers: number; fouls: number };
type Player = Line & { jersey: number | null; name?: string };
type Side = { players: Player[]; unattributed: Line; total: Line };
type Box = { home: Side; away: Side };

const cols: [string, (l: Line) => string][] = [
  ["PTS", (l) => String(l.points)], ["FG", (l) => `${l.fgm}/${l.fga}`], ["3P", (l) => `${l.tpm}/${l.tpa}`], ["FT", (l) => `${l.ftm}/${l.fta}`],
  ["REB", (l) => String(l.rebounds)], ["AST", (l) => String(l.assists)], ["TO", (l) => String(l.turnovers)], ["PF", (l) => String(l.fouls)],
];
const hasStats = (l: Line) => Object.values(l).some((n) => n > 0);

function SideTable({ name, side }: { name: string; side: Side }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table aria-label={`${name} box score`}>
        <caption style={{ textAlign: "left" }}>{name}</caption>
        <thead><tr><th scope="col">Player</th>{cols.map(([h]) => <th key={h} scope="col">{h}</th>)}</tr></thead>
        <tbody>
          {side.players.map((p, i) => (
            <tr key={i}><th scope="row">{p.jersey === null ? "Former player" : `#${p.jersey}`}{p.name ? ` ${p.name}` : ""}</th>{cols.map(([h, f]) => <td key={h}>{f(p)}</td>)}</tr>
          ))}
          {hasStats(side.unattributed) && <tr><th scope="row">Not credited to a player</th>{cols.map(([h, f]) => <td key={h}>{f(side.unattributed)}</td>)}</tr>}
        </tbody>
        <tfoot><tr><th scope="row">Team</th>{cols.map(([h, f]) => <td key={h}>{f(side.total)}</td>)}</tr></tfoot>
      </table>
    </div>
  );
}

/** Loads the box score only when opened. Players are shown by jersey number; names appear only for people allowed to see the roster. */
export function BoxScore({ matchId, homeName, awayName }: { matchId: string; homeName: string; awayName: string }) {
  const [box, setBox] = useState<Box | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    if (box) return;
    try { setBox(await api<Box>(`/matches/${matchId}/box-score`)); } catch (e) { setError(e instanceof ApiError ? e.message : "Could not reach the server."); }
  }
  return (
    <details onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) void load(); }}>
      <summary>Box score</summary>
      {error && <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p>}
      {!box && !error && <p>Loading…</p>}
      {box && <><SideTable name={homeName} side={box.home} /><SideTable name={awayName} side={box.away} /></>}
    </details>
  );
}
