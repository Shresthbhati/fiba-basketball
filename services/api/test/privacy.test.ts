import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { auditLog, users } from "../src/db/schema.js";
import { adultBody, cookieOf, testApp } from "./helpers.js";

async function makeUser(t: Awaited<ReturnType<typeof testApp>>, email: string, password = "correct-horse-battery") {
  const res = await t.app.inject({
    method: "POST",
    url: "/api/v1/auth/signup",
    body: adultBody({ email, password, displayName: "Privacy Pro" }),
  });
  return { id: res.json().id as string, cookie: cookieOf(res) };
}

describe("Self-Service Data Export & Right to Erasure (Spec §24.4, ADR-0010)", () => {
  it("rejects unauthenticated requests to export or delete account", async () => {
    const t = await testApp();
    const exportRes = await t.app.inject({ method: "GET", url: "/api/v1/me/export-data" });
    expect(exportRes.statusCode).toBe(401);

    const deleteRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/me/delete-account",
      body: { password: "any" },
    });
    expect(deleteRes.statusCode).toBe(401);
  });

  it("exports comprehensive GDPR data package with user profile, career, and consents", async () => {
    const t = await testApp();
    const user = await makeUser(t, "export-user@courtiq.test");

    const res = await t.app.inject({
      method: "GET",
      url: "/api/v1/me/export-data",
      headers: { cookie: user.cookie },
    });

    expect(res.statusCode).toBe(200);
    const data = res.json();

    expect(data.formatVersion).toBe("1.0");
    expect(data.profile.id).toBe(user.id);
    expect(data.profile.email).toBe("export-user@courtiq.test");
    expect(data.profile.displayName).toBe("Privacy Pro");
    expect(data.career).toBeDefined();
    expect(Array.isArray(data.achievements)).toBe(true);
    expect(Array.isArray(data.assessments)).toBe(true);
    expect(Array.isArray(data.workouts)).toBe(true);

    // Verify audit log recorded the export
    const auditEntries = await t.db.select().from(auditLog).where(eq(auditLog.action, "user.data_exported"));
    expect(auditEntries.length).toBeGreaterThan(0);
    expect(auditEntries[0]!.actorId).toBe(user.id);
  });

  it("safely executes self-service right to erasure with password verification", async () => {
    const t = await testApp();
    const user = await makeUser(t, "erase-me@courtiq.test", "my-secure-password-123");

    // Attempt deletion with incorrect password fails with 401
    const badPwRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/me/delete-account",
      headers: { cookie: user.cookie },
      body: { password: "wrong-password" },
    });
    expect(badPwRes.statusCode).toBe(401);

    // Deletion with correct password succeeds
    const okRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/me/delete-account",
      headers: { cookie: user.cookie },
      body: { password: "my-secure-password-123" },
    });
    expect(okRes.statusCode).toBe(200);

    // Verify user record is anonymized in DB
    const [dbUser] = await t.db.select().from(users).where(eq(users.id, user.id));
    expect(dbUser).toBeDefined();
    expect(dbUser!.displayName).toBe("Former Player");
    expect(dbUser!.email).toContain("@anonymized.courtiq");
    expect(dbUser!.passwordHash).toBe("DELETED");
    expect(dbUser!.dateOfBirth).toBe("1970-01-01");

    // Verify audit log captured user.account_deleted
    const auditEntries = await t.db.select().from(auditLog).where(eq(auditLog.action, "user.account_deleted"));
    expect(auditEntries.length).toBeGreaterThan(0);
    expect(auditEntries[0]!.actorId).toBe(user.id);
  });
});
