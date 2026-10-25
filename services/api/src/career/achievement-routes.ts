import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import {
  getVerifiedAchievementWithProof,
  issueVerifiedAchievement,
  listAthleteVerifiedAchievements,
  revokeVerifiedAchievement,
} from "./achievements.js";

const me = (req: FastifyRequest) => req.user!.id;
const idParam = z.object({ id: z.string().uuid() });

const issueAchievementSchema = z.object({
  userId: z.string().uuid(),
  title: z.string().trim().min(2).max(120),
  category: z.enum(["AWARD", "CHAMPIONSHIP", "SELECTION", "MILESTONE"]),
  issuer: z.string().trim().min(2).max(100),
  competitionId: z.string().uuid().optional(),
  evidenceUrl: z.string().url().max(500).optional(),
  evidenceRef: z.string().trim().max(100).optional(),
});

const revokeAchievementSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});

export function registerAchievementRoutes(app: FastifyInstance, db: Db) {
  // Public Verification Endpoint (Spec §3.1, §11.2)
  app.get("/api/v1/achievements/:id/verify", { config: { access: "public" } }, async (req) => {
    const { id } = idParam.parse(req.params);
    return getVerifiedAchievementWithProof(db, id);
  });

  // Issue Verified Achievement (Authenticated organizer / coach)
  app.post("/api/v1/achievements", { config: { access: "authenticated" } }, async (req, reply) => {
    const input = issueAchievementSchema.parse(req.body);
    const created = await issueVerifiedAchievement(db, me(req), input);
    return reply.status(201).send(created);
  });

  // Revoke Verified Achievement (Authenticated organizer / official)
  app.post("/api/v1/achievements/:id/revoke", { config: { access: "authenticated" } }, async (req) => {
    const { id } = idParam.parse(req.params);
    const { reason } = revokeAchievementSchema.parse(req.body);
    return revokeVerifiedAchievement(db, me(req), id, reason);
  });

  // List Athlete Verified Achievements
  app.get("/api/v1/users/:id/achievements", { config: { access: "public" } }, async (req) => {
    const { id } = idParam.parse(req.params);
    const query = z.object({
      includeRevoked: z.enum(["true", "false"]).optional(),
    }).parse(req.query);

    const includeRevoked = query.includeRevoked === "true";
    const items = await listAthleteVerifiedAchievements(db, id, includeRevoked);
    return { items };
  });
}
