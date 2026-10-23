"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
import {
  TrainingProgramsView,
  type ProgramEnrollment,
  type TrainingProgram,
} from "../../../lib/training-programs";

const FALLBACK_PROGRAMS: TrainingProgram[] = [
  {
    id: "20000000-0000-4000-8000-000000000001",
    slug: "8-week-off-season-vertical-power",
    name: "8-Week Off-Season Vertical Jump & Force Foundation",
    phase: "OFF_SEASON",
    description: "Comprehensive off-season periodization designed to build max lower-body force and convert structural strength into reactive vertical jump height.",
    durationWeeks: 8,
    daysPerWeek: 3,
    targetLevel: "INTERMEDIATE",
    primaryGoal: "VERTICAL_POWER",
    isTemplate: true,
    reviewed: false,
    totalWorkouts: 24,
    workouts: [
      {
        id: "20000000-0000-4000-8000-000000000101",
        programId: "20000000-0000-4000-8000-000000000001",
        weekNumber: 1,
        dayNumber: 1,
        title: "Day 1: Maximal Force & Vertical Launch",
        focus: "LOWER_BODY_FORCE",
        estimatedDurationMin: 50,
        exercisesPrescription: [
          { exerciseSlug: "trap-bar-deadlift", exerciseName: "Trap Bar Deadlift", orderIndex: 1, targetSets: 4, targetReps: 6, targetRpe: 8, restSeconds: 120 },
          { exerciseSlug: "countermovement-jump", exerciseName: "Countermovement Jump", orderIndex: 2, targetSets: 3, targetReps: 5, targetRpe: 7, restSeconds: 90 },
          { exerciseSlug: "dumbbell-bench-press", exerciseName: "Dumbbell Bench Press", orderIndex: 3, targetSets: 3, targetReps: 8, targetRpe: 8, restSeconds: 90 },
        ],
      },
      {
        id: "20000000-0000-4000-8000-000000000102",
        programId: "20000000-0000-4000-8000-000000000001",
        weekNumber: 1,
        dayNumber: 2,
        title: "Day 2: Lateral Deceleration & Elastic Power",
        focus: "ELASTIC_POWER",
        estimatedDurationMin: 45,
        exercisesPrescription: [
          { exerciseSlug: "skater-bounds", exerciseName: "Skater Bounds", orderIndex: 1, targetSets: 3, targetReps: 6, targetRpe: 7, restSeconds: 90 },
          { exerciseSlug: "bulgarian-split-squat", exerciseName: "Bulgarian Split Squat", orderIndex: 2, targetSets: 3, targetReps: 8, targetRpe: 8, restSeconds: 90 },
        ],
      },
    ],
  },
  {
    id: "20000000-0000-4000-8000-000000000002",
    slug: "6-week-pre-season-speed-agility",
    name: "6-Week Pre-Season Speed & Change-of-Direction",
    phase: "PRE_SEASON",
    description: "Intensive pre-season block focusing on transition acceleration, lateral deceleration, perimeter defensive sliding, and repeat-sprint conditioning.",
    durationWeeks: 6,
    daysPerWeek: 3,
    targetLevel: "INTERMEDIATE",
    primaryGoal: "REPEAT_SPRINT_ABILITY",
    isTemplate: true,
    reviewed: false,
    totalWorkouts: 18,
  },
  {
    id: "20000000-0000-4000-8000-000000000003",
    slug: "in-season-maintenance-micro-dosing",
    name: "In-Season Maintenance & High-Intent Micro-Dosing",
    phase: "IN_SEASON",
    description: "Low-volume, high-velocity micro-dosing protocol to preserve peak neural drive and lower-body power without game-day residual fatigue.",
    durationWeeks: 4,
    daysPerWeek: 2,
    targetLevel: "ADVANCED",
    primaryGoal: "FATIGUE_MANAGEMENT",
    isTemplate: true,
    reviewed: false,
    totalWorkouts: 8,
  },
  {
    id: "20000000-0000-4000-8000-000000000004",
    slug: "tournament-week-taper-primer",
    name: "Tournament Week Neuromuscular Primer & Taper",
    phase: "TOURNAMENT_PEAK",
    description: "Strategic taper microcycle designed to peak central nervous system readiness, optimize joint mobility, and eliminate neuromuscular fatigue before tournament play.",
    durationWeeks: 1,
    daysPerWeek: 2,
    targetLevel: "INTERMEDIATE",
    primaryGoal: "TOURNAMENT_READINESS",
    isTemplate: true,
    reviewed: false,
    totalWorkouts: 2,
  },
];

const FALLBACK_ENROLLMENT: ProgramEnrollment = {
  id: "demo-enrollment",
  programId: "20000000-0000-4000-8000-000000000001",
  programName: "8-Week Off-Season Vertical Jump & Force Foundation",
  programPhase: "OFF_SEASON",
  primaryGoal: "VERTICAL_POWER",
  durationWeeks: 8,
  daysPerWeek: 3,
  athleteId: "me",
  startDate: "2026-10-20",
  currentWeek: 1,
  status: "ACTIVE",
  completedWorkoutIds: ["20000000-0000-4000-8000-000000000101"],
  totalWorkouts: 24,
  completedCount: 1,
  adherencePercent: 4,
  painReportedRecently: false,
  workouts: FALLBACK_PROGRAMS[0]!.workouts,
};

export default function TrainingProgramsPage() {
  const [programs, setPrograms] = useState<TrainingProgram[]>(FALLBACK_PROGRAMS);
  const [activeEnrollment, setActiveEnrollment] = useState<ProgramEnrollment | null>(
    FALLBACK_ENROLLMENT,
  );

  useEffect(() => {
    async function loadData() {
      try {
        const progRes = await api<{ items: TrainingProgram[] }>("/training/programs");
        if (progRes?.items?.length) setPrograms(progRes.items);

        const enrollRes = await api<{ items: ProgramEnrollment[] }>("/training/enrollments");
        if (enrollRes?.items?.length) {
          const active = enrollRes.items.find((e) => e.status === "ACTIVE") || enrollRes.items[0];
          if (active) {
            const detail = await api<ProgramEnrollment>(`/training/enrollments/${active.id}`);
            setActiveEnrollment(detail);
          }
        }
      } catch {
        // Fallback to demo periodization data on network/auth error
      }
    }
    loadData();
  }, []);

  const handleEnroll = async (programId: string) => {
    try {
      const created = await api<{ id: string }>(`/training/programs/${programId}/enroll`, {
        method: "POST",
        body: {},
      });
      if (created?.id) {
        const detail = await api<ProgramEnrollment>(`/training/enrollments/${created.id}`);
        setActiveEnrollment(detail);
      }
    } catch {
      // Offline fallback handling
    }
  };

  const handleCompleteWorkout = async (enrollmentId: string, workoutId: string) => {
    try {
      await api(`/training/enrollments/${enrollmentId}/complete-workout`, {
        method: "POST",
        body: { workoutId },
      });
    } catch {
      // Offline fallback handling
    }
  };

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <Link href="/train" className="hover:text-zinc-200">
          Train
        </Link>
        <span>/</span>
        <span className="text-zinc-200">Periodization Programs</span>
      </div>

      <TrainingProgramsView
        initialPrograms={programs}
        activeEnrollment={activeEnrollment}
        onEnroll={handleEnroll}
        onCompleteWorkout={handleCompleteWorkout}
      />
    </main>
  );
}
