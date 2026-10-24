import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { getAthleteReadiness } from "./readiness.js";

const me = (req: FastifyRequest) => req.user!.id;
const authed = { config: { access: "authenticated" as const } };
const athleteParam = z.object({ id: z.string().uuid() });

export function registerReadinessRoutes(app: FastifyInstance, db: Db) {
  // Current user's training-to-game readiness & correlation summary
  app.get("/api/v1/me/readiness", authed, async (req) => {
    const summary = await getAthleteReadiness(db, me(req), me(req));
    return summary;
  });

  // Athlete readiness lookup (scoped; negative authZ returns 404 for unauthorized actors)
  app.get("/api/v1/athletes/:id/readiness", authed, async (req) => {
    const { id } = athleteParam.parse(req.params);
    const summary = await getAthleteReadiness(db, id, me(req));
    return summary;
  });
}
