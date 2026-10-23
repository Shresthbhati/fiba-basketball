import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  programEnrollments,
  trainingPrograms,
  trainingProgramWorkouts,
  type PrescribedExerciseItem,
} from "../db/schema.js";
import { AuthError } from "../identity/service.js";
import { canAccessAthlete } from "./testing-service.js";
import { painReportedRecently } from "./service.js";
import { canManageTeam, canViewTeam } from "../coach/service.js";

export type ProgramPhase = "OFF_SEASON" | "PRE_SEASON" | "IN_SEASON" | "TOURNAMENT_PEAK";
export type TargetLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "ELITE";
export type PrimaryGoal =
  | "VERTICAL_POWER"
  | "HYPERTROPHY_BASE"
  | "REPEAT_SPRINT_ABILITY"
  | "FATIGUE_MANAGEMENT"
  | "TOURNAMENT_READINESS";

export interface CreateProgramInput {
  slug?: string | undefined;
  name: string;
  phase: ProgramPhase;
  description: string;
  durationWeeks?: number | undefined;
  daysPerWeek?: number | undefined;
  targetLevel?: TargetLevel | undefined;
  primaryGoal: PrimaryGoal;
  teamId?: string | undefined;
}

export interface AddProgramWorkoutInput {
  weekNumber: number;
  dayNumber: number;
  title: string;
  focus: string;
  estimatedDurationMin?: number | undefined;
  exercisesPrescription?: PrescribedExerciseItem[] | undefined;
}

export interface EnrollAthleteInput {
  athleteId?: string | undefined;
  startDate?: string | undefined;
  notes?: string | undefined;
}

/**
 * Checks if viewer has permission to read a program.
 */
export async function canReadProgram(
  db: Db,
  viewerId: string,
  program: typeof trainingPrograms.$inferSelect,
): Promise<boolean> {
  if (program.isTemplate) return true;
  if (program.creatorId === viewerId) return true;
  if (program.teamId) {
    return canViewTeam(db, viewerId, program.teamId);
  }
  return false;
}

/**
 * Checks if viewer has permission to edit a program.
 */
export async function canEditProgram(
  db: Db,
  viewerId: string,
  program: typeof trainingPrograms.$inferSelect,
): Promise<boolean> {
  if (program.creatorId === viewerId) return true;
  if (program.teamId) {
    return canManageTeam(db, viewerId, program.teamId);
  }
  return false;
}

/**
 * Lists available training programs with filtering.
 */
export async function listPrograms(
  db: Db,
  viewerId: string,
  filters?: {
    phase?: string | undefined;
    targetLevel?: string | undefined;
    teamId?: string | undefined;
  },
) {
  const query = db.select().from(trainingPrograms);

  const conditions = [];
  if (filters?.phase) {
    conditions.push(eq(trainingPrograms.phase, filters.phase));
  }
  if (filters?.targetLevel) {
    conditions.push(eq(trainingPrograms.targetLevel, filters.targetLevel));
  }
  if (filters?.teamId) {
    conditions.push(eq(trainingPrograms.teamId, filters.teamId));
  }

  const all = await (conditions.length > 0
    ? query.where(and(...conditions))
    : query
  ).orderBy(desc(trainingPrograms.isTemplate), asc(trainingPrograms.phase), asc(trainingPrograms.name));

  // Filter based on read visibility
  const readable: typeof all = [];
  for (const prog of all) {
    if (await canReadProgram(db, viewerId, prog)) {
      readable.push(prog);
    }
  }

  // Count workouts per program
  const counts = await db
    .select({
      programId: trainingProgramWorkouts.programId,
      workoutCount: sql<number>`count(*)::int`,
    })
    .from(trainingProgramWorkouts)
    .groupBy(trainingProgramWorkouts.programId);

  const countMap = new Map(counts.map((c) => [c.programId, c.workoutCount]));

  return readable.map((p) => ({
    ...p,
    totalWorkouts: countMap.get(p.id) ?? 0,
  }));
}

/**
 * Fetches a single program with all its prescribed workouts.
 */
export async function getProgram(db: Db, viewerId: string, programId: string) {
  const [program] = await db
    .select()
    .from(trainingPrograms)
    .where(eq(trainingPrograms.id, programId));

  if (!program) {
    throw new AuthError(404, "Not Found");
  }

  const allowed = await canReadProgram(db, viewerId, program);
  if (!allowed) {
    throw new AuthError(404, "Not Found");
  }

  const workouts = await db
    .select()
    .from(trainingProgramWorkouts)
    .where(eq(trainingProgramWorkouts.programId, programId))
    .orderBy(
      asc(trainingProgramWorkouts.weekNumber),
      asc(trainingProgramWorkouts.dayNumber),
    );

  return {
    ...program,
    workouts,
  };
}

