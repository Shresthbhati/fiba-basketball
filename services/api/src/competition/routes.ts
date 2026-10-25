import { getRoster, removeRosterSpot, setRosterSpot } from "./roster.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { can } from "../authz/service.js";
import type { Db } from "../db/index.js";
import { AuthError } from "../identity/service.js";
import { getCompetitionEmbedSummary } from "./embed.js";
import { validateScheduleConflicts } from "./schedule.js";
import {
  applyAutoSchedule, applyDelay, competitionStandings, createCompetition, listCompetitions, createTeam, generateSchedule,
  getCommandCenter, getCompetitionOfficials, getCompetitionScheduleConflicts, getMatch, getTeam, listMatches, listTeams,
  lockMatch, matchDetail, previewDelayImpact, recordForfeit, recordResult, setMatchTime, registerTeam, visibleCompetition,
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

  // Rosters: visible to the team's members and the competition's organizer only (the handlers answer 404 to everyone else).
  const rosterParams = z.object({ id: z.uuid(), teamId: z.uuid(), userId: z.uuid().optional() });
  app.get("/api/v1/competitions/:id/teams/:teamId/roster", { config: { access: "authenticated" } }, async (req) => {
    const p = rosterParams.parse(req.params);
    return getRoster(db, req.user!, p.id, p.teamId);
  });
  app.put("/api/v1/competitions/:id/teams/:teamId/roster/:userId", { config: { access: "authenticated" } }, async (req, reply) => {
    const p = rosterParams.extend({ userId: z.uuid() }).parse(req.params);
    const { jersey } = z.object({ jersey: z.number().int().min(0).max(99) }).parse(req.body);
    await setRosterSpot(db, req.user!, p.id, p.teamId, p.userId, jersey);
    return reply.status(204).send();
  });
  app.delete("/api/v1/competitions/:id/teams/:teamId/roster/:userId", { config: { access: "authenticated" } }, async (req, reply) => {
    const p = rosterParams.extend({ userId: z.uuid() }).parse(req.params);
    await removeRosterSpot(db, req.user!, p.id, p.teamId, p.userId);
    return reply.status(204).send();
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

  app.get("/api/v1/competitions/:id/officials", { config: { access: manage } }, async (req) => ({
    items: await getCompetitionOfficials(db, compId(req)),
  }));

  app.get("/api/v1/competitions/:id/command-center", { config: { access: manage } }, async (req) =>
    getCommandCenter(db, compId(req)),
  );

  const delayInput = z.object({
    matchId: z.uuid(),
    delayMinutes: z.number().int().min(1).max(360),
  });

  app.post("/api/v1/competitions/:id/delay-impact", { config: { access: manage } }, async (req) =>
    previewDelayImpact(db, compId(req), delayInput.parse(req.body)),
  );

  // Schedule conflict detection and validation (Spec §10.2, §17.1)
  app.get("/api/v1/competitions/:id/schedule/conflicts", { config: { access: "public" } }, async (req) => {
    const cid = compId(req);
    const query = z.object({
      minRestMinutes: z.coerce.number().int().min(0).max(300).optional(),
    }).parse(req.query);
    return getCompetitionScheduleConflicts(db, cid, query);
  });

  app.post("/api/v1/competitions/:id/schedule/validate", { config: { access: "public" } }, async (req) => {
    const body = z.object({
      matches: z.array(z.object({
        id: z.string(),
        homeTeamId: z.string().nullable().optional(),
        awayTeamId: z.string().nullable().optional(),
        courtName: z.string().nullable().optional(),
        scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
        estimatedDurationMinutes: z.number().int().min(15).max(240).optional(),
        isBye: z.boolean().optional(),
      })),
      minRestMinutes: z.number().int().min(0).max(300).optional(),
    }).parse(req.body);
    return validateScheduleConflicts(body.matches, { minRestMinutes: body.minRestMinutes });
  });

  app.post("/api/v1/competitions/:id/schedule/auto-assign", { config: { access: manage } }, async (req) => {
    const cid = compId(req);
    const body = z.object({
      availableCourts: z.array(z.string().trim().min(1)).min(1),
      startDateTime: z.string().datetime({ offset: true }),
      matchDurationMinutes: z.number().int().min(15).max(180).optional(),
      bufferMinutes: z.number().int().min(0).max(60).optional(),
      minRestMinutes: z.number().int().min(0).max(240).optional(),
      dailyStartHour: z.number().int().min(0).max(23).optional(),
      dailyEndHour: z.number().int().min(1).max(24).optional(),
    }).parse(req.body);
    return applyAutoSchedule(db, cid, body);
  });

  app.post("/api/v1/competitions/:id/apply-delay", { config: { access: manage } }, async (req) =>
    applyDelay(db, compId(req), delayInput.parse(req.body)),
  );

  const manageMatch = { action: "competition:manage", hide: true, resource: matchRef } as const;

  /** Public once the competition is published, like /matches/:id/state. */
  app.get("/api/v1/matches/:id", { config: { access: "public" } }, async (req) => {
    const m = await getMatch(db, compId(req));
    const manager = req.user ? await can(db, req.user.id, "competition:manage", { type: "competition", id: m.competitionId }) : false;
    await visibleCompetition(db, m.competitionId, manager);
    return matchDetail(db, m.id);
  });
  app.patch("/api/v1/matches/:id", { config: { access: manageMatch } }, async (req) => {
    const body = z.object({
      scheduledAt: z.iso.datetime({ offset: true }).nullable().optional(),
      courtName: z.string().trim().nullable().optional(),
      estimatedDurationMinutes: z.number().int().min(15).max(240).optional(),
    }).parse(req.body);
    return setMatchTime(
      db,
      compId(req),
      body.scheduledAt !== undefined ? (body.scheduledAt === null ? null : new Date(body.scheduledAt)) : undefined,
      body.courtName,
      body.estimatedDurationMinutes
    );
  });
  app.post("/api/v1/matches/:id/forfeit", { config: { access: manageMatch } }, async (req) =>
    recordForfeit(db, compId(req), req.user!.id, z.object({ winner: z.enum(["home", "away"]) }).parse(req.body).winner),
  );

  const score = { action: "match:score", hide: true, resource: matchRef } as const;
  app.post("/api/v1/matches/:id/result", { config: { access: score } }, async (req) =>
    recordResult(db, compId(req), req.user!.id, result.parse(req.body)),
  );
  app.post("/api/v1/matches/:id/lock", { config: { access: score } }, async (req) => lockMatch(db, compId(req)));

  // Public Embeddable Tournament Endpoints (Spec §8.5, §15.2)
  app.get("/api/v1/embed/competitions/:id/summary", { config: { access: "public" } }, async (req) => {
    return getCompetitionEmbedSummary(db, compId(req));
  });

  app.get("/api/v1/embed/competitions/:id/standings", { config: { access: "public" } }, async (req) => {
    const summary = await getCompetitionEmbedSummary(db, compId(req));
    return { competition: summary.competition, standings: summary.standings, stats: summary.stats };
  });

  app.get("/api/v1/embed/competitions/:id/bracket", { config: { access: "public" } }, async (req) => {
    const summary = await getCompetitionEmbedSummary(db, compId(req));
    return { competition: summary.competition, bracket: summary.bracket, stats: summary.stats };
  });

  app.get("/api/v1/embed/competitions/:id/schedule", { config: { access: "public" } }, async (req) => {
    const summary = await getCompetitionEmbedSummary(db, compId(req));
    return { competition: summary.competition, schedule: summary.schedule, stats: summary.stats };
  });
}
