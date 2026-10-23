import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { listAudit } from "../audit/service.js";
import { writeAudit } from "../audit/service.js";
import { listBlocks, listCases, fileReport, readCase, removeBlock, resolveCase, setBlock } from "./service.js";

const idParam = z.object({ id: z.uuid() });
const userParam = z.object({ userId: z.uuid() });
// A sensitive read must say why; short throwaway strings are rejected.
const reasonQuery = z.object({ reason: z.string().trim().min(8).max(300) });

export function registerTrust(app: FastifyInstance, db: Db) {
  app.get("/api/v1/blocks", { config: { access: "authenticated" } }, async (req) => ({ items: await listBlocks(db, req.user!.id) }));
  app.put("/api/v1/blocks/:userId", { config: { access: "authenticated" } }, async (req, reply) => {
    const { kind } = z.object({ kind: z.enum(["BLOCK", "MUTE"]) }).parse(req.body);
    await setBlock(db, req.user!.id, userParam.parse(req.params).userId, kind);
    return reply.status(204).send();
  });
  app.delete("/api/v1/blocks/:userId", { config: { access: "authenticated" } }, async (req, reply) => {
    await removeBlock(db, req.user!.id, userParam.parse(req.params).userId);
    return reply.status(204).send();
  });

  app.post("/api/v1/reports", { config: { access: "authenticated" } }, async (req, reply) => {
    const body = z.object({
      targetType: z.enum(["USER", "PICKUP_GAME", "COURT"]), targetId: z.uuid(),
      reason: z.enum(["HARASSMENT", "UNSAFE", "SPAM", "IMPERSONATION", "INAPPROPRIATE", "OTHER"]),
      note: z.string().trim().max(500).optional(),
    }).parse(req.body);
    await fileReport(db, req.user!.id, body);
    // Deliberately no case id: reporters learn nothing about moderation state.
    return reply.status(202).send({ ok: true });
  });

  const review = { action: "moderation:review" } as const;
  app.get("/api/v1/moderation/cases", { config: { access: review } }, async (req) => {
    const { status } = z.object({ status: z.enum(["OPEN", "RESOLVED", "DISMISSED"]).default("OPEN") }).parse(req.query);
    return { items: await listCases(db, status) };
  });
  app.get("/api/v1/moderation/cases/:id", { config: { access: review } }, async (req) =>
    readCase(db, req.user!.id, idParam.parse(req.params).id, reasonQuery.parse(req.query).reason));
  app.post("/api/v1/moderation/cases/:id/resolve", { config: { access: review } }, async (req, reply) => {
    const body = z.object({ outcome: z.enum(["RESOLVED", "DISMISSED"]), note: z.string().trim().min(3).max(500) }).parse(req.body);
    await resolveCase(db, req.user!.id, idParam.parse(req.params).id, body.outcome, body.note);
    return reply.status(204).send();
  });

  // Reading the audit trail is itself audited.
  app.get("/api/v1/admin/audit", { config: { access: { action: "audit:read" } } }, async (req) => {
    const { reason } = reasonQuery.parse(req.query);
    await writeAudit(db, { actorId: req.user!.id, action: "audit.read", reason });
    return { items: await listAudit(db, 200) };
  });
}
