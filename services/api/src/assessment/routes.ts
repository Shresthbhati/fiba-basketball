import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import type { MediaStorage } from "../media/storage.js";
import { getAssessment, listAssessments, recordAssessment } from "./service.js";

const idParam = z.object({ id: z.uuid() });
const idOf = (req: FastifyRequest) => idParam.parse(req.params).id;
const me = (req: FastifyRequest) => req.user!.id;
const authed = { config: { access: "authenticated" as const } };

const assessmentBody = z.object({
  protocol: z.enum(["BODYWEIGHT_SQUAT", "COUNTERMOVEMENT_JUMP"]),
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
  protocol: z.enum(["BODYWEIGHT_SQUAT", "COUNTERMOVEMENT_JUMP"]),
  contentType: z.enum(["video/mp4", "video/webm", "video/quicktime"]),
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

  // 2. Record completed / processed assessment result
  app.post("/api/v1/assessments", authed, async (req, reply) => {
    const body = assessmentBody.parse(req.body);
    const created = await recordAssessment(db, me(req), body);
    return reply.status(201).send(created);
  });

  // 3. List user's past assessments
  app.get("/api/v1/assessments", authed, async (req) => {
    const items = await listAssessments(db, me(req));
    return { items };
  });

  // 4. Get specific assessment details (strictly private to owner)
  app.get("/api/v1/assessments/:id", authed, async (req) => {
    return getAssessment(db, me(req), idOf(req));
  });
}
