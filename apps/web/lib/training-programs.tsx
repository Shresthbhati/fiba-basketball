"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, EmptyState, StatCard } from "@courtiq/design-system";

export type ProgramPhase = "OFF_SEASON" | "PRE_SEASON" | "IN_SEASON" | "TOURNAMENT_PEAK";
export type TargetLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "ELITE";
export type PrimaryGoal =
  | "VERTICAL_POWER"
  | "HYPERTROPHY_BASE"
  | "REPEAT_SPRINT_ABILITY"
  | "FATIGUE_MANAGEMENT"
  | "TOURNAMENT_READINESS";

export interface PrescribedExercise {
  exerciseId?: string;
  exerciseSlug: string;
  exerciseName: string;
  orderIndex: number;
  targetSets: number;
  targetReps: number;
  targetRpe?: number;
  restSeconds?: number;
  notes?: string;
}

export interface ProgramWorkout {
  id: string;
  programId: string;
  weekNumber: number;
  dayNumber: number;
  title: string;
  focus: string;
  estimatedDurationMin: number;
  exercisesPrescription: PrescribedExercise[];
  completed?: boolean;
}

export interface TrainingProgram {
  id: string;
  slug: string;
  name: string;
  phase: ProgramPhase;
  description: string;
  durationWeeks: number;
  daysPerWeek: number;
  targetLevel: TargetLevel;
  primaryGoal: PrimaryGoal;
  isTemplate: boolean;
  reviewed: boolean;
  totalWorkouts?: number;
  workouts?: ProgramWorkout[];
}

export interface ProgramEnrollment {
  id: string;
  programId: string;
  programName: string;
  programPhase: ProgramPhase;
  primaryGoal: PrimaryGoal;
  durationWeeks: number;
  daysPerWeek: number;
  athleteId: string;
  startDate: string;
  currentWeek: number;
  status: "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
  completedWorkoutIds: string[];
  totalWorkouts: number;
  completedCount: number;
  adherencePercent: number;
  painReportedRecently?: boolean;
  program?: TrainingProgram;
  workouts?: ProgramWorkout[];
}

export interface TrainingProgramsViewProps {
  initialPrograms: TrainingProgram[];
  activeEnrollment?: ProgramEnrollment | null;
  onEnroll?: (programId: string) => Promise<void>;
  onCompleteWorkout?: (enrollmentId: string, workoutId: string) => Promise<void>;
}

export const PHASE_LABELS: Record<ProgramPhase, string> = {
  OFF_SEASON: "Off-Season",
  PRE_SEASON: "Pre-Season",
  IN_SEASON: "In-Season",
  TOURNAMENT_PEAK: "Tournament Peak",
};

export const GOAL_LABELS: Record<PrimaryGoal, string> = {
  VERTICAL_POWER: "Vertical Jump & Power",
  HYPERTROPHY_BASE: "Structural Strength & Mass",
  REPEAT_SPRINT_ABILITY: "Speed & Change of Direction",
  FATIGUE_MANAGEMENT: "Maintenance & Recovery",
  TOURNAMENT_READINESS: "Taper & Neural Priming",
};

