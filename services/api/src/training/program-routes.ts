import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import {
  addProgramWorkout,
  completeEnrollmentWorkout,
  createProgram,
  enrollAthlete,
  getEnrollment,
  getProgram,
  listEnrollments,
  listPrograms,
  updateEnrollmentStatus,
} from "./program-service.js";

const idParam = z.object({ id: z.string().uuid() });
const idOf = (req: FastifyRequest) => idParam.parse(req.params).id;
const me = (req: FastifyRequest) => req.user!.id;
const authed = { config: { access: "authenticated" as const } };

const phaseEnum = z.enum(["OFF_SEASON", "PRE_SEASON", "IN_SEASON", "TOURNAMENT_PEAK"]);
const targetLevelEnum = z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "ELITE"]);
const primaryGoalEnum = z.enum([
  "VERTICAL_POWER",
  "HYPERTROPHY_BASE",
  "REPEAT_SPRINT_ABILITY",
  "FATIGUE_MANAGEMENT",
  "TOURNAMENT_READINESS",
]);

const createProgramBody = z.object({
  slug: z.string().trim().max(80).optional(),
  name: z.string().trim().min(3).max(150),
  phase: phaseEnum,
  description: z.string().trim().min(10).max(2000),
  durationWeeks: z.number().int().min(1).max(24).optional(),
  daysPerWeek: z.number().int().min(1).max(6).optional(),
  targetLevel: targetLevelEnum.optional(),
  primaryGoal: primaryGoalEnum,
  teamId: z.string().uuid().optional(),
});

const exercisePrescriptionSchema = z.object({
  exerciseId: z.string().uuid().optional(),
  exerciseSlug: z.string().trim(),
  exerciseName: z.string().trim(),
  orderIndex: z.number().int().min(1).max(50),
  targetSets: z.number().int().min(1).max(20),
  targetReps: z.number().int().min(1).max(100),
  targetRpe: z.number().int().min(1).max(10).optional(),
  restSeconds: z.number().int().min(0).max(600).optional(),
  notes: z.string().trim().max(255).optional(),
});

const addWorkoutBody = z.object({
  weekNumber: z.number().int().min(1).max(24),
  dayNumber: z.number().int().min(1).max(7),
  title: z.string().trim().min(3).max(150),
  focus: z.string().trim().max(64),
  estimatedDurationMin: z.number().int().min(10).max(180).optional(),
  exercisesPrescription: z.array(exercisePrescriptionSchema).optional(),
});

const enrollBody = z.object({
  athleteId: z.string().uuid().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().trim().max(500).optional(),
});

const completeWorkoutBody = z.object({
  workoutId: z.string().uuid(),
});

const updateStatusBody = z.object({
  status: z.enum(["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"]),
});

export function registerPeriodizationPrograms(app: FastifyInstance, db: Db) {
  // List training programs (public templates + accessible custom programs)
  app.get("/api/v1/training/programs", authed, async (req) => {
    const query = z
      .object({
        phase: phaseEnum.optional(),
        targetLevel: targetLevelEnum.optional(),
        teamId: z.string().uuid().optional(),
      })
      .parse(req.query);

    return { items: await listPrograms(db, me(req), query) };
  });

  // Get specific program with scheduled workouts
  app.get("/api/v1/training/programs/:id", authed, async (req) => {
    return getProgram(db, me(req), idOf(req));
  });

  // Create custom program
  app.post("/api/v1/training/programs", authed, async (req, reply) => {
    const body = createProgramBody.parse(req.body);
    const created = await createProgram(db, me(req), body);
    return reply.status(201).send(created);
  });

  // Add prescribed workout day
  app.post("/api/v1/training/programs/:id/workouts", authed, async (req, reply) => {
    const body = addWorkoutBody.parse(req.body);
    const workout = await addProgramWorkout(db, me(req), idOf(req), body);
    return reply.status(201).send(workout);
  });

  // Enroll in program
  app.post("/api/v1/training/programs/:id/enroll", authed, async (req, reply) => {
    const body = enrollBody.parse(req.body ?? {});
    const enrollment = await enrollAthlete(db, me(req), idOf(req), body);
    return reply.status(201).send(enrollment);
  });

  // List athlete enrollments
  app.get("/api/v1/training/enrollments", authed, async (req) => {
    const query = z
      .object({ athleteId: z.string().uuid().optional() })
      .parse(req.query);

    return { items: await listEnrollments(db, me(req), query.athleteId) };
  });

  // Get single enrollment progress & schedule
  app.get("/api/v1/training/enrollments/:id", authed, async (req) => {
    return getEnrollment(db, me(req), idOf(req));
  });

  // Mark prescribed workout completed
  app.post("/api/v1/training/enrollments/:id/complete-workout", authed, async (req) => {
    const { workoutId } = completeWorkoutBody.parse(req.body);
    return completeEnrollmentWorkout(db, me(req), idOf(req), workoutId);
  });

  // Update enrollment status
  app.patch("/api/v1/training/enrollments/:id/status", authed, async (req) => {
    const { status } = updateStatusBody.parse(req.body);
    return updateEnrollmentStatus(db, me(req), idOf(req), status);
  });
}
