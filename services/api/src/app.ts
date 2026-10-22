import { randomUUID } from "node:crypto";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
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

export async function buildApp(db: Db, opts: { secureCookies?: boolean; rateLimit?: boolean; allowedOrigins?: string[]; mailer?: Mailer; webBaseUrl?: string; rateLimitScale?: number } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    genReqId: (req) => (req.headers["x-request-id"] as string | undefined) ?? randomUUID(),
    requestIdHeader: "x-request-id",
  });

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

  registerCourts(app, db);
  registerPickup(app, db);
  registerCompetitions(app, db);
  registerTraining(app, db);
  registerMatchScoring(app, db, new MatchBus());

  app.get("/health", async () => ({ status: "UP" }));
  return app;
}
