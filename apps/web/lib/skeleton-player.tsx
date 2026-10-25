"use client";

import React, { useState, useEffect } from "react";

export interface PoseLandmark {
  id: number;
  name: string;
  x: number; // 0 to 1 normalized
  y: number; // 0 to 1 normalized
  visibility?: number;
}

export interface KinematicFrame {
  frameNumber: number;
  timestampMs: number;
  phase: "STANDING" | "ECCENTRIC" | "INFLECTION" | "CONCENTRIC" | "TAKEOFF" | "FLIGHT" | "LANDING";
  kneeAngleLeftDeg: number;
  kneeAngleRightDeg: number;
  hipAngleDeg: number;
  trunkLeanDeg: number;
  landmarks: PoseLandmark[];
}

export interface SkeletonPlayerProps {
  protocol: "BODYWEIGHT_SQUAT" | "COUNTERMOVEMENT_JUMP" | "SHOOTING_MECHANICS" | "LANDING_STABILITY";
  frames?: KinematicFrame[];
  videoSrc?: string;
  onFrameChange?: (frame: KinematicFrame) => void;
}

// MediaPipe 33 Landmark Skeleton Segments
export const SKELETON_CONNECTIONS: Array<[number, number]> = [
  // Head
  [0, 2], [0, 5],
  // Shoulders & Chest
  [11, 12],
  // Left Arm
  [11, 13], [13, 15],
  // Right Arm
  [12, 14], [14, 16],
  // Torso
  [11, 23], [12, 24], [23, 24],
  // Left Leg
  [23, 25], [25, 27], [27, 29], [29, 31],
  // Right Leg
  [24, 26], [26, 28], [28, 30], [30, 32],
];

// Generates a deterministic sequence of 30 frames for testing / preview
export function generateSampleFrames(protocol: "BODYWEIGHT_SQUAT" | "COUNTERMOVEMENT_JUMP" | "SHOOTING_MECHANICS" | "LANDING_STABILITY"): KinematicFrame[] {
  const frames: KinematicFrame[] = [];
  const totalFrames = 30;

  for (let i = 0; i < totalFrames; i++) {
    const progress = i / (totalFrames - 1);
    // Sine wave motion down and up
    const depthCurve = Math.sin(progress * Math.PI); // 0 at start, 1 at middle, 0 at end

    const kneeAngle = protocol === "BODYWEIGHT_SQUAT"
      ? 165 - depthCurve * 83 // 165 deg standing -> 82 deg max depth
      : 165 - depthCurve * 65; // CMJ dip
    const hipAngle = 170 - depthCurve * 75;
    const trunkLean = 10 + depthCurve * 22;

    const hipY = 0.52 + depthCurve * 0.16;
    const kneeY = 0.68 + depthCurve * 0.06;
    const ankleY = 0.88;

    const phase =
      progress < 0.15 ? "STANDING" :
      progress < 0.45 ? "ECCENTRIC" :
      progress < 0.55 ? "INFLECTION" :
      progress < 0.85 ? "CONCENTRIC" : "STANDING";

    const landmarks: PoseLandmark[] = [
      { id: 0, name: "nose", x: 0.5, y: 0.18 - depthCurve * 0.05 },
      { id: 2, name: "left_eye", x: 0.48, y: 0.16 - depthCurve * 0.05 },
      { id: 5, name: "right_eye", x: 0.52, y: 0.16 - depthCurve * 0.05 },
      { id: 11, name: "left_shoulder", x: 0.42, y: 0.32 + depthCurve * 0.08 },
      { id: 12, name: "right_shoulder", x: 0.58, y: 0.32 + depthCurve * 0.08 },
      { id: 13, name: "left_elbow", x: 0.38, y: 0.45 + depthCurve * 0.08 },
      { id: 14, name: "right_elbow", x: 0.62, y: 0.45 + depthCurve * 0.08 },
      { id: 15, name: "left_wrist", x: 0.44, y: 0.54 + depthCurve * 0.06 },
      { id: 16, name: "right_wrist", x: 0.56, y: 0.54 + depthCurve * 0.06 },
      { id: 23, name: "left_hip", x: 0.44, y: hipY },
      { id: 24, name: "right_hip", x: 0.56, y: hipY },
      { id: 25, name: "left_knee", x: 0.40 - depthCurve * 0.02, y: kneeY },
      { id: 26, name: "right_knee", x: 0.60 + depthCurve * 0.02, y: kneeY },
      { id: 27, name: "left_ankle", x: 0.42, y: ankleY },
      { id: 28, name: "right_ankle", x: 0.58, y: ankleY },
      { id: 29, name: "left_heel", x: 0.42, y: ankleY + 0.02 },
      { id: 30, name: "right_heel", x: 0.58, y: ankleY + 0.02 },
      { id: 31, name: "left_foot_index", x: 0.39, y: ankleY + 0.03 },
      { id: 32, name: "right_foot_index", x: 0.61, y: ankleY + 0.03 },
    ];

    frames.push({
      frameNumber: i + 1,
      timestampMs: Math.round(i * 66.6), // ~15 fps
      phase,
      kneeAngleLeftDeg: Math.round(kneeAngle * 10) / 10,
      kneeAngleRightDeg: Math.round((kneeAngle + 0.8) * 10) / 10,
      hipAngleDeg: Math.round(hipAngle * 10) / 10,
      trunkLeanDeg: Math.round(trunkLean * 10) / 10,
      landmarks,
    });
  }

  return frames;
}

