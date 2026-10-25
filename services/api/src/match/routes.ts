import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { can, grantRole } from "../authz/service.js";
import { getCompetition, getMatch, matchDetail, recordResult, visibleCompetition } from "../competition/service.js";
import type { Db } from "../db/index.js";
import { matchEvents, users } from "../db/schema.js";
import { AuthError } from "../identity/service.js";
import type { MatchBus } from "./bus.js";
import { ConflictError, batchInput, listEvents, matchState, submitEvents } from "./events.js";
import { and, asc, eq } from "drizzle-orm";
import { competitionRosters } from "../db/schema.js";
import { boxScore } from "./box-score.js";
import { buildShotChart } from "./shot-chart.js";
import { hasLineup, secondsOnCourt, type MinuteEvent } from "./minutes.js";
import { matchEventsOf } from "./events.js";

const id = z.object({ id: z.uuid() });
const paramId = (req: FastifyRequest) => id.parse(req.params).id;

export function registerMatchScoring(app: FastifyInstance, db: Db, bus: MatchBus) {
  const matchRef = async (req: FastifyRequest) => {
    const m = await getMatch(db, paramId(req)).catch(() => null);
    return m ? { type: "competition", id: m.competitionId } : undefined;
  };
  const score = { action: "match:score", hide: true, resource: matchRef } as const;

  /** Same visibility rule as the rest of the competition: unpublished competitions are 404 to the public. */
  async function viewable(req: FastifyRequest) {
    const m = await getMatch(db, paramId(req));
    const manager = req.user ? await can(db, req.user.id, "competition:manage", { type: "competition", id: m.competitionId }) : false;
    await visibleCompetition(db, m.competitionId, manager);
    return m;
  }

  type RosterRow = { userId: string; name: string; jersey: number };
  const rosterOf = async (competitionId: string, teamId: string | null): Promise<RosterRow[]> =>
    teamId === null ? [] : db.select({ userId: users.id, name: users.displayName, jersey: competitionRosters.jersey })
      .from(competitionRosters).innerJoin(users, eq(users.id, competitionRosters.userId))
      .where(and(eq(competitionRosters.competitionId, competitionId), eq(competitionRosters.teamId, teamId))).orderBy(asc(competitionRosters.jersey));

  /** The two rosters a scorer picks players from. */
  app.get("/api/v1/matches/:id/rosters", { config: { access: score } }, async (req) => {
    const m = await getMatch(db, paramId(req));
    return { home: await rosterOf(m.competitionId, m.homeTeamId), away: await rosterOf(m.competitionId, m.awayTeamId) };
  });

  /**
   * Box score: public once the competition is published. Players appear by jersey number; names are added only for people who may
   * see that team's roster (its members and the organizer), because rosters are not public.
   */
  app.get("/api/v1/matches/:id/box-score", { config: { access: "public" } }, async (req) => {
    const m = await viewable(req);
    const events = await matchEventsOf(db, m.id);
    const stats = boxScore(events.map((e) => ({ id: e.id, type: e.type as never, side: e.side as never, playerId: e.playerId, correctsEventId: e.correctsEventId })));
    const timed = events.map((e): MinuteEvent => ({ id: e.id, type: e.type as never, side: e.side as never, period: e.period, clockSeconds: e.clockSeconds, playerId: e.playerId, playerOutId: e.playerOutId, correctsEventId: e.correctsEventId }));
    const onCourt = secondsOnCourt(timed);
    const out = {} as Record<"home" | "away", { players: unknown[]; unattributed: unknown; total: unknown }>;
    for (const side of ["home", "away"] as const) {
      const teamId = side === "home" ? m.homeTeamId : m.awayTeamId;
      const seesNames = req.user && teamId
        ? (await can(db, req.user.id, "team:view", { type: "team", id: teamId })) || (await can(db, req.user.id, "competition:manage", { type: "competition", id: m.competitionId }))
        : false;
      const roster = new Map((await rosterOf(m.competitionId, teamId)).map((r) => [r.userId, r]));
      const timedSide = onCourt !== null && hasLineup(timed, side);
      const players = [...stats.players.entries()].filter(([, p]) => p.side === side).map(([userId, p]) => {
        const r = roster.get(userId);
        // seconds is null when no lineup was recorded for this side (never a made-up 0).
        return { jersey: r?.jersey ?? null, ...(seesNames && r ? { name: r.name } : {}), seconds: timedSide ? (onCourt!.get(userId) ?? 0) : null, ...p.line };
      }).sort((a, b) => (a.jersey ?? 999) - (b.jersey ?? 999));
      out[side] = { players, unattributed: stats.unattributed[side], total: stats.totals[side] };
    }
    return out;
  });

  /**
   * Verified Shot Chart & Zone Efficiency (WP-3.4, Master Spec §6.4).
   * Derived from official match events with geometric zone categorization and sample size indicators.
   */
  app.get("/api/v1/matches/:id/shot-chart", { config: { access: "public" } }, async (req) => {
    const m = await viewable(req);
    const query = z.object({
      side: z.enum(["home", "away"]).optional(),
      playerId: z.string().uuid().optional(),
      period: z.coerce.number().int().min(1).max(10).optional(),
    }).parse(req.query);

    let events = await matchEventsOf(db, m.id);
    if (query.side) {
      events = events.filter((e) => e.side === query.side);
    }
    if (query.playerId) {
      events = events.filter((e) => e.playerId === query.playerId);
    }
    if (query.period) {
      events = events.filter((e) => e.period === query.period);
    }

    const rosterMap = new Map<string, { name: string; jersey: number }>();
    for (const side of ["home", "away"] as const) {
      const teamId = side === "home" ? m.homeTeamId : m.awayTeamId;
      const seesNames = req.user && teamId
        ? (await can(db, req.user.id, "team:view", { type: "team", id: teamId })) || (await can(db, req.user.id, "competition:manage", { type: "competition", id: m.competitionId }))
        : false;
      const rows = await rosterOf(m.competitionId, teamId);
      for (const r of rows) {
        rosterMap.set(r.userId, {
          name: seesNames ? r.name : `#${r.jersey}`,
          jersey: r.jersey,
        });
      }
    }

    const shotChart = buildShotChart(events.map((e) => ({
      id: e.id,
      type: e.type as never,
      side: e.side as never,
      period: e.period,
      clockSeconds: e.clockSeconds,
      playerId: e.playerId,
      correctsEventId: e.correctsEventId,
      coordX: e.coordX,
      coordY: e.coordY,
      shotZone: e.shotZone,
      distanceMeters: e.distanceMeters,
    })), rosterMap);

    return {
      matchId: m.id,
      competitionId: m.competitionId,
      sourceType: "OFFICIAL",
      ...shotChart,
    };
  });

  /**
   * Cumulative career shot chart for a player across all official matches (WP-3.4, Master Spec §11.1).
   */
  app.get("/api/v1/players/:id/shot-chart", { config: { access: "public" } }, async (req) => {
    const playerId = paramId(req);
    const [user] = await db.select({ id: users.id, name: users.displayName }).from(users).where(eq(users.id, playerId));
    if (!user) {
      throw new AuthError(404, "Player not found");
    }

    const events = await db
      .select()
      .from(matchEvents)
      .where(eq(matchEvents.playerId, playerId))
      .orderBy(asc(matchEvents.createdAt));

    const rosterMap = new Map<string, { name: string; jersey: number }>();
    rosterMap.set(playerId, { name: user.name, jersey: 0 });

    const shotChart = buildShotChart(events.map((e) => ({
      id: e.id,
      type: e.type as never,
      side: e.side as never,
      period: e.period,
      clockSeconds: e.clockSeconds,
      playerId: e.playerId,
      correctsEventId: e.correctsEventId,
      coordX: e.coordX,
      coordY: e.coordY,
      shotZone: e.shotZone,
      distanceMeters: e.distanceMeters,
    })), rosterMap);

    return {
      playerId,
      playerName: user.name,
      sourceType: "OFFICIAL",
      ...shotChart,
    };
  });

  app.post("/api/v1/matches/:id/events", { config: { access: score } }, async (req, reply) => {
    try {
      return await submitEvents(db, bus, paramId(req), req.user!.id, batchInput.parse(req.body));
    } catch (e) {
      if (e instanceof ConflictError) {
        return reply.status(409).type("application/problem+json").send({
          type: "about:blank", title: e.message, status: 409, instance: req.url, requestId: req.id, ...e.body,
        });
      }
      throw e;
    }
  });

  app.get("/api/v1/matches/:id/state", { config: { access: "public" } }, async (req) => {
    const m = await viewable(req);
    const detail = await matchDetail(db, m.id);
    return {
      matchId: m.id,
      competitionId: m.competitionId,
      competitionName: detail.competitionName,
      round: m.round,
      slot: m.slot,
      stage: m.stage,
      groupName: m.groupName,
      courtName: m.courtName,
      scheduledAt: detail.scheduledAt,
      homeTeam: detail.home,
      awayTeam: detail.away,
      matchState: m.state,
      ...(await matchState(db, m.id)),
    };
  });

  app.get("/api/v1/matches/:id/events", { config: { access: "public" } }, async (req) => {
    const m = await viewable(req);
    const after = z.coerce.number().int().min(0).default(0).parse((req.query as { after?: string }).after);
    return { items: await listEvents(db, m.id, after) };
  });

  /** Server-Sent Events. Each message is a hint; clients refetch /state after reconnecting. */
  app.get("/api/v1/matches/:id/stream", { config: { access: "public" } }, async (req, reply) => {
    const m = await viewable(req);
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "x-accel-buffering": "no" });
    raw.write(`retry: 3000\n\n`);
    const unsub = bus.subscribe(m.id, (msg) => raw.write(`id: ${msg.id}\nevent: ${msg.type}\ndata: ${JSON.stringify(msg)}\n\n`));
    const ping = setInterval(() => raw.write(`: ping\n\n`), 15_000);
    req.raw.on("close", () => { clearInterval(ping); unsub(); });
  });

  /** Spec §22.1 typed envelope Server-Sent Events endpoint */
  app.get("/api/v1/streams/matches/:id", { config: { access: "public" } }, async (req, reply) => {
    const m = await viewable(req);
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive", "x-accel-buffering": "no" });
    raw.write("retry: 3000\n\n");
    const unsub = bus.subscribe(m.id, (msg) => raw.write("id: " + msg.id + "\nevent: " + msg.type + "\ndata: " + JSON.stringify(msg) + "\n\n"));
    const ping = setInterval(() => raw.write(": ping\n\n"), 15_000);
    req.raw.on("close", () => { clearInterval(ping); unsub(); });
  });

  /** Ends scoring: the score becomes the official result using the same path (and audit log) as manual entry. */
  app.post("/api/v1/matches/:id/finalize", { config: { access: score } }, async (req) => {
    const mid = paramId(req);
    const state = await matchState(db, mid);
    if (state.version === 0) throw new AuthError(409, "No events recorded");
    return recordResult(db, mid, req.user!.id, { homeScore: state.homeScore, awayScore: state.awayScore });
  });

  /** An organizer assigns scorekeepers/referees to one competition. */
  app.post(
    "/api/v1/competitions/:id/officials",
    { config: { access: { action: "competition:manage", hide: true, resource: (req) => ({ type: "competition", id: paramId(req) }) } } },
    async (req, reply) => {
      const body = z.object({ email: z.email(), role: z.enum(["SCOREKEEPER", "REFEREE"]) }).parse(req.body);
      const cid = paramId(req);
      await getCompetition(db, cid);
      const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email.trim().toLowerCase()));
      if (!u) throw new AuthError(404, "No account with that email");
      await grantRole(db, u.id, body.role, { type: "competition", id: cid });
      return reply.status(201).send({ ok: true });
    },
  );
}
