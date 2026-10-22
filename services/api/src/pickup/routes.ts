import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { MAX_RADIUS_M } from "../geo/distance.js";
import { AuthError } from "../identity/service.js";
import { cancelGame, cancelRsvp, checkIn, confirmComplete, createGame, getGame, rsvp, searchGames } from "./service.js";

const idParam = z.object({ id: z.uuid() });
const newGame = z.object({
  courtId: z.uuid(), title: z.string().trim().min(1).max(100), startsAt: z.coerce.date(), endsAt: z.coerce.date(),
  capacity: z.number().int().min(2).max(30), skillBand: z.enum(["CASUAL", "INTERMEDIATE", "COMPETITIVE"]).optional(),
});
const searchQuery = z.object({
  lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180),
  radius_m: z.coerce.number().int().min(100).max(MAX_RADIUS_M).default(5000),
  from: z.coerce.date().optional(), to: z.coerce.date().optional(),
});

// Public games need guardian consent for minors; guardian flow isn't built yet, so minors are blocked.
const adultsOnly = (req: FastifyRequest) => {
  if (req.user!.isMinor) throw new AuthError(403, "Public games for under-18 accounts need guardian consent (not yet available)");
};
const gameId = (req: FastifyRequest) => idParam.parse(req.params).id;

export function registerPickup(app: FastifyInstance, db: Db) {
  app.post("/api/v1/pickup", { config: { access: { action: "pickup:host" } } }, async (req, reply) => {
    adultsOnly(req);
    return reply.status(201).send(await createGame(db, req.user!.id, newGame.parse(req.body)));
  });

  app.get("/api/v1/pickup", { config: { access: "public" } }, async (req) => {
    const q = searchQuery.parse(req.query);
    return { items: await searchGames(db, { lat: q.lat, lng: q.lng, radiusM: q.radius_m, from: q.from, to: q.to }) };
  });

  app.get("/api/v1/pickup/:id", { config: { access: "public" } }, async (req) => getGame(db, gameId(req), req.user?.id ?? null));

  app.post("/api/v1/pickup/:id/rsvp", { config: { access: "authenticated" } }, async (req) => {
    adultsOnly(req);
    return rsvp(db, gameId(req), req.user!.id);
  });
  app.delete("/api/v1/pickup/:id/rsvp", { config: { access: "authenticated" } }, async (req) => cancelRsvp(db, gameId(req), req.user!.id));
  app.post("/api/v1/pickup/:id/check-in", { config: { access: "authenticated" } }, async (req) => checkIn(db, gameId(req), req.user!.id));
  app.post("/api/v1/pickup/:id/complete", { config: { access: "authenticated" } }, async (req) => confirmComplete(db, gameId(req), req.user!.id));
  app.post("/api/v1/pickup/:id/cancel", { config: { access: "authenticated" } }, async (req, reply) => {
    await cancelGame(db, gameId(req), req.user!.id);
    return reply.status(204).send();
  });
}
