import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import {
  createCandidateEvent,
  findSimilarPlays,
  generatePlayEmbedding,
  getScenarioSimulation,
  listCandidateEvents,
  listModels,
  listTeamSimulations,
  promoteModel,
  registerModel,
  reviewCandidateEvent,
  rollbackModel,
  simulateScenario,
  type DefensiveCoverageType,
  type TacticalCandidateEventType,
  type TacticalCandidateStatus,
} from "./tactical-service.js";

const authed = { config: { access: "authenticated" as const } };

const createCandidateBody = z.object({
  gameId: z.string().uuid(),
  clipId: z.string().uuid().optional(),
  teamId: z.string().uuid(),
  eventType: z.enum([
    "PICK_AND_ROLL",
    "POP",
    "SCREEN_AWAY",
    "DRIVE_AND_KICK",
    "CUT_TO_RIM",
    "ISOLATION",
    "POST_UP",
    "TRANSITION_BREAK",
  ]),
  timestampSeconds: z.number().nonnegative(),
  courtCoordinates: z.object({
    x: z.number(),
    y: z.number(),
    endX: z.number().optional(),
    endY: z.number().optional(),
  }),
  involvedPlayerIds: z.array(z.string().uuid()).optional(),
  confidenceScore: z.number().min(0).max(1),
  modelVersion: z.string().optional(),
});

const reviewCandidateBody = z.object({
  status: z.enum(["CONFIRMED", "REJECTED", "ADJUSTED"]),
  reviewNotes: z.string().optional(),
  adjustedEventType: z
    .enum([
      "PICK_AND_ROLL",
      "POP",
      "SCREEN_AWAY",
      "DRIVE_AND_KICK",
      "CUT_TO_RIM",
      "ISOLATION",
      "POST_UP",
      "TRANSITION_BREAK",
    ])
    .optional(),
  adjustedCoordinates: z
    .object({
      x: z.number(),
      y: z.number(),
      endX: z.number().optional(),
      endY: z.number().optional(),
    })
    .optional(),
});

const simulateScenarioBody = z.object({
  teamId: z.string().uuid(),
  playId: z.string().uuid().optional(),
  title: z.string().min(1),
  coverageType: z.enum(["DROP", "SWITCH", "BLITZ_TRAP", "HEDGE_AND_RECOVER", "ICE_WEAK", "HELP_AND_RECOVER"]),
  offensiveSetup: z.record(z.string(), z.unknown()).optional(),
  defensiveResponse: z.record(z.string(), z.unknown()).optional(),
});

const registerModelBody = z.object({
  modelVersion: z.string().min(1),
  modelType: z.enum(["CV_TRACKING", "TACTICAL_CANDIDATE", "PLAY_EMBEDDING", "COVERAGE_SIMULATOR"]),
  benchmarkDataset: z.string().min(1),
  metrics: z.object({
    accuracy: z.number().min(0).max(1),
    f1Score: z.number().min(0).max(1),
    precision: z.number().min(0).max(1),
    recall: z.number().min(0).max(1),
    sampleSize: z.number().int().positive(),
  }),
  status: z.enum(["CANDIDATE", "ACTIVE", "DEPRECATED", "ROLLED_BACK"]).optional(),
});

