"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { ApiError, api } from "./api";
import { SetQueue } from "./set-queue";
import { categoryLabel, type Exercise, type SessionDetail, type Suggestion } from "./train-types";

const statusText = {
  idle: "", syncing: "Saving…", offline: "Offline — sets are stored on this device and will send when you reconnect", signin: "Log in again to save your sets",
} as const;

function Stepper({ label, value, onChange, step, min = 0 }: { label: string; value: string; onChange: (v: string) => void; step: number; min?: number }) {
  const n = Number(value) || 0;
  return (
    <div style={{ display: "grid", gap: 4 }}>
      <label htmlFor={`f-${label}`}>{label}</label>
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" className="secondary" aria-label={`Decrease ${label}`} onClick={() => onChange(String(Math.max(min, +(n - step).toFixed(2))))}>−</button>
        <input id={`f-${label}`} value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" style={{ width: "100%", textAlign: "center" }} />
        <button type="button" className="secondary" aria-label={`Increase ${label}`} onClick={() => onChange(String(+(n + step).toFixed(2)))}>+</button>
      </div>
    </div>
  );
}

export function WorkoutLogger({ sessionId, queue: injected }: { sessionId: string; queue?: SetQueue }) {
  const router = useRouter();
  const queue = useMemo(() => injected ?? new SetQueue(sessionId, (path, body) => api(path, { method: "POST", body })), [sessionId, injected]);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [exerciseId, setExerciseId] = useState("");
  const [reps, setReps] = useState("8");
  const [load, setLoad] = useState("");
  const [rpe, setRpe] = useState("");
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load_ = useCallback(async () => {
    try {
      const [ex, s] = await Promise.all([api<{ items: Exercise[] }>("/exercises"), api<SessionDetail>(`/training/sessions/${sessionId}`)]);
      setExercises(ex.items);
      setSession(s);
      setExerciseId((cur) => cur || ex.items[0]?.id || "");
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 404 ? "This workout doesn't exist." : err.status === 401 ? "Log in to see your workouts." : err.message) : "Could not reach the server.");
    }
  }, [sessionId]);
  useEffect(() => { void load_(); }, [load_]);

  useEffect(() => queue.subscribe(rerender), [queue]);
  useEffect(() => {
    const sync = async () => { const before = queue.items.length; await queue.sync(); if (before > 0 && queue.items.length === 0) void load_(); };
    void sync();
    const t = setInterval(() => void sync(), 5000);
    window.addEventListener("online", sync);
    return () => { clearInterval(t); window.removeEventListener("online", sync); };
  }, [queue, load_]);

  useEffect(() => {
    if (!exerciseId) return;
    setSuggestion(null);
    api<Suggestion>(`/training/progression/${exerciseId}`).then(setSuggestion).catch(() => setSuggestion(null));
  }, [exerciseId]);

  const byId = new Map(exercises.map((e) => [e.id, e]));
  const current = byId.get(exerciseId);
  const mine = [...(session?.sets ?? []).map((s) => ({ key: s.id, id: s.id as string | null, clientId: s.clientId, exerciseId: s.exerciseId, reps: s.reps, loadKg: s.loadKg, rpe: s.rpe, waiting: false })),
    ...queue.items.map((p) => ({ key: p.clientId, id: null, clientId: p.clientId, exerciseId: p.exerciseId, reps: p.reps, loadKg: p.loadKg ?? null, rpe: p.rpe ?? null, waiting: true }))];
  const finished = session?.endedAt != null;

  function pickExercise(id: string) {
    setExerciseId(id);
    const last = [...mine].reverse().find((s) => s.exerciseId === id);
    if (last) { setReps(String(last.reps)); setLoad(last.loadKg === null ? "" : String(last.loadKg)); setRpe(last.rpe === null ? "" : String(last.rpe)); }
  }

  function addSet() {
    const r = Math.floor(Number(reps));
    if (!exerciseId || !(r >= 1)) { setError("Enter how many reps you did."); return; }
    const l = load.trim() === "" ? undefined : Number(load);
    const e = rpe.trim() === "" ? undefined : Math.floor(Number(rpe));
    if ((l !== undefined && !(l >= 0)) || (e !== undefined && !(e >= 1 && e <= 10))) { setError("Check the weight and effort (RPE must be 1–10)."); return; }
    setError(null);
    queue.add({ exerciseId, reps: r, ...(l !== undefined ? { loadKg: l } : {}), ...(e !== undefined ? { rpe: e } : {}) });
    void queue.sync().then(() => load_());
  }

  async function removeSet(row: { id: string | null; clientId: string }) {
    try {
      if (row.id) await api(`/training/sets/${row.id}`, { method: "DELETE" });
      else queue.remove(row.clientId);
      await load_();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Could not reach the server."); }
  }

  async function finish(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (queue.items.length > 0) { setError("Some sets haven't been sent yet. Reconnect, then finish."); return; }
    const v = new FormData(e.currentTarget).get("rpe");
    try {
      await api(`/training/sessions/${sessionId}/finish`, { method: "POST", body: v ? { sessionRpe: Number(v) } : {} });
      router.push("/train");
    } catch (err) { setError(err instanceof ApiError ? err.message : "Could not reach the server."); }
  }

  if (!session) return error ? <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p> : <p>Loading…</p>;

  const grouped = [...new Set(mine.map((s) => s.exerciseId))];
  return (
    <div style={{ display: "grid", gap: 14, maxWidth: 560 }}>
      <h1 style={{ marginBottom: 0 }}>{finished ? "Workout (finished)" : "Workout"}</h1>
      <div role="status" style={{ color: queue.status === "offline" ? "#ffb347" : "var(--muted)" }}>
        {statusText[queue.status]}{queue.items.length > 0 ? ` · ${queue.items.length} waiting to send` : ""}
      </div>
      {queue.rejected.length > 0 && <p role="alert" style={{ color: "#ff6b6b" }}>Some sets were not saved: {queue.rejected.join("; ")}</p>}

      {!finished && (
        <section aria-label="Log a set" style={{ background: "var(--surface)", borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
          <label>Exercise
            <select value={exerciseId} onChange={(e) => pickExercise(e.target.value)}>
              {Object.entries(categoryLabel).map(([cat, label]) => (
                <optgroup key={cat} label={label}>{exercises.filter((x) => x.category === cat).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>
              ))}
            </select>
          </label>
          {current && (
            <details>
              <summary>Cues and safety</summary>
              <p>{current.cues}</p><p>{current.safetyNotes}</p>
              {!current.reviewed && <p style={{ color: "var(--muted)" }}>Awaiting expert review — treat these notes as general guidance only.</p>}
            </details>
          )}
          {suggestion && (
            <p role="note" aria-label="Suggestion" style={{ margin: 0, color: suggestion.action === "HOLD" && suggestion.explanation.startsWith("You reported pain") ? "#ffb347" : "var(--text)" }}>
              <strong>{suggestion.action === "INCREASE" ? `Suggestion: try ${suggestion.suggestedLoadKg} kg. ` : suggestion.action === "DECREASE" ? `Suggestion: drop to ${suggestion.suggestedLoadKg} kg. ` : "Suggestion: "}</strong>
              {suggestion.explanation}
            </p>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            <Stepper label="Reps" value={reps} onChange={setReps} step={1} min={1} />
            <Stepper label="Weight (kg)" value={load} onChange={setLoad} step={2.5} />
            <Stepper label="RPE (1–10)" value={rpe} onChange={setRpe} step={1} />
          </div>
          <button type="button" style={{ minHeight: 56, fontSize: 18 }} onClick={addSet}>Add set</button>
        </section>
      )}
      {error && <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p>}

      <section aria-label="Sets logged">
        <h2>Sets logged</h2>
        {mine.length === 0 ? <p>No sets yet. Choose an exercise and add your first set.</p> : grouped.map((exId) => (
          <div key={exId}>
            <h3 style={{ marginBottom: 4 }}>{byId.get(exId)?.name ?? "Exercise"}</h3>
            <ol style={{ margin: 0 }}>
              {mine.filter((s) => s.exerciseId === exId).map((s) => (
                <li key={s.key}>
                  {s.reps} reps{s.loadKg !== null ? ` × ${s.loadKg} kg` : ""}{s.rpe !== null ? ` @ RPE ${s.rpe}` : ""}{s.waiting ? " (waiting to send)" : ""}
                  {!finished && <button type="button" className="secondary" style={{ minHeight: 32, marginLeft: 8, padding: "2px 10px" }} aria-label={`Delete set of ${s.reps} reps`} onClick={() => void removeSet(s)}>Delete</button>}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </section>

      {!finished && (
        <form onSubmit={finish} style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap" }}>
          <label>How hard was the whole workout? (RPE, optional)
            <select name="rpe" defaultValue=""><option value="">Skip</option>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}</select>
          </label>
          <button type="submit">Finish workout</button>
        </form>
      )}
    </div>
  );
}
