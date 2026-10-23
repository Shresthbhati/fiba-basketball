"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, api } from "./api";
import type { TeamSummary } from "./film-types";

const msg = (e: unknown) => (e instanceof ApiError ? e.message : "Could not reach the server.");

export function TeamsPanel() {
  const [teams, setTeams] = useState<TeamSummary[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  const load = () => api<{ items: TeamSummary[] }>("/me/teams").then((r) => setTeams(r.items)).catch((e) => {
    if (e instanceof ApiError && e.status === 401) setNeedsLogin(true); else setError(msg(e));
  });
  useEffect(() => { void load(); }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try { await api("/teams", { method: "POST", body: { name } }); setName(""); await load(); } catch (err) { setError(msg(err)); }
  }

  if (needsLogin) return <p><Link href="/login">Log in</Link> or <Link href="/signup">sign up</Link> to see your teams. Team film is private to team members.</p>;
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 560 }}>
      {error && <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p>}
      <section aria-label="Your teams">
        <h2>Your teams</h2>
        {!teams && !error && <p>Loading…</p>}
        {teams && teams.length === 0 && <p>You are not on a team yet. Create one, or ask a coach to add you.</p>}
        {teams && teams.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
            {teams.map((t) => <li key={t.id} style={{ background: "var(--surface)", padding: 12, borderRadius: 8 }}><Link href={`/teams/${t.id}`}>{t.name}</Link></li>)}
          </ul>
        )}
      </section>
      <form aria-label="Create a team" onSubmit={create} style={{ display: "grid", gap: 8 }}>
        <label>Team name <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} /></label>
        <button type="submit">Create team</button>
      </form>
    </div>
  );
}