export function registerTacticalRoutes(app: FastifyInstance, db: Db) {
  // WP-7.1: Propose candidate tracking event (SourceType.MODEL_INFERENCE)
  app.post("/api/v1/tactical/candidates", authed, async (req: FastifyRequest, reply) => {
    const body = createCandidateBody.parse(req.body);
    const candidate = await createCandidateEvent(db, req.user!.id, {
      ...body,
      eventType: body.eventType as TacticalCandidateEventType,
    });
    return reply.status(201).send(candidate);
  });

  // WP-7.1: List team candidate events in human review queue
  app.get("/api/v1/tactical/teams/:teamId/candidates", authed, async (req: FastifyRequest<{ Params: { teamId: string }; Querystring: { gameId?: string; status?: string; minConfidence?: string } }>, reply) => {
    const minConfidence = req.query.minConfidence ? Number.parseFloat(req.query.minConfidence) : undefined;
    const candidates = await listCandidateEvents(db, req.user!.id, req.params.teamId, {
      gameId: req.query.gameId,
      status: req.query.status as TacticalCandidateStatus | undefined,
      minConfidence: Number.isNaN(minConfidence) ? undefined : minConfidence,
    });
    return reply.send({ candidates, count: candidates.length });
  });

  // WP-7.1: Review candidate event (CONFIRMED / REJECTED / ADJUSTED)
  app.patch("/api/v1/tactical/candidates/:id/review", authed, async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const body = reviewCandidateBody.parse(req.body);
    const reviewed = await reviewCandidateEvent(db, req.user!.id, req.params.id, {
      status: body.status as TacticalCandidateStatus,
      reviewNotes: body.reviewNotes,
      adjustedEventType: body.adjustedEventType as TacticalCandidateEventType | undefined,
      adjustedCoordinates: body.adjustedCoordinates,
    });
    return reply.send(reviewed);
  });

  // WP-7.2: Generate or refresh play diagram vector embedding
  app.post("/api/v1/tactical/plays/:playId/embeddings", authed, async (req: FastifyRequest<{ Params: { playId: string } }>, reply) => {
    const embedding = await generatePlayEmbedding(db, req.user!.id, req.params.playId);
    return reply.status(201).send(embedding);
  });

  // WP-7.2: Find similar tactical plays by cosine distance
  app.get("/api/v1/tactical/plays/:playId/similar", authed, async (req: FastifyRequest<{ Params: { playId: string }; Querystring: { limit?: string; minSimilarity?: string } }>, reply) => {
    const limit = req.query.limit ? Number.parseInt(req.query.limit, 10) : undefined;
    const minSimilarity = req.query.minSimilarity ? Number.parseFloat(req.query.minSimilarity) : undefined;
    const similar = await findSimilarPlays(db, req.user!.id, req.params.playId, {
      limit: Number.isNaN(limit) ? undefined : limit,
      minSimilarity: Number.isNaN(minSimilarity) ? undefined : minSimilarity,
    });
    return reply.send({ matches: similar, total: similar.length });
  });

  // WP-7.3: Run Level 3 Rule-Based Scenario Simulation
  app.post("/api/v1/tactical/simulations", authed, async (req: FastifyRequest, reply) => {
    const body = simulateScenarioBody.parse(req.body);
    const simulation = await simulateScenario(db, req.user!.id, {
      ...body,
      coverageType: body.coverageType as DefensiveCoverageType,
    });
    return reply.status(201).send(simulation);
  });

  // WP-7.3: Get scenario simulation details
  app.get("/api/v1/tactical/simulations/:id", authed, async (req: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const simulation = await getScenarioSimulation(db, req.user!.id, req.params.id);
    return reply.send(simulation);
  });

  // WP-7.3: List simulations for team
  app.get("/api/v1/tactical/teams/:teamId/simulations", authed, async (req: FastifyRequest<{ Params: { teamId: string } }>, reply) => {
    const simulations = await listTeamSimulations(db, req.user!.id, req.params.teamId);
    return reply.send({ simulations, count: simulations.length });
  });

  // WP-7.4: Register tactical model in registry
  app.post("/api/v1/tactical/models", authed, async (req: FastifyRequest, reply) => {
    const body = registerModelBody.parse(req.body);
    const model = await registerModel(db, req.user!.id, body);
    return reply.status(201).send(model);
  });

  // WP-7.4: List models in registry
  app.get("/api/v1/tactical/models", authed, async (req: FastifyRequest<{ Querystring: { modelType?: string; status?: string } }>, reply) => {
    const models = await listModels(db, req.query);
    return reply.send({ models, count: models.length });
  });

  // WP-7.4: Promote model to ACTIVE
  app.post("/api/v1/tactical/models/:modelVersion/promote", authed, async (req: FastifyRequest<{ Params: { modelVersion: string } }>, reply) => {
    const promoted = await promoteModel(db, req.user!.id, req.params.modelVersion);
    return reply.send(promoted);
  });

  // WP-7.4: Rollback model
  app.post("/api/v1/tactical/models/:modelVersion/rollback", authed, async (req: FastifyRequest<{ Params: { modelVersion: string }; Body: { reason?: string } }>, reply) => {
    const reason = (req.body as { reason?: string } | undefined)?.reason ?? "Manual administrative rollback";
    const rolledBack = await rollbackModel(db, req.user!.id, req.params.modelVersion, reason);
    return reply.send(rolledBack);
  });
}
