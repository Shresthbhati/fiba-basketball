import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import type { MediaStorage } from "../media/storage.js";
import {
  getAssessment,
  listAssessments,
  recordAssessment,
  createShareGrant,
  listShareGrants,
  revokeShareGrant,
  addCoachFeedback,
  updateAssessmentStatus,
} from "./service.js";
import {
  addCameraStream,
  listCameraStreams,
  deleteCameraStream,
  analyzeShootingMechanics,
  analyzeLandingStability,
} from "./multicam.js";

const idParam = z.object({ id: z.string().uuid() });
const grantParam = z.object({ id: z.string().uuid(), grantId: z.string().uuid() });
const streamParam = z.object({ streamId: z.string().uuid() });
const idOf = (req: FastifyRequest) => idParam.parse(req.params).id;
const grantIdOf = (req: FastifyRequest) => grantParam.parse(req.params).grantId;
const streamIdOf = (req: FastifyRequest) => streamParam.parse(req.params).streamId;
const me = (req: FastifyRequest) => req.user!.id;
const authed = { config: { access: "authenticated" as const } };

const assessmentBody = z.object({
  protocol: z.enum(["BODYWEIGHT_SQUAT", "COUNTERMOVEMENT_JUMP", "SHOOTING_MECHANICS", "LANDING_STABILITY"]),
  status: z.enum(["ACCEPTED", "NEEDS_REVIEW", "ABSTAINED"]),
  confidence: z.number().min(0).max(1).optional(),
  modelVersion: z.string().trim().max(100).optional(),
  protocolVersion: z.string().trim().max(100).optional(),
  repCount: z.number().int().min(0).max(1000).optional(),
  metrics: z.record(z.string(), z.unknown()).optional(),
  criteriaUnmeasurable: z.array(z.string().trim().max(100)).optional(),
  feedback: z.array(z.string().trim().max(500)).optional(),
  abstainReason: z.string().trim().max(500).optional(),
});

const uploadIntentBody = z.object({
  protocol: z.enum(["BODYWEIGHT_SQUAT", "COUNTERMOVEMENT_JUMP", "SHOOTING_MECHANICS", "LANDING_STABILITY"]),
  contentType: z.enum(["video/mp4", "video/webm", "video/quicktime"]),
});

const shareGrantBody = z.object({
  granteeId: z.string().uuid().optional(),
  granteeEmail: z.string().email().optional(),
  role: z.enum(["COACH", "TRAINER", "HEALTH_PRO"]).default("COACH"),
  expiresAt: z.string().datetime().optional(),
});

const coachFeedbackBody = z.object({
  notes: z.string().trim().min(1).max(2000),
  cues: z.array(z.string().trim().max(200)).default([]),
  suggestedDrillId: z.string().uuid().optional(),
});

const updateStatusBody = z.object({
  status: z.enum(["ACCEPTED", "NEEDS_REVIEW", "ABSTAINED"]).optional(),
});

const addStreamBody = z.object({
  cameraLabel: z.enum(["PRIMARY_SAGITTAL", "SECONDARY_FRONTAL", "ELEVATED_REAR", "BASELINE_WIDE"]),
  videoUrl: z.string().url(),
  syncOffsetMs: z.number().int().min(-60000).max(60000).default(0),
  resolution: z.string().trim().max(20).optional(),
  fps: z.number().int().min(1).max(240).optional(),
  isPrimary: z.boolean().default(false),
  calibratedDistanceM: z.number().min(0.5).max(30).optional(),
});

const shootingAnalysisBody = z.object({
  releaseAngleDeg: z.number().min(20).max(85),
  releaseTimeS: z.number().min(0.1).max(3.0),
  elbowFlareDeg: z.number().min(0).max(60),
  setPoint: z.enum(["ABOVE_BROW", "AT_BROW", "CHEST_LOW"]),
  guideHandContested: z.boolean().optional(),
  tier: z.enum(["PRO", "COLLEGIATE", "VARSITY", "YOUTH"]).optional(),
});

const landingAnalysisBody = z.object({
  bilateralContactDiffMs: z.number().min(0).max(500),
  kneeFlexionAtImpactDeg: z.number().min(5).max(120),
  valgusIndex: z.enum(["NONE", "MILD_MEDIAL", "NOTABLE_VALGUS"]),
  jumpHeightCm: z.number().min(0).max(150).optional(),
});

