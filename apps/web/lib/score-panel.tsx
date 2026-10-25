"use client";
import { useEffect, useMemo, useReducer, useState } from "react";
import { ApiError, api } from "./api";
import { GameClock, formatClock, parseClock } from "./game-clock";
import { COURT_SIZE, Lineup } from "./lineup";
import { ScoreQueue, type Side } from "./score-queue";

const label: Record<string, string> = {
  idle: "All changes saved", syncing: "Saving…", offline: "Offline — events are stored on this device and will send when you reconnect",
  conflict: "Another scorer changed this game", error: "Could not save — retrying",
};

export type RosterRow = { userId: string; name: string; jersey: number };
export type MatchRosters = { home: RosterRow[]; away: RosterRow[] };
/** Events that can be credited to a player (the server refuses a player on any other event). */
const PLAYER_EVENTS = new Set(["FREE_THROW", "FIELD_GOAL", "THREE_POINT", "FIELD_GOAL_MISSED", "THREE_POINT_MISSED", "FREE_THROW_MISSED", "REBOUND", "ASSIST", "TURNOVER", "PLAYER_FOUL"]);

/** Cosmetic match details. Scoring never depends on them; without them the panel says Home/Away. */
export type MatchInfo = { homeName: string; awayName: string; competitionName?: string; scheduledAt?: string | null };

