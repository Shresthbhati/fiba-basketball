"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, api } from "./api";
import { formatLabel, stateLabel, statusLabel, type CompetitionDetail, type MatchRow, type StandingRow } from "./competition-types";

const roundName = (round: number, last: number, knockout: boolean) =>
  !knockout ? `Round ${round}` : round === last ? "Final" : round === last - 1 ? "Semi-finals" : `Round ${round}`;

export function CompetitionPanel({ id }: { id: string }) {
  const [comp, setComp] = useState<CompetitionDetail | null>(null);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [table, setTable] = useState<StandingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const c = await api<CompetitionDetail>(`/competitions/${id}`);
      setComp(c);
      if (c.status !== "DRAFT") {
        setMatches((await api<{ items: MatchRow[] }>(`/competitions/${id}/matches`)).items);
        if (c.format === "ROUND_ROBIN") setTable((await api<{ items: StandingRow[] }>(`/competitions/${id}/standings`)).items);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 404 ? "This competition doesn't exist or isn't published yet." : err.message) : "Could not reach the server.");
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function run(fn: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setError(null);
    setNote(null);
    try { await fn(); if (done) setNote(done); await load(); }
    catch (err) { setError(err instanceof ApiError ? (err.status === 401 ? "Log in first." : err.message) : "Could not reach the server."); }
    finally { setBusy(false); }
  }

  const addTeam = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const name = String(new FormData(form).get("team") ?? "").trim();
    if (!name) return;
    void run(async () => {
      const team = await api<{ id: string }>("/teams", { method: "POST", body: { name } });
      await api(`/competitions/${id}/teams`, { method: "POST", body: { teamId: team.id, seed: (comp?.teams.length ?? 0) + 1 } });
      form.reset();
    });
  };
  const addOfficial = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const email = String(new FormData(form).get("email") ?? "").trim();
    void run(async () => { await api(`/competitions/${id}/officials`, { method: "POST", body: { email, role: "SCOREKEEPER" } }); form.reset(); }, `${email} can now score games.`);
  };

  if (!comp) return error ? <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p> : <p>Loading…</p>;
  const names = new Map(comp.teams.map((t) => [t.id, t.name]));
  const team = (tid: string | null) => (tid ? names.get(tid) ?? "?" : "TBD");
  const knockout = comp.format === "SINGLE_ELIMINATION";
  const lastRound = Math.max(0, ...matches.map((m) => m.round));
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);

  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 640 }}>
      <div>
        <h1 style={{ marginBottom: 0 }}>{comp.name}</h1>
        <div style={{ color: "var(--muted)" }}>{formatLabel[comp.format]} · {statusLabel[comp.status]}</div>
      </div>
      {error && <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p>}
      {note && <p role="status">{note}</p>}

      <section aria-label="Teams">
        <h2>Teams ({comp.teams.length})</h2>
        {comp.teams.length === 0 ? <p>No teams yet.</p> : <ol>{comp.teams.map((t) => <li key={t.id}>{t.name}</li>)}</ol>}
        {comp.canManage && comp.status === "DRAFT" && (
          <form onSubmit={addTeam} style={{ display: "flex", gap: 8 }}>
            <input name="team" placeholder="Team name" required maxLength={80} aria-label="Team name" style={{ flex: 1 }} />
            <button type="submit" disabled={busy}>Add team</button>
          </form>
        )}
      </section>

      {comp.canManage && comp.status === "DRAFT" && (
        <section aria-label="Schedule">
          <h2>Schedule</h2>
          <p>{comp.teams.length < 2 ? "Add at least 2 teams to create the schedule." : knockout ? "Teams are seeded in the order added. Top seeds get byes if the count isn't a power of two." : "Every team plays every other team once."}</p>
          <button disabled={busy || comp.teams.length < 2} onClick={() => void run(() => api(`/competitions/${id}/schedule`, { method: "POST" }), "Schedule created and the competition is now visible to everyone.")}>
            Create schedule and publish
          </button>
        </section>
      )}

      {comp.canManage && comp.status !== "DRAFT" && (
        <section aria-label="Scorekeepers">
          <h2>Scorekeepers</h2>
          <p>Give someone who has a COURT IQ account permission to score this competition's games.</p>
          <form onSubmit={addOfficial} style={{ display: "flex", gap: 8 }}>
            <input name="email" type="email" placeholder="their@email.com" required aria-label="Scorekeeper email" style={{ flex: 1 }} />
            <button type="submit" disabled={busy}>Add</button>
          </form>
        </section>
      )}

      {rounds.map((r) => (
        <section key={r} aria-label={roundName(r, lastRound, knockout)}>
          <h2>{roundName(r, lastRound, knockout)}</h2>
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
            {matches.filter((m) => m.round === r).map((m) => (
              <li key={m.id} style={{ background: "var(--surface)", padding: 12, borderRadius: 8 }}>
                {m.isBye ? (
                  <span>{team(m.homeTeamId ?? m.awayTeamId)} — bye</span>
                ) : (
                  <>
                    <strong>{team(m.homeTeamId)}</strong> {m.homeScore ?? "–"} : {m.awayScore ?? "–"} <strong>{team(m.awayTeamId)}</strong>
                    <div style={{ color: "var(--muted)" }}>{stateLabel[m.state]}</div>
                    {comp.canManage && m.state !== "LOCKED" && m.homeTeamId && m.awayTeamId && <Link href={`/score/${m.id}`}>{m.state === "FINISHED" ? "Reopen scorer" : "Open scorer"}</Link>}
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {table.length > 0 && (
        <section aria-label="Standings">
          <h2>Standings</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr>{["#", "Team", "P", "W", "L", "PF", "PA", "Pts"].map((h) => <th key={h} style={{ textAlign: h === "Team" ? "left" : "right", padding: 6 }}>{h}</th>)}</tr></thead>
              <tbody>
                {table.map((r) => (
                  <tr key={r.name}>
                    <td style={{ textAlign: "right", padding: 6 }}>{r.rank}</td><td style={{ padding: 6 }}>{r.name}</td>
                    {[r.played, r.wins, r.losses, r.pointsFor, r.pointsAgainst, r.points].map((v, i) => <td key={i} style={{ textAlign: "right", padding: 6 }}>{v}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <small style={{ color: "var(--muted)" }}>Win = 2 points, loss = 1, forfeit loss = 0.</small>
        </section>
      )}
    </div>
  );
}