export function registerAssessment(app: FastifyInstance, db: Db, storage: MediaStorage) {
  // 1. Request presigned upload URL for assessment video
  app.post("/api/v1/assessments/upload-intent", authed, async (req, reply) => {
    const { protocol, contentType } = uploadIntentBody.parse(req.body);
    const userId = me(req);
    const key = `assessments/${userId}/${Date.now()}-${protocol.toLowerCase()}.mp4`;

    const uploadUrl = storage.getPresignedPutUrl
      ? await storage.getPresignedPutUrl(key, contentType, 900)
      : `/api/v1/media/upload/${encodeURIComponent(key)}`;

    return reply.status(200).send({
      key,
      uploadUrl,
      expiresInSeconds: 900,
    });
  });

  // 2. Record a completed biomechanical movement assessment
  app.post("/api/v1/assessments", authed, async (req, reply) => {
    const body = assessmentBody.parse(req.body);
    const assessment = await recordAssessment(db, me(req), body);
    return reply.status(201).send(assessment);
  });

  // 3. List assessments for current athlete
  app.get("/api/v1/assessments", authed, async (req) => {
    const items = await listAssessments(db, me(req));
    return { items };
  });

  // 4. Get detailed assessment by ID (enforcing private owner/grant access)
  app.get("/api/v1/assessments/:id", authed, async (req) => {
    const assessment = await getAssessment(db, me(req), idOf(req));
    return assessment;
  });

  // 5. Grant access to a coach, trainer, or healthcare professional
  app.post("/api/v1/assessments/:id/grants", authed, async (req, reply) => {
    const body = shareGrantBody.parse(req.body);
    const grant = await createShareGrant(db, me(req), idOf(req), body);
    return reply.status(201).send(grant);
  });

  // 6. List active and revoked share grants for an assessment
  app.get("/api/v1/assessments/:id/grants", authed, async (req) => {
    return listShareGrants(db, me(req), idOf(req));
  });

  // 7. Revoke share grant immediately (WP-2.8)
  app.delete("/api/v1/assessments/:id/grants/:grantId", authed, async (req, reply) => {
    await revokeShareGrant(db, me(req), idOf(req), grantIdOf(req));
    return reply.status(204).send();
  });

  // 8. Add coach feedback / drill prescription
  app.post("/api/v1/assessments/:id/feedback", authed, async (req, reply) => {
    const body = coachFeedbackBody.parse(req.body);
    const feedback = await addCoachFeedback(db, me(req), idOf(req), body);
    return reply.status(201).send(feedback);
  });

  // 9. Update assessment status (e.g. ACCEPTED or NEEDS_REVIEW)
  app.patch("/api/v1/assessments/:id", authed, async (req) => {
    const body = updateStatusBody.parse(req.body);
    return updateAssessmentStatus(db, me(req), idOf(req), body);
  });

  // 10. Multi-Camera Stream: Attach synchronized camera angle
  app.post("/api/v1/assessments/:id/streams", authed, async (req, reply) => {
    const body = addStreamBody.parse(req.body);
    const stream = await addCameraStream(db, me(req), idOf(req), body);
    return reply.status(201).send(stream);
  });

  // 11. Multi-Camera Stream: List synchronized camera angles
  app.get("/api/v1/assessments/:id/streams", authed, async (req) => {
    const items = await listCameraStreams(db, me(req), idOf(req));
    return { items };
  });

  // 12. Multi-Camera Stream: Delete camera stream
  app.delete("/api/v1/assessments/streams/:streamId", authed, async (req, reply) => {
    await deleteCameraStream(db, me(req), streamIdOf(req));
    return reply.status(204).send();
  });

  // 13. Shooting Mechanics Biomechanical Analysis (Spec §4.1)
  app.post("/api/v1/assessments/analyze-shooting", authed, async (req) => {
    const body = shootingAnalysisBody.parse(req.body);
    return analyzeShootingMechanics(db, body);
  });

  // 14. Landing Stability & Deceleration Symmetry Analysis (Spec §4.1)
  app.post("/api/v1/assessments/analyze-landing", authed, async (req) => {
    const body = landingAnalysisBody.parse(req.body);
    return analyzeLandingStability(body);
  });
}
