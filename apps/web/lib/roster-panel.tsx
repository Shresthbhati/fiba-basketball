"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ApiError, api } from "./api";

type Roster = {
  items: { userId: string; name: string; jersey: number }[]; canEdit: boolean; max: number;
  candidates: { userId: string; name: string }[];
};
const msg = (e: unknown) => (e instanceof ApiError ? e.message : "Could not reach the server.");

export function RosterPanel({ competitionId, teamId }: { competitionId: string; teamId: string }) {
  const base = `/competitions/${competitionId}/teams/${teamId}/roster`;
  const [roster, setRoster] = useState<Roster | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "hidden">("loading");
  const [error, setError] = useState<string | null>(null);
  const [who, setWho] = useState("");
  const [jersey, setJersey] = useState("");

  const load = useCallback(async () => {
    try { setRoster(await api<Roster>(base)); setState("ok"); }
    catch (e) { if (e instanceof ApiError && (e.status === 404 || e.status === 401)) setState("hidden"); else { setError(msg(e)); setState("ok"); } }
  }, [base]);
  useEffect(() => { void load(); }, [load]);

  async function add(e: FormEvent) {
    e.preventDefault(); setError(null);
    try { await api(`${base}/${who}`, { method: "PUT", body: { jersey: Number(jersey) } }); setWho(""); setJersey(""); await load(); }
    catch (err) { setError(msg(err)); }
  }
  async function remove(userId: string) {
    setError(null);
    try { await api(`${base}/${userId}`, { method: "DELETE" }); await load(); } catch (err) { setError(msg(err)); }
  }

  if (state === "hidden") return <p>We could not find that roster. It is only visible to the team and the organizer. <Link href={`/competitions/${competitionId}`}>Back to the competition</Link></p>;
  if (state === "loading") return <p>Loading…</p>;
  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 520 }}>
      <p><Link href={`/competitions/${competitionId}`}>← Competition</Link></p>
      {error && <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p>}
      {roster && (
        <>
          <p>{roster.items.length} of {roster.max} players{roster.canEdit ? "" : " · roster is closed"}</p>
          {roster.items.length === 0 && <p>No players on the roster yet.</p>}
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 6 }}>
            {roster.items.map((p) => (
              <li key={p.userId} style={{ background: "var(--surface)", padding: 10, borderRadius: 8 }}>
                <strong>#{p.jersey}</strong> {p.name}
                {roster.canEdit && <> <button type="button" className="secondary" aria-label={`Remove ${p.name}`} onClick={() => remove(p.userId)}>Remove</button></>}
              </li>
            ))}
          </ul>
          {roster.canEdit && (
            <form aria-label="Add a player" onSubmit={add} style={{ display: "grid", gap: 8 }}>
              <label>Player
                <select value={who} onChange={(e) => setWho(e.target.value)} required>
                  <option value="">Choose…</option>
                  {roster.candidates.map((c) => <option key={c.userId} value={c.userId}>{c.name}</option>)}
                </select>
              </label>
              <label>Jersey number <input type="number" min={0} max={99} value={jersey} onChange={(e) => setJersey(e.target.value)} required /></label>
              <button type="submit">Add to roster</button>
              <small>Only adult team members can be added. Under-18 players can't be on competition rosters yet. Rosters are only visible to the team and the organizer.</small>
            </form>
          )}
        </>
      )}
    </div>
  );
}
