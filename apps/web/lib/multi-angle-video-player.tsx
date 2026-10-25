"use client";

import React, { useEffect, useRef, useState } from "react";
import { api } from "./api";

export interface FilmAngle {
  id: string;
  gameId: string;
  label: string;
  angleType: "BROADCAST" | "BASELINE" | "ENDZONE" | "TACTICAL_HIGH" | "COURT_SIDE" | string;
  isPrimary: boolean;
  timeOffsetMs: number;
  video: {
    status: "NONE" | "UPLOADING" | "READY" | "ERROR" | string;
    type: string | null;
    bytes: number | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface MultiAngleVideoPlayerProps {
  gameId: string;
  canManage?: boolean;
  onTimeUpdate?: (currentTimeSec: number) => void;
  primaryVideoUrl?: string;
  initialAngles?: FilmAngle[];
}

export function MultiAngleVideoPlayer({
  gameId,
  canManage = false,
  onTimeUpdate,
  primaryVideoUrl,
  initialAngles = [],
}: MultiAngleVideoPlayerProps) {
  const primaryVideoRef = useRef<HTMLVideoElement>(null);
  const secondaryVideoRef = useRef<HTMLVideoElement>(null);

  const [angles, setAngles] = useState<FilmAngle[]>(initialAngles);
  const [selectedAngleId, setSelectedAngleId] = useState<string | null>(null);
  const [pipAngleId, setPipAngleId] = useState<string | null>(null);
  const [layoutMode, setLayoutMode] = useState<"SINGLE" | "PIP" | "SPLIT">("SINGLE");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // New angle modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newAngleType, setNewAngleType] = useState<"BROADCAST" | "BASELINE" | "ENDZONE" | "TACTICAL_HIGH" | "COURT_SIDE">("BASELINE");
  const [newOffsetMs, setNewOffsetMs] = useState(0);
  const [uploadingAngleId, setUploadingAngleId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch angles on mount
  useEffect(() => {
    async function loadAngles() {
      try {
        const res = await api<{ items: FilmAngle[] }>(`/film/games/${gameId}/angles`);
        if (res?.items) {
          setAngles(res.items);
          if (!selectedAngleId && res.items.length > 0) {
            setSelectedAngleId(res.items[0]!.id);
          }
        }
      } catch {
        // use initial angles or fallback
      }
    }
    void loadAngles();
  }, [gameId, selectedAngleId]);

  const activeAngle = angles.find((a) => a.id === selectedAngleId) ?? angles[0] ?? null;
  const pipAngle = angles.find((a) => a.id === pipAngleId) ?? null;

  // Resolve video source for active angle
  const activeVideoSrc = activeAngle?.video.status === "READY"
    ? `/api/v1/film/games/${gameId}/angles/${activeAngle.id}/video`
    : primaryVideoUrl ?? `/api/v1/film/games/${gameId}/video`;

  // Resolve video source for secondary/PIP angle
  const pipVideoSrc = pipAngle?.video.status === "READY"
    ? `/api/v1/film/games/${gameId}/angles/${pipAngle.id}/video`
    : null;

  // Sync secondary video with primary video playback
  useEffect(() => {
    const primary = primaryVideoRef.current;
    const secondary = secondaryVideoRef.current;
    if (!primary || !secondary || !pipAngle) return;

    const offsetSec = (pipAngle.timeOffsetMs - (activeAngle?.timeOffsetMs ?? 0)) / 1000;

    const onPlay = () => {
      secondary.currentTime = Math.max(0, primary.currentTime + offsetSec);
      void secondary.play().catch(() => {});
      setIsPlaying(true);
    };

    const onPause = () => {
      secondary.pause();
      setIsPlaying(false);
    };

    const onSeeked = () => {
      secondary.currentTime = Math.max(0, primary.currentTime + offsetSec);
    };

    const onTime = () => {
      setCurrentTime(primary.currentTime);
      onTimeUpdate?.(primary.currentTime);
      // Soft sync if drifted by > 0.25 seconds
      const targetSec = Math.max(0, primary.currentTime + offsetSec);
      if (Math.abs(secondary.currentTime - targetSec) > 0.25) {
        secondary.currentTime = targetSec;
      }
    };

    primary.addEventListener("play", onPlay);
    primary.addEventListener("pause", onPause);
    primary.addEventListener("seeked", onSeeked);
    primary.addEventListener("timeupdate", onTime);

    return () => {
      primary.removeEventListener("play", onPlay);
      primary.removeEventListener("pause", onPause);
      primary.removeEventListener("seeked", onSeeked);
      primary.removeEventListener("timeupdate", onTime);
    };
  }, [pipAngle, activeAngle, onTimeUpdate]);

  async function handleAddAngle(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    setError(null);
    try {
      const created = await api<FilmAngle>(`/film/games/${gameId}/angles`, {
        method: "POST",
        body: {
          label: newLabel.trim(),
          angleType: newAngleType,
          timeOffsetMs: Number(newOffsetMs) || 0,
        },
      });
      setAngles((prev) => [...prev, created]);
      setShowAddModal(false);
      setNewLabel("");
      setNewOffsetMs(0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create angle");
    }
  }

  async function handleUploadAngleVideo(angleId: string, file: File) {
    setError(null);
    setUploadingAngleId(angleId);
    try {
      const res = await fetch(`/api/v1/film/games/${gameId}/angles/${angleId}/video`, {
        method: "PUT",
        headers: { "content-type": file.type, "content-length": String(file.size) },
        body: file,
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("Upload failed");
      // Refresh angles
      const refreshed = await api<{ items: FilmAngle[] }>(`/film/games/${gameId}/angles`);
      if (refreshed?.items) setAngles(refreshed.items);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingAngleId(null);
    }
  }

  return (
    <div
      style={{
        display: "grid",
        gap: "1rem",
        backgroundColor: "var(--bg-surface, #141418)",
        borderRadius: 8,
        border: "1px solid var(--border, #2a2a32)",
        padding: "1rem",
        color: "var(--text, #f0f0f4)",
      }}
    >
      {/* Angle Selection & Multi-View Controls Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--muted, #8a8a98)", textTransform: "uppercase" }}>
            Camera Angle:
          </span>
          {angles.map((angle) => {
            const isSelected = (activeAngle?.id === angle.id);
            return (
              <button
                key={angle.id}
                type="button"
                onClick={() => setSelectedAngleId(angle.id)}
                style={{
                  padding: "0.35rem 0.75rem",
                  borderRadius: 4,
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  border: isSelected ? "1px solid var(--accent, #f97316)" : "1px solid var(--border, #2a2a32)",
                  backgroundColor: isSelected ? "var(--accent, #f97316)" : "var(--bg-canvas, #0a0a0c)",
                  color: isSelected ? "#fff" : "var(--text, #f0f0f4)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <span>{angle.label}</span>
                {angle.timeOffsetMs !== 0 && (
                  <span style={{ fontSize: "0.65rem", opacity: 0.8 }}>
                    {angle.timeOffsetMs > 0 ? `+${angle.timeOffsetMs}ms` : `${angle.timeOffsetMs}ms`}
                  </span>
                )}
              </button>
            );
          })}

          {canManage && (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              style={{
                padding: "0.35rem 0.75rem",
                borderRadius: 4,
                fontSize: "0.8rem",
                fontWeight: 600,
                border: "1px dashed var(--accent, #f97316)",
                backgroundColor: "transparent",
                color: "var(--accent, #f97316)",
                cursor: "pointer",
              }}
            >
              + Add Camera Angle
            </button>
          )}
        </div>

        {/* View Mode Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.8rem", color: "var(--muted, #8a8a98)" }}>View:</span>
          <button
            type="button"
            onClick={() => setLayoutMode("SINGLE")}
            style={{
              padding: "0.25rem 0.6rem",
              borderRadius: 4,
              border: "1px solid var(--border, #2a2a32)",
              fontSize: "0.75rem",
              fontWeight: 600,
              backgroundColor: layoutMode === "SINGLE" ? "var(--border, #2a2a32)" : "transparent",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Single
          </button>
          <button
            type="button"
            onClick={() => {
              setLayoutMode("PIP");
              if (!pipAngleId && angles.length > 1) {
                setPipAngleId(angles.find((a) => a.id !== activeAngle?.id)?.id ?? null);
              }
            }}
            style={{
              padding: "0.25rem 0.6rem",
              borderRadius: 4,
              border: "1px solid var(--border, #2a2a32)",
              fontSize: "0.75rem",
              fontWeight: 600,
              backgroundColor: layoutMode === "PIP" ? "var(--border, #2a2a32)" : "transparent",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            PIP
          </button>
          <button
            type="button"
            onClick={() => {
              setLayoutMode("SPLIT");
              if (!pipAngleId && angles.length > 1) {
                setPipAngleId(angles.find((a) => a.id !== activeAngle?.id)?.id ?? null);
              }
            }}
            style={{
              padding: "0.25rem 0.6rem",
              borderRadius: 4,
              border: "1px solid var(--border, #2a2a32)",
              fontSize: "0.75rem",
              fontWeight: 600,
              backgroundColor: layoutMode === "SPLIT" ? "var(--border, #2a2a32)" : "transparent",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Side-by-Side
          </button>
        </div>
      </div>

      {error && (
        <div style={{ color: "#f87171", fontSize: "0.85rem", padding: "0.4rem 0.6rem", backgroundColor: "rgba(239,68,68,0.1)", borderRadius: 4 }}>
          {error}
        </div>
      )}

      {/* Video Viewport Container */}
      <div
        style={{
          position: "relative",
          width: "100%",
          backgroundColor: "#000",
          borderRadius: 8,
          overflow: "hidden",
          display: layoutMode === "SPLIT" ? "grid" : "block",
          gridTemplateColumns: layoutMode === "SPLIT" ? "1fr 1fr" : undefined,
          gap: layoutMode === "SPLIT" ? "0.5rem" : undefined,
          minHeight: 280,
        }}
      >
        {/* Primary Video */}
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
          <video
            ref={primaryVideoRef}
            src={activeVideoSrc}
            controls
            playsInline
            style={{ width: "100%", display: "block", maxHeight: 540 }}
          />
          <div
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              backgroundColor: "rgba(0,0,0,0.65)",
              padding: "0.2rem 0.5rem",
              borderRadius: 4,
              fontSize: "0.75rem",
              fontWeight: 700,
              color: "#fff",
              backdropFilter: "blur(4px)",
            }}
          >
            {activeAngle?.label ?? "Primary"}
          </div>
        </div>

        {/* Secondary / PIP Video */}
        {layoutMode !== "SINGLE" && pipAngle && (
          <div
            style={
              layoutMode === "PIP"
                ? {
                    position: "absolute",
                    bottom: 16,
                    right: 16,
                    width: "28%",
                    minWidth: 160,
                    maxWidth: 240,
                    borderRadius: 6,
                    overflow: "hidden",
                    border: "2px solid var(--accent, #f97316)",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.8)",
                    backgroundColor: "#000",
                    zIndex: 10,
                  }
                : {
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    backgroundColor: "#000",
                  }
            }
          >
            {pipVideoSrc ? (
              <video
                ref={secondaryVideoRef}
                src={pipVideoSrc}
                muted
                playsInline
                style={{ width: "100%", display: "block" }}
              />
            ) : (
              <div style={{ padding: "1rem", textAlign: "center", fontSize: "0.75rem", color: "var(--muted, #8a8a98)" }}>
                No video uploaded for {pipAngle.label}
              </div>
            )}
            <div
              style={{
                position: "absolute",
                top: 4,
                left: 4,
                backgroundColor: "rgba(0,0,0,0.7)",
                padding: "0.15rem 0.4rem",
                borderRadius: 3,
                fontSize: "0.65rem",
                fontWeight: 700,
                color: "#fff",
              }}
            >
              {pipAngle.label}
            </div>
          </div>
        )}
      </div>

      {/* Angle Upload & Management Bar for Coaches */}
      {canManage && activeAngle && activeAngle.video.status === "NONE" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.75rem 1rem",
            backgroundColor: "rgba(249, 115, 22, 0.08)",
            border: "1px solid rgba(249, 115, 22, 0.25)",
            borderRadius: 6,
            fontSize: "0.85rem",
          }}
        >
          <span>Upload video for <strong>{activeAngle.label}</strong>:</span>
          <input
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            disabled={uploadingAngleId === activeAngle.id}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleUploadAngleVideo(activeAngle.id, file);
            }}
            style={{ fontSize: "0.8rem" }}
          />
        </div>
      )}

      {/* Add Camera Angle Modal */}
      {showAddModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.75)",
            display: "grid",
            placeItems: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
        >
          <div
            style={{
              backgroundColor: "var(--bg-surface, #141418)",
              border: "1px solid var(--border, #2a2a32)",
              borderRadius: 8,
              padding: "1.5rem",
              width: "100%",
              maxWidth: 420,
              display: "grid",
              gap: "1rem",
            }}
          >
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>
              Add Multi-Angle Camera Stream
            </h3>

            <form onSubmit={handleAddAngle} style={{ display: "grid", gap: "0.85rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", color: "var(--muted, #8a8a98)", marginBottom: "0.25rem" }}>
                  Camera Label
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tactical Baseline (Left Court)"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    borderRadius: 4,
                    border: "1px solid var(--border, #2a2a32)",
                    backgroundColor: "var(--bg-canvas, #0a0a0c)",
                    color: "#fff",
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", color: "var(--muted, #8a8a98)", marginBottom: "0.25rem" }}>
                  Angle Type
                </label>
                <select
                  value={newAngleType}
                  onChange={(e) => setNewAngleType(e.target.value as any)}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    borderRadius: 4,
                    border: "1px solid var(--border, #2a2a32)",
                    backgroundColor: "var(--bg-canvas, #0a0a0c)",
                    color: "#fff",
                  }}
                >
                  <option value="BROADCAST">Broadcast Wide</option>
                  <option value="BASELINE">Tactical Baseline</option>
                  <option value="ENDZONE">High End-Zone</option>
                  <option value="TACTICAL_HIGH">Tactical High / All-22</option>
                  <option value="COURT_SIDE">Courtside Close</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", color: "var(--muted, #8a8a98)", marginBottom: "0.25rem" }}>
                  Sync Time Offset (Milliseconds relative to primary)
                </label>
                <input
                  type="number"
                  step="50"
                  value={newOffsetMs}
                  onChange={(e) => setNewOffsetMs(Number(e.target.value))}
                  style={{
                    width: "100%",
                    padding: "0.5rem",
                    borderRadius: 4,
                    border: "1px solid var(--border, #2a2a32)",
                    backgroundColor: "var(--bg-canvas, #0a0a0c)",
                    color: "#fff",
                  }}
                />
                <span style={{ fontSize: "0.7rem", color: "var(--muted, #8a8a98)" }}>
                  Positive means secondary camera started after the primary stream.
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{
                    padding: "0.45rem 0.85rem",
                    borderRadius: 4,
                    border: "1px solid var(--border, #2a2a32)",
                    backgroundColor: "transparent",
                    color: "var(--text, #f0f0f4)",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: "0.45rem 0.85rem",
                    borderRadius: 4,
                    border: "none",
                    backgroundColor: "var(--accent, #f97316)",
                    color: "#fff",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Save Angle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
