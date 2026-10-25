import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { MAX_RADIUS_M } from "../geo/distance.js";
import { AuthError } from "../identity/service.js";
import {
  addCourtPhoto,
  confirmCourtAttributes,
  createCourt,
  deleteCourtPhoto,
  getCourt,
  getCourtVerifications,
  listCourtPhotos,
  nearbyCourts,
  reportCourt,
  setPrimaryCourtPhoto,
  setVerification,
} from "./service.js";

const lat = z.coerce.number().min(-90).max(90);
const lng = z.coerce.number().min(-180).max(180);
const idParam = z.object({ id: z.uuid() });
const photoIdParam = z.object({ id: z.uuid(), photoId: z.uuid() });

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

const photoUploadBody = z.object({
  url: z.string().url().max(1000),
  caption: z.string().trim().max(200).optional(),
  isPrimary: z.boolean().optional(),
});

const confirmAttributesBody = z.object({
  confirmedSurface: z.string().trim().max(60).optional(),
  confirmedHoops: z.number().int().min(1).max(40).optional(),
  confirmedLit: z.boolean().optional(),
  confirmedIndoor: z.boolean().optional(),
  notes: z.string().trim().max(500).optional(),
});

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

  // Court Photos Gallery (Spec §8.1, §8.3, WP-1.11, WP-2.5)
  app.get("/api/v1/courts/:id/photos", { config: { access: "public" } }, async (req) => {
    const { id } = idParam.parse(req.params);
    return { items: await listCourtPhotos(db, id) };
  });

  app.post("/api/v1/courts/:id/photos", { config: { access: "authenticated" } }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = photoUploadBody.parse(req.body);
    const photo = await addCourtPhoto(db, req.user!.id, id, body);
    return reply.status(201).send(photo);
  });

  app.delete("/api/v1/courts/:id/photos/:photoId", { config: { access: "authenticated" } }, async (req, reply) => {
    const { id, photoId } = photoIdParam.parse(req.params);
    await deleteCourtPhoto(db, req.user!.id, id, photoId);
    return reply.status(200).send({ ok: true });
  });

  app.post("/api/v1/courts/:id/photos/:photoId/primary", { config: { access: "authenticated" } }, async (req) => {
    const { id, photoId } = photoIdParam.parse(req.params);
    return setPrimaryCourtPhoto(db, req.user!.id, id, photoId);
  });

  // Community Attribute Confirmations & Crowd Verification (Spec §8.1)
  app.get("/api/v1/courts/:id/verifications", { config: { access: "public" } }, async (req) => {
    const { id } = idParam.parse(req.params);
    return getCourtVerifications(db, id);
  });

  app.post("/api/v1/courts/:id/confirm-attributes", { config: { access: "authenticated" } }, async (req) => {
    const { id } = idParam.parse(req.params);
    const body = confirmAttributesBody.parse(req.body);
    return confirmCourtAttributes(db, req.user!.id, id, body);
  });
}
