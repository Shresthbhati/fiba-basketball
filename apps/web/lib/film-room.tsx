"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError, api } from "./api";
import { fmtTime, type Clip, type FilmGame } from "./film-types";

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
  const [tags, setTags] = useState("");
  const [note, setNote] = useState("");

  const loadGame = useCallback(async () => {
    try { setGame(await api<FilmGame>(`/film/games/${gameId}`)); }
    catch (e) { if (e instanceof ApiError && (e.status === 404 || e.status === 401)) setNotFound(true); else setError(msg(e)); }
  }, [gameId]);
  const loadClips = useCallback(async () => {
    try { setClips((await api<{ items: Clip[] }>(`/film/games/${gameId}/clips${filter ? `?tag=${encodeURIComponent(filter)}` : ""}`)).items); }
    catch (e) { if (!(e instanceof ApiError && e.status === 404)) setError(msg(e)); }
  }, [gameId, filter]);
  useEffect(() => { void loadGame(); }, [loadGame]);
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
    </div>
  );
}
