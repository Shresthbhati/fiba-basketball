"use client";

import React, { useState } from "react";
import { Badge, Button, Card } from "@courtiq/design-system";

export interface CameraFeedItem {
  id: string;
  cameraLabel: string;
  videoUrl: string;
  syncOffsetMs: number;
  resolution?: string;
  fps?: number;
  isPrimary: boolean;
}

export interface DualCameraPlayerProps {
  primaryStream: CameraFeedItem;
  secondaryStream?: CameraFeedItem;
  protocolTitle?: string;
  kinematicMetrics?: {
    releaseAngleDeg?: number;
    elbowFlareDeg?: number;
    setPoint?: string;
    bilateralContactDiffMs?: number;
    landingSymmetryIndex?: number;
    jumpHeightCm?: number;
  };
  observations?: string[];
  coachingCues?: string[];
  confidence?: number;
}

export function DualCameraPlayer({
  primaryStream,
  secondaryStream,
  protocolTitle = "Shooting Mechanics Kinematic Assessment",
  kinematicMetrics,
  observations = [
    "High release angle (51.2°) provides optimal arc trajectory over defender contest.",
    "Elbow aligned within 8.5° corridor, maintaining direct rim alignment.",
  ],
  coachingCues = [
    "Maintain consistent one-motion energy transfer from dip to release",
    "Hold follow-through wrist snap until ball reaches basket apex",
  ],
  confidence = 0.94,
}: DualCameraPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrameMs, setCurrentFrameMs] = useState(1400); // 1.4s mark
  const [layout, setLayout] = useState<"SPLIT" | "PRIMARY_ONLY" | "PIP">("SPLIT");

  const totalDurationMs = 5000;

  const handleStepFrame = (deltaFrames: number) => {
    const frameMs = 16.67; // 60 fps
    setCurrentFrameMs((ms) => Math.max(0, Math.min(totalDurationMs, ms + deltaFrames * frameMs)));
  };

  return (
    <Card className="p-6 space-y-5">
      {/* Header bar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-orange-400">
              Synchronized Multi-Angle Review (Spec §6.3, §9.2)
            </span>
            <Badge variant="success">CV_ESTIMATE {(confidence * 100).toFixed(0)}%</Badge>
            {secondaryStream && (
              <Badge variant="neutral">
                Sync Offset: {secondaryStream.syncOffsetMs > 0 ? `+${secondaryStream.syncOffsetMs}ms` : `${secondaryStream.syncOffsetMs}ms`}
              </Badge>
            )}
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight mt-1">
            {protocolTitle}
          </h2>
        </div>

        {/* View Layout Toggle */}
        {secondaryStream && (
          <div className="flex items-center gap-1 bg-neutral-900 p-1 rounded-lg border border-neutral-800">
            {(["SPLIT", "PIP", "PRIMARY_ONLY"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                  layout === mode ? "bg-orange-500 text-neutral-950" : "text-neutral-400 hover:text-white"
                }`}
                onClick={() => setLayout(mode)}
              >
                {mode === "SPLIT" ? "Dual Split" : mode === "PIP" ? "Picture-in-Picture" : "Primary Only"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Video Viewport Area */}
      <div
        className={`grid gap-4 ${
          layout === "SPLIT" && secondaryStream ? "md:grid-cols-2" : "grid-cols-1"
        }`}
      >
        {/* Primary View (Sagittal) */}
        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-center">
          <div className="absolute top-3 left-3 z-10">
            <span className="rounded bg-neutral-900/90 px-2 py-1 text-[11px] font-bold text-white border border-neutral-700 backdrop-blur-sm">
              Angle 1: {primaryStream.cameraLabel.replace(/_/g, " ")} (PRIMARY)
            </span>
          </div>

          {/* Kinematic HUD Overlay */}
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-1 items-end">
            {kinematicMetrics?.releaseAngleDeg && (
              <span className="rounded bg-emerald-950/80 px-2 py-0.5 text-xs font-bold text-emerald-400 border border-emerald-800 backdrop-blur-sm">
                Release: {kinematicMetrics.releaseAngleDeg.toFixed(1)}°
              </span>
            )}
            {kinematicMetrics?.setPoint && (
              <span className="rounded bg-sky-950/80 px-2 py-0.5 text-xs font-bold text-sky-400 border border-sky-800 backdrop-blur-sm">
                Set Point: {kinematicMetrics.setPoint.replace(/_/g, " ")}
              </span>
            )}
            {kinematicMetrics?.landingSymmetryIndex && (
              <span className="rounded bg-emerald-950/80 px-2 py-0.5 text-xs font-bold text-emerald-400 border border-emerald-800 backdrop-blur-sm">
                Symmetry: {kinematicMetrics.landingSymmetryIndex}/100
              </span>
            )}
          </div>

          <div className="text-center p-6 space-y-2">
            <div className="text-4xl">🎥</div>
            <div className="text-xs font-medium text-neutral-400">
              Primary Video Stream @ {(currentFrameMs / 1000).toFixed(2)}s
            </div>
            <div className="text-[11px] text-neutral-400">
              {primaryStream.resolution || "1080p"} • {primaryStream.fps || 60} fps
            </div>
          </div>
        </div>

        {/* Secondary View (Frontal with Sync Offset) */}
        {layout === "SPLIT" && secondaryStream && (
          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-center">
            <div className="absolute top-3 left-3 z-10">
              <span className="rounded bg-neutral-900/90 px-2 py-1 text-[11px] font-bold text-white border border-neutral-700 backdrop-blur-sm">
                Angle 2: {secondaryStream.cameraLabel.replace(/_/g, " ")}
              </span>
            </div>

            <div className="absolute top-3 right-3 z-10 flex flex-col gap-1 items-end">
              {kinematicMetrics?.elbowFlareDeg && (
                <span className="rounded bg-sky-950/80 px-2 py-0.5 text-xs font-bold text-sky-400 border border-sky-800 backdrop-blur-sm">
                  Elbow Flare: {kinematicMetrics.elbowFlareDeg.toFixed(1)}°
                </span>
              )}
              {kinematicMetrics?.bilateralContactDiffMs !== undefined && (
                <span className="rounded bg-amber-950/80 px-2 py-0.5 text-xs font-bold text-amber-400 border border-amber-800 backdrop-blur-sm">
                  Contact Delta: {kinematicMetrics.bilateralContactDiffMs}ms
                </span>
              )}
            </div>

            <div className="text-center p-6 space-y-2">
              <div className="text-4xl">📹</div>
              <div className="text-xs font-medium text-neutral-400">
                Secondary Video Stream @ {((currentFrameMs + secondaryStream.syncOffsetMs) / 1000).toFixed(2)}s
              </div>
              <div className="text-[11px] text-orange-400">
                Calibrated Sync Offset: {secondaryStream.syncOffsetMs}ms
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Synchronized Playback Controls & Timeline Scrubber */}
      <div className="space-y-3 bg-neutral-900/80 p-4 rounded-xl border border-neutral-800">
        <div className="flex items-center gap-4">
          <input
            type="range"
            min="0"
            max={totalDurationMs}
            step="16.67"
            value={currentFrameMs}
            onChange={(e) => setCurrentFrameMs(parseFloat(e.target.value))}
            className="w-full accent-orange-500 cursor-pointer h-1.5 bg-neutral-700 rounded-lg"
          />
          <span className="text-xs font-mono text-neutral-300 min-w-16 text-right">
            {(currentFrameMs / 1000).toFixed(2)}s
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleStepFrame(-1)}
            >
              ⏮ -1 Frame
            </Button>
            <Button
              variant={isPlaying ? "secondary" : "primary"}
              size="sm"
              onClick={() => setIsPlaying(!isPlaying)}
            >
              {isPlaying ? "❚❚ Pause" : "▶ Play Sync"}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleStepFrame(1)}
            >
              +1 Frame ⏭
            </Button>
          </div>

          <div className="text-xs text-neutral-400">
            Synchronous 60fps Scrubbing • Lock Step Audio Alignment
          </div>
        </div>
      </div>

      {/* Biomechanical Observations & Coaching Cues */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg bg-neutral-900/60 p-4 border border-neutral-800 space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300">
            Biomechanical Kinematic Observations
          </h3>
          <ul className="list-disc list-inside space-y-1 text-xs text-neutral-300">
            {observations.map((obs, idx) => (
              <li key={idx}>{obs}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg bg-emerald-950/30 p-4 border border-emerald-900/60 space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
            Coach Technical Cues & Drills
          </h3>
          <ul className="list-disc list-inside space-y-1 text-xs text-emerald-200">
            {coachingCues.map((cue, idx) => (
              <li key={idx}>{cue}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* ADR-0009 Disclaimer */}
      <div className="rounded-lg bg-neutral-950 p-3 border border-neutral-900 text-[11px] text-neutral-400">
        <strong className="text-neutral-300">Biomechanical Disclaimer (ADR-0009):</strong> Movement analysis metrics are non-diagnostic kinematic observations. No injury forecasting or medical evaluation is produced.
      </div>
    </Card>
  );
}