/**
 * Creates a new training program.
 */
export async function createProgram(
  db: Db,
  creatorId: string,
  input: CreateProgramInput,
) {
  if (input.teamId) {
    const canManage = await canManageTeam(db, creatorId, input.teamId);
    if (!canManage) {
      throw new AuthError(404, "Not Found");
    }
  }

  const slug =
    input.slug ||
    `${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`;

  const [program] = await db
    .insert(trainingPrograms)
    .values({
      slug,
      name: input.name,
      phase: input.phase,
      description: input.description,
      durationWeeks: input.durationWeeks ?? 4,
      daysPerWeek: input.daysPerWeek ?? 3,
      targetLevel: input.targetLevel ?? "INTERMEDIATE",
      primaryGoal: input.primaryGoal,
      isTemplate: false,
      creatorId,
      teamId: input.teamId ?? null,
      reviewed: false,
    })
    .returning();

  return {
    ...program!,
    workouts: [],
    totalWorkouts: 0,
  };
}

/**
 * Prescribes a workout day for a program.
 */
export async function addProgramWorkout(
  db: Db,
  creatorId: string,
  programId: string,
  input: AddProgramWorkoutInput,
) {
  const [program] = await db
    .select()
    .from(trainingPrograms)
    .where(eq(trainingPrograms.id, programId));

  if (!program) {
    throw new AuthError(404, "Not Found");
  }

  const allowed = await canEditProgram(db, creatorId, program);
  if (!allowed) {
    throw new AuthError(404, "Not Found");
  }

  const [workout] = await db
    .insert(trainingProgramWorkouts)
    .values({
      programId,
      weekNumber: input.weekNumber,
      dayNumber: input.dayNumber,
      title: input.title,
      focus: input.focus,
      estimatedDurationMin: input.estimatedDurationMin ?? 45,
      exercisesPrescription: input.exercisesPrescription ?? [],
    })
    .returning();

  return workout!;
}

/**
 * Enrolls an athlete in a training program.
 */
export async function enrollAthlete(
  db: Db,
  viewerId: string,
  programId: string,
  input: EnrollAthleteInput,
) {
  const targetAthleteId = input.athleteId ?? viewerId;

  const [program] = await db
    .select()
    .from(trainingPrograms)
    .where(eq(trainingPrograms.id, programId));

  if (!program) {
    throw new AuthError(404, "Not Found");
  }

  const allowed = await canAccessAthlete(db, viewerId, targetAthleteId);
  if (!allowed) {
    throw new AuthError(404, "Not Found");
  }

  const assignedByUserId = viewerId !== targetAthleteId ? viewerId : null;
  const startDate = input.startDate ?? new Date().toISOString().split("T")[0]!;

  const [enrollment] = await db
    .insert(programEnrollments)
    .values({
      programId,
      athleteId: targetAthleteId,
      assignedByUserId,
      startDate,
      currentWeek: 1,
      status: "ACTIVE",
      completedWorkoutIds: [],
      notes: input.notes ?? null,
    })
    .returning();

  return {
    ...enrollment!,
    program,
  };
}

/**
 * Lists enrollments for an athlete.
 */
export async function listEnrollments(
  db: Db,
  viewerId: string,
  targetAthleteId?: string,
) {
  const athleteId = targetAthleteId ?? viewerId;

  const allowed = await canAccessAthlete(db, viewerId, athleteId);
  if (!allowed) {
    throw new AuthError(404, "Not Found");
  }

  const enrollments = await db
    .select({
      id: programEnrollments.id,
      programId: programEnrollments.programId,
      programName: trainingPrograms.name,
      programPhase: trainingPrograms.phase,
      primaryGoal: trainingPrograms.primaryGoal,
      durationWeeks: trainingPrograms.durationWeeks,
      daysPerWeek: trainingPrograms.daysPerWeek,
      athleteId: programEnrollments.athleteId,
      assignedByUserId: programEnrollments.assignedByUserId,
      startDate: programEnrollments.startDate,
      currentWeek: programEnrollments.currentWeek,
      status: programEnrollments.status,
      completedWorkoutIds: programEnrollments.completedWorkoutIds,
      createdAt: programEnrollments.createdAt,
    })
    .from(programEnrollments)
    .innerJoin(trainingPrograms, eq(trainingPrograms.id, programEnrollments.programId))
    .where(eq(programEnrollments.athleteId, athleteId))
    .orderBy(desc(programEnrollments.createdAt));

  // Count total workouts per program
  const programIds = [...new Set(enrollments.map((e) => e.programId))];
  const workoutCounts = programIds.length > 0
    ? await db
        .select({
          programId: trainingProgramWorkouts.programId,
          count: sql<number>`count(*)::int`,
        })
        .from(trainingProgramWorkouts)
        .where(inArray(trainingProgramWorkouts.programId, programIds))
        .groupBy(trainingProgramWorkouts.programId)
    : [];

  const countMap = new Map(workoutCounts.map((w) => [w.programId, w.count]));

  return enrollments.map((e) => {
    const totalWorkouts = countMap.get(e.programId) ?? (e.durationWeeks * e.daysPerWeek);
    const completedCount = e.completedWorkoutIds?.length ?? 0;
    const adherencePercent =
      totalWorkouts > 0 ? Math.min(100, Math.round((completedCount / totalWorkouts) * 100)) : 0;

    return {
      ...e,
      totalWorkouts,
      completedCount,
      adherencePercent,
    };
  });
}

