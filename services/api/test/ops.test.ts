import { Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig, productionProblems } from "../src/config.js";
import { FileMailer } from "../src/identity/file-mailer.js";
import { ConsoleMailer } from "../src/identity/mailer.js";
import { createMailer } from "../src/identity/mailer-factory.js";
import { SmtpMailer } from "../src/identity/smtp-mailer.js";
import { adultBody, testApp } from "./helpers.js";

const prodOk = {
  NODE_ENV: "production", DATABASE_URL: "postgres://db/x", ALLOWED_ORIGINS: "https://app.example.com", WEB_BASE_URL: "https://app.example.com",
  MEDIA_DIR: "/var/lib/courtiq/media", SMTP_URL: "smtps://user:pass@mail.example.com", MAIL_FROM: "COURT IQ <no-reply@example.com>",
};

describe("production config guard", () => {
  it("allows anything in development", () => {
    expect(productionProblems(loadConfig({}))).toEqual([]);
    expect(productionProblems(loadConfig({ NODE_ENV: "development", RATE_LIMIT_SCALE: "100", MAIL_OUTBOX_DIR: "/tmp/x" }))).toEqual([]);
  });
  it("accepts a complete production setup", () => {
    expect(productionProblems(loadConfig(prodOk))).toEqual([]);
  });
  it("lists every problem in an empty production environment", () => {
    const p = productionProblems(loadConfig({ NODE_ENV: "production" })).join("\n");
    for (const needle of ["DATABASE_URL", "ALLOWED_ORIGINS", "WEB_BASE_URL", "SMTP_URL"]) expect(p).toContain(needle);
  });
  it("refuses dev-only settings and half-configured email in production", () => {
    expect(productionProblems(loadConfig({ ...prodOk, MAIL_OUTBOX_DIR: "/tmp/x" })).join()).toContain("MAIL_OUTBOX_DIR");
    expect(productionProblems(loadConfig({ ...prodOk, RATE_LIMIT_SCALE: "100" })).join()).toContain("RATE_LIMIT_SCALE");
    const { MAIL_FROM: _unused, ...noFrom } = prodOk;
    void _unused;
    expect(productionProblems(loadConfig(noFrom)).join()).toContain("MAIL_FROM");
    expect(productionProblems(loadConfig({ ...prodOk, ALLOWED_ORIGINS: "  " })).join()).toContain("ALLOWED_ORIGINS");
  });
});

describe("mailers", () => {
  it("SmtpMailer sends from the configured address", async () => {
    const sendMail = vi.fn(async () => ({}));
    await new SmtpMailer({ sendMail } as never, "COURT IQ <no-reply@example.com>").send({ to: "a@example.com", subject: "Hi", text: "Body" });
    expect(sendMail).toHaveBeenCalledWith({ from: "COURT IQ <no-reply@example.com>", to: "a@example.com", subject: "Hi", text: "Body" });
  });
  it("the factory prefers SMTP, then the dev outbox, then the console", () => {
    expect(createMailer({ SMTP_URL: "smtp://localhost:1025", MAIL_FROM: "x@example.com", MAIL_OUTBOX_DIR: "/tmp/x" })).toBeInstanceOf(SmtpMailer);
    expect(createMailer({ MAIL_OUTBOX_DIR: "/tmp/x" })).toBeInstanceOf(FileMailer);
    expect(createMailer({})).toBeInstanceOf(ConsoleMailer);
  });
});

describe("readiness and headers", () => {
  it("/ready is 200 when the database answers and 503 when it does not; /health stays up either way", async () => {
    const { app } = await testApp();
    const ok = await app.inject({ url: "/ready" });
    expect([ok.statusCode, ok.json()]).toEqual([200, { status: "READY" }]);

    const broken = await buildApp({ execute: async () => { throw new Error("db down"); } } as never, { secureCookies: false });
    const down = await broken.inject({ url: "/ready" });
    expect([down.statusCode, down.json()]).toEqual([503, { status: "NOT_READY" }]);
    expect((await broken.inject({ url: "/health" })).statusCode).toBe(200);
  });

  it("sends standard security headers and does not advertise the framework", async () => {
    const { app } = await testApp();
    for (const url of ["/health", "/api/v1/exercises", "/nope"]) {
      const h = (await app.inject({ url })).headers;
      expect(h["x-content-type-options"], url).toBe("nosniff");
      expect(h["x-frame-options"], url).toBeDefined();
      expect(h["content-security-policy"], url).toBeDefined();
      expect(h["strict-transport-security"], url).toBeDefined();
      expect(h["x-powered-by"], url).toBeUndefined();
    }
  });
});

describe("request logging", () => {
  it("writes structured JSON with the request id, and never the cookie, password or session token", async () => {
    const lines: string[] = [];
    const stream = new Writable({ write(chunk, _enc, cb) { lines.push(String(chunk)); cb(); } });
    const base = await testApp();
    const app = await buildApp(base.db, { secureCookies: false, logStream: stream });
    const secretCookie = "ciq_session=SUPERSECRETSESSIONTOKEN";
    await app.inject({ method: "POST", url: "/api/v1/auth/signup", payload: adultBody({ email: "log@example.com", password: "my-very-secret-password" }), headers: { "x-request-id": "req-123", cookie: secretCookie } });
    await app.inject({ url: "/api/v1/me", headers: { cookie: secretCookie, "x-request-id": "req-456" } });
    await app.close();

    const all = lines.join("");
    const records = all.trim().split("\n").map((l) => JSON.parse(l) as { reqId?: string });
    expect(records.length).toBeGreaterThan(0);
    expect(records.some((r) => r.reqId === "req-123")).toBe(true);
    expect(records.some((r) => r.reqId === "req-456")).toBe(true);
    for (const secret of ["SUPERSECRETSESSIONTOKEN", "my-very-secret-password", "ciq_session="]) expect(all, secret).not.toContain(secret);
  });
});
