import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import type { Cohort } from "./normative-benchmarks.js";
import {
  addAttempt,
  createSession,
  deleteAttempt,
  getAthleteCombineProfile,
  getBenchmarks,
  getSession,
  listProtocols,
  listSessions,
} from "./testing-service.js";

const idParam = z.object({ id: z.string().uuid() });
const userParam = z.object({ userId: z.string().uuid() });
const idOf = (req: FastifyRequest) => idParam.parse(req.params).id;
const userIdOf = (req: FastifyRequest) => userParam.parse(req.params).userId;
const me = (req: FastifyRequest) => req.user!.id;
const authed = { config: { access: "authenticated" as const } };

const cohortEnum = z.enum([
  "U14_MALE",
  "U14_FEMALE",
  "U16_MALE",
  "U16_FEMALE",
  "U18_MALE",
  "U18_FEMALE",
  "COLLEGIATE_MALE",
  "COLLEGIATE_FEMALE",
  "PRO_MALE",
  "PRO_FEMALE",
]);

const createSessionBody = z.object({
  targetUserId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  testDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  location: z.string().trim().max(120).optional(),
  surface: z.enum(["HARDWOOD", "SYNTHETIC", "ASPHALT", "OTHER"]).optional(),
  environmentalNotes: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(1000).optional(),
});

const addAttemptBody = z.object({
  protocolId: z.string().uuid(),
  attemptNumber: z.number().int().min(1).max(20).optional(),
  rawValue: z.number().min(0).max(5000),
  isFault: z.boolean().optional(),
  faultReason: z.string().trim().max(120).optional(),
  instrumentType: z
    .enum([
      "VERTEC_VANES",
      "CONTACT_MAT",
      "OPTICAL_SYSTEM",
      "TIMING_GATES_DUAL_BEAM",
      "TIMING_GATES_SINGLE_BEAM",
      "STOPWATCH_MANUAL",
      "CV_ESTIMATE",
    ])
    .optional(),
  instrumentDetails: z
    .object({
      model: z.string().max(100).optional(),
      serialNumber: z.string().max(100).optional(),
      beamHeightCm: z.number().min(0).max(250).optional(),
      calibrationDate: z.string().max(30).optional(),
    })
    .optional(),
  sourceType: z.enum(["OFFICIAL", "COACH", "SELF_REPORTED", "CV_ESTIMATE"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
  notes: z.string().trim().max(255).optional(),
});

export function registerAthleticTesting(app: FastifyInstance, db: Db) {
  // Public protocols catalog
  app.get("/api/v1/athletic-testing/protocols", { config: { access: "public" } }, async () => {
    return { items: await listProtocols(db) };
  });

  // Public normative benchmarks
  app.get("/api/v1/athletic-testing/benchmarks", { config: { access: "public" } }, async (req) => {
    const { cohort } = z
      .object({ cohort: cohortEnum.optional() })
      .parse(req.query);
    return { items: getBenchmarks((cohort as Cohort) ?? "COLLEGIATE_MALE") };
  });

  // Create test session
  app.post("/api/v1/athletic-testing/sessions", authed, async (req, reply) => {
    const body = createSessionBody.parse(req.body);
    const session = await createSession(db, me(req), body);
    return reply.status(201).send(session);
  });

  // List test sessions
  app.get("/api/v1/athletic-testing/sessions", authed, async (req) => {
    const { userId } = z
      .object({ userId: z.string().uuid().optional() })
      .parse(req.query);
    return { items: await listSessions(db, me(req), userId) };
  });

  // Get test session details
  app.get("/api/v1/athletic-testing/sessions/:id", authed, async (req) => {
    const { cohort } = z
      .object({ cohort: cohortEnum.optional() })
      .parse(req.query);
    return getSession(db, me(req), idOf(req), (cohort as Cohort) ?? "COLLEGIATE_MALE");
  });

  // Record an attempt
  app.post("/api/v1/athletic-testing/sessions/:id/attempts", authed, async (req, reply) => {
    const body = addAttemptBody.parse(req.body);
    const attempt = await addAttempt(db, me(req), idOf(req), body);
    return reply.status(201).send(attempt);
  });

  // Delete an attempt
  app.delete("/api/v1/athletic-testing/attempts/:id", authed, async (req, reply) => {
    await deleteAttempt(db, me(req), idOf(req));
    return reply.status(204).send();
  });

  // Athlete combine profile & signature
  app.get("/api/v1/athletic-testing/athletes/:userId/profile", authed, async (req) => {
    const { cohort } = z
      .object({ cohort: cohortEnum.optional() })
      .parse(req.query);
    return getAthleteCombineProfile(db, me(req), userIdOf(req), (cohort as Cohort) ?? "COLLEGIATE_MALE");
  });
}
