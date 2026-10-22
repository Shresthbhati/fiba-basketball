"use client";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, api } from "./api";
import type { Wellness } from "./train-types";

export function WellnessCard() {
  const [status, setStatus] = useState<Wellness | null>(null);
  const [open, setOpen] = useState(false);
  const [pain, setPain] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api<Wellness>("/training/wellness").then(setStatus).catch(() => undefined); }, []);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const n = (k: string) => (f.get(k) ? Number(f.get(k)) : undefined);
    setError(null);
    try {
      const s = await api<Wellness>("/training/wellness", {
        method: "POST",
        body: { painReported: pain, ...(n("fatigue") ? { fatigue: n("fatigue") } : {}), ...(n("soreness") ? { soreness: n("soreness") } : {}), ...(n("sleep") !== undefined ? { sleepHours: n("sleep") } : {}), ...(pain && f.get("note") ? { painNote: String(f.get("note")) } : {}) },
      });
      setStatus(s);
      setOpen(false);
    } catch (err) { setError(err instanceof ApiError ? err.message : "Could not reach the server."); }
  }

  return (
    <section aria-label="How are you feeling" style={{ background: "var(--surface)", borderRadius: 12, padding: 12, display: "grid", gap: 8 }}>
      <h2 style={{ margin: 0 }}>How are you feeling today?</h2>
      <p style={{ margin: 0, color: "var(--muted)" }}>Optional and private. Only you can see this.</p>
      {status?.trainingPaused && <p role="alert" style={{ margin: 0, color: "#ffb347" }}>{status.message}</p>}
      {!open && <button type="button" className="secondary" onClick={() => setOpen(true)}>{status?.latest ? "Update today's check-in" : "Check in"}</button>}
      {open && (
        <form onSubmit={save} style={{ display: "grid", gap: 10 }}>
          <label>Tiredness (1 = fresh, 5 = very tired)<select name="fatigue" defaultValue=""><option value="">Skip</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
          <label>Soreness (1 = none, 5 = very sore)<select name="soreness" defaultValue=""><option value="">Skip</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
          <label>Hours slept<input name="sleep" type="number" min={0} max={24} step={0.5} /></label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={pain} onChange={(e) => setPain(e.target.checked)} /> I have pain or something feels unstable</label>
          {pain && <label>What are you feeling? (optional)<input name="note" maxLength={500} /></label>}
          {error && <p role="alert" style={{ color: "#ff6b6b", margin: 0 }}>{error}</p>}
          <div style={{ display: "flex", gap: 8 }}><button type="submit">Save check-in</button><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      )}
    </section>
  );
}
