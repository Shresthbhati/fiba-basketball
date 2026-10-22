"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { ApiError, api } from "../../../lib/api";
import type { Game } from "../../../lib/game-types";

function NewGame() {
  const router = useRouter();
  const params = useSearchParams();
  const courtId = params.get("courtId");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!courtId) return <p>Pick a court first: <a href="/courts">find a court</a>.</p>;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const g = await api<Game>("/pickup", {
        method: "POST",
        body: {
          courtId, title: f.get("title"), capacity: Number(f.get("capacity")),
          startsAt: new Date(String(f.get("startsAt"))).toISOString(), endsAt: new Date(String(f.get("endsAt"))).toISOString(),
          ...(f.get("skillBand") ? { skillBand: f.get("skillBand") } : {}),
        },
      });
      router.push(`/pickup/${g.id}`);
    } catch (err) {
      setError(err instanceof ApiError
        ? err.status === 401 ? "Log in to host a game." : err.message
        : "Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12, maxWidth: 420 }}>
      <h1>Host a game</h1>
      <p>At {params.get("court") ?? "the selected court"}</p>
      <label>Title<input name="title" required maxLength={100} defaultValue="Pickup run" /></label>
      <label>Starts<input name="startsAt" type="datetime-local" required /></label>
      <label>Ends<input name="endsAt" type="datetime-local" required /></label>
      <label>Players (including you)<input name="capacity" type="number" min={2} max={30} defaultValue={10} required /></label>
      <label>Level (optional)
        <select name="skillBand" defaultValue=""><option value="">Any</option><option value="CASUAL">Casual</option><option value="INTERMEDIATE">Intermediate</option><option value="COMPETITIVE">Competitive</option></select>
      </label>
      {error && <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p>}
      <button type="submit" disabled={busy}>{busy ? "Creating…" : "Create game"}</button>
    </form>
  );
}

export default function Page() {
  return <main><Suspense><NewGame /></Suspense></main>;
}
