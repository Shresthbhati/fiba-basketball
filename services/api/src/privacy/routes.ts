import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import {
  exportUserData,
  getLatestExport,
  getPrivacyStatus,
  requestAccountErasure,
} from "./service.js";

const erasureBody = z.object({
  passwordVerify: z.string().min(1, "Password is required to confirm account erasure"),
  reason: z.string().max(300).optional(),
});

export function registerPrivacyRoutes(app: FastifyInstance, db: Db) {
  // Get current user privacy and data retention lifecycle status
  app.get("/api/v1/privacy/status", { config: { access: "authenticated" } }, async (req) => {
    return getPrivacyStatus(db, req.user!.id);
  });

  // Request machine-readable personal data export archive (GDPR Art. 15/20, CCPA §1798.100)
  app.post("/api/v1/privacy/export", { config: { access: "authenticated" } }, async (req, reply) => {
    const exportResult = await exportUserData(db, req.user!.id);
    return reply.status(201).send(exportResult);
  });

  // Retrieve the latest generated data export archive
  app.get("/api/v1/privacy/export/latest", { config: { access: "authenticated" } }, async (req) => {
    return getLatestExport(db, req.user!.id);
  });

  // Execute Right to Erasure / Account Anonymization (GDPR Art. 17, CCPA §1798.105)
  app.post("/api/v1/privacy/erasure", { config: { access: "authenticated" } }, async (req, reply) => {
    const body = erasureBody.parse(req.body);
    const result = await requestAccountErasure(db, req.user!.id, body);
    reply.clearCookie("session", { path: "/" });
    return reply.status(200).send(result);
  });
}
