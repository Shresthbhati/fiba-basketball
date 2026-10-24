import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import {
  createCommunity,
  getCommunityById,
  joinCommunity,
  leaveCommunity,
  listCommunities,
  listCommunityGames,
  listCommunityMembers,
} from "./service.js";

const me = (req: FastifyRequest) => req.user!.id;
const authed = { config: { access: "authenticated" as const } };
const publicAccess = { config: { access: "public" as const } };

const createCommunityBody = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(1000).optional(),
  city: z.string().trim().min(2).max(100),
  primaryCourtId: z.string().uuid().optional(),
  isPrivate: z.boolean().default(false),
  skillLevel: z.string().max(32).default("OPEN"),
});

const listCommunitiesQuery = z.object({
  city: z.string().optional(),
  skillLevel: z.string().optional(),
  search: z.string().optional(),
});

const idParam = z.object({ id: z.string().uuid() });

export function registerCommunityRoutes(app: FastifyInstance, db: Db) {
  // List communities
  app.get("/api/v1/communities", publicAccess, async (req) => {
    const query = listCommunitiesQuery.parse(req.query);
    const actorId = req.user?.id;
    const items = await listCommunities(db, query, actorId);
    return { items };
  });

  // Get community by ID (negative authZ: 404 if private and unauthorized)
  app.get("/api/v1/communities/:id", publicAccess, async (req) => {
    const { id } = idParam.parse(req.params);
    const actorId = req.user?.id;
    const comm = await getCommunityById(db, id, actorId);
    return comm;
  });

  // Create a new basketball community
  app.post("/api/v1/communities", authed, async (req, reply) => {
    const body = createCommunityBody.parse(req.body);
    const comm = await createCommunity(db, me(req), body);
    return reply.status(201).send(comm);
  });

  // Join community
  app.post("/api/v1/communities/:id/join", authed, async (req) => {
    const { id } = idParam.parse(req.params);
    const member = await joinCommunity(db, id, me(req));
    return member;
  });

  // Leave community
  app.post("/api/v1/communities/:id/leave", authed, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    await leaveCommunity(db, id, me(req));
    return reply.status(204).send();
  });

  // List members
  app.get("/api/v1/communities/:id/members", authed, async (req) => {
    const { id } = idParam.parse(req.params);
    const items = await listCommunityMembers(db, id, me(req));
    return { items };
  });

  // List community pickup runs
  app.get("/api/v1/communities/:id/games", publicAccess, async (req) => {
    const { id } = idParam.parse(req.params);
    const actorId = req.user?.id;
    const items = await listCommunityGames(db, id, actorId);
    return { items };
  });
}
