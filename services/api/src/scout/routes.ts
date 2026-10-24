import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import {
  addShortlistMember,
  createScoutEvaluation,
  createShortlist,
  deleteScoutEvaluation,
  getAthleteConsensusEvaluation,
  getScoutEvaluation,
  getScoutProfile,
  getShortlist,
  listScoutEvaluationsForAthlete,
  listShortlists,
  removeShortlistMember,
  searchTalentPool,
  updateScoutEvaluation,
  updateShortlistMember,
  upsertScoutProfile,
} from "./service.js";

const me = (req: FastifyRequest) => req.user!.id;
const authed = { config: { access: "authenticated" as const } };

const profileBody = z.object({
  organization: z.string().trim().min(2).max(120),
  roleTitle: z.string().trim().min(2).max(100),
  notes: z.string().trim().max(1000).optional(),
});

const talentSearchQuery = z.object({
  position: z.string().max(8).optional(),
  minGraduationYear: z.coerce.number().int().min(2020).max(2040).optional(),
  maxGraduationYear: z.coerce.number().int().min(2020).max(2040).optional(),
  minVerticalJumpCm: z.coerce.number().min(30).max(150).optional(),
  maxSprintSeconds: z.coerce.number().min(2.5).max(6.0).optional(),
  minPointsPerGame: z.coerce.number().min(0).max(60).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const shortlistBody = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  isSharedWithOrg: z.boolean().default(false),
});

const memberBody = z.object({
  athleteId: z.string().uuid(),
  evaluationTier: z
    .enum(["WATCHLIST", "HIGH_PRIORITY", "CONTACTED", "OFFERED", "COMMITTED", "PASSED"])
    .default("WATCHLIST"),
  scoutNotes: z.string().trim().max(1000).optional(),
});

const updateMemberBody = z.object({
  evaluationTier: z
    .enum(["WATCHLIST", "HIGH_PRIORITY", "CONTACTED", "OFFERED", "COMMITTED", "PASSED"])
    .optional(),
  scoutNotes: z.string().trim().max(1000).optional(),
});

const shortlistParam = z.object({ id: z.string().uuid() });
const memberParam = z.object({
  id: z.string().uuid(),
  memberId: z.string().uuid(),
});

