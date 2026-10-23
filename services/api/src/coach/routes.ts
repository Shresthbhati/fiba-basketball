import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import {
  createAssignment,
  getAssignment,
  listAssignments,
  submitAssignment,
  reviewSubmission,
  getCoachDashboard,
} from "./service.js";

const me = (req: FastifyRequest) => req.user!.id;
const authed = { config: { access: "authenticated" as const } };

const idParam = z.object({ id: z.string().uuid() });
const teamIdParam = z.object({ teamId: z.string().uuid() });
const idOf = (req: FastifyRequest) => idParam.parse(req.params).id;
const teamIdOf = (req: FastifyRequest) => teamIdParam.parse(req.params).teamId;

const quizQuestionSchema = z.object({
  id: z.string().min(1).max(50),
  question: z.string().trim().min(1).max(300),
  options: z.array(z.string().trim().min(1).max(200)).min(2).max(6),
  correctOptionIndex: z.number().int().min(0).max(5),
});

const resourceRefSchema = z.object({
  type: z.enum([
    "FILM_CLIP",
    "SCOUTING_MONTAGE",
    "TACTICAL_PLAY",
    "PRACTICE_DRILL",
    "ASSESSMENT",
    "WORKOUT",
  ]),
  id: z.string().min(1).max(100),
  title: z.string().trim().max(120).optional(),
});

const createAssignmentBody = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  type: z.enum([
    "FILM_STUDY",
    "DRILL_PRACTICE",
    "WORKOUT_PRESCRIPTION",
    "MOVEMENT_ASSESSMENT",
  ]),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  dueAt: z.string().datetime().optional(),
  resourceRef: resourceRefSchema.optional(),
  quizQuestions: z.array(quizQuestionSchema).optional(),
  targetAthleteIds: z.array(z.string().uuid()).optional(),
});

const submitAssignmentBody = z.object({
  answers: z.object({
    selectedOptions: z.record(z.string(), z.number().int()).optional(),
    athleteNotes: z.string().trim().max(1000).optional(),
    resourceId: z.string().uuid().optional(),
  }),
});

const reviewSubmissionBody = z.object({
  status: z.enum(["REVIEWED", "REVISION_REQUESTED"]),
  coachNotes: z.string().trim().max(1000).optional(),
  score: z.number().int().min(0).max(100).optional(),
});

export function registerCoachRoutes(app: FastifyInstance, db: Db) {
  // 1. Create an assignment for a team
  app.post("/api/v1/teams/:teamId/assignments", authed, async (req, reply) => {
    const body = createAssignmentBody.parse(req.body);
    const assignment = await createAssignment(db, me(req), teamIdOf(req), body);
    return reply.status(201).send(assignment);
  });

  // 2. List assignments for a team (filtered appropriately for coach or athlete)
  app.get("/api/v1/teams/:teamId/assignments", authed, async (req) => {
    const items = await listAssignments(db, me(req), teamIdOf(req));
    return { items };
  });

  // 3. Get single assignment details
  app.get("/api/v1/assignments/:id", authed, async (req) => {
    const assignment = await getAssignment(db, me(req), idOf(req));
    return assignment;
  });

  // 4. Submit assignment (athlete)
  app.post("/api/v1/assignments/:id/submissions", authed, async (req, reply) => {
    const body = submitAssignmentBody.parse(req.body);
    const submission = await submitAssignment(db, me(req), idOf(req), body);
    return reply.status(201).send(submission);
  });

  // 5. Review submission (coach)
  app.put("/api/v1/submissions/:id/review", authed, async (req) => {
    const body = reviewSubmissionBody.parse(req.body);
    const updated = await reviewSubmission(db, me(req), idOf(req), body);
    return updated;
  });

  // 6. Coach Dashboard metrics & review queue
  app.get("/api/v1/teams/:teamId/coach-dashboard", authed, async (req) => {
    const dashboard = await getCoachDashboard(db, me(req), teamIdOf(req));
    return dashboard;
  });
}
