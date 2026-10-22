import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decide, grantRole } from "../src/authz/service.js";
import { adultBody, cookieOf, testApp } from "./helpers.js";

const comp = { type: "competition", id: randomUUID() };

describe("decide (pure policy)", () => {
  it("denies by default and for unrelated roles", () => {
    expect(decide([], "competition:manage")).toBe(false);
    expect(decide([{ role: "PLAYER", resourceType: null, resourceId: null }], "competition:manage")).toBe(false);
  });
  it("allows a global role", () => {
    expect(decide([{ role: "ORGANIZER", resourceType: null, resourceId: null }], "competition:create")).toBe(true);
  });
  it("scopes a resource role to that resource only", () => {
    const a = [{ role: "ORGANIZER" as const, resourceType: "competition", resourceId: comp.id }];
    expect(decide(a, "competition:manage", comp)).toBe(true);
    expect(decide(a, "competition:manage", { type: "competition", id: randomUUID() })).toBe(false);
    expect(decide(a, "competition:manage")).toBe(false);
  });
  it("lets only a global PLATFORM_ADMIN do everything", () => {
    expect(decide([{ role: "PLATFORM_ADMIN", resourceType: null, resourceId: null }], "moderation:review")).toBe(true);
    expect(decide([{ role: "PLATFORM_ADMIN", resourceType: "competition", resourceId: comp.id }], "moderation:review")).toBe(false);
  });
});

async function signedIn(t: Awaited<ReturnType<typeof testApp>>, email: string) {
  const res = await t.app.inject({ method: "POST", url: "/api/v1/auth/signup", payload: adultBody({ email }) });
  return { id: res.json().id as string, cookie: cookieOf(res) };
}

describe("authorization wiring", () => {
  it("refuses to register an /api/v1 route with no access declaration", async () => {
    const { app } = await testApp();
    expect(() => app.get("/api/v1/oops", async () => ({}))).toThrow(/config\.access/);
  });

  it("gives new users PLAYER and reports permissions", async () => {
    const t = await testApp();
    const u = await signedIn(t, "p@example.com");
    const res = await t.app.inject({ url: "/api/v1/me/permissions", headers: { cookie: u.cookie } });
    expect(res.json()).toMatchObject({ roles: ["PLAYER"], actions: ["competition:create", "pickup:host"] });
    expect((await t.app.inject({ url: "/api/v1/me/permissions" })).statusCode).toBe(401);
  });

  it("enforces actions: 401 anonymous, 403 without role, 200 with role, 404 when hidden", async () => {
    const t = await testApp();
    t.app.get("/api/v1/_t/admin", { config: { access: { action: "moderation:review" } } }, async () => ({ ok: true }));
    t.app.get(
      "/api/v1/_t/comp/:id",
      { config: { access: { action: "competition:manage", hide: true, resource: (r) => ({ type: "competition", id: (r.params as { id: string }).id }) } } },
      async () => ({ ok: true }),
    );
    const u = await signedIn(t, "u@example.com");
    const other = await signedIn(t, "o@example.com");

    expect((await t.app.inject({ url: "/api/v1/_t/admin" })).statusCode).toBe(401);
    expect((await t.app.inject({ url: "/api/v1/_t/admin", headers: { cookie: u.cookie } })).statusCode).toBe(403);

    await grantRole(t.db, u.id, "MODERATOR");
    expect((await t.app.inject({ url: "/api/v1/_t/admin", headers: { cookie: u.cookie } })).statusCode).toBe(200);

    await grantRole(t.db, u.id, "ORGANIZER", comp);
    expect((await t.app.inject({ url: `/api/v1/_t/comp/${comp.id}`, headers: { cookie: u.cookie } })).statusCode).toBe(200);
    // Another user and a different competition both look like "does not exist".
    expect((await t.app.inject({ url: `/api/v1/_t/comp/${comp.id}`, headers: { cookie: other.cookie } })).statusCode).toBe(404);
  });

  it("ignores expired assignments", async () => {
    const t = await testApp();
    t.app.get("/api/v1/_t/admin", { config: { access: { action: "moderation:review" } } }, async () => ({ ok: true }));
    const u = await signedIn(t, "e@example.com");
    await grantRole(t.db, u.id, "MODERATOR", undefined, new Date(Date.now() - 1000));
    expect((await t.app.inject({ url: "/api/v1/_t/admin", headers: { cookie: u.cookie } })).statusCode).toBe(403);
  });
});
