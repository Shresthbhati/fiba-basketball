import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { AuthError } from "../identity/service.js";
import {
  searchFilmClips,
  createSavedSearch,
  listSavedSearches,
  deleteSavedSearch,
  createMontage,
  getMontage,
  listMontages,
  updateMontage,
  deleteMontage,
} from "./search-service.js";

const me = (req: FastifyRequest) => req.user!.id;
const authed = { config: { access: "authenticated" as const } };

const idParam = z.object({ id: z.string().uuid() });
const teamIdParam = z.object({ teamId: z.string().uuid() });
const idOf = (req: FastifyRequest) => idParam.parse(req.params).id;
const teamIdOf = (req: FastifyRequest) => teamIdParam.parse(req.params).teamId;

const searchQuery = z.object({
  q: z.string().trim().max(100).optional(),
  tag: z.string().trim().max(50).optional(),
  gameId: z.string().uuid().optional(),
  minDurationMs: z.coerce.number().int().min(0).optional(),
  maxDurationMs: z.coerce.number().int().min(0).optional(),
});

const createSavedSearchBody = z.object({
  name: z.string().trim().min(1).max(100),
  filters: searchQuery,
});

const montageItemSchema = z.object({
  clipId: z.string().uuid(),
  gameId: z.string().uuid(),
  order: z.number().int().min(1).max(100),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  title: z.string().trim().max(120).optional(),
  note: z.string().trim().max(1000).optional(),
  tags: z.array(z.string().trim().max(40)).optional(),
});

const createMontageBody = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  tags: z.array(z.string().trim().max(40)).default([]),
  items: z.array(montageItemSchema).min(1),
});

const updateMontageBody = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).optional(),
  tags: z.array(z.string().trim().max(40)).optional(),
  items: z.array(montageItemSchema).min(1).optional(),
});

export function registerFilmSearchRoutes(app: FastifyInstance, db: Db) {
  // 1. Cross-game film library search
  app.get("/api/v1/teams/:teamId/film/search", authed, async (req) => {
    const query = searchQuery.parse(req.query);
    return searchFilmClips(db, me(req), teamIdOf(req), query);
  });

  // 2. Create saved search
  app.post("/api/v1/teams/:teamId/film/saved-searches", authed, async (req, reply) => {
    const body = createSavedSearchBody.parse(req.body);
    const saved = await createSavedSearch(db, me(req), teamIdOf(req), body);
    return reply.status(201).send(saved);
  });

  // 3. List saved searches for team
  app.get("/api/v1/teams/:teamId/film/saved-searches", authed, async (req) => {
    return listSavedSearches(db, me(req), teamIdOf(req));
  });

  // 4. Delete saved search
  app.delete("/api/v1/teams/:teamId/film/saved-searches/:id", authed, async (req, reply) => {
    await deleteSavedSearch(db, me(req), teamIdOf(req), idOf(req));
    return reply.status(204).send();
  });

  // 5. Create scouting montage
  app.post("/api/v1/teams/:teamId/film/montages", authed, async (req, reply) => {
    const body = createMontageBody.parse(req.body);
    const montage = await createMontage(db, me(req), teamIdOf(req), body);
    return reply.status(201).send(montage);
  });

  // 6. List scouting montages for team
  app.get("/api/v1/teams/:teamId/film/montages", authed, async (req) => {
    return listMontages(db, me(req), teamIdOf(req));
  });

  // 7. Get single scouting montage
  app.get("/api/v1/film/montages/:id", authed, async (req) => {
    const montage = await getMontage(db, me(req), idOf(req));
    if (!montage) {
      throw new AuthError(404, "Montage not found");
    }
    return montage;
  });

  // 8. Update scouting montage
  app.put("/api/v1/film/montages/:id", authed, async (req) => {
    const body = updateMontageBody.parse(req.body);
    const updated = await updateMontage(db, me(req), idOf(req), body);
    return updated;
  });

  // 9. Delete scouting montage
  app.delete("/api/v1/film/montages/:id", authed, async (req, reply) => {
    await deleteMontage(db, me(req), idOf(req));
    return reply.status(204).send();
  });
}