export function TrainingProgramsView({
  initialPrograms,
  activeEnrollment: initialActiveEnrollment,
  onEnroll,
  onCompleteWorkout,
}: TrainingProgramsViewProps) {
  const [selectedPhase, setSelectedPhase] = useState<ProgramPhase | "ALL">("ALL");
  const [activeEnrollment, setActiveEnrollment] = useState<ProgramEnrollment | null | undefined>(
    initialActiveEnrollment,
  );
  const [enrollingProgramId, setEnrollingProgramId] = useState<string | null>(null);
  const [selectedProgramDetail, setSelectedProgramDetail] = useState<TrainingProgram | null>(null);

  const filteredPrograms = initialPrograms.filter(
    (p) => selectedPhase === "ALL" || p.phase === selectedPhase,
  );

  const handleEnrollClick = async (programId: string) => {
    try {
      setEnrollingProgramId(programId);
      if (onEnroll) {
        await onEnroll(programId);
      }
      const program = initialPrograms.find((p) => p.id === programId);
      if (program) {
        setActiveEnrollment({
          id: `local-enrollment-${Date.now()}`,
          programId: program.id,
          programName: program.name,
          programPhase: program.phase,
          primaryGoal: program.primaryGoal,
          durationWeeks: program.durationWeeks,
          daysPerWeek: program.daysPerWeek,
          athleteId: "me",
          startDate: new Date().toISOString().split("T")[0]!,
          currentWeek: 1,
          status: "ACTIVE",
          completedWorkoutIds: [],
          totalWorkouts: program.totalWorkouts || program.durationWeeks * program.daysPerWeek,
          completedCount: 0,
          adherencePercent: 0,
          painReportedRecently: false,
          program,
          workouts: program.workouts || [],
        });
      }
    } finally {
      setEnrollingProgramId(null);
    }
  };

  const handleWorkoutComplete = async (workoutId: string) => {
    if (!activeEnrollment) return;

    if (onCompleteWorkout) {
      await onCompleteWorkout(activeEnrollment.id, workoutId);
    }

    setActiveEnrollment((prev) => {
      if (!prev) return prev;
      const completedSet = new Set([...prev.completedWorkoutIds, workoutId]);
      const nextWorkouts = prev.workouts?.map((w) => ({
        ...w,
        completed: completedSet.has(w.id),
      }));
      const total = prev.totalWorkouts || 1;
      const count = completedSet.size;
      return {
        ...prev,
        completedWorkoutIds: Array.from(completedSet),
        completedCount: count,
        adherencePercent: Math.min(100, Math.round((count / total) * 100)),
        workouts: nextWorkouts,
      };
    });
  };

  return (
    <div className="space-y-8" data-testid="training-programs-hub">
      {/* Header */}
      <div className="border-b border-zinc-800 pb-6">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-100">
          Periodized Training Programs & Macrocycles
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Basketball-specific periodization architectures designed for off-season force, pre-season speed, in-season maintenance, and tournament peaking.
        </p>
      </div>

      {/* Active Enrollment Schedule Card */}
      {activeEnrollment && (
        <Card className="p-6 bg-zinc-900 border border-zinc-700 space-y-6" data-testid="active-enrollment-card">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider font-semibold text-emerald-400">
                  Active Enrollment
                </span>
                <Badge variant="brand">{PHASE_LABELS[activeEnrollment.programPhase]}</Badge>
                <Badge variant="neutral">{GOAL_LABELS[activeEnrollment.primaryGoal]}</Badge>
              </div>
              <h2 className="text-xl font-bold text-zinc-100 mt-1">{activeEnrollment.programName}</h2>
              <p className="text-xs text-zinc-400">
                Week {activeEnrollment.currentWeek} of {activeEnrollment.durationWeeks} • Started {activeEnrollment.startDate}
              </p>
            </div>

            <div className="flex items-center gap-6">
              <StatCard
                label="Adherence"
                value={`${activeEnrollment.adherencePercent}%`}
                hint={`${activeEnrollment.completedCount} of ${activeEnrollment.totalWorkouts} workouts`}
              />
            </div>
          </div>

          {/* Safety Stop Alert per ADR-0009 */}
          {activeEnrollment.painReportedRecently && (
            <div
              data-testid="pain-safety-stop-alert"
              className="p-4 bg-amber-950/40 border border-amber-600/50 rounded-lg text-sm text-amber-200 space-y-1"
            >
              <div className="font-semibold text-amber-100 flex items-center gap-2">
                <span>⚠️ Safety Hold Active</span>
              </div>
              <p className="text-xs text-amber-300">
                You reported pain in a recent wellness check. Training suggestions and intensity progressions are paused.
                Please consider speaking to a qualified professional before continuing.
              </p>
            </div>
          )}

          {/* Prescribed Workouts List for Active Program */}
          <div className="space-y-4">
            <h3 className="font-semibold text-zinc-200 text-sm">Week {activeEnrollment.currentWeek} Scheduled Workouts</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="scheduled-workouts-grid">
              {(activeEnrollment.workouts || []).map((workout) => {
                const isCompleted = activeEnrollment.completedWorkoutIds.includes(workout.id) || workout.completed;
                return (
                  <div
                    key={workout.id}
                    data-testid={`workout-card-${workout.id}`}
                    className={`p-4 rounded-lg border transition-colors flex flex-col justify-between ${
                      isCompleted
                        ? "bg-zinc-950/50 border-emerald-900/60"
                        : "bg-zinc-850 border-zinc-700"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs font-semibold text-zinc-400">Day {workout.dayNumber}</span>
                        <Badge variant={isCompleted ? "success" : "neutral"}>
                          {isCompleted ? "Completed" : `${workout.estimatedDurationMin} min`}
                        </Badge>
                      </div>

                      <h4 className="font-bold text-zinc-100 text-sm">{workout.title}</h4>
                      <span className="text-xs text-emerald-400 font-mono block mt-0.5">{workout.focus}</span>

                      {/* Prescribed Exercises Mini List */}
                      <div className="mt-3 space-y-1.5 border-t border-zinc-800/80 pt-2">
                        {(workout.exercisesPrescription || []).map((ex, idx) => (
                          <div key={idx} className="text-xs text-zinc-300 flex items-baseline justify-between">
                            <span className="truncate pr-2">{ex.exerciseName}</span>
                            <span className="text-zinc-400 font-mono text-[11px] whitespace-nowrap">
                              {ex.targetSets}×{ex.targetReps} {ex.targetRpe ? `@ RPE ${ex.targetRpe}` : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-zinc-800/80 flex items-center justify-between">
                      <Link
                        href="/train"
                        className="text-xs text-zinc-400 hover:text-zinc-200 underline"
                      >
                        Launch in Logger →
                      </Link>

                      {!isCompleted ? (
                        <Button
                          data-testid={`complete-workout-btn-${workout.id}`}
                          onClick={() => handleWorkoutComplete(workout.id)}
                          className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded"
                        >
                          ✓ Complete
                        </Button>
                      ) : (
                        <span className="text-xs text-emerald-400 font-medium">Done ✓</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {/* Periodized Programs Catalog */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-zinc-100">Basketball Periodization Templates</h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Select a structured training cycle tailored to your competition calendar phase.
            </p>
          </div>

          {/* Phase Filter Buttons */}
          <div className="flex flex-wrap gap-1.5" data-testid="phase-filter-buttons">
            {(["ALL", "OFF_SEASON", "PRE_SEASON", "IN_SEASON", "TOURNAMENT_PEAK"] as const).map((phase) => (
              <button
                key={phase}
                onClick={() => setSelectedPhase(phase)}
                className={`text-xs px-3 py-1.5 rounded transition-colors ${
                  selectedPhase === phase
                    ? "bg-zinc-800 text-white font-medium border border-zinc-700"
                    : "text-zinc-400 hover:text-zinc-200 bg-zinc-900 border border-transparent"
                }`}
              >
                {phase === "ALL" ? "All Phases" : PHASE_LABELS[phase]}
              </button>
            ))}
          </div>
        </div>

        {/* Programs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6" data-testid="programs-grid">
          {filteredPrograms.map((program) => (
            <Card
              key={program.id}
              data-testid={`program-card-${program.slug}`}
              className="p-6 bg-zinc-900 border border-zinc-800 flex flex-col justify-between hover:border-zinc-700 transition-colors space-y-4"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="brand">{PHASE_LABELS[program.phase]}</Badge>
                    <Badge variant="neutral">{program.targetLevel}</Badge>
                  </div>
                  {!program.reviewed && (
                    <Badge variant="warning">Awaiting S&C Review</Badge>
                  )}
                </div>

                <h3 className="font-bold text-zinc-100 text-lg leading-tight">{program.name}</h3>
                <span className="text-xs text-emerald-400 font-medium block mt-1">
                  Primary Goal: {GOAL_LABELS[program.primaryGoal]}
                </span>

                <p className="text-xs text-zinc-400 mt-2 line-clamp-3 leading-relaxed">
                  {program.description}
                </p>

                <div className="grid grid-cols-3 gap-2 mt-4 p-3 bg-zinc-950/60 rounded-lg border border-zinc-800/60 text-center">
                  <div>
                    <span className="text-xs text-zinc-500 block">Duration</span>
                    <span className="text-sm font-bold text-zinc-200">{program.durationWeeks} Weeks</span>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500 block">Frequency</span>
                    <span className="text-sm font-bold text-zinc-200">{program.daysPerWeek} Days/Wk</span>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500 block">Sessions</span>
                    <span className="text-sm font-bold text-zinc-200">
                      {program.totalWorkouts || program.durationWeeks * program.daysPerWeek} Total
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-zinc-800 flex items-center justify-between gap-3">
                <Button
                  onClick={() => setSelectedProgramDetail(program)}
                  className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-2 rounded"
                >
                  View Blueprint
                </Button>

                <Button
                  data-testid={`enroll-button-${program.slug}`}
                  disabled={enrollingProgramId === program.id}
                  onClick={() => handleEnrollClick(program.id)}
                  className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded shadow-sm"
                >
                  {enrollingProgramId === program.id ? "Enrolling..." : "Enroll in Program →"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Program Blueprint Modal */}
      {selectedProgramDetail && (
        <div
          data-testid="blueprint-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
        >
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge variant="brand">{PHASE_LABELS[selectedProgramDetail.phase]}</Badge>
                  <Badge variant="neutral">{selectedProgramDetail.targetLevel}</Badge>
                </div>
                <h3 className="font-bold text-zinc-100 text-lg mt-1">{selectedProgramDetail.name}</h3>
              </div>
              <button
                onClick={() => setSelectedProgramDetail(null)}
                className="text-zinc-400 hover:text-zinc-200 text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-sm text-zinc-300">{selectedProgramDetail.description}</p>

            <div className="space-y-3">
              <h4 className="font-semibold text-zinc-200 text-sm">Scheduled Workouts & Exercise Prescriptions</h4>
              {(selectedProgramDetail.workouts || []).length === 0 ? (
                <EmptyState
                  title="Workouts loading or custom generated"
                  description="Detailed scheduled workout days will appear upon enrollment."
                />
              ) : (
                <div className="space-y-3">
                  {selectedProgramDetail.workouts?.map((w) => (
                    <div key={w.id} className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-zinc-200 text-sm">
                          Week {w.weekNumber}, Day {w.dayNumber}: {w.title}
                        </span>
                        <span className="text-xs text-emerald-400">{w.focus}</span>
                      </div>
                      <div className="space-y-1 text-xs text-zinc-400">
                        {w.exercisesPrescription.map((ex, i) => (
                          <div key={i} className="flex justify-between border-t border-zinc-900 pt-1">
                            <span>{ex.exerciseName}</span>
                            <span className="font-mono text-zinc-300">
                              {ex.targetSets} sets × {ex.targetReps} reps
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-zinc-800">
              <Button
                onClick={() => setSelectedProgramDetail(null)}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 text-sm rounded-md"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
