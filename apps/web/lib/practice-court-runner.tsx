"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  CATEGORY_THEMES,
  ATTENDANCE_THEMES,
  type AttendanceRecord,
  type AttendanceStatus,
  type PracticeBlock,
  type PracticeSession,
} from "./practice-planner";

export interface PracticeCourtRunnerProps {
  practice: PracticeSession;
  isOpen: boolean;
  onClose: () => void;
  onUpdateStatus?: (status: "IN_PROGRESS" | "COMPLETED") => Promise<void>;
  onUpdateAttendance?: (attendance: AttendanceRecord[]) => Promise<void>;
}

// Web Audio API Whistle Synthesizer (Realistic multi-tone whistle alert)
function playWhistleSound() {
  if (typeof window === "undefined") return;
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    // High dual frequency typical of Fox 40 basketball referee whistle
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(2800, ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(3200, ctx.currentTime + 0.1);

    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(3100, ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(3500, ctx.currentTime + 0.1);

    gainNode.gain.setValueAtTime(0.01, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.45);
    osc2.stop(ctx.currentTime + 0.45);

    // Haptic vibration feedback if supported
    if ("vibrate" in navigator) {
      navigator.vibrate([100, 50, 150]);
    }
  } catch {
    // Non-blocking fallback if browser policy or test environment blocks AudioContext
  }
}

export function PracticeCourtRunner({
  practice,
  isOpen,
  onClose,
  onUpdateStatus,
  onUpdateAttendance,
}: PracticeCourtRunnerProps) {
  const blocks = practice.blocks || [];
  const [currentBlockIndex, setCurrentBlockIndex] = useState<number>(0);
  const currentBlock: PracticeBlock | undefined = blocks[currentBlockIndex];

  // Timer state
  const [secondsRemaining, setSecondsRemaining] = useState<number>(
    (currentBlock?.durationMins || 10) * 60
  );
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);

  // Quick Attendance Sheet
  const [showAttendance, setShowAttendance] = useState<boolean>(false);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>(practice.attendance || []);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize block duration when changing blocks
  const resetTimerForBlock = useCallback((block: PracticeBlock | undefined) => {
    if (block) {
      setSecondsRemaining((block.durationMins || 10) * 60);
    }
  }, []);

  // Set status to IN_PROGRESS on initial launch
  useEffect(() => {
    if (isOpen && practice.status === "SCHEDULED" && onUpdateStatus) {
      void onUpdateStatus("IN_PROGRESS");
    }
  }, [isOpen, practice.status, onUpdateStatus]);

  // Main countdown ticker
  useEffect(() => {
    if (!isRunning) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          if (!isMuted) playWhistleSound();
          // Auto advance or pause on block end
          if (currentBlockIndex < blocks.length - 1) {
            setCurrentBlockIndex((idx) => {
              const nextIdx = idx + 1;
              resetTimerForBlock(blocks[nextIdx]);
              return nextIdx;
            });
            return 0;
          } else {
            setIsRunning(false);
            setIsCompleted(true);
            return 0;
          }
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, currentBlockIndex, blocks, isMuted, resetTimerForBlock]);

  // Keyboard shortcuts (Space = Play/Pause, N = Next, P = Prev, W = Whistle)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === "Space") {
        e.preventDefault();
        setIsRunning((prev) => !prev);
      } else if (e.code === "KeyN") {
        e.preventDefault();
        handleNextBlock();
      } else if (e.code === "KeyP") {
        e.preventDefault();
        handlePrevBlock();
      } else if (e.code === "KeyW") {
        e.preventDefault();
        handleManualWhistle();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, currentBlockIndex, blocks.length]);

  if (!isOpen) return null;

  const handleNextBlock = () => {
    if (currentBlockIndex < blocks.length - 1) {
      if (!isMuted) playWhistleSound();
      const nextIdx = currentBlockIndex + 1;
      setCurrentBlockIndex(nextIdx);
      resetTimerForBlock(blocks[nextIdx]);
    } else {
      setIsRunning(false);
      setIsCompleted(true);
    }
  };

  const handlePrevBlock = () => {
    if (currentBlockIndex > 0) {
      const prevIdx = currentBlockIndex - 1;
      setCurrentBlockIndex(prevIdx);
      resetTimerForBlock(blocks[prevIdx]);
    }
  };

  const handleAddMinute = () => {
    setSecondsRemaining((prev) => prev + 60);
  };

  const handleManualWhistle = () => {
    playWhistleSound();
  };

  const handleAttendanceToggle = (userId: string, newStatus: AttendanceStatus) => {
    const updated = attendance.map((a) => (a.userId === userId ? { ...a, status: newStatus } : a));
    setAttendance(updated);
    if (onUpdateAttendance) {
      void onUpdateAttendance(updated);
    }
  };

  const handleCompletePractice = async () => {
    if (onUpdateStatus) {
      await onUpdateStatus("COMPLETED");
    }
    onClose();
  };

  // Format MM:SS
  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  const timeFormatted = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  const currentCategoryTheme = currentBlock
    ? CATEGORY_THEMES[currentBlock.category]
    : CATEGORY_THEMES.WARMUP;

  const totalCalculatedMins = blocks.reduce((sum, b) => sum + (b.durationMins || 0), 0);
  const elapsedMinutesEstimate = blocks
    .slice(0, currentBlockIndex)
    .reduce((sum, b) => sum + (b.durationMins || 0), 0) +
    Math.max(0, (currentBlock?.durationMins || 0) - Math.ceil(secondsRemaining / 60));

  const percentProgress = totalCalculatedMins > 0
    ? Math.min(100, Math.round((elapsedMinutesEstimate / totalCalculatedMins) * 100))
    : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Practice Live Court Runner"
      className="fixed inset-0 z-50 flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans select-none"
    >
      {/* Top Header Bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="flex h-3 w-3 relative">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isRunning ? "bg-emerald-400" : "bg-amber-400"} opacity-75`} />
            <span className={`relative inline-flex rounded-full h-3 w-3 ${isRunning ? "bg-emerald-500" : "bg-amber-500"}`} />
          </span>
          <div>
            <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <span>{practice.title}</span>
              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                {practice.focus || "Tactical & Technical Installation"}
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Block {currentBlockIndex + 1} of {blocks.length} · {elapsedMinutesEstimate}m / {totalCalculatedMins}m Total Session
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Audio Whistle Toggle */}
          <button
            type="button"
            onClick={() => setIsMuted((prev) => !prev)}
            aria-label={isMuted ? "Unmute Whistle Alert" : "Mute Whistle Alert"}
            className="p-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
          >
            {isMuted ? "🔇 Whistle Muted" : "🔊 Whistle On"}
          </button>

          {/* Quick Attendance Sheet Toggle */}
          <button
            type="button"
            onClick={() => setShowAttendance((prev) => !prev)}
            className={`px-3 py-2 rounded text-xs font-medium transition-colors ${
              showAttendance ? "bg-indigo-600 text-white" : "bg-slate-800 hover:bg-slate-700 text-slate-300"
            }`}
          >
            📋 Floor Roster ({attendance.filter((a) => a.status === "PRESENT").length}/{attendance.length})
          </button>

          {/* Exit Court Runner */}
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded bg-slate-800 hover:bg-red-900/50 text-slate-300 hover:text-red-200 text-xs font-medium transition-colors"
          >
            ✕ Exit Runner
          </button>
        </div>
      </div>

      {/* Session Overall Progress Meter */}
      <div className="w-full bg-slate-800 h-1.5 overflow-hidden">
        <div
          className="bg-emerald-500 h-full transition-all duration-500 ease-out"
          style={{ width: `${percentProgress}%` }}
        />
      </div>

      {/* Main Runner Stage */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 overflow-y-auto">
        {/* Left Column: Big Clock & Active Controls */}
        <div className="lg:col-span-2 flex flex-col justify-between bg-slate-900/60 border border-slate-800 rounded-2xl p-8 relative shadow-2xl">
          {/* Current Drill Category Banner */}
          <div className="flex items-center justify-between">
            <span
              className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider shadow-sm"
              style={{
                backgroundColor: currentCategoryTheme.bg,
                color: currentCategoryTheme.color,
                border: `1px solid ${currentCategoryTheme.border}`,
              }}
            >
              {currentCategoryTheme.label}
            </span>

            <span className="text-xs text-slate-400 font-mono">
              Target Duration: {currentBlock?.durationMins || 10} Mins
            </span>
          </div>

          {/* Large Countdown Clock Display */}
          <div className="flex flex-col items-center justify-center my-8">
            <div
              className={`font-mono text-7xl sm:text-9xl font-black tracking-tight drop-shadow-md tabular-nums transition-colors ${
                secondsRemaining <= 30 && secondsRemaining > 0
                  ? "text-amber-400 animate-pulse"
                  : secondsRemaining === 0
                  ? "text-red-500"
                  : "text-slate-100"
              }`}
            >
              {timeFormatted}
            </div>

            <p className="mt-3 text-sm text-slate-400 flex items-center gap-2">
              <kbd className="px-2 py-0.5 rounded bg-slate-800 text-[11px] font-mono border border-slate-700">Space</kbd>
              <span>{isRunning ? "Pause Countdown" : "Start Countdown"}</span>
              ·
              <kbd className="px-2 py-0.5 rounded bg-slate-800 text-[11px] font-mono border border-slate-700">W</kbd>
              <span>Blow Whistle</span>
            </p>
          </div>

          {/* Action Controls Toolbar */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={handlePrevBlock}
              disabled={currentBlockIndex === 0}
              className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-300 font-medium text-sm transition-all"
            >
              ⏮ Previous
            </button>

            <button
              type="button"
              onClick={() => setIsRunning((prev) => !prev)}
              className={`px-8 py-3 rounded-xl font-bold text-base shadow-lg transition-all ${
                isRunning
                  ? "bg-amber-600 hover:bg-amber-500 text-white"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white"
              }`}
            >
              {isRunning ? "⏸ Pause Timer" : "▶ Start Block"}
            </button>

            <button
              type="button"
              onClick={handleNextBlock}
              className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-sm transition-all"
            >
              {currentBlockIndex < blocks.length - 1 ? "⏭ Next Drill" : "✓ Finish Practice"}
            </button>

            <button
              type="button"
              onClick={handleAddMinute}
              className="px-3.5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-mono transition-all"
            >
              +1 Min
            </button>

            <button
              type="button"
              onClick={handleManualWhistle}
              className="px-4 py-3 rounded-xl bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/50 text-amber-300 font-semibold text-sm transition-all flex items-center gap-1.5"
            >
              <span>📢 Whistle Cue</span>
            </button>
          </div>
        </div>

        {/* Right Column: Active Drill Notes & Upcoming Queue */}
        <div className="flex flex-col gap-4">
          {/* Current Drill Information Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>ACTIVE DRILL #{currentBlock?.order || 1}</span>
              {currentBlock?.playId && (
                <span className="text-emerald-400 font-medium">📋 Playbook Linked</span>
              )}
            </div>

            <h2 className="text-xl font-bold text-slate-100">{currentBlock?.title}</h2>

            {currentBlock?.notes ? (
              <div className="mt-3 p-3 rounded-lg bg-slate-950/80 border border-slate-800 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                <span className="font-semibold text-slate-400 uppercase text-[10px] block mb-1">
                  Coaching Focus & Cues:
                </span>
                {currentBlock.notes}
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500 italic">
                No specific coaching notes attached to this drill block.
              </p>
            )}
          </div>

          {/* Next Up Drill Card */}
          {currentBlockIndex < blocks.length - 1 ? (
            <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-4">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Up Next:
              </span>
              <div className="mt-1 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">
                    {blocks[currentBlockIndex + 1]?.title}
                  </h3>
                  <span className="text-xs text-slate-500">
                    {blocks[currentBlockIndex + 1]?.durationMins} minutes · {blocks[currentBlockIndex + 1]?.category}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleNextBlock}
                  className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-medium"
                >
                  Skip To
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/50 border border-emerald-900/40 rounded-2xl p-4 text-center">
              <span className="text-xs text-emerald-400 font-medium">
                Final drill of this practice session!
              </span>
            </div>
          )}

          {/* Quick Roster Drawer (Collapsible) */}
          {showAttendance && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-2 max-h-72 overflow-y-auto">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs">
                <span className="font-semibold text-slate-300">Floor Attendance Check</span>
                <span className="text-slate-500">{attendance.length} Athletes</span>
              </div>

              {attendance.map((rec) => (
                <div
                  key={rec.userId}
                  className="flex items-center justify-between p-2 rounded bg-slate-950/60 border border-slate-800/60 text-xs"
                >
                  <span className="font-medium text-slate-200 truncate">{rec.name || rec.userId.slice(0, 8)}</span>
                  <div className="flex items-center gap-1">
                    {(["PRESENT", "ABSENT", "EXCUSED", "INJURED"] as AttendanceStatus[]).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => handleAttendanceToggle(rec.userId, st)}
                        style={{
                          backgroundColor: rec.status === st ? ATTENDANCE_THEMES[st].bg : undefined,
                          color: rec.status === st ? ATTENDANCE_THEMES[st].color : undefined,
                        }}
                        className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${
                          rec.status === st
                            ? "font-bold shadow-sm"
                            : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                        }`}
                      >
                        {st.charAt(0)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Practice Completed Banner Modal */}
      {isCompleted && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-500/50 p-6 rounded-2xl max-w-md w-full text-center flex flex-col gap-4 shadow-2xl">
            <div className="w-16 h-16 rounded-full bg-emerald-950/80 border border-emerald-500 flex items-center justify-center mx-auto text-3xl">
              🏆
            </div>
            <h2 className="text-xl font-bold text-slate-100">Practice Session Finished!</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              All {blocks.length} sequenced drill blocks completed. Great work coaching on the court today.
            </p>
            <div className="flex gap-3 justify-center mt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
              >
                Close Runner
              </button>
              <button
                type="button"
                onClick={handleCompletePractice}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
              >
                ✓ Finalize & Log Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
