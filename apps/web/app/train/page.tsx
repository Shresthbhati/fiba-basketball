"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, api } from "../../lib/api";
import type { SessionSummary } from "../../lib/train-types";
import { WellnessCard } from "../../lib/wellness-card";

export default function Train() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    api<{ items: SessionSummary[] }>("/training/sessions").then((r) => setSessions(r.items)).catch((e) => {
      if (e instanceof ApiError && e.status === 401) setNeedsLogin(true);
      else setError(e instanceof ApiError ? e.message : "Could not reach the server.");
    });
  }, []);

  async function start() {
    try { router.push(`/train/${(await api<{ id: string }>("/training/sessions", { method: "POST", body: {} })).id}`); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not reach the server."); }
  }

  if (needsLogin) return <main><h1>Train</h1><p><Link href="/login">Log in</Link> or <Link href="/signup">sign up</Link> to log workouts. Your training data is private to you.</p></main>;
  return (
    <main style={{ display: "grid", gap: 16, maxWidth: 560 }}>
      <h1 style={{ marginBottom: 0 }}>Train</h1>
      <WellnessCard />
      <button type="button" style={{ minHeight: 56, fontSize: 18 }} onClick={start}>Start a workout</button>
      <p>
        <Link href="/train/history">See your progress</Link>
        {" · "}
        <Link href="/train/assessments">Player Lab Assessments</Link>
        {" · "}
        <Link href="/train/testing">Combine & Athletic Testing</Link>
        {" · "}
        <Link href="/train/programs">Periodized Programs</Link>
        {" · "}
        <Link href="/train/devices">Wearables & Sensors</Link>
      </p>
      {error && <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p>}
      <section aria-label="Recent workouts">
        <h2>Recent workouts</h2>
        {!sessions && !error && <p>Loading…</p>}
        {sessions && sessions.length === 0 && <p>No workouts yet.</p>}
        {sessions && sessions.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
            {sessions.map((s) => (
              <li key={s.id} style={{ background: "var(--surface)", padding: 12, borderRadius: 8 }}>
                <Link href={`/train/${s.id}`}>{new Date(s.startedAt).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</Link>
                {" · "}{s.setCount} {s.setCount === 1 ? "set" : "sets"}{s.endedAt ? "" : " · in progress"}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
