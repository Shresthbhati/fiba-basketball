import { describe, expect, it } from "vitest";
import { ageOn } from "../src/identity/age.js";
import { adultBody, cookieOf, testApp } from "./helpers.js";

describe("ageOn", () => {
  it("accounts for birthdays not yet reached", () => {
    const today = new Date("2026-06-15T00:00:00Z");
    expect(ageOn("2013-06-15", today)).toBe(13);
    expect(ageOn("2013-06-16", today)).toBe(12);
  });
});

describe("identity", () => {
  it("signs up, returns the profile, and never leaks the hash", async () => {
    const { app } = await testApp();
    const res = await app.inject({ method: "POST", url: "/api/v1/auth/signup", payload: adultBody() });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ email: "ada@example.com", isMinor: false });
    expect(JSON.stringify(res.json())).not.toContain("argon2");
    expect(String(res.headers["set-cookie"])).toMatch(/HttpOnly/i);
    expect(String(res.headers["set-cookie"])).toMatch(/SameSite=Lax/i);
  });

  it("rejects under-13 and flags 13-17 as minors", async () => {
    const { app } = await testApp();
    const year = new Date().getUTCFullYear();
    const kid = await app.inject({ method: "POST", url: "/api/v1/auth/signup", payload: adultBody({ dateOfBirth: `${year - 10}-01-01` }) });
    expect(kid.statusCode).toBe(403);
    const teen = await app.inject({ method: "POST", url: "/api/v1/auth/signup", payload: adultBody({ dateOfBirth: `${year - 15}-01-01` }) });
    expect(teen.statusCode).toBe(201);
    expect(teen.json().isMinor).toBe(true);
  });

  it("rejects duplicate email and weak input", async () => {
    const { app } = await testApp();
    await app.inject({ method: "POST", url: "/api/v1/auth/signup", payload: adultBody() });
    const dup = await app.inject({ method: "POST", url: "/api/v1/auth/signup", payload: adultBody({ email: "ADA@example.com" }) });
    expect(dup.statusCode).toBe(409);
    const weak = await app.inject({ method: "POST", url: "/api/v1/auth/signup", payload: adultBody({ email: "b@example.com", password: "short" }) });
    expect(weak.statusCode).toBe(400);
    expect(weak.headers["content-type"]).toContain("application/problem+json");
  });

  it("logs in, serves /me with the cookie, and logs out", async () => {
    const { app } = await testApp();
    await app.inject({ method: "POST", url: "/api/v1/auth/signup", payload: adultBody() });
    const bad = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "ada@example.com", password: "wrong-password" } });
    expect(bad.statusCode).toBe(401);
    const ok = await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "ada@example.com", password: "correct-horse-battery" } });
    expect(ok.statusCode).toBe(200);
    const cookie = cookieOf(ok);
    const me = await app.inject({ url: "/api/v1/me", headers: { cookie } });
    expect(me.json().email).toBe("ada@example.com");
    await app.inject({ method: "POST", url: "/api/v1/auth/logout", headers: { cookie } });
    const after = await app.inject({ url: "/api/v1/me", headers: { cookie } });
    expect(after.statusCode).toBe(401);
  });

  it("returns 401 for /me without a session and blocks cross-origin mutations", async () => {
    const { app } = await testApp();
    expect((await app.inject({ url: "/api/v1/me" })).statusCode).toBe(401);
    const res = await app.inject({
      method: "POST", url: "/api/v1/auth/signup", payload: adultBody(),
      headers: { origin: "https://evil.example", host: "localhost:3001" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("rate-limits repeated auth attempts", async () => {
    const { app } = await testApp();
    let last = 0;
    for (let i = 0; i < 12; i++) {
      last = (await app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "x@example.com", password: "nope" } })).statusCode;
    }
    expect(last).toBe(429);
  });
});
