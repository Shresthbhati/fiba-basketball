"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, api } from "./api";
import type { FilmGame, Member } from "./film-types";

const msg = (e: unknown) => (e instanceof ApiError ? e.message : "Could not reach the server.");

export function TeamDetail({ teamId }: { teamId: string }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [games, setGames] = useState<FilmGame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("PLAYER");
  const [title, setTitle] = useState("");
  const [opponent, setOpponent] = useState("");

  const load = useCallback(async () => {
    try {
      const m = await api<{ items: Member[]; canManage: boolean }>(`/teams/${teamId}/members`);
      setMembers(m.items); setCanManage(m.canManage);
      setGames((await api<{ items: FilmGame[] }>(`/teams/${teamId}/games`)).items);
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 401)) setNotFound(true); else setError(msg(e));
    }
  }, [teamId]);
  useEffect(() => { void load(); }, [load]);

  async function addMember(e: FormEvent) {
    e.preventDefault(); setError(null);
    try { await api(`/teams/${teamId}/members`, { method: "POST", body: { email, role } }); setEmail(""); await load(); } catch (err) { setError(msg(err)); }
  }
  async function removeMember(userId: string) {
    setError(null);
    try { await api(`/teams/${teamId}/members/${userId}`, { method: "DELETE" }); await load(); } catch (err) { setError(msg(err)); }
  }
  async function addGame(e: FormEvent) {
    e.preventDefault(); setError(null);
    try {
      await api(`/teams/${teamId}/games`, { method: "POST", body: { title, ...(opponent ? { opponent } : {}) } });
      setTitle(""); setOpponent(""); await load();
    } catch (err) { setError(msg(err)); }
  }

  if (notFound) return <p>We could not find that team. It may not exist, or you may not be a member. <Link href="/teams">Back to your teams</Link></p>;
  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 640 }}>
      <p><Link href="/teams">← Your teams</Link></p>
      {error && <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p>}
      <section aria-label="Games">
        <h2>Games</h2>
        {!games && !error && <p>Loading…</p>}
        {games && games.length === 0 && <p>No game film yet.{canManage ? " Add a game below, then upload its video." : ""}</p>}
        {games && games.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
            {games.map((g) => (
              <li key={g.id} style={{ background: "var(--surface)", padding: 12, borderRadius: 8 }}>
                <Link href={`/film/${g.id}`}>{g.title}</Link>
                {g.opponent ? ` · vs ${g.opponent}` : ""}{g.video.status === "READY" ? "" : " · no video yet"}
              </li>
            ))}
          </ul>
        )}
        {canManage && (
          <form aria-label="Add a game" onSubmit={addGame} style={{ display: "grid", gap: 8, marginTop: 12 }}>
            <label>Game title <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} /></label>
            <label>Opponent (optional) <input value={opponent} onChange={(e) => setOpponent(e.target.value)} maxLength={80} /></label>
            <button type="submit">Add game</button>
          </form>
        )}
      </section>
      <section aria-label="Members">
        <h2>Members</h2>
        {!members && !error && <p>Loading…</p>}
        {members && (
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 6 }}>
            {members.map((m) => (
              <li key={m.userId}>
                {m.name} · {m.role === "COACH" ? "Coach" : "Player"}
                {canManage && m.role !== "COACH" && <> <button type="button" className="secondary" onClick={() => removeMember(m.userId)} aria-label={`Remove ${m.name}`}>Remove</button></>}
              </li>
            ))}
          </ul>
        )}
        {canManage && (
          <form aria-label="Add a member" onSubmit={addMember} style={{ display: "grid", gap: 8, marginTop: 12 }}>
            <label>Email of an existing account <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <label>Role <select value={role} onChange={(e) => setRole(e.target.value)}><option value="PLAYER">Player</option><option value="COACH">Coach</option></select></label>
            <button type="submit">Add to team</button>
            <small>Players under 18 can be added only after a guardian has allowed media use.</small>
          </form>
        )}
      </section>
    </div>
  );
}
