import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { getCourtActivitySummary, recordCourtCheckIn } from "./activity.js";

const me = (req: FastifyRequest) => req.user!.id;
const authed = { config: { access: "authenticated" as const } };
const publicAccess = { config: { access: "public" as const } };

const checkInBody = z.object({
  headcountEstimate: z.number().int().min(1).max(50).optional(),
  conditionReport: z
    .enum(["EXCELLENT", "GOOD", "FAIR", "WET_SLIPPERY", "DAMAGED_HOOP"])
    .optional(),
  notes: z.string().trim().max(500).optional(),
});

const courtParam = z.object({ id: z.string().uuid() });

export function registerCourtActivityRoutes(app: FastifyInstance, db: Db) {
  // Check in at court
  app.post("/api/v1/courts/:id/check-in", authed, async (req, reply) => {
    const { id } = courtParam.parse(req.params);
    const body = checkInBody.parse(req.body ?? {});
    const checkIn = await recordCourtCheckIn(db, id, me(req), body);
    return reply.status(201).send(checkIn);
  });

  // Get privacy-preserving court activity history and heatmap
  app.get("/api/v1/courts/:id/activity", publicAccess, async (req) => {
    const { id } = courtParam.parse(req.params);
    const summary = await getCourtActivitySummary(db, id);
    return summary;
  });
}
