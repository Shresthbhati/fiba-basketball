"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, api } from "./api";
import { SCORING_TYPES, fmtTime, timelineLabel, type Clip, type FilmGame, type TeamMatch, type Timeline } from "./film-types";
import { AutoClipModal } from "./auto-clip-modal";
import { TelestratorCanvas } from "./telestrator-canvas";

const msg = (e: unknown) => (e instanceof ApiError ? e.message : "Could not reach the server.");
const TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export function FilmRoom({ gameId }: { gameId: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [game, setGame] = useState<FilmGame | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [markIn, setMarkIn] = useState<number | null>(null);
  const [markOut, setMarkOut] = useState<number | null>(null);
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [matches, setMatches] = useState<TeamMatch[]>([]);
  const [pickMatch, setPickMatch] = useState("");
  const [pickEvent, setPickEvent] = useState("");
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");
  const [showAutoClipModal, setShowAutoClipModal] = useState(false);
  const [showTelestrator, setShowTelestrator] = useState(false);

  const loadGame = useCallback(async () => {
    try { setGame(await api<FilmGame>(`/film/games/${gameId}`)); }
    catch (e) { if (e instanceof ApiError && (e.status === 404 || e.status === 401)) setNotFound(true); else setError(msg(e)); }
  }, [gameId]);
  const loadClips = useCallback(async () => {
    try { setClips((await api<{ items: Clip[] }>(`/film/games/${gameId}/clips${filter ? `?tag=${encodeURIComponent(filter)}` : ""}`)).items); }
    catch (e) { if (!(e instanceof ApiError && e.status === 404)) setError(msg(e)); }
  }, [gameId, filter]);
  const loadTimeline = useCallback(async () => {
    try { setTimeline(await api<Timeline>(`/film/games/${gameId}/timeline`)); } catch { setTimeline(null); }
  }, [gameId]);
  useEffect(() => { void loadGame(); }, [loadGame]);
  const matchKey = game ? `${game.matchId ?? ""}|${game.synced ? 1 : 0}` : null; // reload the timeline when the link or sync changes
  useEffect(() => { if (matchKey) void loadTimeline(); }, [matchKey, loadTimeline]);
  useEffect(() => {
    if (game?.canManage && !game.matchId) api<{ items: TeamMatch[] }>(`/teams/${game.teamId}/matches`).then((r) => setMatches(r?.items ?? []), () => setMatches([]));
  }, [game?.canManage, game?.matchId, game?.teamId]);
  useEffect(() => { void loadClips(); }, [loadClips]);

  async function upload(file: File) {
    setError(null);
    if (!TYPES.includes(file.type)) { setError("Choose an mp4, webm or mov video."); return; }
    setUploading(true);
    try {
      const res = await fetch(`/api/v1/film/games/${gameId}/video`, { method: "PUT", headers: { "content-type": file.type }, body: file, credentials: "same-origin" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { title?: string };
        throw new ApiError(res.status, data.title ?? "Upload failed");
      }
      await loadGame();
    } catch (e) { setError(msg(e)); } finally { setUploading(false); }
  }

  const now = () => Math.round((video.current?.currentTime ?? 0) * 1000);
  async function saveClip(e: FormEvent) {
    e.preventDefault(); setError(null);
    if (markIn === null || markOut === null) { setError("Mark where the clip starts and ends first."); return; }
    try {
      await api(`/film/games/${gameId}/clips`, {
        method: "POST",
        body: { startMs: markIn, endMs: markOut, tags: tags.split(",").map((t) => t.trim()).filter(Boolean), ...(note ? { note } : {}) },
      });
      setMarkIn(null); setMarkOut(null); setTags(""); setNote(""); await loadClips();
    } catch (err) { setError(msg(err)); }
  }
  async function removeClip(id: string) {
    try { await api(`/film/games/${gameId}/clips/${id}`, { method: "DELETE" }); await loadClips(); } catch (e) { setError(msg(e)); }
  }
  async function link(e: FormEvent) {
    e.preventDefault(); setError(null);
    try { await api(`/film/games/${gameId}/match`, { method: "PUT", body: { matchId: pickMatch } }); await loadGame(); await loadTimeline(); }
    catch (err) { setError(msg(err)); }
  }
  async function unlink() {
    setError(null);
    try { await api(`/film/games/${gameId}/match`, { method: "DELETE" }); await loadGame(); setTimeline(null); } catch (err) { setError(msg(err)); }
  }
  async function syncNow(e: FormEvent) {
    e.preventDefault(); setError(null);
    try { await api(`/film/games/${gameId}/sync`, { method: "PUT", body: { eventId: pickEvent, videoMs: now() } }); await loadGame(); await loadTimeline(); }
    catch (err) { setError(msg(err)); }
  }
  async function removeSync(eventId: string) {
    setError(null);
    try { await api(`/film/games/${gameId}/sync/${eventId}`, { method: "DELETE" }); await loadGame(); await loadTimeline(); }
    catch (err) { setError(msg(err)); }
  }
  const syncForm = (name: string, help: string) => (
    <form aria-label={name} onSubmit={syncNow} style={{ display: "grid", gap: 8 }}>
      <p>{help}</p>
      <label>Basket
        <select value={pickEvent} onChange={(e) => setPickEvent(e.target.value)} required>
          <option value="">Choose…</option>
          {timeline?.linked && timeline.items.filter((i) => SCORING_TYPES.has(i.type)).map((i) => <option key={i.id} value={i.id}>{timelineLabel(i, timeline.ours)}</option>)}
        </select>
      </label>
      <button type="submit" disabled={game?.video.status !== "READY"}>Use the current video time for this basket</button>
    </form>
  );
  function jump(ms: number) {
    const v = video.current;
    if (!v) return;
    v.currentTime = ms / 1000;
    void v.play().catch(() => undefined);
  }
  function play(c: Clip) {
    const v = video.current;
    if (!v) return;
    v.currentTime = c.startMs / 1000;
    void v.play().catch(() => undefined);
  }

  if (notFound) return <p>We could not find that game. It may not exist, or you may not be on the team. <Link href="/teams">Your teams</Link></p>;
  if (!game) return error ? <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p> : <p>Loading…</p>;
  const canManage = game.canManage === true;
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 720 }}>
      <p><Link href={`/teams/${game.teamId}`}>← Team</Link></p>
      <h1 style={{ marginBottom: 0 }}>{game.title}</h1>
      {game.opponent && <p style={{ marginTop: 0 }}>vs {game.opponent}</p>}
      {error && <p role="alert" style={{ color: "#ff6b6b" }}>{error}</p>}

      {game.video.status === "READY" ? (
        <video ref={video} controls preload="metadata" src={`/api/v1/film/games/${gameId}/video?v=${game.video.bytes}`} style={{ width: "100%", background: "#000", borderRadius: 8 }} aria-label="Game video" />
      ) : <p>No video uploaded yet.</p>}

      {canManage && (
        <label>
          {game.video.status === "READY" ? "Replace video" : "Upload video"} (mp4, webm or mov)
          <input type="file" accept="video/mp4,video/webm,video/quicktime" disabled={uploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
          {uploading && <span role="status"> Uploading… keep this page open.</span>}
        </label>
      )}

      {game.video.status === "READY" && (
        <div style={{ marginTop: 8, marginBottom: 12, display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setShowTelestrator((prev) => !prev)}
            style={{
              padding: "7px 14px",
              borderRadius: 6,
              background: showTelestrator ? "#059669" : "#1e293b",
              color: "#ffffff",
              fontSize: 13,
              fontWeight: 500,
              border: "1px solid #334155",
              cursor: "pointer",
            }}
          >
            {showTelestrator ? "✕ Close Telestrator Studio" : "🎨 Telestrator & Keyframe Studio"}
          </button>
        </div>
      )}

      {showTelestrator && (
        <div style={{ marginBottom: 16 }}>
          <TelestratorCanvas
            gameId={gameId}
            currentTimestampMs={now()}
            onSeek={(ms) => {
              if (video.current) {
                video.current.currentTime = ms / 1000;
              }
            }}
            canManage={game.canManage}
          />
        </div>
      )}

      <section aria-label="Scorebook">
        <h2>Scorebook</h2>
        {!game.matchId && !canManage && <p>This film is not linked to an official match.</p>}
        {!game.matchId && canManage && (
          matches.length === 0 ? <p>No official match of this team to link yet.</p> : (
            <form aria-label="Link a match" onSubmit={link} style={{ display: "grid", gap: 8 }}>
              <label>Official match
                <select value={pickMatch} onChange={(e) => setPickMatch(e.target.value)} required>
                  <option value="">Choose…</option>
                  {matches.map((m) => <option key={m.id} value={m.id}>{m.home} vs {m.away} · {m.competition}{m.homeScore !== null ? ` · ${m.homeScore}–${m.awayScore}` : ""}</option>)}
                </select>
              </label>
              <button type="submit">Link film to match</button>
            </form>
          )
        )}
        {timeline?.linked && (
          <>
            {canManage && <p><button type="button" className="secondary" onClick={unlink}>Unlink match</button></p>}
            {!timeline.synced && !canManage && <p>The coach has not lined this film up with the scorebook yet.</p>}
            {canManage && !timeline.synced && syncForm("Line up the video", "Pause the video at the moment one of these baskets was scored, choose it, then press the button.")}
            {timeline.untimed > 0 && <small>{timeline.untimed} scorebook event(s) have no recorded time and are not shown.</small>}
            {timeline.synced && (
              <ul aria-label="Scorebook timeline" style={{ listStyle: "none", padding: 0, display: "grid", gap: 4 }}>
                {timeline.items.filter((i) => i.videoMs !== null).map((i) => (
                  <li key={i.id}><button type="button" className="secondary" onClick={() => jump(i.videoMs!)}>{fmtTime(i.videoMs!)}</button> {timelineLabel(i, timeline.ours)}</li>
                ))}
              </ul>
            )}
            {canManage && timeline.synced && (
              <div style={{ marginTop: 12, marginBottom: 12 }}>
                <button
                  type="button"
                  onClick={() => setShowAutoClipModal(true)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    borderRadius: 6,
                    background: "#2563eb",
                    color: "#ffffff",
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  ⚡ Auto-Generate Clips & Highlight Reel
                </button>
              </div>
            )}
            {canManage && timeline.synced && (
              <>
                <ul aria-label="Sync points" style={{ listStyle: "none", padding: 0, display: "grid", gap: 4 }}>
                  {timeline.syncPoints.map((p) => {
                    const it = timeline.items.find((i) => i.id === p.eventId);
                    return (
                      <li key={p.eventId}>Video {fmtTime(p.videoMs)} = {it ? timelineLabel(it, timeline.ours) : "an event"}{" "}
                        <button type="button" className="secondary" onClick={() => removeSync(p.eventId)} aria-label={`Remove sync point at ${fmtTime(p.videoMs)}`}>Remove</button></li>
                    );
                  })}
                </ul>
                <details>
                  <summary>Add another sync point</summary>
                  {syncForm("Add a sync point", "If the video was paused or cut, line up another basket after that point. Each event uses the nearest sync point.")}
                </details>
              </>
            )}
          </>
        )}
      </section>

      <section aria-label="Clips">
        <h2>Clips</h2>
        <label>Filter by tag <input value={filter} onChange={(e) => setFilter(e.target.value)} maxLength={30} /></label>
        {clips.length === 0 && <p>{filter ? "No clips with that tag." : "No clips yet."}</p>}
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
          {clips.map((c) => (
            <li key={c.id} style={{ background: "var(--surface)", padding: 12, borderRadius: 8 }}>
              <button type="button" className="secondary" onClick={() => play(c)}>▶ {fmtTime(c.startMs)}–{fmtTime(c.endMs)}</button>{" "}
              {c.tags.map((t) => <span key={t} style={{ marginRight: 6 }}>#{t}</span>)}
              {c.note && <div>{c.note}</div>}
              {canManage && <button type="button" className="secondary" onClick={() => removeClip(c.id)} aria-label={`Delete clip ${fmtTime(c.startMs)}`}>Delete</button>}
            </li>
          ))}
        </ul>
        {canManage && game.video.status === "READY" && (
          <form aria-label="Add a clip" onSubmit={saveClip} style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button type="button" className="secondary" onClick={() => setMarkIn(now())}>Mark start</button>
              <button type="button" className="secondary" onClick={() => setMarkOut(now())}>Mark end</button>
              <span>{markIn === null ? "start not set" : `start ${fmtTime(markIn)}`} · {markOut === null ? "end not set" : `end ${fmtTime(markOut)}`}</span>
            </div>
            <label>Tags (comma separated) <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="fast break, turnover" /></label>
            <label>Note (optional) <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></label>
            <button type="submit">Save clip</button>
          </form>
        )}
      </section>

      {showAutoClipModal && (
        <AutoClipModal
          gameId={gameId}
          gameTitle={game.title}
          onClipsGenerated={loadClips}
          onClose={() => setShowAutoClipModal(false)}
        />
      )}
    </div>
  );
}
