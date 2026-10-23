"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, api } from "./api";

type Line = { points: number; fgm: number; fga: number; tpm: number; tpa: number; ftm: number; fta: number; rebounds: number; assists: number; turnovers: number; fouls: number };
type Career = {
  games: number; totals: Line; perGame: { points: number; rebounds: number; assists: number; turnovers: number; fouls: number } | null;
  competitions: { name: string; games: number; totals: Line; recent: { matchId: string; opponent: string; scheduledAt: string | null; line: Line }[] }[];
};
const shooting = (l: Line) => `${l.fgm}/${l.fga} FG · ${l.tpm}/${l.tpa} 3P · ${l.ftm}/${l.fta} FT`;

/** The signed-in player's own record. Nothing here can be shared or seen by anyone else. */
export function CareerPanel() {
  const [career, setCareer] = useState<Career | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Career>("/me/career").then(setCareer).catch((e) => {
      if (e instanceof ApiError && e.status === 401) setNeedsLogin(true); else setError(e instanceof ApiError ? e.message : "Could not reach the server.");
    });
  }, []);

  if (needsLogin) return <p><Link href="/login">Log in</Link> to see your record.</p>;
  if (error) return <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p>;
  if (!career) return <p>Loading…</p>;
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 640 }}>
      <p style={{ color: "var(--muted)" }}>Only you can see this. It is built from official results where the scorekeeper credited events to you, and it ignores anything that was corrected.</p>
      {career.games === 0 ? (
        <p>No official games yet. Once a competition game you played in is finished, it shows up here.</p>
      ) : (
        <>
          <section aria-label="Career totals">
            <h2>Career</h2>
            <p><strong>Games played</strong> {career.games}</p>
            <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 4 }}>
              <li>Points {career.totals.points} · {career.perGame!.points} per game</li>
              <li>Rebounds {career.totals.rebounds} · {career.perGame!.rebounds} per game</li>
              <li>Assists {career.totals.assists} · {career.perGame!.assists} per game</li>
              <li>Turnovers {career.totals.turnovers} · Fouls {career.totals.fouls}</li>
              <li>{shooting(career.totals)}</li>
            </ul>
          </section>
          {career.competitions.map((c) => (
            <section key={c.name} aria-label={c.name}>
              <h2>{c.name}</h2>
              <p>{c.games} {c.games === 1 ? "game" : "games"} · {c.totals.points} points · {shooting(c.totals)}</p>
              <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 4 }}>
                {c.recent.map((r) => (
                  <li key={r.matchId} style={{ background: "var(--surface)", padding: 8, borderRadius: 8 }}>
                    vs {r.opponent || "opponent"}{r.scheduledAt ? ` · ${new Date(r.scheduledAt).toLocaleDateString()}` : ""} — {r.line.points} pts, {r.line.rebounds} reb, {r.line.assists} ast
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
