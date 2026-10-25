import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { adultBody, cookieOf, testApp } from "./helpers.js";
import { users, wellnessChecks, accountErasureRequests } from "../src/db/schema.js";

describe("GDPR / CCPA Self-Serve Data Export & Account Erasure OS (Spec §1.4, §24.4, WP-1.4, WP-1.1)", () => {
  it("enforces authentication on all privacy endpoints (ADR-0010: 401)", async () => {
    const { app } = await testApp();

    const getStatus = await app.inject({ method: "GET", url: "/api/v1/privacy/status" });
    expect(getStatus.statusCode).toBe(401);

    const postExport = await app.inject({ method: "POST", url: "/api/v1/privacy/export" });
    expect(postExport.statusCode).toBe(401);

    const getLatest = await app.inject({ method: "GET", url: "/api/v1/privacy/export/latest" });
    expect(getLatest.statusCode).toBe(401);

    const postErasure = await app.inject({
      method: "POST",
      url: "/api/v1/privacy/erasure",
      payload: { passwordVerify: "Password123!" },
    });
    expect(postErasure.statusCode).toBe(401);
  });

  it("generates machine-readable data export archive with SHA-256 integrity checksum (GDPR Art. 15/20)", async () => {
    const { app } = await testApp();
    const signupRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: adultBody({ email: "export-user@example.com", displayName: "Devin Booker" }),
    });
    const cookie = cookieOf(signupRes);
    const user = signupRes.json();

    // Check initial privacy status (no exports yet)
    const initialStatusRes = await app.inject({
      method: "GET",
      url: "/api/v1/privacy/status",
      headers: { cookie },
    });
    expect(initialStatusRes.statusCode).toBe(200);
    const initialStatus = initialStatusRes.json();
    expect(initialStatus.isErased).toBe(false);
    expect(initialStatus.hasActiveExport).toBe(false);
    expect(initialStatus.latestExport).toBeNull();

    // Trigger data export
    const exportRes = await app.inject({
      method: "POST",
      url: "/api/v1/privacy/export",
      headers: { cookie },
    });
    expect(exportRes.statusCode).toBe(201);
    const exportData = exportRes.json();

    expect(exportData.status).toBe("READY");
    expect(typeof exportData.checksumSha256).toBe("string");
    expect(exportData.checksumSha256.length).toBe(64);
    expect(exportData.archive.profile.id).toBe(user.id);
    expect(exportData.archive.profile.email).toBe("export-user@example.com");
    expect(exportData.archive.profile.displayName).toBe("Devin Booker");
    expect(exportData.archive.dataVersion).toBe("1.0-GDPR-CCPA");

    // Fetch latest export archive
    const latestRes = await app.inject({
      method: "GET",
      url: "/api/v1/privacy/export/latest",
      headers: { cookie },
    });
    expect(latestRes.statusCode).toBe(200);
    const latest = latestRes.json();
    expect(latest.id).toBe(exportData.id);
    expect(latest.checksumSha256).toBe(exportData.checksumSha256);
    expect(latest.archive.profile.displayName).toBe("Devin Booker");

    // Check privacy status again
    const updatedStatusRes = await app.inject({
      method: "GET",
      url: "/api/v1/privacy/status",
      headers: { cookie },
    });
    expect(updatedStatusRes.statusCode).toBe(200);
    const updatedStatus = updatedStatusRes.json();
    expect(updatedStatus.hasActiveExport).toBe(true);
    expect(updatedStatus.latestExport.id).toBe(exportData.id);
  });

  it("executes right to erasure with password verification, invalidates sessions, and scrub personal identifiers (GDPR Art. 17)", async () => {
    const { app, db } = await testApp();
    const password = "SecurePassword123!";
    const signupRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: adultBody({ email: "erasure-user@example.com", password, displayName: "Marcus Smart" }),
    });
    const cookie = cookieOf(signupRes);
    const user = signupRes.json();

    // 1. Submit wellness log to test sensitive health data scrub
    await app.inject({
      method: "POST",
      url: "/api/v1/train/wellness",
      headers: { cookie },
      payload: { fatigue: 3, soreness: 2, sleepHours: 8, painReported: false },
    });

    // 2. Reject erasure with wrong password (403)
    const badPwRes = await app.inject({
      method: "POST",
      url: "/api/v1/privacy/erasure",
      headers: { cookie },
      payload: { passwordVerify: "WrongPassword999!" },
    });
    expect(badPwRes.statusCode).toBe(403);

    // 3. Confirm erasure with valid password (200)
    const erasureRes = await app.inject({
      method: "POST",
      url: "/api/v1/privacy/erasure",
      headers: { cookie },
      payload: { passwordVerify: password, reason: "Relocating overseas and closing account" },
    });
    expect(erasureRes.statusCode).toBe(200);
    const erasureData = erasureRes.json();
    expect(erasureData.ok).toBe(true);
    expect(erasureData.status).toBe("COMPLETED");
    expect(erasureData.message).toContain("[Former Member]");

    // 4. Invalidation: old cookie can no longer access authenticated endpoints (401)
    const postErasureStatus = await app.inject({
      method: "GET",
      url: "/api/v1/privacy/status",
      headers: { cookie },
    });
    expect(postErasureStatus.statusCode).toBe(401);

    // 5. Verify direct database state: user row is tombstoned and anonymized
    const [dbUser] = await db.select().from(users).where(eq(users.id, user.id));
    expect(dbUser).toBeDefined();
    expect(dbUser!.isErased).toBe(true);
    expect(dbUser!.displayName).toBe("[Former Member]");
    expect(dbUser!.email).toBe(`erased-${user.id}@anonymized.courtiq`);
    expect(dbUser!.erasedAt).not.toBeNull();

    // 6. Verify sensitive health data was completely scrubbed
    const userWellness = await db.select().from(wellnessChecks).where(eq(wellnessChecks.userId, user.id));
    expect(userWellness.length).toBe(0);

    // 7. Verify audit entry exists
    const erasureAudit = await db.select().from(accountErasureRequests).where(eq(accountErasureRequests.userId, user.id));
    expect(erasureAudit.length).toBe(1);
    expect(erasureAudit[0]!.status).toBe("COMPLETED");
  });
});
