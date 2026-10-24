import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import {
  adjudicateProtest,
  fileMatchProtest,
  listCompetitionProtests,
  listMatchProtests,
} from "./protests.js";

const me = (req: FastifyRequest) => req.user!.id;
const authed = { config: { access: "authenticated" as const } };
const publicAccess = { config: { access: "public" as const } };

const matchParam = z.object({ id: z.string().uuid() });
const compParam = z.object({ id: z.string().uuid() });
const protestParam = z.object({ id: z.string().uuid() });

const protestBody = z.object({
  filingTeamId: z.string().uuid(),
  protestType: z.enum([
    "SCORE_DISCREPANCY",
    "INELIGIBLE_PLAYER",
    "REFEREE_RULE_MISAPPLICATION",
    "CLOCK_OPERATOR_ERROR",
    "OTHER",
  ]),
  period: z.number().int().min(1).max(10).optional(),
  gameClock: z.string().regex(/^([0-5]?\d):[0-5]\d$/, "MM:SS format").optional(),
  ruleCited: z.string().trim().max(60).optional(),
  description: z.string().trim().min(5).max(2000),
});

const rulingBody = z.object({
  ruling: z.enum(["UPHELD", "DISMISSED"]),
  remedyAction: z
    .enum(["NONE", "SCORE_ADJUSTED", "MATCH_FORFEITED", "PERIOD_REPLAY_ORDERED"])
    .optional(),
  refereeTestimony: z.string().trim().max(2000).optional(),
  adjustedHomeScore: z.number().int().min(0).max(300).optional(),
  adjustedAwayScore: z.number().int().min(0).max(300).optional(),
  forfeitWinnerTeamId: z.string().uuid().optional(),
  rulingSummary: z.string().trim().min(5).max(2000),
});

export function registerProtestRoutes(app: FastifyInstance, db: Db) {
  // File match protest
  app.post("/api/v1/matches/:id/protests", authed, async (req, reply) => {
    const { id } = matchParam.parse(req.params);
    const body = protestBody.parse(req.body);
    const protest = await fileMatchProtest(db, id, me(req), body);
    return reply.status(201).send(protest);
  });

  // List protests for a match
  app.get("/api/v1/matches/:id/protests", publicAccess, async (req) => {
    const { id } = matchParam.parse(req.params);
    return listMatchProtests(db, id);
  });

  // List all protests across a competition (organizers only)
  app.get("/api/v1/competitions/:id/protests", authed, async (req) => {
    const { id } = compParam.parse(req.params);
    return listCompetitionProtests(db, id, me(req));
  });

  // Adjudicate protest
  app.post("/api/v1/protests/:id/adjudicate", authed, async (req) => {
    const { id } = protestParam.parse(req.params);
    const body = rulingBody.parse(req.body);
    return adjudicateProtest(db, id, me(req), body);
  });
}
