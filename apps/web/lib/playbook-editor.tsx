"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  CourtRenderer,
  TokenOverlay,
  type TacticalPlay,
  type TacticalKeyframe,
  type TacticalToken,
  type TacticalAction,
  type ActionPathType,
  type CourtPoint,
} from "@courtiq/court-renderer";
import { interpolateKeyframes } from "./play-animator";

export interface PlaybookEditorProps {
  initialPlay?: TacticalPlay;
  onSave?: (play: TacticalPlay) => Promise<void> | void;
  readOnly?: boolean;
}

export const DEFAULT_HORNS_PLAY: TacticalPlay = {
  id: "preset-horns-pick-and-pop",
  title: "Horns Pick & Pop",
  description: "Standard horns entry into high ball screen with stretch 4 popping to 3-point line.",
  category: "offense",
  courtMode: "half",
  tags: ["horns", "pick-and-pop", "3-pointer"],
  version: 1,
  keyframes: [
    {
      step: 1,
      description: "Initial Horns Setup: 1 at top, 4 & 5 at elbows, 2 & 3 spaced in corners.",
      tokens: [
        { id: "o1", type: "offense", label: "1", x: 7.0, y: 0.0 },
        { id: "o2", type: "offense", label: "2", x: 13.0, y: -6.5 },
        { id: "o3", type: "offense", label: "3", x: 13.0, y: 6.5 },
        { id: "o4", type: "offense", label: "4", x: 8.5, y: -2.5 },
        { id: "o5", type: "offense", label: "5", x: 8.5, y: 2.5 },
        { id: "d1", type: "defense", label: "x1", x: 8.0, y: 0.0 },
        { id: "d4", type: "defense", label: "x4", x: 9.0, y: -2.5 },
        { id: "ball", type: "ball", label: "ball", x: 7.0, y: 0.0 },
      ],
      actions: [
        { id: "a1", type: "screen", from: { x: 8.5, y: -2.5 }, to: { x: 8.0, y: 0.0 }, label: "Ball Screen" },
      ],
    },
    {
      step: 2,
      description: "Ball Screen & Pop: 4 sets screen; 1 drives off screen; 4 pops out beyond 3PT arc.",
      tokens: [
        { id: "o1", type: "offense", label: "1", x: 8.5, y: 1.5 },
        { id: "o2", type: "offense", label: "2", x: 13.0, y: -6.5 },
        { id: "o3", type: "offense", label: "3", x: 13.0, y: 6.5 },
        { id: "o4", type: "offense", label: "4", x: 5.5, y: -3.5 },
        { id: "o5", type: "offense", label: "5", x: 10.5, y: 1.0 },
        { id: "d1", type: "defense", label: "x1", x: 9.0, y: 1.0 },
        { id: "d4", type: "defense", label: "x4", x: 8.0, y: -1.0 },
        { id: "ball", type: "ball", label: "ball", x: 8.5, y: 1.5 },
      ],
      actions: [
        { id: "a2", type: "pass", from: { x: 8.5, y: 1.5 }, to: { x: 5.5, y: -3.5 }, label: "Pop Pass" },
        { id: "a3", type: "cut", from: { x: 8.5, y: 2.5 }, to: { x: 10.5, y: 1.0 }, label: "Roll to Rim" },
      ],
    },
    {
      step: 3,
      description: "Catch & Shoot: 4 receives pass for open 3PT attempt; 5 establishes rebounding position.",
      tokens: [
        { id: "o1", type: "offense", label: "1", x: 9.0, y: 2.0 },
        { id: "o2", type: "offense", label: "2", x: 13.0, y: -6.5 },
        { id: "o3", type: "offense", label: "3", x: 13.0, y: 6.5 },
        { id: "o4", type: "offense", label: "4", x: 5.5, y: -3.5 },
        { id: "o5", type: "offense", label: "5", x: 12.0, y: 0.5 },
        { id: "d1", type: "defense", label: "x1", x: 9.0, y: 1.0 },
        { id: "d4", type: "defense", label: "x4", x: 6.5, y: -3.0 },
        { id: "ball", type: "ball", label: "ball", x: 5.5, y: -3.5 },
      ],
      actions: [],
    },
  ],
};

