import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import {
  cancelCourtReservation,
  createCourtReservation,
  getCourtFacilityStatus,
  getFacilityAnalytics,
  listCourtMaintenanceLogs,
  listCourtOperatingHours,
  listCourtReservations,
  logCourtMaintenance,
  submitFacilityClaim,
  updateCourtOperatingHours,
} from "./facility.js";

const me = (req: FastifyRequest) => req.user!.id;
const authed = { config: { access: "authenticated" as const } };
const publicAccess = { config: { access: "public" as const } };

const courtParam = z.object({ id: z.string().uuid() });
const reservationParam = z.object({ id: z.string().uuid() });

const claimBody = z.object({
  businessName: z.string().trim().min(2).max(120),
  contactEmail: z.string().email(),
  contactPhone: z.string().trim().max(30).optional(),
});

const operatingHourItem = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  openTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM format"),
  closeTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM format"),
  slotDurationMinutes: z.number().int().min(15).max(240).optional(),
  hourlyRateCents: z.number().int().min(0).max(1000000).optional(),
  currency: z.string().max(3).optional(),
  isClosed: z.boolean().optional(),
});

const operatingHoursBody = z.object({
  schedule: z.array(operatingHourItem).min(1).max(7),
});

const reservationBody = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  purpose: z
    .enum([
      "LEAGUE_MATCH",
      "TEAM_PRACTICE",
      "PICKUP_RUN",
      "TRAINING",
      "COMMUNITY_EVENT",
      "OTHER",
    ])
    .optional(),
  notes: z.string().trim().max(500).optional(),
});

const cancelReservationBody = z.object({
  reason: z.string().trim().max(500).optional(),
});

const maintenanceBody = z.object({
  category: z.enum([
    "SURFACE_RESURFACING",
    "RIM_REPLACEMENT",
    "NET_REPLACEMENT",
    "BACKBOARD_INSPECTION",
    "LIGHTING_REPAIR",
    "COURT_STRIPING",
    "GENERAL_CLEANING",
    "SAFETY_AUDIT",
  ]),
  description: z.string().trim().min(5).max(1000),
  severity: z.enum(["ROUTINE", "RECOMMENDED", "URGENT_SAFETY_HAZARD"]).optional(),
  costCents: z.number().int().min(0).optional(),
  performedAt: z.string().datetime(),
  nextInspectionDue: z.string().datetime().optional(),
});

export function registerCourtFacilityRoutes(app: FastifyInstance, db: Db) {
  // Submit facility claim
  app.post("/api/v1/courts/:id/claims", authed, async (req, reply) => {
    const { id } = courtParam.parse(req.params);
    const body = claimBody.parse(req.body);
    const claim = await submitFacilityClaim(db, id, me(req), body);
    return reply.status(201).send(claim);
  });

  // Get court facility and manager status
  app.get("/api/v1/courts/:id/facility-status", publicAccess, async (req) => {
    const { id } = courtParam.parse(req.params);
    const userId = req.user?.id;
    return getCourtFacilityStatus(db, id, userId);
  });

  // Get operating hours
  app.get("/api/v1/courts/:id/operating-hours", publicAccess, async (req) => {
    const { id } = courtParam.parse(req.params);
    return listCourtOperatingHours(db, id);
  });

  // Update operating hours (manager only)
  app.put("/api/v1/courts/:id/operating-hours", authed, async (req) => {
    const { id } = courtParam.parse(req.params);
    const body = operatingHoursBody.parse(req.body);
    return updateCourtOperatingHours(db, id, me(req), body.schedule);
  });

  // List court reservations
  app.get("/api/v1/courts/:id/reservations", publicAccess, async (req) => {
    const { id } = courtParam.parse(req.params);
    const userId = req.user?.id;
    return listCourtReservations(db, id, userId);
  });

  // Book a court reservation
  app.post("/api/v1/courts/:id/reservations", authed, async (req, reply) => {
    const { id } = courtParam.parse(req.params);
    const body = reservationBody.parse(req.body);
    const reservation = await createCourtReservation(db, id, me(req), {
      startTime: new Date(body.startTime),
      endTime: new Date(body.endTime),
      purpose: body.purpose,
      notes: body.notes,
    });
    return reply.status(201).send(reservation);
  });

  // Cancel reservation
  app.post("/api/v1/reservations/:id/cancel", authed, async (req) => {
    const { id } = reservationParam.parse(req.params);
    const body = cancelReservationBody.parse(req.body ?? {});
    return cancelCourtReservation(db, id, me(req), body.reason);
  });

  // Get maintenance logs
  app.get("/api/v1/courts/:id/maintenance", publicAccess, async (req) => {
    const { id } = courtParam.parse(req.params);
    return listCourtMaintenanceLogs(db, id);
  });

  // Log maintenance (manager only)
  app.post("/api/v1/courts/:id/maintenance", authed, async (req, reply) => {
    const { id } = courtParam.parse(req.params);
    const body = maintenanceBody.parse(req.body);
    const log = await logCourtMaintenance(db, id, me(req), {
      category: body.category,
      description: body.description,
      severity: body.severity,
      costCents: body.costCents,
      performedAt: new Date(body.performedAt),
      nextInspectionDue: body.nextInspectionDue ? new Date(body.nextInspectionDue) : undefined,
    });
    return reply.status(201).send(log);
  });

  // Get facility analytics (manager only)
  app.get("/api/v1/courts/:id/facility-analytics", authed, async (req) => {
    const { id } = courtParam.parse(req.params);
    return getFacilityAnalytics(db, id, me(req));
  });
}
