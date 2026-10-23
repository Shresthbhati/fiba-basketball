import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { AuthError } from "../identity/service.js";
import {
  createReport,
  getReport,
  listReports,
  updateReport,
  deleteReport,
} from "./report.js";

const idParam = z.object({ id: z.string().uuid() });
const teamIdParam = z.object({ teamId: z.string().uuid() });
const idOf = (req: FastifyRequest) => idParam.parse(req.params).id;
const teamIdOf = (req: FastifyRequest) => teamIdParam.parse(req.params).teamId;
const me = (req: FastifyRequest) => req.user!.id;
const authed = { config: { access: "authenticated" as const } };

const citationSchema = z.object({
  citationType: z.enum(["CLIP", "EVENT", "METRIC"]),
  targetId: z.string().min(1).max(100),
  gameId: z.string().uuid().optional(),
  timestampMs: z.number().int().min(0).optional(),
  note: z.string().trim().max(300).optional(),
});

const reportBlockSchema = z.object({
  id: z.string().min(1).max(50),
  title: z.string().trim().min(1).max(150),
  claimType: z.enum(["OBSERVED", "DERIVED", "HYPOTHESIS"]),
  statement: z.string().trim().min(1).max(2000),
  sampleSize: z.number().int().min(1).optional(),
  confidence: z.number().min(0).max(1).optional(),
  citations: z.array(citationSchema).default([]),
});

const createReportBody = z.object({
  title: z.string().trim().min(1).max(150),
  summary: z.string().trim().max(1000).optional(),
  tags: z.array(z.string().trim().max(50)).default([]),
  blocks: z.array(reportBlockSchema).min(1),
});

const updateReportBody = z.object({
  title: z.string().trim().min(1).max(150).optional(),
  summary: z.string().trim().max(1000).optional(),
  tags: z.array(z.string().trim().max(50)).optional(),
  blocks: z.array(reportBlockSchema).min(1).optional(),
});

export function registerReportRoutes(app: FastifyInstance, db: Db) {
  // 1. Create tactical report for a team
  app.post("/api/v1/teams/:teamId/reports", authed, async (req, reply) => {
    const body = createReportBody.parse(req.body);
    const report = await createReport(db, me(req), teamIdOf(req), body);
    return reply.status(201).send(report);
  });

  // 2. List tactical reports for a team
  app.get("/api/v1/teams/:teamId/reports", authed, async (req) => {
    const items = await listReports(db, me(req), teamIdOf(req));
    return { items };
  });

  // 3. Get single tactical report (negative authZ: non-members receive 404)
  app.get("/api/v1/reports/:id", authed, async (req) => {
    const report = await getReport(db, me(req), idOf(req));
    if (!report) {
      throw new AuthError(404, "Report not found");
    }
    return report;
  });

  // 4. Update tactical report
  app.put("/api/v1/reports/:id", authed, async (req) => {
    const body = updateReportBody.parse(req.body);
    const updated = await updateReport(db, me(req), idOf(req), body);
    return updated;
  });

  // 5. Delete tactical report
  app.delete("/api/v1/reports/:id", authed, async (req, reply) => {
    await deleteReport(db, me(req), idOf(req));
    return reply.status(204).send();
  });
}