export function ScorePanel({ queue, onFinalize, info, rosters }: { queue: ScoreQueue; onFinalize?: () => Promise<void>; info?: MatchInfo | null; rosters?: MatchRosters | null }) {
  const homeName = info?.homeName || "Home";
  const awayName = info?.awayName || "Away";
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [period, setPeriod] = useState(queue.serverState.period);
  const [msg, setMsg] = useState<string | null>(null);
  // The player each side's next events are credited to. Stays selected until changed, so a run of baskets is one tap each.
  const [chosen, setChosen] = useState<{ home: string | null; away: string | null }>({ home: null, away: null });

  // The game clock is the scorer's own: started and stopped by hand, and stamped on every event they enter.
  const clock = useMemo(() => new GameClock(`ciq.clock.${queue.id}`), [queue]);
  const [clockText, setClockText] = useState("");
  useEffect(() => clock.subscribe(rerender), [clock]);
  // Who is on court per side, and the bench player the scorer has picked to come on (waiting for who leaves).
  const lineup = useMemo(() => new Lineup(`ciq.lineup.${queue.id}`), [queue]);
  const [comingOn, setComingOn] = useState<{ home: string | null; away: string | null }>({ home: null, away: null });
  useEffect(() => lineup.subscribe(rerender), [lineup]);
  useEffect(() => {
    if (clock.period !== period) setPeriod(clock.period); // a reload restores the period the clock was on
    const t = setInterval(() => { clock.tick(); if (clock.running) rerender(); }, 250);
    return () => clearInterval(t);
  }, [clock]);
  useEffect(() => queue.subscribe(rerender), [queue]);
  useEffect(() => {
    void queue.sync();
    const t = setInterval(() => void queue.sync(), 5000);
    const on = () => void queue.sync();
    window.addEventListener("online", on);
    window.addEventListener("ciq:sync", on);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", on);
      window.removeEventListener("ciq:sync", on);
    };
  }, [queue]);

  const add = (type: string, side?: Side) => {
    const playerId = side && PLAYER_EVENTS.has(type) ? chosen[side] : null;
    queue.add(type, { ...(side ? { side } : {}), period, clockSeconds: clock.seconds, ...(playerId ? { playerId } : {}) });
    void queue.sync();
  };
  const { home, away } = queue.score;

  const putOnCourt = (side: Side, playerId: string) => {
    const wasWaiting = comingOn[side];
    if (lineup.onCourt(side).length < COURT_SIZE && !wasWaiting) {
      const e = queue.add("SUBSTITUTION", { side, period, clockSeconds: clock.seconds, playerId });
      if (!lineup.addStarter({ eventId: e.id, side, inId: playerId })) queue.undoLast(period);
    } else setComingOn((c) => ({ ...c, [side]: playerId }));
    void queue.sync();
  };
  const swapOut = (side: Side, outId: string) => {
    const inId = comingOn[side];
    if (!inId) return;
    const e = queue.add("SUBSTITUTION", { side, period, clockSeconds: clock.seconds, playerId: inId, playerOutId: outId });
    if (!lineup.substitute({ eventId: e.id, side, inId, outId })) queue.undoLast(period);
    setComingOn((c) => ({ ...c, [side]: null }));
    void queue.sync();
  };

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
      <details>
        <summary>More stats</summary>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 8 }}>
          {([["FREE_THROW_MISSED", "Miss FT"], ["FIELD_GOAL_MISSED", "Miss 2"], ["THREE_POINT_MISSED", "Miss 3"], ["REBOUND", "Rebound"], ["ASSIST", "Assist"], ["TURNOVER", "Turnover"]] as const).map(([t, l]) => (
            <button key={t} className="secondary" style={{ minHeight: 48 }} onClick={() => add(t, side)} aria-label={`${name} ${l}`}>{l}</button>
          ))}
        </div>
      </details>
      {(rosters?.[side].length ?? 0) > 0 && (
        <div role="group" aria-label={`${name} player`} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <button type="button" className={chosen[side] === null ? "" : "secondary"} aria-pressed={chosen[side] === null}
            onClick={() => setChosen((c) => ({ ...c, [side]: null }))}>No player</button>
          {rosters![side].map((p) => (
            <button key={p.userId} type="button" className={chosen[side] === p.userId ? "" : "secondary"} aria-pressed={chosen[side] === p.userId}
              aria-label={`#${p.jersey} ${p.name}`} onClick={() => setChosen((c) => ({ ...c, [side]: p.userId }))}>#{p.jersey}</button>
          ))}
        </div>
      )}
      {(rosters?.[side].length ?? 0) > 0 && (() => {
        const roster = rosters![side];
        const on = lineup.onCourt(side);
        const waiting = comingOn[side];
        const tag = (p: RosterRow) => `#${p.jersey} ${p.name}`;
        return (
          <details>
            <summary>On court ({on.length}/{COURT_SIZE})</summary>
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              <p style={{ margin: 0, color: "var(--muted)" }}>
                {waiting ? `Who does #${roster.find((p) => p.userId === waiting)?.jersey} replace? Tap a player on court.`
                  : on.length < COURT_SIZE ? "Tap the players who start. After that, tap a bench player to bring them on." : "Tap a bench player to bring them on."}
              </p>
              <div role="group" aria-label={`${name} on court`} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {roster.filter((p) => on.includes(p.userId)).map((p) => (
                  <button key={p.userId} type="button" disabled={!waiting} onClick={() => swapOut(side, p.userId)} aria-label={`Take off ${tag(p)}`}>#{p.jersey}</button>
                ))}
                {on.length === 0 && <span style={{ color: "var(--muted)" }}>Nobody marked on court yet.</span>}
              </div>
              <div role="group" aria-label={`${name} bench`} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {roster.filter((p) => !on.includes(p.userId)).map((p) => (
                  <button key={p.userId} type="button" className={waiting === p.userId ? "" : "secondary"} aria-pressed={waiting === p.userId}
                    onClick={() => putOnCourt(side, p.userId)} aria-label={`Bring on ${tag(p)}`}>#{p.jersey}</button>
                ))}
              </div>
              {waiting && <button type="button" className="secondary" onClick={() => setComingOn((c) => ({ ...c, [side]: null }))}>Cancel substitution</button>}
            </div>
          </details>
        );
      })()}
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
        <select value={period} onChange={(e) => { const p = Number(e.target.value); setPeriod(p); clock.startPeriod(p); }}>
          {[1, 2, 3, 4, 5, 6, 7].map((p) => <option key={p} value={p}>{p <= 4 ? `Q${p}` : `OT${p - 4}`}</option>)}
        </select>
        <button className="secondary" onClick={() => { clock.startPeriod(period); clock.start(); add("PERIOD_START"); }}>Start period</button>
        <button className="secondary" onClick={() => { clock.stop(); add("PERIOD_END"); }}
          title="Stops the clock and records how much time was left. Minutes played use this when a period ends early.">End period</button>
      </label>

      <section aria-label="Game clock" style={{ background: "var(--surface)", borderRadius: 12, padding: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div role="timer" aria-label="Game clock" style={{ fontSize: 40, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatClock(clock.seconds)}</div>
        <button onClick={() => (clock.running ? clock.stop() : clock.start())} disabled={!clock.running && clock.seconds === 0} style={{ minHeight: 48 }}>
          {clock.running ? "Stop clock" : "Start clock"}
        </button>
        <form style={{ display: "flex", gap: 6, alignItems: "center" }} onSubmit={(e) => {
          e.preventDefault();
          const v = parseClock(clockText);
          if (v === null) { setMsg("Enter the time as minutes:seconds, for example 7:30."); return; }
          setMsg(null); clock.set(v); setClockText("");
        }}>
          <label>Set clock <input value={clockText} onChange={(e) => setClockText(e.target.value)} placeholder="7:30" size={5} inputMode="numeric" /></label>
          <button type="submit" className="secondary">Set</button>
        </form>
        <label>Period length
          <select value={clock.lengthSeconds} onChange={(e) => clock.setLength(Number(e.target.value))}>
            {[300, 480, 600, 720].map((s) => <option key={s} value={s}>{s / 60} min</option>)}
          </select>
        </label>
      </section>

      {team("home", homeName)}
      {team("away", awayName)}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="secondary" onClick={() => { const c = queue.undoLast(period); if (c?.correctsEventId) lineup.undo(c.correctsEventId); if (c) void queue.sync(); }} disabled={queue.pendingCount === 0}>Undo last</button>
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

/** The rosters the scorer can pick players from. Cached so a reload offline still has them; null if unavailable (scoring then works without players). */
export async function loadRosters(matchId: string): Promise<MatchRosters | null> {
  const cacheKey = `courtiq.rosters.${matchId}`;
  try {
    const r = await api<MatchRosters>(`/matches/${matchId}/rosters`);
    try { localStorage.setItem(cacheKey, JSON.stringify(r)); } catch { /* storage unavailable */ }
    return r;
  } catch {
    try {
      const raw = localStorage.getItem(cacheKey);
      return raw ? (JSON.parse(raw) as MatchRosters) : null;
    } catch { return null; }
  }
}

export const finalizeMatch = (matchId: string) => api(`/matches/${matchId}/finalize`, { method: "POST" }).then(() => undefined);