type EditorTool = "select" | "token" | "action";

export const PlaybookEditor: React.FC<PlaybookEditorProps> = ({
  initialPlay = DEFAULT_HORNS_PLAY,
  onSave,
  readOnly = false,
}) => {
  const [play, setPlay] = useState<TacticalPlay>(initialPlay);
  const [activeStepIdx, setActiveStepIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [animProgress, setAnimProgress] = useState<number>(0);
  const [playSpeed, setPlaySpeed] = useState<number>(1.0);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);

  // Active Tool state
  const [tool, setTool] = useState<EditorTool>("select");
  const [selectedTokenType, setSelectedTokenType] = useState<"offense" | "defense" | "ball">("offense");
  const [selectedTokenLabel, setSelectedTokenLabel] = useState<string>("1");
  const [selectedActionType, setSelectedActionType] = useState<ActionPathType>("cut");
  const [actionStartPoint, setActionStartPoint] = useState<CourtPoint | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number | null>(null);

  const currentKeyframe = play.keyframes[activeStepIdx] || play.keyframes[0]!;

  // Handle deterministic animation
  useEffect(() => {
    if (!isPlaying) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }

    const totalSteps = play.keyframes.length;
    if (totalSteps <= 1) {
      setIsPlaying(false);
      return;
    }

    const maxProgress = totalSteps - 1;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      setAnimProgress((prev) => {
        // Base speed: 1.5 seconds per step
        const stepRate = (1 / 1.5) * playSpeed;
        const next = prev + dt * stepRate;
        if (next >= maxProgress) {
          setIsPlaying(false);
          return maxProgress;
        }
        return next;
      });

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying, play.keyframes.length, playSpeed]);

  // Derived display frame (either interpolated during playback or static keyframe)
  const displayFrame = isPlaying
    ? interpolateKeyframes(play.keyframes, animProgress)
    : {
        currentStep: currentKeyframe.step,
        tokens: currentKeyframe.tokens,
        actions: currentKeyframe.actions,
        description: currentKeyframe.description,
      };

  const viewport = {
    width: play.courtMode === "half" ? 700 : 900,
    height: 500,
    padding: 24,
    mode: play.courtMode,
    orientation: "horizontal" as const,
  };

  // Court Click handler for editing
  const handleCourtClick = useCallback(
    (coords: CourtPoint) => {
      if (readOnly || isPlaying) return;

      if (tool === "token") {
        // Place a new token
        const newToken: TacticalToken = {
          id: `tok-${Date.now()}`,
          type: selectedTokenType,
          label: selectedTokenType === "ball" ? "ball" : selectedTokenLabel,
          x: coords.x,
          y: coords.y,
        };

        const updatedKeyframes = [...play.keyframes];
        const curKf = { ...updatedKeyframes[activeStepIdx]! };
        curKf.tokens = [...curKf.tokens, newToken];
        updatedKeyframes[activeStepIdx] = curKf;

        setPlay({ ...play, keyframes: updatedKeyframes });
        setSelectedTokenId(newToken.id);
        setTool("select");
      } else if (tool === "action") {
        if (!actionStartPoint) {
          setActionStartPoint(coords);
        } else {
          // Complete path
          const newAction: TacticalAction = {
            id: `act-${Date.now()}`,
            type: selectedActionType,
            from: actionStartPoint,
            to: coords,
          };

          const updatedKeyframes = [...play.keyframes];
          const curKf = { ...updatedKeyframes[activeStepIdx]! };
          curKf.actions = [...curKf.actions, newAction];
          updatedKeyframes[activeStepIdx] = curKf;

          setPlay({ ...play, keyframes: updatedKeyframes });
          setActionStartPoint(null);
          setTool("select");
        }
      } else if (tool === "select" && selectedTokenId) {
        // Move selected token to clicked location
        const updatedKeyframes = [...play.keyframes];
        const curKf = { ...updatedKeyframes[activeStepIdx]! };
        curKf.tokens = curKf.tokens.map((t) =>
          t.id === selectedTokenId ? { ...t, x: coords.x, y: coords.y } : t
        );
        updatedKeyframes[activeStepIdx] = curKf;
        setPlay({ ...play, keyframes: updatedKeyframes });
      }
    },
    [
      readOnly,
      isPlaying,
      tool,
      selectedTokenType,
      selectedTokenLabel,
      selectedActionType,
      actionStartPoint,
      selectedTokenId,
      play,
      activeStepIdx,
    ]
  );

  // Keyframe management
  const addKeyframe = () => {
    const newStepNum = play.keyframes.length + 1;
    const lastKf = play.keyframes[play.keyframes.length - 1]!;
    const newKf: TacticalKeyframe = {
      step: newStepNum,
      description: `Step ${newStepNum} continuation`,
      tokens: lastKf.tokens.map((t) => ({ ...t })),
      actions: [],
    };
    const updated = [...play.keyframes, newKf];
    setPlay({ ...play, keyframes: updated });
    setActiveStepIdx(updated.length - 1);
  };

  const deleteKeyframe = (idx: number) => {
    if (play.keyframes.length <= 1) return;
    const updated = play.keyframes.filter((_, i) => i !== idx).map((kf, i) => ({ ...kf, step: i + 1 }));
    setPlay({ ...play, keyframes: updated });
    setActiveStepIdx(Math.max(0, idx - 1));
  };

  // Export functions
  const exportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(play, null, 2));
    const dlAnchor = document.createElement("a");
    dlAnchor.setAttribute("href", dataStr);
    dlAnchor.setAttribute("download", `${play.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`);
    dlAnchor.click();
  };

  const exportSvg = () => {
    if (!containerRef.current) return;
    const svgEl = containerRef.current.querySelector("svg");
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const dlAnchor = document.createElement("a");
    dlAnchor.setAttribute("href", url);
    dlAnchor.setAttribute("download", `${play.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.svg`);
    dlAnchor.click();
  };

  return (
    <div
      ref={containerRef}
      className="playbook-editor"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: 20,
        backgroundColor: "#0d0e12",
        borderRadius: 12,
        color: "#f8fafc",
        border: "1px solid #1f2937",
      }}
    >
      {/* Top Header Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 700 }}>{play.title}</h2>
            <span
              style={{
                fontSize: "0.75rem",
                textTransform: "uppercase",
                padding: "2px 8px",
                borderRadius: 4,
                backgroundColor: "#374151",
                color: "#e5e7eb",
                fontWeight: 600,
              }}
            >
              {play.category}
            </span>
            <span style={{ fontSize: "0.8rem", color: "#9ca3af" }}>v{play.version}</span>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "#9ca3af" }}>{play.description}</p>
        </div>

        {/* Export & Save controls */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="secondary"
            onClick={exportJson}
            style={{ fontSize: "0.85rem", padding: "6px 12px" }}
          >
            Export JSON
          </button>
          <button
            type="button"
            className="secondary"
            onClick={exportSvg}
            style={{ fontSize: "0.85rem", padding: "6px 12px" }}
          >
            Export SVG
          </button>
          {onSave && !readOnly && (
            <button
              type="button"
              className="primary"
              onClick={() => onSave(play)}
              style={{ fontSize: "0.85rem", padding: "6px 14px" }}
            >
              Save Play
            </button>
          )}
        </div>
      </div>

      {/* Mandatory ADR-0007 Simulation Disclaimer Banner */}
      <div
        data-testid="adr-0007-banner"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 14px",
          borderRadius: 6,
          backgroundColor: "#1e1e24",
          borderLeft: "4px solid #f97316",
          fontSize: "0.82rem",
          color: "#cbd5e1",
        }}
      >
        <strong style={{ color: "#f97316" }}>ADR-0007 Level 1:</strong>
        <span>Diagrammatic illustration — not a predictive outcome.</span>
      </div>

      {/* Interactive Court Stage */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#08090b",
          padding: 12,
          borderRadius: 8,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <CourtRenderer
          mode={play.courtMode}
          width={viewport.width}
          height={viewport.height}
          padding={viewport.padding}
          interactive={!readOnly && !isPlaying}
          onCourtClick={handleCourtClick}
        >
          <TokenOverlay
            tokens={displayFrame.tokens}
            actions={displayFrame.actions}
            viewport={viewport}
            selectedTokenId={selectedTokenId}
            onSelectToken={(token) => {
              if (!readOnly && !isPlaying) {
                setSelectedTokenId(token.id);
                setTool("select");
              }
            }}
            interactive={!readOnly && !isPlaying}
          />
        </CourtRenderer>

        {/* Temporary Action Drag / Click Anchor */}
        {actionStartPoint && (
          <div
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              backgroundColor: "rgba(0,0,0,0.75)",
              padding: "4px 10px",
              borderRadius: 4,
              fontSize: "0.75rem",
              color: "#facc15",
            }}
          >
            Click target point to complete {selectedActionType} path...
          </div>
        )}
      </div>

      {/* Step Description Display */}
      <div
        style={{
          padding: "8px 12px",
          backgroundColor: "#161822",
          borderRadius: 6,
          fontSize: "0.9rem",
          color: "#e2e8f0",
        }}
      >
        <strong>Step {displayFrame.currentStep}:</strong> {displayFrame.description}
      </div>

      {/* Animation Playback Bar */}
      <div
        data-testid="playback-controls"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: 10,
          backgroundColor: "#14151b",
          borderRadius: 8,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          aria-label={isPlaying ? "Pause" : "Play"}
          className={isPlaying ? "secondary" : "primary"}
          onClick={() => {
            if (animProgress >= play.keyframes.length - 1) {
              setAnimProgress(0);
            }
            setIsPlaying(!isPlaying);
          }}
          style={{ minWidth: 70 }}
        >
          {isPlaying ? "Pause" : "Play"}
        </button>

        <button
          type="button"
          className="secondary"
          disabled={isPlaying}
          onClick={() => {
            setIsPlaying(false);
            const prev = Math.max(0, activeStepIdx - 1);
            setActiveStepIdx(prev);
            setAnimProgress(prev);
          }}
        >
          Prev
        </button>

        <button
          type="button"
          className="secondary"
          disabled={isPlaying}
          onClick={() => {
            setIsPlaying(false);
            const next = Math.min(play.keyframes.length - 1, activeStepIdx + 1);
            setActiveStepIdx(next);
            setAnimProgress(next);
          }}
        >
          Next
        </button>

        <button
          type="button"
          className="secondary"
          onClick={() => {
            setIsPlaying(false);
            setAnimProgress(0);
            setActiveStepIdx(0);
          }}
        >
          Reset
        </button>

        {/* Timeline Scrubber */}
        <input
          type="range"
          aria-label="Timeline progress"
          min="0"
          max={Math.max(1, play.keyframes.length - 1)}
          step="0.01"
          value={isPlaying ? animProgress : activeStepIdx}
          onChange={(e) => {
            setIsPlaying(false);
            const val = parseFloat(e.target.value);
            setAnimProgress(val);
            setActiveStepIdx(Math.round(val));
          }}
          style={{ flex: 1, minWidth: 150 }}
        />

        {/* Speed toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>Speed:</span>
          {[0.5, 1.0, 1.5, 2.0].map((s) => (
            <button
              key={s}
              type="button"
              className={playSpeed === s ? "primary" : "secondary"}
              style={{ padding: "2px 8px", fontSize: "0.75rem" }}
              onClick={() => setPlaySpeed(s)}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Authoring Workbench (hidden in read-only mode) */}
      {!readOnly && (
        <div
          data-testid="workbench-controls"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            padding: 14,
            backgroundColor: "#14151b",
            borderRadius: 8,
          }}
        >
          {/* Keyframe Step Sequencer Strip */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#9ca3af" }}>Steps:</span>
            {play.keyframes.map((kf, idx) => (
              <button
                key={kf.step}
                type="button"
                className={activeStepIdx === idx && !isPlaying ? "primary" : "secondary"}
                style={{ padding: "4px 10px", fontSize: "0.8rem" }}
                onClick={() => {
                  setIsPlaying(false);
                  setActiveStepIdx(idx);
                  setAnimProgress(idx);
                }}
              >
                Step {kf.step}
              </button>
            ))}
            <button
              type="button"
              className="secondary"
              style={{ padding: "4px 10px", fontSize: "0.8rem" }}
              onClick={addKeyframe}
            >
              + Add Step
            </button>
            {play.keyframes.length > 1 && (
              <button
                type="button"
                className="secondary"
                style={{ padding: "4px 10px", fontSize: "0.8rem", color: "#f87171" }}
                onClick={() => deleteKeyframe(activeStepIdx)}
              >
                Delete Step
              </button>
            )}
          </div>

          {/* Step Description Input */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <label htmlFor="step-desc-input" style={{ fontSize: "0.85rem", color: "#9ca3af", whiteSpace: "nowrap" }}>
              Step {currentKeyframe.step} Notes:
            </label>
            <input
              id="step-desc-input"
              type="text"
              value={currentKeyframe.description}
              onChange={(e) => {
                const updated = [...play.keyframes];
                updated[activeStepIdx] = { ...currentKeyframe, description: e.target.value };
                setPlay({ ...play, keyframes: updated });
              }}
              style={{ flex: 1, padding: "6px 10px", borderRadius: 4 }}
            />
          </div>

          {/* Tool Palette */}
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#9ca3af" }}>Tools:</span>
            <button
              type="button"
              className={tool === "select" ? "primary" : "secondary"}
              onClick={() => {
                setTool("select");
                setActionStartPoint(null);
              }}
              style={{ fontSize: "0.8rem", padding: "4px 10px" }}
            >
              Select / Move
            </button>

            {/* Place Token Controls */}
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <button
                type="button"
                className={tool === "token" && selectedTokenType === "offense" ? "primary" : "secondary"}
                onClick={() => {
                  setTool("token");
                  setSelectedTokenType("offense");
                  setActionStartPoint(null);
                }}
                style={{ fontSize: "0.8rem", padding: "4px 8px" }}
              >
                Add Offense
              </button>
              {tool === "token" && selectedTokenType === "offense" && (
                <select
                  value={selectedTokenLabel}
                  onChange={(e) => setSelectedTokenLabel(e.target.value)}
                  style={{ fontSize: "0.8rem", padding: "2px 6px" }}
                >
                  {["1", "2", "3", "4", "5", "PG", "SG", "SF", "PF", "C"].map((lbl) => (
                    <option key={lbl} value={lbl}>
                      {lbl}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <button
                type="button"
                className={tool === "token" && selectedTokenType === "defense" ? "primary" : "secondary"}
                onClick={() => {
                  setTool("token");
                  setSelectedTokenType("defense");
                  setSelectedTokenLabel("x1");
                  setActionStartPoint(null);
                }}
                style={{ fontSize: "0.8rem", padding: "4px 8px" }}
              >
                Add Defense
              </button>
              {tool === "token" && selectedTokenType === "defense" && (
                <select
                  value={selectedTokenLabel}
                  onChange={(e) => setSelectedTokenLabel(e.target.value)}
                  style={{ fontSize: "0.8rem", padding: "2px 6px" }}
                >
                  {["x1", "x2", "x3", "x4", "x5", "X"].map((lbl) => (
                    <option key={lbl} value={lbl}>
                      {lbl}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <button
              type="button"
              className={tool === "token" && selectedTokenType === "ball" ? "primary" : "secondary"}
              onClick={() => {
                setTool("token");
                setSelectedTokenType("ball");
                setSelectedTokenLabel("ball");
                setActionStartPoint(null);
              }}
              style={{ fontSize: "0.8rem", padding: "4px 8px" }}
            >
              Add Ball
            </button>

            {/* Action Path Drawing Controls */}
            <div style={{ display: "flex", gap: 4, alignItems: "center", marginLeft: 8 }}>
              <span style={{ fontSize: "0.8rem", color: "#9ca3af" }}>Draw:</span>
              {(["cut", "pass", "dribble", "screen", "slide"] as ActionPathType[]).map((act) => (
                <button
                  key={act}
                  type="button"
                  className={tool === "action" && selectedActionType === act ? "primary" : "secondary"}
                  onClick={() => {
                    setTool("action");
                    setSelectedActionType(act);
                    setActionStartPoint(null);
                  }}
                  style={{ fontSize: "0.75rem", padding: "3px 8px", textTransform: "capitalize" }}
                >
                  {act}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
