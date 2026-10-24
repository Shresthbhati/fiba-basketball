import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import {
  applyToOpportunity,
  createOpportunity,
  getMyApplications,
  getOpportunityById,
  listOpportunities,
  listOpportunityApplications,
  updateApplicationStatus,
} from "./service.js";

const me = (req: FastifyRequest) => req.user!.id;
const authed = { config: { access: "authenticated" as const } };
const publicAccess = { config: { access: "public" as const } };

const opportunityTypes = [
  "TEAM_TRYOUT",
  "OPEN_RUN",
  "SHOWCASE_CAMP",
  "COLLEGE_RECRUITING_COMBINE",
  "PRO_CONTRACT_TRIAL",
] as const;

const verificationStatuses = [
  "COMMUNITY",
  "VERIFIED",
  "FEATURED",
  "REJECTED",
  "EXPIRED",
] as const;

const applicationStatuses = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "INVITED",
  "WAITLISTED",
  "DECLINED",
] as const;

const createOpportunityBody = z.object({
  title: z.string().trim().min(3).max(160),
  type: z.enum(opportunityTypes),
  organizationName: z.string().trim().min(2).max(120),
  organizationId: z.string().uuid().optional(),
  description: z.string().trim().min(10),
  requirements: z.string().trim().optional(),
  locationName: z.string().trim().min(2).max(120),
  address: z.string().trim().max(255).optional(),
  city: z.string().trim().min(2).max(100),
  country: z.string().trim().max(64).default("USA"),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  applicationDeadline: z.string().datetime().optional(),
  costCents: z.number().int().min(0).default(0),
  currency: z.string().length(3).default("USD"),
  contactEmail: z.string().email(),
  contactPhone: z.string().max(64).optional(),
  ageGroup: z.string().max(32).default("OPEN"),
  minAge: z.number().int().min(5).max(100).optional(),
  maxAge: z.number().int().min(5).max(100).optional(),
  gender: z.enum(["MEN", "WOMEN", "COED"]).default("COED"),
  positions: z.array(z.string()).default(["ALL"]),
  skillLevel: z.string().max(32).default("OPEN"),
  capacity: z.number().int().positive().optional(),
  isPublic: z.boolean().default(true),
});

const listOpportunitiesQuery = z.object({
  type: z.enum(opportunityTypes).optional(),
  city: z.string().optional(),
  verificationStatus: z.enum(verificationStatuses).optional(),
  ageGroup: z.string().optional(),
  gender: z.enum(["MEN", "WOMEN", "COED"]).optional(),
  onlyOpen: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
});

const applyBody = z.object({
  passportToken: z.string().min(10).max(100).optional(),
  primaryPosition: z.string().max(8).default("G"),
  heightCm: z.number().int().min(100).max(250).optional(),
  weightKg: z.number().int().min(30).max(200).optional(),
  graduationYear: z.number().int().min(2020).max(2040).optional(),
  currentTeam: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2000).optional(),
  guardianConsentGranted: z.boolean().default(false),
  guardianName: z.string().trim().max(120).optional(),
  guardianEmail: z.string().email().optional(),
});

const updateAppBody = z.object({
  status: z.enum(applicationStatuses),
  reviewerNotes: z.string().trim().max(2000).optional(),
});

const idParam = z.object({ id: z.string().uuid() });
const oppAppParam = z.object({
  id: z.string().uuid(),
  appId: z.string().uuid(),
});

export function registerOpportunityRoutes(app: FastifyInstance, db: Db) {
  // List opportunities (public / browsable)
  app.get("/api/v1/opportunities", publicAccess, async (req) => {
    const query = listOpportunitiesQuery.parse(req.query);
    const items = await listOpportunities(db, query);
    return { items };
  });

  // Get specific opportunity by ID
  app.get("/api/v1/opportunities/:id", publicAccess, async (req) => {
    const { id } = idParam.parse(req.params);
    const actorId = req.user?.id;
    const opp = await getOpportunityById(db, id, actorId);
    return opp;
  });

  // Create an opportunity (organizer / academy / coach / scout)
  app.post("/api/v1/opportunities", authed, async (req, reply) => {
    const body = createOpportunityBody.parse(req.body);
    const opp = await createOpportunity(db, me(req), body);
    return reply.status(201).send(opp);
  });

  // Submit an application for an opportunity
  app.post("/api/v1/opportunities/:id/apply", authed, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const body = applyBody.parse(req.body);
    const application = await applyToOpportunity(db, me(req), id, body);
    return reply.status(201).send(application);
  });

  // Organizer: List all applications for an opportunity (negative authZ: 404 for non-owners)
  app.get("/api/v1/opportunities/:id/applications", authed, async (req) => {
    const { id } = idParam.parse(req.params);
    const items = await listOpportunityApplications(db, id, me(req));
    return { items };
  });

  // Organizer: Update applicant status (INVITED, WAITLISTED, DECLINED, etc.)
  app.patch("/api/v1/opportunities/:id/applications/:appId", authed, async (req) => {
    const { id, appId } = oppAppParam.parse(req.params);
    const { status, reviewerNotes } = updateAppBody.parse(req.body);
    const updated = await updateApplicationStatus(db, id, appId, me(req), status, reviewerNotes);
    return updated;
  });

  // Athlete: List my own submitted applications
  app.get("/api/v1/me/opportunity-applications", authed, async (req) => {
    const items = await getMyApplications(db, me(req));
    return { items };
  });
}
