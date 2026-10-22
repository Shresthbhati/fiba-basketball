"use client";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "./api";
import { phaseLabel, when, type GameDetail } from "./game-types";

export function GamePanel({ id }: { id: string }) {
  const [game, setGame] = useState<GameDetail | null>(null);
  const [courtName, setCourtName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const g = await api<GameDetail>(`/pickup/${id}`);
      setGame(g);
      setError(null);
      api<{ name: string }>(`/courts/${g.courtId}`).then((c) => setCourtName(c.name)).catch(() => undefined);
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 404 ? "This game doesn't exist." : err.message) : "Could not reach the server.");
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function act(path: string, method = "POST") {
    setBusy(true);
    setError(null);
    try {
      await api(`/pickup/${id}${path}`, { method });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? (err.status === 401 ? "Log in first." : err.message) : "Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  if (!game) return error ? <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p> : <p>Loading…</p>;
  const open = game.phase === "OPEN" || game.phase === "FULL";
  const live = game.phase === "OPEN" || game.phase === "FULL" || game.phase === "IN_PROGRESS";

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 520 }}>
      <h1 style={{ marginBottom: 0 }}>{game.title}</h1>
      <div style={{ color: "var(--muted)" }}>{courtName ?? "Court"} · hosted by {game.hostName}</div>
      <div>{when(game.startsAt)} – {when(game.endsAt)}</div>
      <div role="status"><strong>{phaseLabel[game.phase]}</strong> · {game.confirmedCount}/{game.capacity} players{game.waitlistCount > 0 ? ` · ${game.waitlistCount} on waitlist` : ""} · {game.checkInCount} checked in</div>

      {game.myStatus === "CONFIRMED" && <p>You're in.</p>}
      {game.myStatus === "WAITLIST" && <p>You're on the waitlist. You'll be moved in automatically if a spot opens.</p>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {open && (game.myStatus === null || game.myStatus === "CANCELLED") && (
          <button disabled={busy} onClick={() => act("/rsvp")}>{game.phase === "FULL" ? "Join waitlist" : "Join game"}</button>
        )}
        {open && (game.myStatus === "CONFIRMED" || game.myStatus === "WAITLIST") && !game.isHost && (
          <button className="secondary" disabled={busy} onClick={() => act("/rsvp", "DELETE")}>Leave game</button>
        )}
        {live && game.myStatus === "CONFIRMED" && <button disabled={busy} onClick={() => act("/check-in")}>Check in</button>}
        {game.isHost && live && <button className="secondary" disabled={busy} onClick={() => act("/cancel")}>Cancel game</button>}
        {game.isHost && (game.phase === "IN_PROGRESS" || game.phase === "UNCONFIRMED") && (
          <button disabled={busy} onClick={() => act("/complete")}>Confirm it was played</button>
        )}
      </div>
      {error && <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p>}

      {game.participants ? (
        <section aria-label="Players">
          <h2>Players</h2>
          <ul>{game.participants.map((p, i) => <li key={i}>{p.name}{p.status === "WAITLIST" ? " (waitlist)" : ""}{p.checkedIn ? " ✓ checked in" : ""}</li>)}</ul>
        </section>
      ) : <p style={{ color: "var(--muted)" }}>Join the game to see who's playing.</p>}
    </div>
  );
}
