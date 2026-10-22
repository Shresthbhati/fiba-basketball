"use client";
import { useEffect, useState } from "react";
import { ApiError, api } from "./api";
import { categoryLabel, type Exercise, type HistoryItem, type Suggestion } from "./train-types";

export function TrainHistory() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [exerciseId, setExerciseId] = useState("");
  const [history, setHistory] = useState<{ sampleSize: number; items: HistoryItem[] } | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api<{ items: Exercise[] }>("/exercises").then((r) => { setExercises(r.items); setExerciseId(r.items[0]?.id ?? ""); }).catch(() => setError("Could not load exercises.")); }, []);
  useEffect(() => {
    if (!exerciseId) return;
    setHistory(null); setSuggestion(null); setError(null);
    api<{ sampleSize: number; items: HistoryItem[] }>(`/training/history/${exerciseId}`).then(setHistory)
      .catch((e) => setError(e instanceof ApiError && e.status === 401 ? "Log in to see your progress." : "Could not load your history."));
    api<Suggestion>(`/training/progression/${exerciseId}`).then(setSuggestion).catch(() => undefined);
  }, [exerciseId]);

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 560 }}>
      <h1 style={{ marginBottom: 0 }}>Your progress</h1>
      <label>Exercise
        <select value={exerciseId} onChange={(e) => setExerciseId(e.target.value)}>
          {Object.entries(categoryLabel).map(([cat, label]) => (
            <optgroup key={cat} label={label}>{exercises.filter((x) => x.category === cat).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</optgroup>
          ))}
        </select>
      </label>
      {error && <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p>}
      {history && (
        <>
          <p role="status">Based on {history.sampleSize} {history.sampleSize === 1 ? "workout" : "workouts"}. {history.sampleSize < 3 ? "Early days — trends need more workouts to mean much." : ""}</p>
          {history.items.length === 0 ? <p>You haven't logged this exercise yet.</p> : (
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr><th style={{ textAlign: "left" }}>Date</th><th style={{ textAlign: "right" }}>Top weight (kg)</th><th style={{ textAlign: "right" }}>Reps</th><th style={{ textAlign: "right" }}>Sets</th></tr></thead>
              <tbody>{history.items.map((h) => (
                <tr key={h.sessionId}>
                  <td>{new Date(h.date).toLocaleDateString()}</td>
                  <td style={{ textAlign: "right" }}>{h.topLoadKg ?? "bodyweight"}</td>
                  <td style={{ textAlign: "right" }}>{h.repsAtTopLoad.join(", ")}</td>
                  <td style={{ textAlign: "right" }}>{h.sets}</td>
                </tr>))}</tbody>
            </table>
          )}
        </>
      )}
      {suggestion && <p role="note" aria-label="Suggestion"><strong>Suggestion: </strong>{suggestion.action === "INCREASE" ? `try ${suggestion.suggestedLoadKg} kg. ` : suggestion.action === "DECREASE" ? `drop to ${suggestion.suggestedLoadKg} kg. ` : ""}{suggestion.explanation}</p>}
    </div>
  );
}
