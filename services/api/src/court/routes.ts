import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { MAX_RADIUS_M } from "../geo/distance.js";
import { AuthError } from "../identity/service.js";
import { createCourt, getCourt, nearbyCourts, reportCourt, setVerification } from "./service.js";

const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);
const idParam = z.object({ id: z.uuid() });

const courtBody = z.object({
  name: z.string().trim().min(1).max(120), lat, lng, indoor: z.boolean().optional(),
  surface: z.string().trim().max(60).optional(), hoops: z.number().int().min(1).max(40).optional(),
  lit: z.boolean().optional(), accessNotes: z.string().trim().max(500).optional(),
});
const nearbyQuery = z.object({
  lat, lng,
  radius_m: z.coerce.number().int().min(100).max(MAX_RADIUS_M).default(5000),
  indoor: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
});
const reportBody = z.object({ kind: z.enum(["CLOSED", "UNSAFE", "WRONG_INFO", "OTHER"]), note: z.string().max(500).optional() });
const verifyBody = z.object({ status: z.enum(["COMMUNITY_CONFIRMED", "FACILITY_VERIFIED", "MODERATOR_VERIFIED", "UNVERIFIED"]) });

export function registerCourts(app: FastifyInstance, db: Db) {
  // Search is by a point the caller chooses; we never need or store the caller's own location.
  app.get("/api/v1/courts/nearby", { config: { access: "public" } }, async (req) => {
    const q = nearbyQuery.parse(req.query);
    return { items: await nearbyCourts(db, { lat: q.lat, lng: q.lng, radiusM: q.radius_m, indoor: q.indoor }) };
  });

  app.get("/api/v1/courts/:id", { config: { access: "public" } }, async (req) => {
    const court = await getCourt(db, idParam.parse(req.params).id);
    if (!court) throw new AuthError(404, "Not Found");
    return court;
  });

  app.post("/api/v1/courts", { config: { access: "authenticated" } }, async (req, reply) =>
    reply.status(201).send(await createCourt(db, req.user!.id, courtBody.parse(req.body))),
  );

  app.post("/api/v1/courts/:id/reports", { config: { access: "authenticated" } }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    if (!(await getCourt(db, id))) throw new AuthError(404, "Not Found");
    const body = reportBody.parse(req.body);
    await reportCourt(db, req.user!.id, id, body.kind, body.note);
    return reply.status(201).send({ ok: true });
  });

  app.post("/api/v1/courts/:id/verification", { config: { access: { action: "court:verify" } } }, async (req) => {
    const court = await setVerification(db, idParam.parse(req.params).id, verifyBody.parse(req.body).status);
    if (!court) throw new AuthError(404, "Not Found");
    return court;
  });
}
