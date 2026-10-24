import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import {
  addShortlistMember,
  createShortlist,
  getScoutProfile,
  getShortlist,
  listShortlists,
  removeShortlistMember,
  searchTalentPool,
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
}
