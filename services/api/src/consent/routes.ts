import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { CONSENT_KINDS, acceptGuardianship, consentsForSubject, grantConsent, inviteGuardian, listGuardianships, pendingInvitesFor, revokeConsent, revokeGuardianship } from "./service.js";

const idParam = z.object({ id: z.uuid() });
const kindParam = z.object({ kind: z.enum(CONSENT_KINDS) });
const subjectBody = z.object({ subjectId: z.uuid().optional() });

export function registerConsent(app: FastifyInstance, db: Db, opts: { requireVerifiedGuardianEmail: boolean }) {
  app.get("/api/v1/consents", { config: { access: "authenticated" } }, async (req) =>
    consentsForSubject(db, req.user!.id, subjectBody.parse(req.query).subjectId ?? req.user!.id));

  // `subjectId` is only for a guardian acting for their ward; omitted means "me".
  app.put("/api/v1/consents/:kind", { config: { access: "authenticated" } }, async (req, reply) => {
    await grantConsent(db, req.user!.id, subjectBody.parse(req.body ?? {}).subjectId ?? req.user!.id, kindParam.parse(req.params).kind);
    return reply.status(204).send();
  });
  app.delete("/api/v1/consents/:kind", { config: { access: "authenticated" } }, async (req, reply) => {
    await revokeConsent(db, req.user!.id, subjectBody.parse(req.query).subjectId ?? req.user!.id, kindParam.parse(req.params).kind);
    return reply.status(204).send();
  });

  app.get("/api/v1/guardians", { config: { access: "authenticated" } }, async (req) => ({
    ...(await listGuardianships(db, req.user!.id)),
    invitations: await pendingInvitesFor(db, req.user!.email),
  }));
  app.post("/api/v1/guardians", { config: { access: "authenticated" } }, async (req, reply) => {
    const { guardianEmail } = z.object({ guardianEmail: z.email().max(254) }).parse(req.body);
    const rel = await inviteGuardian(db, req.user!, guardianEmail);
    return reply.status(201).send({ id: rel.id, guardianEmail: rel.guardianEmail, status: rel.status });
  });
  app.post("/api/v1/guardians/:id/accept", { config: { access: "authenticated" } }, async (req, reply) => {
    await acceptGuardianship(db, req.user!, idParam.parse(req.params).id, { requireVerifiedEmail: opts.requireVerifiedGuardianEmail });
    return reply.status(204).send();
  });
  app.delete("/api/v1/guardians/:id", { config: { access: "authenticated" } }, async (req, reply) => {
    await revokeGuardianship(db, req.user!.id, idParam.parse(req.params).id);
    return reply.status(204).send();
  });
}
