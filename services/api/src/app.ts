import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { ZodError } from "zod";
import type { Db } from "./db/index.js";
import { enforceAccess } from "./authz/guard.js";
import { MatchBus } from "./match/bus.js";
import { registerMatchScoring } from "./match/routes.js";
import { registerCompetitions } from "./competition/routes.js";
import { registerCourts } from "./court/routes.js";
import { registerTraining } from "./training/routes.js";
import { registerPickup } from "./pickup/routes.js";
import { ConsoleMailer, type Mailer } from "./identity/mailer.js";
import { registerIdentity } from "./identity/routes.js";
import { registerConsent } from "./consent/routes.js";
import { registerTrust } from "./trust/routes.js";
import { registerFilm } from "./film/routes.js";
import { LocalDiskStorage, type MediaStorage } from "./media/storage.js";

export async function buildApp(db: Db, opts: { secureCookies?: boolean; rateLimit?: boolean; allowedOrigins?: string[]; mailer?: Mailer; webBaseUrl?: string; rateLimitScale?: number; requireVerifiedGuardianEmail?: boolean; storage?: MediaStorage; maxVideoBytes?: number; logger?: boolean; logStream?: { write(msg: string): void } } = {}): Promise<FastifyInstance> {
  // Structured JSON logs with the request id. Cookies and credentials are redacted and request bodies are never logged.
  const logger = opts.logger || opts.logStream
    ? { level: "info", redact: { paths: ["req.headers.cookie", "req.headers.authorization", 'res.headers["set-cookie"]'], censor: "[redacted]" }, ...(opts.logStream ? { stream: opts.logStream } : {}) }
    : false;
  const app = Fastify({
    logger,
    genReqId: (req) => (req.headers["x-request-id"] as string | undefined) ?? randomUUID(),
    requestIdHeader: "x-request-id",
  });

  await app.register(helmet);
  await app.register(cookie);
  await app.register(rateLimit, { global: false });
  app.addHook("onSend", async (req, reply) => {
    reply.header("x-request-id", req.id);
  });

  // RFC 9457 problem+json for every error.
  app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
    const status = err instanceof ZodError ? 400 : (err.statusCode ?? 500);
    reply.status(status).type("application/problem+json").send({
      type: "about:blank",
      title: status >= 500 ? "Internal Server Error" : err instanceof ZodError ? "Invalid request" : err.message,
      status,
      instance: req.url,
      requestId: req.id,
    });
  });
  app.setNotFoundHandler((req, reply) => {
    reply.status(404).type("application/problem+json").send({
      type: "about:blank", title: "Not Found", status: 404, instance: req.url, requestId: req.id,
    });
  });

  enforceAccess(app, db);
  registerIdentity(app, db, { secureCookies: opts.secureCookies ?? true, allowedOrigins: opts.allowedOrigins ?? [],
    mailer: opts.mailer ?? new ConsoleMailer(), rateLimitScale: opts.rateLimitScale ?? 1, webBaseUrl: (opts.webBaseUrl ?? "http://localhost:3000").replace(/\/$/, "") });

  registerConsent(app, db, { requireVerifiedGuardianEmail: opts.requireVerifiedGuardianEmail ?? true });
  registerTrust(app, db);
  registerCourts(app, db);
  registerPickup(app, db);
  registerCompetitions(app, db);
  registerTraining(app, db);
  registerFilm(app, db, opts.storage ?? new LocalDiskStorage(join(tmpdir(), "courtiq-media")), opts.maxVideoBytes ?? 1024 ** 3);
  registerMatchScoring(app, db, new MatchBus());

  // Liveness: the process is up. Readiness: it can reach the database (use this for load balancer checks).
  app.get("/health", async () => ({ status: "UP" }));
  app.get("/ready", async (_req, reply) => {
    try {
      await (db as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(sql`select 1`);
      return { status: "READY" };
    } catch {
      return reply.status(503).send({ status: "NOT_READY" });
    }
  });
  return app;
}
