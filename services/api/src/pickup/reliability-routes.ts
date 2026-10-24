import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import {
  getHostReliability,
  listHostReviews,
  submitHostReview,
} from "./reliability.js";

const me = (req: FastifyRequest) => req.user!.id;
const authed = { config: { access: "authenticated" as const } };
const publicAccess = { config: { access: "public" as const } };

const reviewBody = z.object({
  runHappened: z.boolean(),
  rating: z.number().int().min(1).max(5),
  punctuality: z.enum(["ON_TIME", "SLIGHTLY_LATE", "NO_SHOW"]).optional(),
  competitionMatched: z.boolean().optional(),
  feedbackNotes: z.string().trim().max(1000).optional(),
});

const gameParam = z.object({ id: z.string().uuid() });
const hostParam = z.object({ id: z.string().uuid() });

export function registerReliabilityRoutes(app: FastifyInstance, db: Db) {
  // Submit a review for a hosted pickup game (participant only)
  app.post("/api/v1/pickup/:id/reviews", authed, async (req, reply) => {
    const { id } = gameParam.parse(req.params);
    const body = reviewBody.parse(req.body);
    const review = await submitHostReview(db, id, me(req), body);
    return reply.status(201).send(review);
  });
  app.post("/api/v1/pickup/games/:id/reviews", authed, async (req, reply) => {
    const { id } = gameParam.parse(req.params);
    const body = reviewBody.parse(req.body);
    const review = await submitHostReview(db, id, me(req), body);
    return reply.status(201).send(review);
  });

  // Get host reliability score and completed metrics
  app.get("/api/v1/hosts/:id/reliability", publicAccess, async (req) => {
    const { id } = hostParam.parse(req.params);
    const metrics = await getHostReliability(db, id);
    return metrics;
  });

  // List recent public reviews for a host
  app.get("/api/v1/hosts/:id/reviews", publicAccess, async (req) => {
    const { id } = hostParam.parse(req.params);
    const items = await listHostReviews(db, id);
    return { items };
  });
}
