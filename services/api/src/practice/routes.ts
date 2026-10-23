import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { AuthError } from "../identity/service.js";
import {
  createPractice,
  getPractice,
  listPractices,
  updatePractice,
  recordPracticeAttendance,
  deletePractice,
  createDrill,
  listDrills,
} from "./service.js";

const me = (req: FastifyRequest) => req.user!.id;
const authed = { config: { access: "authenticated" as const } };

const idParam = z.object({ id: z.string().uuid() });
const teamIdParam = z.object({ teamId: z.string().uuid() });
const idOf = (req: FastifyRequest) => idParam.parse(req.params).id;
const teamIdOf = (req: FastifyRequest) => teamIdParam.parse(req.params).teamId;

const blockSchema = z.object({
  id: z.string().min(1).max(50),
  order: z.number().int().min(1).max(50),
  drillId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(120),
  category: z.enum(["WARMUP", "TECHNICAL", "TACTICAL", "SCRIMMAGE", "COOLDOWN"]),
  durationMins: z.number().int().min(1).max(180),
  notes: z.string().trim().max(1000).optional(),
  playId: z.string().uuid().optional(),
  clipId: z.string().uuid().optional(),
});

const createPracticeBody = z.object({
  title: z.string().trim().min(1).max(120),
  scheduledAt: z.string().datetime(),
  location: z.string().trim().max(120).optional(),
  focus: z.string().trim().max(250).optional(),
  notes: z.string().trim().max(2000).optional(),
  blocks: z.array(blockSchema).min(1),
});

const updatePracticeBody = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  scheduledAt: z.string().datetime().optional(),
  location: z.string().trim().max(120).optional(),
  focus: z.string().trim().max(250).optional(),
  notes: z.string().trim().max(2000).optional(),
  blocks: z.array(blockSchema).min(1).optional(),
  status: z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
});

const attendanceRecordSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["PRESENT", "ABSENT", "EXCUSED", "INJURED"]),
  note: z.string().trim().max(250).optional(),
});

const attendanceBody = z.object({
  attendance: z.array(attendanceRecordSchema),
});

const createDrillBody = z.object({
  title: z.string().trim().min(1).max(120),
  category: z.enum(["WARMUP", "TECHNICAL", "TACTICAL", "SCRIMMAGE", "COOLDOWN"]),
  intensity: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  suggestedDurationMins: z.number().int().min(1).max(120).default(10),
  brief: z.string().trim().max(1000).optional(),
  playId: z.string().uuid().optional(),
  clipId: z.string().uuid().optional(),
  tags: z.array(z.string().trim().max(40)).default([]),
});

export function registerPracticeRoutes(app: FastifyInstance, db: Db) {
  // 1. Create a practice session for a team
  app.post("/api/v1/teams/:teamId/practices", authed, async (req, reply) => {
    const body = createPracticeBody.parse(req.body);
    const practice = await createPractice(db, me(req), teamIdOf(req), body);
    return reply.status(201).send(practice);
  });

  // 2. List practice sessions for a team
  app.get("/api/v1/teams/:teamId/practices", authed, async (req) => {
    const items = await listPractices(db, me(req), teamIdOf(req));
    return { items };
  });

  // 3. Get single practice session details
  app.get("/api/v1/practices/:id", authed, async (req) => {
    const practice = await getPractice(db, me(req), idOf(req));
    if (!practice) {
      throw new AuthError(404, "Practice session not found");
    }
    return practice;
  });

  // 4. Update practice session
  app.put("/api/v1/practices/:id", authed, async (req) => {
    const body = updatePracticeBody.parse(req.body);
    const updated = await updatePractice(db, me(req), idOf(req), body);
    return updated;
  });

  // 5. Record player attendance
  app.post("/api/v1/practices/:id/attendance", authed, async (req) => {
    const { attendance } = attendanceBody.parse(req.body);
    const updated = await recordPracticeAttendance(db, me(req), idOf(req), attendance);
    return updated;
  });

  // 6. Delete practice session
  app.delete("/api/v1/practices/:id", authed, async (req, reply) => {
    await deletePractice(db, me(req), idOf(req));
    return reply.status(204).send();
  });

  // 7. List drill catalog for a team
  app.get("/api/v1/teams/:teamId/drills", authed, async (req) => {
    const query = z.object({ category: z.string().optional() }).parse(req.query);
    const items = await listDrills(db, me(req), teamIdOf(req), query);
    return { items };
  });

  // 8. Create custom drill for a team
  app.post("/api/v1/teams/:teamId/drills", authed, async (req, reply) => {
    const body = createDrillBody.parse(req.body);
    const drill = await createDrill(db, me(req), teamIdOf(req), body);
    return reply.status(201).send(drill);
  });
}
