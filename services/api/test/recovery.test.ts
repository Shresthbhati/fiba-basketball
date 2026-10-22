import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { authTokens } from "../src/db/schema.js";
import type { Mail } from "../src/identity/mailer.js";
import { adultBody, cookieOf, testApp } from "./helpers.js";

type T = Awaited<ReturnType<typeof testApp>>;
const tokenFrom = (m: Mail | undefined) => /token=([\w-]+)/.exec(m?.text ?? "")?.[1] ?? "";
const post = (t: T, url: string, payload: unknown, cookie?: string) =>
  t.app.inject({ method: "POST", url, payload: payload as object, ...(cookie ? { headers: { cookie } } : {}) });
const signup = async (t: T, email = "ada@example.com") => cookieOf(await post(t, "/api/v1/auth/signup", adultBody({ email })));
const login = (t: T, email: string, password: string) => post(t, "/api/v1/auth/login", { email, password });

describe("email verification", () => {
  it("sends a link at sign-up; using it verifies the email, once", async () => {
    const t = await testApp();
    const cookie = await signup(t);
    expect(t.mailer.sent).toHaveLength(1);
    expect(t.mailer.last()).toMatchObject({ to: "ada@example.com" });
    expect(t.mailer.last()!.text).toContain("http://web.test/verify-email?token=");
    expect((await t.app.inject({ url: "/api/v1/me", headers: { cookie } })).json().emailVerified).toBe(false);

    const token = tokenFrom(t.mailer.last());
    expect((await post(t, "/api/v1/auth/email/verify", { token })).statusCode).toBe(204);
    expect((await t.app.inject({ url: "/api/v1/me", headers: { cookie } })).json().emailVerified).toBe(true);
    expect((await post(t, "/api/v1/auth/email/verify", { token })).statusCode).toBe(400); // single use
    expect((await post(t, "/api/v1/auth/email/verify", { token: "x".repeat(43) })).statusCode).toBe(400); // unknown
    expect((await post(t, "/api/v1/auth/email/verify", { token: "short" })).statusCode).toBe(400);
  });

  it("can be re-sent while signed in, the newest link wins, and a verified user gets nothing", async () => {
    const t = await testApp();
    const cookie = await signup(t);
    const first = tokenFrom(t.mailer.last());
    expect((await post(t, "/api/v1/auth/email/send-verification", {}, cookie)).statusCode).toBe(202);
    expect(t.mailer.sent).toHaveLength(2);
    const second = tokenFrom(t.mailer.last());
    expect((await post(t, "/api/v1/auth/email/verify", { token: first })).statusCode).toBe(400);
    expect((await post(t, "/api/v1/auth/email/verify", { token: second })).statusCode).toBe(204);
    await post(t, "/api/v1/auth/email/send-verification", {}, cookie);
    expect(t.mailer.sent).toHaveLength(2); // already verified: no more mail
    expect((await post(t, "/api/v1/auth/email/send-verification", {})).statusCode).toBe(401);
  });

  it("does not fail sign-up when the mail service is down", async () => {
    const t = await testApp();
    t.mailer.send = async () => { throw new Error("smtp down"); };
    expect((await post(t, "/api/v1/auth/signup", adultBody())).statusCode).toBe(201);
  });
});

describe("password reset", () => {
  it("resets the password with the emailed link, signs out old sessions, and the link works once", async () => {
    const t = await testApp();
    const oldSession = await signup(t);
    t.mailer.sent.length = 0;

    expect((await post(t, "/api/v1/auth/password-reset/request", { email: "ADA@example.com" })).statusCode).toBe(202);
    expect(t.mailer.sent).toHaveLength(1);
    const token = tokenFrom(t.mailer.last());
    expect(t.mailer.last()!.text).toContain("http://web.test/reset-password?token=");

    expect((await post(t, "/api/v1/auth/password-reset/confirm", { token, password: "a-brand-new-password" })).statusCode).toBe(204);
    expect((await login(t, "ada@example.com", "correct-horse-battery")).statusCode).toBe(401); // old password dead
    expect((await login(t, "ada@example.com", "a-brand-new-password")).statusCode).toBe(200);
    expect((await t.app.inject({ url: "/api/v1/me", headers: { cookie: oldSession } })).statusCode).toBe(401); // old session revoked
    expect((await post(t, "/api/v1/auth/password-reset/confirm", { token, password: "another-password-1" })).statusCode).toBe(400); // reuse
  });

  it("answers identically for unknown and known emails and sends nothing for unknown ones", async () => {
    const t = await testApp();
    await signup(t);
    t.mailer.sent.length = 0;
    const unknown = await post(t, "/api/v1/auth/password-reset/request", { email: "nobody@example.com" });
    const known = await post(t, "/api/v1/auth/password-reset/request", { email: "ada@example.com" });
    expect([unknown.statusCode, unknown.body]).toEqual([known.statusCode, known.body]);
    expect(t.mailer.sent).toHaveLength(1);
    expect(t.mailer.last()!.to).toBe("ada@example.com");
  });

  it("only the newest link works, expired links fail, weak passwords are refused, and the token is stored hashed", async () => {
    const t = await testApp();
    await signup(t);
    await post(t, "/api/v1/auth/password-reset/request", { email: "ada@example.com" });
    const first = tokenFrom(t.mailer.last());
    await post(t, "/api/v1/auth/password-reset/request", { email: "ada@example.com" });
    const second = tokenFrom(t.mailer.last());
    expect(first).not.toBe(second);
    expect((await post(t, "/api/v1/auth/password-reset/confirm", { token: first, password: "a-brand-new-password" })).statusCode).toBe(400);

    expect((await post(t, "/api/v1/auth/password-reset/confirm", { token: second, password: "short" })).statusCode).toBe(400);
    const rows = await t.db.select().from(authTokens);
    expect(rows.some((r) => r.tokenHash === second || r.tokenHash === first)).toBe(false); // raw tokens are never stored

    // The refused weak password did not burn the link: a good password still works with it.
    expect((await post(t, "/api/v1/auth/password-reset/confirm", { token: second, password: "a-brand-new-password" })).statusCode).toBe(204);
  });

  it("rejects an expired link", async () => {
    const t = await testApp();
    await signup(t);
    await post(t, "/api/v1/auth/password-reset/request", { email: "ada@example.com" });
    const token = tokenFrom(t.mailer.last());
    await t.db.update(authTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(authTokens.purpose, "PASSWORD_RESET"));
    expect((await post(t, "/api/v1/auth/password-reset/confirm", { token, password: "a-brand-new-password" })).statusCode).toBe(400);
    expect((await login(t, "ada@example.com", "correct-horse-battery")).statusCode).toBe(200); // password unchanged
  });

  it("rate-limits reset requests", async () => {
    const t = await testApp();
    let last = 0;
    for (let i = 0; i < 7; i++) last = (await post(t, "/api/v1/auth/password-reset/request", { email: "x@example.com" })).statusCode;
    expect(last).toBe(429);
  });
});
