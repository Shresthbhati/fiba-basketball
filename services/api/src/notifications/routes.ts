import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { getSettings, setEmailSetting } from "./email.js";
import { listNotifications, markRead, unreadCount } from "./service.js";

export function registerNotifications(app: FastifyInstance, db: Db) {
  app.get("/api/v1/notifications", { config: { access: "authenticated" } }, async (req) => ({
    items: await listNotifications(db, req.user!.id),
    unread: await unreadCount(db, req.user!.id),
  }));
  app.post("/api/v1/notifications/read", { config: { access: "authenticated" } }, async (req, reply) => {
    const { ids } = z.object({ ids: z.array(z.uuid()).max(100).optional() }).parse(req.body ?? {});
    await markRead(db, req.user!.id, ids);
    return reply.status(204).send();
  });

  app.get("/api/v1/notifications/settings", { config: { access: "authenticated" } }, async (req) => getSettings(db, req.user!.id));
  app.put("/api/v1/notifications/settings", { config: { access: "authenticated" } }, async (req, reply) => {
    const { email } = z.object({ email: z.boolean() }).parse(req.body);
    await setEmailSetting(db, req.user!.id, email);
    return reply.status(204).send();
  });
}
