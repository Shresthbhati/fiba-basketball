import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { can, grantRole } from "../authz/service.js";
import { getCompetition, getMatch, recordResult, visibleCompetition } from "../competition/service.js";
import type { Db } from "../db/index.js";
import { users } from "../db/schema.js";
import { AuthError } from "../identity/service.js";
import type { MatchBus } from "./bus.js";
import { ConflictError, batchInput, listEvents, matchState, submitEvents } from "./events.js";
import { eq } from "drizzle-orm";

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
    return { matchState: m.state, ...(await matchState(db, m.id)) };
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