/**
 * Gets enrollment details with full workout schedule and pain status.
 */
export async function getEnrollment(
  db: Db,
  viewerId: string,
  enrollmentId: string,
) {
  const [enrollment] = await db
    .select()
    .from(programEnrollments)
    .where(eq(programEnrollments.id, enrollmentId));

  if (!enrollment) {
    throw new AuthError(404, "Not Found");
  }

  const allowed = await canAccessAthlete(db, viewerId, enrollment.athleteId);
  if (!allowed) {
    throw new AuthError(404, "Not Found");
  }

  const [program] = await db
    .select()
    .from(trainingPrograms)
    .where(eq(trainingPrograms.id, enrollment.programId));

  if (!program) {
    throw new AuthError(404, "Not Found");
  }

  const workouts = await db
    .select()
    .from(trainingProgramWorkouts)
    .where(eq(trainingProgramWorkouts.programId, enrollment.programId))
    .orderBy(
      asc(trainingProgramWorkouts.weekNumber),
      asc(trainingProgramWorkouts.dayNumber),
    );

  const completedSet = new Set(enrollment.completedWorkoutIds ?? []);

  const scheduledWorkouts = workouts.map((w) => ({
    ...w,
    completed: completedSet.has(w.id),
  }));

  const hasPain = await painReportedRecently(db, enrollment.athleteId);

  return {
    ...enrollment,
    program,
    workouts: scheduledWorkouts,
    painReportedRecently: hasPain,
    completedCount: completedSet.size,
    totalWorkouts: workouts.length,
    adherencePercent:
      workouts.length > 0 ? Math.min(100, Math.round((completedSet.size / workouts.length) * 100)) : 0,
  };
}

/**
 * Marks a workout as completed within an enrollment.
 */
export async function completeEnrollmentWorkout(
  db: Db,
  viewerId: string,
  enrollmentId: string,
  workoutId: string,
) {
  const [enrollment] = await db
    .select()
    .from(programEnrollments)
    .where(eq(programEnrollments.id, enrollmentId));

  if (!enrollment) {
    throw new AuthError(404, "Not Found");
  }

  const allowed = await canAccessAthlete(db, viewerId, enrollment.athleteId);
  if (!allowed) {
    throw new AuthError(404, "Not Found");
  }

  const completedList = Array.from(new Set([...(enrollment.completedWorkoutIds ?? []), workoutId]));

  const workouts = await db
    .select({ id: trainingProgramWorkouts.id })
    .from(trainingProgramWorkouts)
    .where(eq(trainingProgramWorkouts.programId, enrollment.programId));

  const allFinished = workouts.length > 0 && completedList.length >= workouts.length;
  const status = allFinished ? "COMPLETED" : enrollment.status;

  const [updated] = await db
    .update(programEnrollments)
    .set({
      completedWorkoutIds: completedList,
      status,
      updatedAt: new Date(),
    })
    .where(eq(programEnrollments.id, enrollmentId))
    .returning();

  return updated!;
}

/**
 * Updates status of an enrollment.
 */
export async function updateEnrollmentStatus(
  db: Db,
  viewerId: string,
  enrollmentId: string,
  status: "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED",
) {
  const [enrollment] = await db
    .select()
    .from(programEnrollments)
    .where(eq(programEnrollments.id, enrollmentId));

  if (!enrollment) {
    throw new AuthError(404, "Not Found");
  }

  const allowed = await canAccessAthlete(db, viewerId, enrollment.athleteId);
  if (!allowed) {
    throw new AuthError(404, "Not Found");
  }

  const [updated] = await db
    .update(programEnrollments)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(programEnrollments.id, enrollmentId))
    .returning();

  return updated!;
}
