import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { getSettings, setEmailSetting } from "./email.js";
import {
  deletePushSubscription,
  getNotificationPreferences,
  listNotifications,
  listPushSubscriptions,
  markRead,
  savePushSubscription,
  testDispatchNotification,
  unreadCount,
  updateNotificationPreferences,
} from "./service.js";
import { getVapidKeys } from "./vapid.js";

const preferencesBody = z.object({
  webPushEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  gameInvites: z.boolean().optional(),
  courtAlerts: z.boolean().optional(),
  teamAnnouncements: z.boolean().optional(),
  quietHoursEnabled: z.boolean().optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM format").optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM format").optional(),
  quietHoursTimezone: z.string().min(1).max(50).optional(),
  dailyCap: z.number().int().min(1).max(100).optional(),
});

const pushSubscriptionBody = z.object({
  endpoint: z.string().url().max(1000),
  p256dh: z.string().min(1).max(200),
  auth: z.string().min(1).max(200),
  userAgent: z.string().max(300).optional(),
});

const deleteSubscriptionBody = z.object({
  endpoint: z.string().url().max(1000),
});

const testDispatchBody = z.object({
  kind: z
    .enum([
      "GAME_INVITE",
      "COURT_ALERT",
      "TEAM_ANNOUNCEMENT",
      "GAME_CANCELLED",
      "WAITLIST_PROMOTED",
      "ADDED_TO_TEAM",
      "ADDED_TO_ROSTER",
    ])
    .default("GAME_INVITE"),
  channel: z.enum(["PUSH", "EMAIL", "IN_APP"]).default("PUSH"),
  simulatedTimeIso: z.string().datetime().optional(),
});

export function registerNotifications(app: FastifyInstance, db: Db) {
  // In-app notifications
  app.get("/api/v1/notifications", { config: { access: "authenticated" } }, async (req) => ({
    items: await listNotifications(db, req.user!.id),
    unread: await unreadCount(db, req.user!.id),
  }));

  app.post("/api/v1/notifications/read", { config: { access: "authenticated" } }, async (req, reply) => {
    const { ids } = z.object({ ids: z.array(z.uuid()).max(100).optional() }).parse(req.body ?? {});
    await markRead(db, req.user!.id, ids);
    return reply.status(204).send();
  });

  // Legacy email setting
  app.get("/api/v1/notifications/settings", { config: { access: "authenticated" } }, async (req) =>
    getSettings(db, req.user!.id)
  );

  app.put("/api/v1/notifications/settings", { config: { access: "authenticated" } }, async (req, reply) => {
    const { email } = z.object({ email: z.boolean() }).parse(req.body);
    await setEmailSetting(db, req.user!.id, email);
    return reply.status(204).send();
  });

  // VAPID Public Key (WP-5.1)
  app.get("/api/v1/notifications/vapid-public-key", { config: { access: "public" } }, async () => {
    const keys = getVapidKeys();
    return { publicKey: keys.publicKey };
  });

  // Notification Preferences, Quiet Hours & Volume Caps (WP-5.1)
  app.get("/api/v1/notifications/preferences", { config: { access: "authenticated" } }, async (req) => {
    return getNotificationPreferences(db, req.user!.id);
  });

  app.put("/api/v1/notifications/preferences", { config: { access: "authenticated" } }, async (req) => {
    const patch = preferencesBody.parse(req.body);
    return updateNotificationPreferences(db, req.user!.id, patch);
  });

  // Push Subscriptions Lifecycle (RFC 8291 / RFC 8292)
  app.get("/api/v1/notifications/push-subscriptions", { config: { access: "authenticated" } }, async (req) => {
    return { items: await listPushSubscriptions(db, req.user!.id) };
  });

  app.post("/api/v1/notifications/push-subscriptions", { config: { access: "authenticated" } }, async (req, reply) => {
    const body = pushSubscriptionBody.parse(req.body);
    const sub = await savePushSubscription(db, req.user!.id, body);
    return reply.status(201).send(sub);
  });

  app.delete("/api/v1/notifications/push-subscriptions", { config: { access: "authenticated" } }, async (req, reply) => {
    const { endpoint } = deleteSubscriptionBody.parse(req.body);
    await deletePushSubscription(db, req.user!.id, endpoint);
    return reply.status(200).send({ ok: true });
  });

  // Test Dispatch / Simulation (checks Quiet Hours, Caps, and Opt-outs)
  app.post("/api/v1/notifications/test-dispatch", { config: { access: "authenticated" } }, async (req) => {
    const { kind, channel, simulatedTimeIso } = testDispatchBody.parse(req.body ?? {});
    return testDispatchNotification(db, req.user!.id, kind, channel, simulatedTimeIso);
  });
}