export function registerScoutRoutes(app: FastifyInstance, db: Db) {
  // Upsert current user's scout profile
  app.post("/api/v1/scout/profile", authed, async (req) => {
    const body = profileBody.parse(req.body);
    const profile = await upsertScoutProfile(db, me(req), body);
    return profile;
  });

  // Get current user's scout profile
  app.get("/api/v1/scout/profile", authed, async (req) => {
    const profile = await getScoutProfile(db, me(req));
    return { profile };
  });

  // Search empirical talent pool (minors excluded by default; pure empirical stats)
  app.get("/api/v1/scout/talent-search", authed, async (req) => {
    const query = talentSearchQuery.parse(req.query);
    const items = await searchTalentPool(db, me(req), query);
    return { items };
  });

  // Shortlists: Create
  app.post("/api/v1/scout/shortlists", authed, async (req, reply) => {
    const body = shortlistBody.parse(req.body);
    const list = await createShortlist(db, me(req), body);
    return reply.status(201).send(list);
  });

  // Shortlists: List
  app.get("/api/v1/scout/shortlists", authed, async (req) => {
    const items = await listShortlists(db, me(req));
    return { items };
  });

  // Shortlists: Get by ID (negative authZ: 404 for non-owners)
  app.get("/api/v1/scout/shortlists/:id", authed, async (req) => {
    const { id } = shortlistParam.parse(req.params);
    const list = await getShortlist(db, id, me(req));
    return list;
  });

  // Shortlists: Add member
  app.post("/api/v1/scout/shortlists/:id/members", authed, async (req, reply) => {
    const { id } = shortlistParam.parse(req.params);
    const body = memberBody.parse(req.body);
    const member = await addShortlistMember(db, id, me(req), body);
    return reply.status(201).send(member);
  });

  // Shortlists: Update member evaluation tier or notes
  app.patch("/api/v1/scout/shortlists/:id/members/:memberId", authed, async (req) => {
    const { id, memberId } = memberParam.parse(req.params);
    const body = updateMemberBody.parse(req.body);
    const member = await updateShortlistMember(db, id, memberId, me(req), body);
    return member;
  });

  // Shortlists: Remove member
  app.delete("/api/v1/scout/shortlists/:id/members/:memberId", authed, async (req, reply) => {
    const { id, memberId } = memberParam.parse(req.params);
    await removeShortlistMember(db, id, memberId, me(req));
    return reply.status(204).send();
  });

  // -------------------------------------------------------------------------
  // 20-80 Scale Talent Evaluation Cards (Spec §13.1–§13.4, §14.2)
  // -------------------------------------------------------------------------

  const gradeSchema = z.coerce.number().int().min(20).max(80);

  const createEvaluationBody = z.object({
    athleteId: z.string().uuid(),
    gameContext: z.enum(["LIVE_GAME", "FILM_REVIEW", "COMBINE_WORKOUT", "TOURNAMENT", "PRACTICE"]).default("LIVE_GAME"),
    matchId: z.string().uuid().optional(),
    projectedRole: z.string().trim().max(50).default("VERSATILE_ROTATION"),
    playerComparison: z.string().trim().max(100).optional(),
    shootingPresent: gradeSchema.optional(),
    shootingFuture: gradeSchema.optional(),
    finishingPresent: gradeSchema.optional(),
    finishingFuture: gradeSchema.optional(),
    playmakingPresent: gradeSchema.optional(),
    playmakingFuture: gradeSchema.optional(),
    perimeterDefensePresent: gradeSchema.optional(),
    perimeterDefenseFuture: gradeSchema.optional(),
    interiorDefensePresent: gradeSchema.optional(),
    interiorDefenseFuture: gradeSchema.optional(),
    reboundingPresent: gradeSchema.optional(),
    reboundingFuture: gradeSchema.optional(),
    athleticismPresent: gradeSchema.optional(),
    athleticismFuture: gradeSchema.optional(),
    basketballIqPresent: gradeSchema.optional(),
    basketballIqFuture: gradeSchema.optional(),
    overallPresent: gradeSchema.optional(),
    overallFuture: gradeSchema.optional(),
    strengthsSummary: z.string().trim().min(3).max(2000),
    weaknessesSummary: z.string().trim().min(3).max(2000),
    swingSkills: z.string().trim().max(1000).optional(),
    intangiblesNotes: z.string().trim().max(1000).optional(),
    isSharedWithOrg: z.boolean().default(false),
  });

  const updateEvaluationBody = createEvaluationBody.partial();
  const evalParam = z.object({ id: z.string().uuid() });
  const athleteParam = z.object({ athleteId: z.string().uuid() });

  // Create 20-80 evaluation card
  app.post("/api/v1/scout/evaluations", authed, async (req, reply) => {
    const body = createEvaluationBody.parse(req.body);
    const evaluation = await createScoutEvaluation(db, me(req), body);
    return reply.status(201).send(evaluation);
  });

  // Get evaluation card (negative authZ: 404 for unauthorized users per ADR-0010)
  app.get("/api/v1/scout/evaluations/:id", authed, async (req) => {
    const { id } = evalParam.parse(req.params);
    const evaluation = await getScoutEvaluation(db, id, me(req));
    return evaluation;
  });

  // Update evaluation card (author only)
  app.patch("/api/v1/scout/evaluations/:id", authed, async (req) => {
    const { id } = evalParam.parse(req.params);
    const body = updateEvaluationBody.parse(req.body);
    const updated = await updateScoutEvaluation(db, id, me(req), body);
    return updated;
  });

  // Delete evaluation card (author only)
  app.delete("/api/v1/scout/evaluations/:id", authed, async (req, reply) => {
    const { id } = evalParam.parse(req.params);
    await deleteScoutEvaluation(db, id, me(req));
    return reply.status(204).send();
  });

  // List visible evaluations for an athlete
  app.get("/api/v1/scout/athletes/:athleteId/evaluations", authed, async (req) => {
    const { athleteId } = athleteParam.parse(req.params);
    const items = await listScoutEvaluationsForAthlete(db, athleteId, me(req));
    return { items };
  });

  // Get consensus evaluation for an athlete
  app.get("/api/v1/scout/athletes/:athleteId/consensus", authed, async (req) => {
    const { athleteId } = athleteParam.parse(req.params);
    const consensus = await getAthleteConsensusEvaluation(db, athleteId, me(req));
    return consensus;
  });
}
