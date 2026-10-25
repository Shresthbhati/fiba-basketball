import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { AuthError } from "../identity/service.js";
import { evaluateAndAwardMilestones, getMilestoneProgress } from "./milestones.js";
import {
  createPassportGrant,
  listPassportGrants,
  revokePassportGrant,
  getPublicPassport,
} from "./passport.js";

const me = (req: FastifyRequest) => req.user!.id;
const authed = { config: { access: "authenticated" as const } };
const publicAccess = { config: { access: "public" as const } };

const grantParam = z.object({ id: z.string().uuid() });
const tokenParam = z.object({ token: z.string().min(10).max(100) });

const createGrantBody = z.object({
  label: z.string().trim().max(100).optional(),
  includeAverages: z.boolean().default(true),
  includeShootingSplits: z.boolean().default(true),
  includeMinutes: z.boolean().default(false),
  includeGameLog: z.boolean().default(true),
  includeBiometrics: z.boolean().default(false),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

export function registerPassportRoutes(app: FastifyInstance, db: Db) {
  // 1. Create a shareable athlete passport grant
  app.post("/api/v1/me/passport/grants", authed, async (req, reply) => {
    const body = createGrantBody.parse(req.body);
    const grant = await createPassportGrant(db, me(req), body);
    return reply.status(201).send(grant);
  });

  // 2. List all passport share grants created by current athlete
  app.get("/api/v1/me/passport/grants", authed, async (req) => {
    const items = await listPassportGrants(db, me(req));
    return { items };
  });

  // 3. Revoke a passport grant
  app.delete("/api/v1/me/passport/grants/:id", authed, async (req, reply) => {
    const { id } = grantParam.parse(req.params);
    await revokePassportGrant(db, me(req), id);
    return reply.status(204).send();
  });

  // 4. Public endpoint to view an athlete passport via token
  app.get("/api/v1/passport/:token", publicAccess, async (req) => {
    const { token } = tokenParam.parse(req.params);
    const passport = await getPublicPassport(db, token);
    if (!passport) {
      throw new AuthError(404, "Passport not found or link has expired");
    }
    return passport;
  });

  // 5. Get current athlete's verified achievements and milestone progression
  app.get("/api/v1/me/achievements", authed, async (req) => {
    return getMilestoneProgress(db, me(req));
  });

  // 6. Explicitly refresh and evaluate milestone awards
  app.post("/api/v1/me/achievements/refresh", authed, async (req) => {
    const result = await evaluateAndAwardMilestones(db, me(req));
    return result;
  });
}
