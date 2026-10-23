"use client";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "./api";

type Series = { id: string; title: string; weekday: number; startTime: string; durationMin: number; timezone: string };
const DAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

/** The signed-in host's repeating games, with a way to stop each one. Renders nothing for visitors or hosts with none. */
export function MySeries() {
  const [items, setItems] = useState<Series[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api<{ items: Series[] }>("/pickup/series/mine").then((r) => setItems(r.items)).catch(() => setItems([])), []);
  useEffect(() => { void load(); }, [load]);

  async function stop(s: Series) {
    setError(null);
    try { await api(`/pickup/series/${s.id}/cancel`, { method: "POST" }); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not reach the server."); }
  }
  if (items.length === 0 && !error) return null;
  return (
    <section aria-label="Your weekly games" style={{ margin: "16px 0", maxWidth: 520 }}>
      <h2>Your weekly games</h2>
      {error && <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p>}
      <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
        {items.map((s) => (
          <li key={s.id} style={{ background: "var(--surface)", padding: 12, borderRadius: 8 }}>
            <strong>{s.title}</strong> · {DAYS[s.weekday]} at {s.startTime} ({s.timezone}), {s.durationMin} min{" "}
            <button type="button" className="secondary" aria-label={`Stop ${s.title}`} onClick={() => stop(s)}>Stop repeating</button>
            <div style={{ color: "var(--muted)" }}>Stopping cancels upcoming games in this series. Games already played stay.</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