export const SkeletonPlayer: React.FC<SkeletonPlayerProps> = ({
  protocol,
  frames = generateSampleFrames(protocol),
  videoSrc,
  onFrameChange,
}) => {
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const activeFrame = frames[currentFrameIdx] || frames[0]!;

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentFrameIdx((prev) => {
        const next = (prev + 1) % frames.length;
        if (onFrameChange && frames[next]) onFrameChange(frames[next]!);
        return next;
      });
    }, 120);
    return () => clearInterval(interval);
  }, [isPlaying, frames, onFrameChange]);

  const handleStep = (direction: -1 | 1) => {
    setIsPlaying(false);
    const next = Math.max(0, Math.min(frames.length - 1, currentFrameIdx + direction));
    setCurrentFrameIdx(next);
    if (onFrameChange && frames[next]) onFrameChange(frames[next]!);
  };

  const handleJumpKeyframe = (targetPhase: KinematicFrame["phase"]) => {
    setIsPlaying(false);
    const idx = frames.findIndex((f) => f.phase === targetPhase);
    if (idx !== -1) {
      setCurrentFrameIdx(idx);
      if (onFrameChange && frames[idx]) onFrameChange(frames[idx]!);
    }
  };

  // Landmark lookup map
  const landmarkMap = new Map(activeFrame.landmarks.map((l) => [l.id, l]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Visual Canvas Viewport */}
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "4/3",
          background: "#090d16",
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid #1e293b",
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.2)",
        }}
      >
        {videoSrc && (
          <video
            src={videoSrc}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.6 }}
          />
        )}

        {/* SVG Skeleton Layer */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
        >
          {/* Skeleton Bones / Connections */}
          {SKELETON_CONNECTIONS.map(([id1, id2], i) => {
            const p1 = landmarkMap.get(id1);
            const p2 = landmarkMap.get(id2);
            if (!p1 || !p2) return null;
            return (
              <line
                key={`bone-${i}`}
                x1={p1.x * 100}
                y1={p1.y * 100}
                x2={p2.x * 100}
                y2={p2.y * 100}
                stroke="#38bdf8"
                strokeWidth="1.2"
                strokeLinecap="round"
                opacity="0.85"
              />
            );
          })}

          {/* Skeleton Joints */}
          {activeFrame.landmarks.map((l) => (
            <circle
              key={l.id}
              cx={l.x * 100}
              cy={l.y * 100}
              r="1.4"
              fill={l.id === 25 || l.id === 26 ? "#f59e0b" : "#ffffff"}
              stroke="#0284c7"
              strokeWidth="0.6"
            />
          ))}
        </svg>

        {/* Real-time Kinematic Metric HUD */}
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            background: "rgba(15, 23, 42, 0.8)",
            backdropFilter: "blur(4px)",
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid rgba(255, 255, 255, 0.15)",
            color: "#ffffff",
            fontSize: 12,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ color: "#94a3b8" }}>Phase:</span>
            <span style={{ fontWeight: 700, color: "#38bdf8" }}>{activeFrame.phase}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ color: "#94a3b8" }}>Knee Flexion:</span>
            <span style={{ fontWeight: 700, color: "#f59e0b" }}>{activeFrame.kneeAngleLeftDeg}°</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
            <span style={{ color: "#94a3b8" }}>Trunk Lean:</span>
            <span style={{ fontWeight: 600 }}>{activeFrame.trunkLeanDeg}°</span>
          </div>
        </div>

        {/* Frame Timestamp Counter */}
        <div
          style={{
            position: "absolute",
            bottom: 12,
            right: 12,
            background: "rgba(15, 23, 42, 0.8)",
            padding: "4px 8px",
            borderRadius: 6,
            color: "#94a3b8",
            fontSize: 11,
            fontFamily: "monospace",
          }}
        >
          Frame {activeFrame.frameNumber} / {frames.length} ({activeFrame.timestampMs}ms)
        </div>
      </div>

      {/* Playback Controls & Frame Stepper */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
          padding: 12,
          background: "var(--cq-card-bg, #ffffff)",
          border: "1px solid var(--cq-border, #e5e7eb)",
          borderRadius: 8,
        }}
      >
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button
            type="button"
            aria-label="Previous frame"
            onClick={() => handleStep(-1)}
            disabled={currentFrameIdx === 0}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              cursor: currentFrameIdx === 0 ? "not-allowed" : "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            ◀ -1 Frame
          </button>

          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            style={{
              padding: "6px 16px",
              borderRadius: 6,
              border: "none",
              background: "#1e3a8a",
              color: "#ffffff",
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            {isPlaying ? "⏸ Pause" : "▶ Play"}
          </button>

          <button
            type="button"
            aria-label="Next frame"
            onClick={() => handleStep(1)}
            disabled={currentFrameIdx >= frames.length - 1}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              cursor: currentFrameIdx >= frames.length - 1 ? "not-allowed" : "pointer",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            +1 Frame ▶
          </button>
        </div>

        {/* Jump to Critical Biomechanical Positions */}
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={() => handleJumpKeyframe("STANDING")}
            style={{
              padding: "4px 8px",
              borderRadius: 4,
              border: "1px solid #e5e7eb",
              background: "#f9fafb",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Standing
          </button>
          <button
            type="button"
            onClick={() => handleJumpKeyframe("INFLECTION")}
            style={{
              padding: "4px 8px",
              borderRadius: 4,
              border: "1px solid #fde68a",
              background: "#fffbeb",
              color: "#92400e",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Peak Flexion / Depth
          </button>
        </div>
      </div>

      {/* Neutral Body-Map Indicators (ADR-0009 Compliant) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 12,
        }}
      >
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            background: "#f8fafc",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
            Left / Right Knee Angle
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginTop: 2 }}>
            {activeFrame.kneeAngleLeftDeg}° / {activeFrame.kneeAngleRightDeg}°
          </div>
          <span style={{ fontSize: 11, color: "#475569" }}>
            {activeFrame.kneeAngleLeftDeg <= 90 ? "Parallel or below reached" : "Ascent / Extension phase"}
          </span>
        </div>

        <div
          style={{
            padding: 12,
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            background: "#f8fafc",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
            Trunk Lean Angle
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a", marginTop: 2 }}>
            {activeFrame.trunkLeanDeg}°
          </div>
          <span style={{ fontSize: 11, color: "#475569" }}>
            Angle relative to vertical axis
          </span>
        </div>

        <div
          style={{
            padding: 12,
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            background: "#f8fafc",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
            Kinematic Phase
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0284c7", marginTop: 2 }}>
            {activeFrame.phase}
          </div>
          <span style={{ fontSize: 11, color: "#475569" }}>
            Deterministic phase state machine
          </span>
        </div>
      </div>
    </div>
  );
};
