"use client";
import { useEffect, useReducer, useState } from "react";
import { ApiError, api } from "./api";
import { ScoreQueue, type Side } from "./score-queue";

const label: Record<string, string> = {
  idle: "All changes saved", syncing: "Saving…", offline: "Offline — events are stored on this device and will send when you reconnect",
  conflict: "Another scorer changed this game", error: "Could not save — retrying",
};

/** Cosmetic match details. Scoring never depends on them; without them the panel says Home/Away. */
export type MatchInfo = { homeName: string; awayName: string; competitionName?: string; scheduledAt?: string | null };

export function ScorePanel({ queue, onFinalize, info }: { queue: ScoreQueue; onFinalize?: () => Promise<void>; info?: MatchInfo | null }) {
  const homeName = info?.homeName || "Home";
  const awayName = info?.awayName || "Away";
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [period, setPeriod] = useState(queue.serverState.period);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => queue.subscribe(rerender), [queue]);
  useEffect(() => {
    void queue.sync();
    const t = setInterval(() => void queue.sync(), 5000);
    const on = () => void queue.sync();
    window.addEventListener("online", on);
    return () => { clearInterval(t); window.removeEventListener("online", on); };
  }, [queue]);

  const add = (type: string, side?: Side) => {
    queue.add(type, side ? { side, period } : { period });
    void queue.sync();
  };
  const { home, away } = queue.score;

  const team = (side: Side, name: string) => (
    <section aria-label={name} style={{ background: "var(--surface)", borderRadius: 12, padding: 12, display: "grid", gap: 8 }}>
      <h2 style={{ margin: 0 }}>{name}</h2>
      <div aria-live="polite" style={{ fontSize: 56, fontWeight: 700 }}>{side === "home" ? home : away}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {([["FREE_THROW", "+1"], ["FIELD_GOAL", "+2"], ["THREE_POINT", "+3"]] as const).map(([t, l]) => (
          <button key={t} style={{ minHeight: 64, fontSize: 24 }} onClick={() => add(t, side)} aria-label={`${name} ${l} points`}>{l}</button>
        ))}
        <button className="secondary" style={{ minHeight: 56 }} onClick={() => add("PLAYER_FOUL", side)}>Foul</button>
        <button className="secondary" style={{ minHeight: 56 }} onClick={() => add("TIMEOUT", side)}>Timeout</button>
      </div>
    </section>
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {info && (
        <div aria-label="Match details" style={{ color: "var(--muted)" }}>
          {info.competitionName && <div>{info.competitionName}</div>}
          {info.scheduledAt && <div>Scheduled for {new Date(info.scheduledAt).toLocaleString()}</div>}
        </div>
      )}
      <div role="status" style={{ color: queue.status === "offline" || queue.status === "error" ? "#ffb347" : "var(--muted)" }}>
        {label[queue.status]}{queue.pendingCount > 0 ? ` · ${queue.pendingCount} waiting to send` : ""}
      </div>

      {queue.status === "conflict" && queue.conflict && (
        <div role="alertdialog" aria-label="Scoring conflict" style={{ border: "2px solid #ffb347", borderRadius: 12, padding: 12, display: "grid", gap: 8 }}>
          <strong>Another scorer entered {queue.conflict.newerEvents.length} event(s) while you were away.</strong>
          <div>Official score now: {queue.conflict.state.homeScore} – {queue.conflict.state.awayScore}. You have {queue.pendingCount} unsent event(s).</div>
          <button onClick={() => void queue.acceptConflictAndResend()}>Keep mine and add them on top</button>
          <button className="secondary" onClick={() => queue.discardPendingAndReset()}>Discard mine and use the official score</button>
        </div>
      )}

      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        Period
        <select value={period} onChange={(e) => setPeriod(Number(e.target.value))}>
          {[1, 2, 3, 4, 5, 6, 7].map((p) => <option key={p} value={p}>{p <= 4 ? `Q${p}` : `OT${p - 4}`}</option>)}
        </select>
        <button className="secondary" onClick={() => add("PERIOD_START")}>Start period</button>
      </label>

      {team("home", homeName)}
      {team("away", awayName)}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="secondary" onClick={() => queue.undoLast(period) && void queue.sync()} disabled={queue.pendingCount === 0}>Undo last</button>
        {onFinalize && (
          <button
            disabled={queue.pendingCount > 0 || queue.status === "conflict"}
            title={queue.pendingCount > 0 ? "Send all events first" : undefined}
            onClick={async () => {
              if (!window.confirm(`Finish the game at ${home} – ${away}? This becomes the official result.`)) return;
              try { await onFinalize(); setMsg("Game finalized."); }
              catch (e) { setMsg(e instanceof ApiError ? e.message : "Could not finalize. Are you online?"); }
            }}
          >Finish game</button>
        )}
      </div>
      {msg && <p role="status">{msg}</p>}
    </div>
  );
}

type MatchDetailResponse = {
  competitionName: string; scheduledAt: string | null; home: { name: string } | null; away: { name: string } | null;
};

/** Fetches team names etc. Returns null on any failure (offline included): the names are cosmetic. */
export async function loadMatchInfo(matchId: string): Promise<MatchInfo | null> {
  const cacheKey = `courtiq.matchinfo.${matchId}`;
  try {
    const m = await api<MatchDetailResponse>(`/matches/${matchId}`);
    const info: MatchInfo = {
      homeName: m.home?.name ?? "Home", awayName: m.away?.name ?? "Away", competitionName: m.competitionName, scheduledAt: m.scheduledAt,
    };
    try { localStorage.setItem(cacheKey, JSON.stringify(info)); } catch { /* storage unavailable */ }
    return info;
  } catch {
    try {
      const raw = localStorage.getItem(cacheKey);
      return raw ? (JSON.parse(raw) as MatchInfo) : null;
    } catch { return null; }
  }
}

export const finalizeMatch = (matchId: string) => api(`/matches/${matchId}/finalize`, { method: "POST" }).then(() => undefined);
