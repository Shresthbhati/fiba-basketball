import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import {
  getPregameChecklist,
  listAssignedMatches,
  listIncidentReports,
  savePregameChecklist,
  signOffMatch,
  submitIncidentReport,
} from "./referee.js";

const me = (req: FastifyRequest) => req.user!.id;
const authed = { config: { access: "authenticated" as const } };

const matchParam = z.object({ id: z.string().uuid() });

const pregameBody = z.object({
  courtSurfaceSafe: z.boolean(),
  perimeterRunoffClear: z.boolean(),
  gameBallPressureChecked: z.boolean(),
  gameClockTested: z.boolean(),
  shotClockTested: z.boolean(),
  jerseyContrastVerified: z.boolean(),
  tableCrewConfirmed: z.boolean(),
  notes: z.string().trim().max(1000).optional(),
});

const incidentBody = z.object({
  incidentType: z.enum([
    "TECHNICAL_FOUL",
    "UNSPORTSMANLIKE_FOUL",
    "DISQUALIFYING_FOUL",
    "EJECTION",
    "PROTEST",
    "DELAY_INCIDENT",
  ]),
  teamId: z.string().uuid().optional(),
  playerId: z.string().uuid().optional(),
  period: z.number().int().min(1).max(10).optional(),
  gameClockTime: z.string().regex(/^([0-5]?\d):[0-5]\d$/, "MM:SS format").optional(),
  description: z.string().trim().min(5).max(2000),
  ruleReference: z.string().trim().max(100).optional(),
});

const signoffBody = z.object({
  isCrewChief: z.boolean().optional(),
  finalScoreVerified: z.boolean().optional(),
  scorebookAudited: z.boolean().optional(),
  refereeNotes: z.string().trim().max(1000).optional(),
});

export function registerRefereeRoutes(app: FastifyInstance, db: Db) {
  // List matches assigned to authenticated referee
  app.get("/api/v1/referee/matches", authed, async (req) => {
    const items = await listAssignedMatches(db, me(req));
    return { items };
  });

  // Pre-game safety checklist
  app.get("/api/v1/matches/:id/pregame", authed, async (req) => {
    const { id } = matchParam.parse(req.params);
    const item = await getPregameChecklist(db, id, me(req));
    return { item };
  });

  app.post("/api/v1/matches/:id/pregame", authed, async (req, reply) => {
    const { id } = matchParam.parse(req.params);
    const body = pregameBody.parse(req.body);
    const checklist = await savePregameChecklist(db, id, me(req), body);
    return reply.status(200).send(checklist);
  });

  // Incident & disciplinary reports
  app.post("/api/v1/matches/:id/incidents", authed, async (req, reply) => {
    const { id } = matchParam.parse(req.params);
    const body = incidentBody.parse(req.body);
    const report = await submitIncidentReport(db, id, me(req), body);
    return reply.status(201).send(report);
  });

  app.get("/api/v1/matches/:id/incidents", authed, async (req) => {
    const { id } = matchParam.parse(req.params);
    const items = await listIncidentReports(db, id, me(req));
    return { items };
  });

  // Official match sign-off & lock
  app.post("/api/v1/matches/:id/signoff", authed, async (req, reply) => {
    const { id } = matchParam.parse(req.params);
    const body = signoffBody.parse(req.body);
    const result = await signOffMatch(db, id, me(req), body);
    return reply.status(200).send(result);
  });
}
