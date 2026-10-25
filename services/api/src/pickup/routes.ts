import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { MAX_RADIUS_M } from "../geo/distance.js";
import { hasConsent } from "../consent/service.js";
import { AuthError } from "../identity/service.js";
import { cancelSeries, createSeries, mySeries } from "./series.js";
import { cancelGame, cancelRsvp, checkIn, confirmComplete, createGame, getGame, rsvp, searchGames } from "./service.js";
import { registerPickupRecruitment } from "./recruitment-routes.js";

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

// Adults need nothing extra. An under-18 account needs PUBLIC_PICKUP consent from an active guardian.
const needsGuardianConsent = (db: Db) => async (req: FastifyRequest) => {
  if (req.user!.isMinor && !(await hasConsent(db, req.user!, "PUBLIC_PICKUP"))) {
    throw new AuthError(403, "Public games for under-18 accounts need guardian consent");
  }
};
const gameId = (req: FastifyRequest) => idParam.parse(req.params).id;

export function registerPickup(app: FastifyInstance, db: Db) {
  const adultsOnly = needsGuardianConsent(db);
  app.post("/api/v1/pickup", { config: { access: { action: "pickup:host" } } }, async (req, reply) => {
    await adultsOnly(req);
    return reply.status(201).send(await createGame(db, req.user!.id, newGame.parse(req.body)));
  });

  app.get("/api/v1/pickup", { config: { access: "public" } }, async (req) => {
    const q = searchQuery.parse(req.query);
    return { items: await searchGames(db, { lat: q.lat, lng: q.lng, radiusM: q.radius_m, from: q.from, to: q.to }) };
  });

  const newSeries = z.object({
    courtId: z.uuid(), title: z.string().trim().min(1).max(100), weekday: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM"), durationMin: z.number().int().min(30).max(360),
    timezone: z.string().min(1).max(64), capacity: z.number().int().min(2).max(30),
    skillBand: z.enum(["CASUAL", "INTERMEDIATE", "COMPETITIVE"]).optional(),
  });
  app.post("/api/v1/pickup/series", { config: { access: { action: "pickup:host" } } }, async (req, reply) => {
    await adultsOnly(req);
    return reply.status(201).send(await createSeries(db, req.user!.id, newSeries.parse(req.body)));
  });
  app.get("/api/v1/pickup/series/mine", { config: { access: "authenticated" } }, async (req) => ({ items: await mySeries(db, req.user!.id) }));
  app.post("/api/v1/pickup/series/:id/cancel", { config: { access: "authenticated" } }, async (req) =>
    cancelSeries(db, idParam.parse(req.params).id, req.user!.id));

  app.get("/api/v1/pickup/:id", { config: { access: "public" } }, async (req) => getGame(db, gameId(req), req.user?.id ?? null));

  app.post("/api/v1/pickup/:id/rsvp", { config: { access: "authenticated" } }, async (req) => {
    await adultsOnly(req);
    return rsvp(db, gameId(req), req.user!.id);
  });
  app.delete("/api/v1/pickup/:id/rsvp", { config: { access: "authenticated" } }, async (req) => cancelRsvp(db, gameId(req), req.user!.id));
  app.post("/api/v1/pickup/:id/check-in", { config: { access: "authenticated" } }, async (req) => checkIn(db, gameId(req), req.user!.id));
  app.post("/api/v1/pickup/:id/complete", { config: { access: "authenticated" } }, async (req) => confirmComplete(db, gameId(req), req.user!.id));
  app.post("/api/v1/pickup/:id/cancel", { config: { access: "authenticated" } }, async (req, reply) => {
    await cancelGame(db, gameId(req), req.user!.id);
    return reply.status(204).send();
  });

  registerPickupRecruitment(app, db);
}
