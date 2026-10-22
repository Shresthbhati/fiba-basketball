import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { permissionsFor } from "../authz/service.js";
import type { Db } from "../db/index.js";
import { AuthError, SESSION_TTL_MS, login, logout, signup, userForToken, type PublicUser } from "./service.js";

const safeHost = (origin: string) => { try { return new URL(origin).host; } catch { return null; } };

export const COOKIE = "ciq_session";

const signupBody = z.object({
  email: z.email(),
  password: z.string().min(10).max(200),
  displayName: z.string().trim().min(1).max(60),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const loginBody = z.object({ email: z.string().min(1).max(320), password: z.string().min(1).max(200) });

declare module "fastify" {
  interface FastifyRequest {
    user: PublicUser | null;
  }
}

export function registerIdentity(app: FastifyInstance, db: Db, opts: { secureCookies: boolean; allowedOrigins?: string[] }) {
  app.decorateRequest("user", null);

  // CSRF: browsers always send Origin on cross-site mutations. When the web app proxies /api to us the Host header
  // is rewritten, so deployments list their web origin(s) in ALLOWED_ORIGINS; with no list we require Origin to match Host.
  const allowed = new Set((opts.allowedOrigins ?? []).map((o) => o.replace(/\/$/, "")));
  app.addHook("onRequest", async (req) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
    const origin = req.headers.origin;
    if (!origin) return;
    const ok = allowed.size > 0 ? allowed.has(origin.replace(/\/$/, "")) : safeHost(origin) === req.headers.host;
    if (!ok) throw new AuthError(403, "Cross-origin request blocked");
  });

  app.addHook("onRequest", async (req) => {
    const token = req.cookies[COOKIE];
    if (token) req.user = await userForToken(db, token);
  });

  const setCookie = (reply: import("fastify").FastifyReply, token: string) =>
    reply.setCookie(COOKIE, token, {
      httpOnly: true, sameSite: "lax", secure: opts.secureCookies, path: "/", maxAge: SESSION_TTL_MS / 1000,
    });

  const authLimit = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

  app.post("/api/v1/auth/signup", { ...authLimit, config: { ...authLimit.config, access: "public" } }, async (req, reply) => {
    const body = signupBody.parse(req.body);
    const { user, token } = await signup(db, body);
    setCookie(reply, token);
    return reply.status(201).send(user);
  });

  app.post("/api/v1/auth/login", { ...authLimit, config: { ...authLimit.config, access: "public" } }, async (req, reply) => {
    const body = loginBody.parse(req.body);
    const { user, token } = await login(db, body.email, body.password);
    setCookie(reply, token);
    return user;
  });

  app.post("/api/v1/auth/logout", { config: { access: "public" } }, async (req: FastifyRequest, reply) => {
    const token = req.cookies[COOKIE];
    if (token) await logout(db, token);
    reply.clearCookie(COOKIE, { path: "/" });
    return reply.status(204).send();
  });

  app.get("/api/v1/me", { config: { access: "authenticated" } }, async (req) => req.user);

  app.get("/api/v1/me/permissions", { config: { access: "authenticated" } }, async (req) =>
    permissionsFor(db, req.user!.id),
  );
}
