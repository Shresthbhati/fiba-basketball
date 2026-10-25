import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import {
  createOrUpdateSponsorProfile,
  createSponsorGrant,
  getCompetitionSponsorAnalytics,
  getCourtSponsorAnalytics,
  getSponsorProfile,
  listSponsorGrants,
  listSponsorQueryAuditLogs,
  revokeSponsorGrant,
  type SponsorProfileInput,
} from "./sponsor-analytics.js";

const authed = { config: { access: "authenticated" as const } };

const BRAND_CATEGORIES = [
  "APPAREL",
  "FOOTWEAR",
  "BEVERAGES",
  "NUTRITION",
  "EQUIPMENT",
  "MEDIA",
  "TECHNOLOGY",
  "COMMUNITY",
  "OTHER",
] as const;

const profileBody = z.object({
  companyName: z.string().trim().min(2).max(120),
  contactEmail: z.string().email(),
  brandCategory: z.enum(BRAND_CATEGORIES),
  websiteUrl: z.string().url().optional(),
});

const grantBody = z.object({
  sponsorId: z.string().uuid(),
  courtId: z.string().uuid().optional(),
  competitionId: z.string().uuid().optional(),
  scope: z.enum(["COURT", "COMPETITION", "GLOBAL"]).optional(),
  expiresAt: z.string().datetime().optional(),
});

const idParam = z.object({ id: z.string().uuid() });

const analyticsQuery = z.object({
  kThreshold: z.coerce.number().int().min(5).max(100).optional(),
});

export function registerSponsorRoutes(app: FastifyInstance, db: Db) {
  // Register or update sponsor company profile
  app.post("/api/v1/sponsors/profile", authed, async (req: FastifyRequest, reply) => {
    const body = profileBody.parse(req.body);
    const profile = await createOrUpdateSponsorProfile(db, req.user!.id, {
      companyName: body.companyName,
      contactEmail: body.contactEmail,
      brandCategory: body.brandCategory as SponsorProfileInput["brandCategory"],
      websiteUrl: body.websiteUrl,
    });
    return reply.status(200).send(profile);
  });

  // Get current user's sponsor profile and active grants
  app.get("/api/v1/sponsors/me", authed, async (req: FastifyRequest) => {
    const profile = await getSponsorProfile(db, req.user!.id);
    return { profile };
  });

  // Issue an analytics access grant to a verified sponsor
  app.post("/api/v1/sponsors/grants", authed, async (req: FastifyRequest, reply) => {
    const body = grantBody.parse(req.body);
    const grant = await createSponsorGrant(db, req.user!.id, {
      sponsorId: body.sponsorId,
      courtId: body.courtId,
      competitionId: body.competitionId,
      scope: body.scope,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });
    return reply.status(201).send(grant);
  });

  // List sponsor grants (received or issued)
  app.get("/api/v1/sponsors/grants", authed, async (req: FastifyRequest) => {
    const items = await listSponsorGrants(db, req.user!.id);
    return { items };
  });

  // Revoke an analytics grant
  app.delete("/api/v1/sponsors/grants/:id", authed, async (req: FastifyRequest) => {
    const { id } = idParam.parse(req.params);
    return revokeSponsorGrant(db, req.user!.id, id);
  });

  // Query aggregated court footfall and demographics with k-anonymity (k >= 5) guardrails
  app.get("/api/v1/sponsors/analytics/courts/:id", authed, async (req: FastifyRequest) => {
    const { id } = idParam.parse(req.params);
    const query = analyticsQuery.parse(req.query);
    const summary = await getCourtSponsorAnalytics(db, id, req.user!.id, {
      kThreshold: query.kThreshold,
    });
    return summary;
  });

  // Query aggregated competition metrics and demographics with k-anonymity (k >= 5) guardrails
  app.get("/api/v1/sponsors/analytics/competitions/:id", authed, async (req: FastifyRequest) => {
    const { id } = idParam.parse(req.params);
    const query = analyticsQuery.parse(req.query);
    const summary = await getCompetitionSponsorAnalytics(db, id, req.user!.id, {
      kThreshold: query.kThreshold,
    });
    return summary;
  });

  // Query recent sponsor report audit queries
  app.get("/api/v1/sponsors/analytics/audit-log", authed, async (req: FastifyRequest) => {
    const items = await listSponsorQueryAuditLogs(db, req.user!.id);
    return { items };
  });
}
