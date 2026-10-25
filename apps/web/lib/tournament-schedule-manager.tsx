"use client";

import React, { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "./api";

export type ConflictType =
  | "COURT_OVERLAP"
  | "TEAM_REST_VIOLATION"
  | "DOUBLE_BOOKED_TEAM"
  | "VENUE_HOURS_VIOLATION";

export interface ScheduleConflictItem {
  type: ConflictType;
  severity: "ERROR" | "WARNING";
  matchIds: string[];
  teamIds?: string[];
  courtName?: string;
  description: string;
  suggestedResolution?: string;
}

export interface TournamentMatchItem {
  id: string;
  round: number;
  slot: number;
  homeTeamId?: string | null;
  awayTeamId?: string | null;
  homeName: string;
  awayName: string;
  courtName?: string | null;
  scheduledAt?: string | null;
  estimatedDurationMinutes?: number;
  state: string;
  isBye?: boolean;
}

export interface TournamentScheduleManagerProps {
  competitionId: string;
  canManage?: boolean;
  initialMatches?: TournamentMatchItem[];
  initialConflicts?: ScheduleConflictItem[];
}

export function TournamentScheduleManager({
  competitionId,
  canManage = false,
  initialMatches,
  initialConflicts,
}: TournamentScheduleManagerProps) {
  const [matches, setMatches] = useState<TournamentMatchItem[]>(initialMatches || []);
  const [conflicts, setConflicts] = useState<ScheduleConflictItem[]>(initialConflicts || []);
  const [selectedCourtFilter, setSelectedCourtFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState<boolean>(!initialMatches);
  const [error, setError] = useState<string | null>(null);
  const [successNote, setSuccessNote] = useState<string | null>(null);

  // Auto-schedule modal state
  const [showAutoScheduleModal, setShowAutoScheduleModal] = useState<boolean>(false);
  const [courtsInput, setCourtsInput] = useState<string>("Court 1, Court 2");
  const [startDateTime, setStartDateTime] = useState<string>("2026-11-01T09:00");
  const [matchDuration, setMatchDuration] = useState<number>(60);
  const [bufferMins, setBufferMins] = useState<number>(15);
  const [minRestMins, setMinRestMins] = useState<number>(60);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Edit match modal state
  const [editingMatch, setEditingMatch] = useState<TournamentMatchItem | null>(null);
  const [editCourt, setEditCourt] = useState<string>("");
  const [editTime, setEditTime] = useState<string>("");
  const [editDuration, setEditDuration] = useState<number>(60);

  const loadScheduleData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [matchesRes, conflictsRes] = await Promise.all([
        api<{ items: TournamentMatchItem[] }>(`/competitions/${competitionId}/matches`),
        api<{ conflicts: ScheduleConflictItem[] }>(`/competitions/${competitionId}/schedule/conflicts`),
      ]);
      setMatches(matchesRes.items || []);
      setConflicts(conflictsRes.conflicts || []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load tournament schedule");
    } finally {
      setLoading(false);
    }
  }, [competitionId]);

  useEffect(() => {
    if (!initialMatches) {
      void loadScheduleData();
    }
  }, [initialMatches, loadScheduleData]);

  const handleRunAutoSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const courts = courtsInput
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);

      if (courts.length === 0) {
        throw new Error("Please specify at least one court");
      }

      const isoStart = new Date(startDateTime).toISOString();

      await api(`/competitions/${competitionId}/schedule/auto-assign`, {
        method: "POST",
        body: {
          availableCourts: courts,
          startDateTime: isoStart,
          matchDurationMinutes: matchDuration,
          bufferMinutes: bufferMins,
          minRestMinutes: minRestMins,
        },
      });

      setSuccessNote("Tournament schedule successfully generated across multiple courts!");
      setShowAutoScheduleModal(false);
      await loadScheduleData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to auto-assign schedule");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveMatchSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMatch) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await api(`/matches/${editingMatch.id}`, {
        method: "PATCH",
        body: {
          courtName: editCourt.trim() || null,
          scheduledAt: editTime ? new Date(editTime).toISOString() : null,
          estimatedDurationMinutes: editDuration,
        },
      });

      setEditingMatch(null);
      setSuccessNote(`Match #${editingMatch.slot} schedule updated.`);
      await loadScheduleData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update match schedule");
    } finally {
      setIsSubmitting(false);
    }
  };

  const courtsList = Array.from(
    new Set(matches.map((m) => m.courtName).filter((c): c is string => !!c))
  ).sort();

  const filteredMatches = matches.filter((m) => {
    if (selectedCourtFilter === "ALL") return true;
    if (selectedCourtFilter === "UNASSIGNED") return !m.courtName;
    return m.courtName === selectedCourtFilter;
  });

  const errorConflicts = conflicts.filter((c) => c.severity === "ERROR");
  const warningConflicts = conflicts.filter((c) => c.severity === "WARNING");

  return (
    <div className="flex flex-col gap-5 p-5 bg-slate-950 border border-slate-800 rounded-2xl text-slate-100">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <span>🏟️ Multi-Court Tournament Schedule</span>
            {conflicts.length > 0 && (
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                  errorConflicts.length > 0
                    ? "bg-red-950 text-red-400 border border-red-800"
                    : "bg-amber-950 text-amber-400 border border-amber-800"
                }`}
              >
                {conflicts.length} Conflict{conflicts.length === 1 ? "" : "s"}
              </span>
            )}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Constraint Engine: Overlap Prevention · Rest Window Compliance · Operating Hours
          </p>
        </div>

        <div className="flex items-center gap-2">
          {canManage && (
            <button
              type="button"
              onClick={() => setShowAutoScheduleModal(true)}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow transition-colors flex items-center gap-1.5"
            >
              <span>⚡ Auto-Schedule Wizard</span>
            </button>
          )}

          <select
            value={selectedCourtFilter}
            onChange={(e) => setSelectedCourtFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-slate-200"
          >
            <option value="ALL">All Courts ({matches.length})</option>
            {courtsList.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value="UNASSIGNED">Unassigned Courts</option>
          </select>
        </div>
      </div>

      {successNote && (
        <div className="p-3 bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs rounded-lg flex items-center justify-between">
          <span>{successNote}</span>
          <button type="button" onClick={() => setSuccessNote(null)} className="text-emerald-400 font-bold">
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-950/60 border border-red-800 text-red-300 text-xs rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-red-400 font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Conflict Alert Banner */}
      {conflicts.length > 0 && (
        <div className="flex flex-col gap-2 p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <span>⚠️ Scheduling Conflicts Detected</span>
            </span>
            <span className="text-[11px] text-slate-400">
              {errorConflicts.length} Errors · {warningConflicts.length} Warnings
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
            {conflicts.map((c, idx) => (
              <div
                key={idx}
                className={`p-2.5 rounded-lg border text-xs flex flex-col gap-1 ${
                  c.severity === "ERROR"
                    ? "bg-red-950/40 border-red-900/60 text-red-200"
                    : "bg-amber-950/40 border-amber-900/60 text-amber-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[11px] uppercase tracking-wide">
                    {c.type.replace(/_/g, " ")}
                  </span>
                  {c.courtName && (
                    <span className="px-1.5 py-0.5 rounded bg-black/40 text-[10px] font-mono">
                      {c.courtName}
                    </span>
                  )}
                </div>
                <p className="text-[11px] opacity-90 leading-tight">{c.description}</p>
                {c.suggestedResolution && (
                  <p className="text-[10px] opacity-75 italic mt-0.5">
                    💡 {c.suggestedResolution}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Matches Grid / Schedule Table */}
      {loading ? (
        <div className="p-8 text-center text-xs text-slate-500 animate-pulse">
          Loading tournament matches and court schedules...
        </div>
      ) : filteredMatches.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
          No matches found for the selected court filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredMatches.map((m) => {
            const hasConflict = conflicts.some((c) => c.matchIds.includes(m.id));
            const formattedTime = m.scheduledAt
              ? new Date(m.scheduledAt).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Unscheduled";

            const formattedDate = m.scheduledAt
              ? new Date(m.scheduledAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })
              : null;

            return (
              <div
                key={m.id}
                className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2.5 transition-colors ${
                  hasConflict
                    ? "bg-red-950/20 border-red-800/80"
                    : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-slate-400">
                    R{m.round} · Slot {m.slot}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                      m.courtName
                        ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {m.courtName || "No Court Assigned"}
                  </span>
                </div>

                <div className="my-1">
                  <div className="font-bold text-sm text-slate-100 truncate">{m.homeName}</div>
                  <div className="text-xs text-slate-400 font-semibold my-0.5">vs</div>
                  <div className="font-bold text-sm text-slate-100 truncate">{m.awayName}</div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs text-slate-400">
                  <div>
                    <span className="font-semibold text-slate-200">{formattedTime}</span>
                    {formattedDate && <span className="ml-1 text-[11px] text-slate-500">({formattedDate})</span>}
                    <span className="ml-1.5 text-[11px] text-slate-500">· {m.estimatedDurationMinutes || 60}m</span>
                  </div>

                  {canManage && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMatch(m);
                        setEditCourt(m.courtName || "");
                        setEditTime(m.scheduledAt ? m.scheduledAt.slice(0, 16) : "");
                        setEditDuration(m.estimatedDurationMinutes || 60);
                      }}
                      className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
                    >
                      Edit Slot
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Auto-Schedule Wizard Modal */}
      {showAutoScheduleModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form
            onSubmit={handleRunAutoSchedule}
            className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-lg w-full flex flex-col gap-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-base text-slate-100">
                ⚡ Multi-Court Automated Scheduler
              </h3>
              <button
                type="button"
                onClick={() => setShowAutoScheduleModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Distribute round-robin or bracket fixtures across your facility's available courts
              while preventing court double-booking and guaranteeing minimum team rest windows.
            </p>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="court-names-input" className="text-xs font-semibold text-slate-300">
                Available Facility Courts (comma separated):
              </label>
              <input
                id="court-names-input"
                type="text"
                value={courtsInput}
                onChange={(e) => setCourtsInput(e.target.value)}
                placeholder="e.g. Court 1, Court 2, Main Gym"
                required
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="tournament-start-input" className="text-xs font-semibold text-slate-300">Tournament Kick-off:</label>
                <input
                  id="tournament-start-input"
                  type="datetime-local"
                  value={startDateTime}
                  onChange={(e) => setStartDateTime(e.target.value)}
                  required
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="match-duration-select" className="text-xs font-semibold text-slate-300">Match Duration:</label>
                <select
                  id="match-duration-select"
                  value={matchDuration}
                  onChange={(e) => setMatchDuration(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100"
                >
                  <option value={45}>45 Minutes</option>
                  <option value={60}>60 Minutes</option>
                  <option value={75}>75 Minutes</option>
                  <option value={90}>90 Minutes</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="court-buffer-select" className="text-xs font-semibold text-slate-300">Court Turnaround Buffer:</label>
                <select
                  id="court-buffer-select"
                  value={bufferMins}
                  onChange={(e) => setBufferMins(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100"
                >
                  <option value={10}>10 Minutes</option>
                  <option value={15}>15 Minutes</option>
                  <option value={20}>20 Minutes</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="min-rest-select" className="text-xs font-semibold text-slate-300">Min Team Rest Window:</label>
                <select
                  id="min-rest-select"
                  value={minRestMins}
                  onChange={(e) => setMinRestMins(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100"
                >
                  <option value={45}>45 Minutes</option>
                  <option value={60}>60 Minutes (Standard)</option>
                  <option value={90}>90 Minutes (Recommended)</option>
                  <option value={120}>120 Minutes</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => setShowAutoScheduleModal(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold"
              >
                {isSubmitting ? "Generating..." : "Generate & Apply Schedule"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Match Slot Modal */}
      {editingMatch && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveMatchSchedule}
            className="bg-slate-900 border border-slate-800 p-5 rounded-2xl max-w-md w-full flex flex-col gap-3.5 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h3 className="font-bold text-sm text-slate-100">
                Edit Match #{editingMatch.slot} Slot
              </h3>
              <button
                type="button"
                onClick={() => setEditingMatch(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-slate-300">
              <span className="font-bold">{editingMatch.homeName}</span> vs{" "}
              <span className="font-bold">{editingMatch.awayName}</span>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="assigned-court-input" className="text-xs text-slate-400">Assigned Court:</label>
              <input
                id="assigned-court-input"
                type="text"
                value={editCourt}
                onChange={(e) => setEditCourt(e.target.value)}
                placeholder="e.g. Court 1, Main Arena"
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="scheduled-time-input" className="text-xs text-slate-400">Scheduled Time:</label>
                <input
                  id="scheduled-time-input"
                  type="datetime-local"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="duration-mins-input" className="text-xs text-slate-400">Duration (mins):</label>
                <input
                  id="duration-mins-input"
                  type="number"
                  min={15}
                  max={240}
                  value={editDuration}
                  onChange={(e) => setEditDuration(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => setEditingMatch(null)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold"
              >
                {isSubmitting ? "Saving..." : "Save Match Slot"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
