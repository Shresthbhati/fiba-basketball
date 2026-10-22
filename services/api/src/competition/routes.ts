import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { can } from "../authz/service.js";
import type { Db } from "../db/index.js";
import { AuthError } from "../identity/service.js";
import {
  competitionStandings, createCompetition, listCompetitions, createTeam, generateSchedule, getMatch, getTeam, listMatches, listTeams,
  lockMatch, matchDetail, recordForfeit, recordResult, setMatchTime, registerTeam, visibleCompetition,
} from "./service.js";

const id = z.object({ id: z.uuid() });
const compId = (req: FastifyRequest) => id.parse(req.params).id;
const result = z.object({ homeScore: z.number().int().min(0).max(300), awayScore: z.number().int().min(0).max(300), forfeit: z.boolean().optional() });

const adultsOnly = (req: FastifyRequest) => {
  if (req.user!.isMinor) throw new AuthError(403, "Organizing is limited to adult accounts for now");
};

export function registerCompetitions(app: FastifyInstance, db: Db) {
  const competitionRef = (req: FastifyRequest) => ({ type: "competition", id: compId(req) });
  const matchRef = async (req: FastifyRequest) => {
    const m = await getMatch(db, compId(req)).catch(() => null);
    return m ? { type: "competition", id: m.competitionId } : undefined;
  };
  const manage = { action: "competition:manage", hide: true, resource: competitionRef } as const;

  app.post("/api/v1/teams", { config: { access: "authenticated" } }, async (req, reply) => {
    adultsOnly(req);
    const body = z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body);
    return reply.status(201).send(await createTeam(db, req.user!.id, body.name));
  });
  app.get("/api/v1/teams/:id", { config: { access: "public" } }, async (req) => getTeam(db, compId(req)));

  app.post("/api/v1/competitions", { config: { access: { action: "competition:create" } } }, async (req, reply) => {
    adultsOnly(req);
    const body = z.object({ name: z.string().trim().min(1).max(100), format: z.enum(["ROUND_ROBIN", "SINGLE_ELIMINATION"]) }).parse(req.body);
    return reply.status(201).send(await createCompetition(db, req.user!.id, body));
  });

  app.get("/api/v1/competitions", { config: { access: "public" } }, async (req) => ({
    items: await listCompetitions(db, req.user?.id ?? null),
  }));

  app.get("/api/v1/competitions/:id", { config: { access: "public" } }, async (req) => {
    const cid = compId(req);
    const manager = req.user ? await can(db, req.user.id, "competition:manage", { type: "competition", id: cid }) : false;
    return { ...(await visibleCompetition(db, cid, manager)), teams: await listTeams(db, cid), canManage: manager };
  });

  app.post("/api/v1/competitions/:id/teams", { config: { access: manage } }, async (req, reply) => {
    const body = z.object({ teamId: z.uuid(), seed: z.number().int().min(1).optional() }).parse(req.body);
    await registerTeam(db, compId(req), body.teamId, body.seed);
    return reply.status(201).send({ ok: true });
  });

  app.post("/api/v1/competitions/:id/schedule", { config: { access: manage } }, async (req, reply) =>
    reply.status(201).send({ items: await generateSchedule(db, compId(req)) }),
  );

  app.get("/api/v1/competitions/:id/matches", { config: { access: "public" } }, async (req) => {
    const cid = compId(req);
    const manager = req.user ? await can(db, req.user.id, "competition:manage", { type: "competition", id: cid }) : false;
    await visibleCompetition(db, cid, manager);
    return { items: await listMatches(db, cid) };
  });

  app.get("/api/v1/competitions/:id/standings", { config: { access: "public" } }, async (req) => {
    const cid = compId(req);
    const manager = req.user ? await can(db, req.user.id, "competition:manage", { type: "competition", id: cid }) : false;
    await visibleCompetition(db, cid, manager);
    return { items: await competitionStandings(db, cid) };
  });

  const manageMatch = { action: "competition:manage", hide: true, resource: matchRef } as const;

  /** Public once the competition is published, like /matches/:id/state. */
  app.get("/api/v1/matches/:id", { config: { access: "public" } }, async (req) => {
    const m = await getMatch(db, compId(req));
    const manager = req.user ? await can(db, req.user.id, "competition:manage", { type: "competition", id: m.competitionId }) : false;
    await visibleCompetition(db, m.competitionId, manager);
    return matchDetail(db, m.id);
  });
  app.patch("/api/v1/matches/:id", { config: { access: manageMatch } }, async (req) => {
    const body = z.object({ scheduledAt: z.iso.datetime({ offset: true }).nullable() }).parse(req.body);
    return setMatchTime(db, compId(req), body.scheduledAt === null ? null : new Date(body.scheduledAt));
  });
  app.post("/api/v1/matches/:id/forfeit", { config: { access: manageMatch } }, async (req) =>
    recordForfeit(db, compId(req), req.user!.id, z.object({ winner: z.enum(["home", "away"]) }).parse(req.body).winner),
  );

  const score = { action: "match:score", hide: true, resource: matchRef } as const;
  app.post("/api/v1/matches/:id/result", { config: { access: score } }, async (req) =>
    recordResult(db, compId(req), req.user!.id, result.parse(req.body)),
  );
  app.post("/api/v1/matches/:id/lock", { config: { access: score } }, async (req) => lockMatch(db, compId(req)));
}
