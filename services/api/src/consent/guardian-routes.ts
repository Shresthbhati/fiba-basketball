import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import {
  acknowledgeCheckin,
  getGuardianDashboard,
  getWardEmergencyContacts,
  saveWardEmergencyContacts,
  updateWardSafetySettings,
} from "./guardian-portal.js";
import { grantConsent, revokeConsent, type ConsentKind } from "./service.js";

const me = (req: FastifyRequest) => req.user!.id;
const authed = { config: { access: "authenticated" as const } };

const minorParam = z.object({ minorId: z.string().uuid() });
const checkinParam = z.object({ checkinId: z.string().uuid() });
const consentParam = z.object({
  minorId: z.string().uuid(),
  kind: z.enum(["PUBLIC_PICKUP", "PROFILE_DISCOVERY", "MEDIA_USE", "COMPETITION_PLAY"]),
});

const emergencyBody = z.object({
  primaryContactName: z.string().trim().min(2).max(100),
  primaryContactPhone: z.string().trim().min(5).max(30),
  primaryContactRelationship: z.string().trim().max(40).optional(),
  secondaryContactName: z.string().trim().max(100).optional(),
  secondaryContactPhone: z.string().trim().max(30).optional(),
  secondaryContactRelationship: z.string().trim().max(40).optional(),
  medicalNotes: z.string().trim().max(1000).optional(),
});

const safetySettingsBody = z.object({
  notifyOnPickupJoin: z.boolean().optional(),
  notifyOnTournamentRoster: z.boolean().optional(),
  notifyOnCheckin: z.boolean().optional(),
  safetyLockActive: z.boolean().optional(),
});

const grantConsentBody = z.object({
  kind: z.enum(["PUBLIC_PICKUP", "PROFILE_DISCOVERY", "MEDIA_USE", "COMPETITION_PLAY"]),
});

export function registerGuardianRoutes(app: FastifyInstance, db: Db) {
  // Guardian family overview dashboard
  app.get("/api/v1/guardian/dashboard", authed, async (req) => {
    return getGuardianDashboard(db, me(req));
  });

  // Get emergency contacts for minor
  app.get("/api/v1/guardian/wards/:minorId/emergency", authed, async (req) => {
    const { minorId } = minorParam.parse(req.params);
    return getWardEmergencyContacts(db, me(req), minorId);
  });

  // Save emergency contacts for minor
  app.put("/api/v1/guardian/wards/:minorId/emergency", authed, async (req) => {
    const { minorId } = minorParam.parse(req.params);
    const body = emergencyBody.parse(req.body);
    return saveWardEmergencyContacts(db, me(req), minorId, body);
  });

  // Update safety settings & toggle safety lock
  app.put("/api/v1/guardian/wards/:minorId/safety-settings", authed, async (req) => {
    const { minorId } = minorParam.parse(req.params);
    const body = safetySettingsBody.parse(req.body);
    return updateWardSafetySettings(db, me(req), minorId, body);
  });

  // Grant consent for ward
  app.post("/api/v1/guardian/wards/:minorId/consents", authed, async (req, reply) => {
    const { minorId } = minorParam.parse(req.params);
    const body = grantConsentBody.parse(req.body);
    await grantConsent(db, me(req), minorId, body.kind);
    return reply.status(201).send({ success: true, kind: body.kind });
  });

  // Revoke consent for ward
  app.delete("/api/v1/guardian/wards/:minorId/consents/:kind", authed, async (req) => {
    const { minorId, kind } = consentParam.parse(req.params);
    await revokeConsent(db, me(req), minorId, kind as ConsentKind);
    return { success: true, kind };
  });

  // Acknowledge check-in
  app.post("/api/v1/guardian/checkins/:checkinId/acknowledge", authed, async (req) => {
    const { checkinId } = checkinParam.parse(req.params);
    return acknowledgeCheckin(db, me(req), checkinId);
  });
}
