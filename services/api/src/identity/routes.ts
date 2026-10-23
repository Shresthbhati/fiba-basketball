import { myCareer } from "../career/service.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { permissionsFor } from "../authz/service.js";
import type { Mailer } from "./mailer.js";
import { confirmPasswordReset, requestPasswordReset, sendVerification, verifyEmail } from "./tokens.js";
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

export function registerIdentity(app: FastifyInstance, db: Db, opts: { secureCookies: boolean; allowedOrigins?: string[]; mailer: Mailer; webBaseUrl: string; rateLimitScale?: number }) {
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

  const scale = Math.max(1, opts.rateLimitScale ?? 1); // production keeps 1; automated browser tests raise it
  const authLimit = { config: { rateLimit: { max: 10 * scale, timeWindow: "1 minute" } } };

  app.post("/api/v1/auth/signup", { ...authLimit, config: { ...authLimit.config, access: "public" } }, async (req, reply) => {
    const body = signupBody.parse(req.body);
    const { user, token } = await signup(db, body);
    await sendVerification(db, opts.mailer, opts.webBaseUrl, user.id).catch(() => undefined); // a mail outage must not block sign-up
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

  const tokenBody = z.object({ token: z.string().min(20).max(200) });
  const strict = { config: { rateLimit: { max: 5 * scale, timeWindow: "1 minute" } } };

  app.post("/api/v1/auth/password-reset/request", { ...strict, config: { ...strict.config, access: "public" } }, async (req, reply) => {
    const { email } = z.object({ email: z.string().min(3).max(320) }).parse(req.body);
    await requestPasswordReset(db, opts.mailer, opts.webBaseUrl, email).catch(() => undefined);
    return reply.status(202).send({ ok: true }); // same answer whether or not the account exists
  });

  app.post("/api/v1/auth/password-reset/confirm", { ...authLimit, config: { ...authLimit.config, access: "public" } }, async (req, reply) => {
    const body = tokenBody.extend({ password: z.string().min(10).max(200) }).parse(req.body);
    await confirmPasswordReset(db, body.token, body.password);
    return reply.status(204).send();
  });

  app.post("/api/v1/auth/email/send-verification", { ...strict, config: { ...strict.config, access: "authenticated" } }, async (req, reply) => {
    await sendVerification(db, opts.mailer, opts.webBaseUrl, req.user!.id);
    return reply.status(202).send({ ok: true });
  });

  app.post("/api/v1/auth/email/verify", { ...authLimit, config: { ...authLimit.config, access: "public" } }, async (req, reply) => {
    await verifyEmail(db, tokenBody.parse(req.body).token);
    return reply.status(204).send();
  });

  app.get("/api/v1/me", { config: { access: "authenticated" } }, async (req) => req.user);

  // A player's own record from official results. Private: there is no way to read someone else's.
  app.get("/api/v1/me/career", { config: { access: "authenticated" } }, async (req) => myCareer(db, req.user!.id));

  app.get("/api/v1/me/permissions", { config: { access: "authenticated" } }, async (req) =>
    permissionsFor(db, req.user!.id),
  );
}
