import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import {
  createOrUpdateFreeAgentListing,
  draftPlayerFromPool,
  getMyFreeAgentListing,
  invitePlayerToTeam,
  joinCompetitionDraftPool,
  listCompetitionDraftPool,
  listFreeAgents,
  listMyInvitations,
  listTeamInvitations,
  respondToTeamInvitation,
} from "./free-agent.js";

const me = (req: FastifyRequest) => req.user!.id;
const authed = { config: { access: "authenticated" as const } };
const publicAccess = { config: { access: "public" as const } };

const freeAgentBody = z.object({
  city: z.string().trim().min(1).max(100),
  primaryPosition: z.enum(["PG", "SG", "SF", "PF", "C"]),
  secondaryPositions: z.array(z.enum(["PG", "SG", "SF", "PF", "C"])).optional(),
  skillLevel: z.enum(["OPEN", "CASUAL", "INTERMEDIATE", "COMPETITIVE"]).optional(),
  experienceYears: z.number().int().min(0).max(50).optional(),
  availability: z.enum(["WEEKDAYS", "WEEKENDS", "EVENINGS", "ANYTIME"]).optional(),
  bio: z.string().trim().max(1000).optional(),
  linkedCommunityId: z.string().uuid().optional(),
});

const freeAgentQuery = z.object({
  city: z.string().optional(),
  position: z.string().optional(),
  skillLevel: z.string().optional(),
  availability: z.string().optional(),
});

const teamParam = z.object({ id: z.string().uuid() });
const compParam = z.object({ id: z.string().uuid() });
const inviteParam = z.object({ id: z.string().uuid() });
const draftParam = z.object({ id: z.string().uuid(), poolId: z.string().uuid() });

const inviteBody = z.object({
  userId: z.string().uuid(),
  role: z.enum(["PLAYER", "COACH"]).optional(),
  message: z.string().trim().max(500).optional(),
});

const respondBody = z.object({
  action: z.enum(["ACCEPTED", "DECLINED"]),
});

const joinDraftBody = z.object({
  primaryPosition: z.enum(["PG", "SG", "SF", "PF", "C"]),
  skillLevel: z.enum(["OPEN", "CASUAL", "INTERMEDIATE", "COMPETITIVE"]).optional(),
});

const draftPickBody = z.object({
  teamId: z.string().uuid(),
  round: z.number().int().min(1).optional(),
  pick: z.number().int().min(1).optional(),
});

export function registerFreeAgentRoutes(app: FastifyInstance, db: Db) {
  // Free Agent listings
  app.post("/api/v1/free-agents", authed, async (req, reply) => {
    const body = freeAgentBody.parse(req.body);
    const listing = await createOrUpdateFreeAgentListing(db, me(req), body);
    return reply.status(201).send(listing);
  });

  app.get("/api/v1/free-agents", publicAccess, async (req) => {
    const q = freeAgentQuery.parse(req.query);
    const items = await listFreeAgents(db, q);
    return { items };
  });

  app.get("/api/v1/free-agents/mine", authed, async (req) => {
    const item = await getMyFreeAgentListing(db, me(req));
    return { item };
  });

  // Team Invitations
  app.post("/api/v1/teams/:id/invitations", authed, async (req, reply) => {
    const { id } = teamParam.parse(req.params);
    const body = inviteBody.parse(req.body);
    const invitation = await invitePlayerToTeam(db, id, me(req), body);
    return reply.status(201).send(invitation);
  });

  app.get("/api/v1/teams/:id/invitations", authed, async (req) => {
    const { id } = teamParam.parse(req.params);
    const items = await listTeamInvitations(db, id, me(req));
    return { items };
  });

  app.get("/api/v1/me/team-invitations", authed, async (req) => {
    const items = await listMyInvitations(db, me(req));
    return { items };
  });

  app.post("/api/v1/me/team-invitations/:id/respond", authed, async (req) => {
    const { id } = inviteParam.parse(req.params);
    const { action } = respondBody.parse(req.body);
    const result = await respondToTeamInvitation(db, id, me(req), action);
    return result;
  });

  // Competition Draft Pool
  app.post("/api/v1/competitions/:id/draft-pool", authed, async (req, reply) => {
    const { id } = compParam.parse(req.params);
    const body = joinDraftBody.parse(req.body);
    const entry = await joinCompetitionDraftPool(db, id, me(req), body);
    return reply.status(201).send(entry);
  });

  app.get("/api/v1/competitions/:id/draft-pool", publicAccess, async (req) => {
    const { id } = compParam.parse(req.params);
    const items = await listCompetitionDraftPool(db, id);
    return { items };
  });

  app.post("/api/v1/competitions/:id/draft-pool/:poolId/draft", authed, async (req) => {
    const { id, poolId } = draftParam.parse(req.params);
    const body = draftPickBody.parse(req.body);
    const result = await draftPlayerFromPool(db, id, poolId, me(req), body);
    return result;
  });
}
