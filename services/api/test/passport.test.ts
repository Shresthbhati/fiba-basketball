import { describe, expect, it } from "vitest";
import { awardVerifiedAchievement } from "../src/career/passport.js";
import { recordAssessment } from "../src/assessment/service.js";
import { adultBody, cookieOf, testApp } from "./helpers.js";

async function makeUser(t: Awaited<ReturnType<typeof testApp>>, email: string, displayName = "Jane Doe") {
  const res = await t.app.inject({
    method: "POST",
    url: "/api/v1/auth/signup",
    body: adultBody({ email, displayName }),
  });
  return { id: res.json().id as string, cookie: cookieOf(res) };
}

describe("athlete career passport & field-level sharing (WP-8.1 & ADR-0010)", () => {
  it("rejects unauthenticated attempts to create a passport grant", async () => {
    const t = await testApp();
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/me/passport/grants",
      body: { label: "Scout link" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("creates a grant, enforces field-level visibility filtering, and serves public passport", async () => {
    const t = await testApp();
    const athlete = await makeUser(t, "athlete-passport@example.com", "Maya Moore");

    // Add verified achievement
    await awardVerifiedAchievement(t.db, athlete.id, {
      title: "Tournament MVP",
      category: "AWARD",
      issuer: "Metropolitan Basketball Federation",
    });

    // Record an accepted biomechanics assessment
    await recordAssessment(t.db, athlete.id, {
      protocol: "COUNTERMOVEMENT_JUMP",
      status: "ACCEPTED",
      confidence: 0.95,
      metrics: { jumpHeightInches: 26.5 },
    });

    // Athlete creates grant hiding shooting splits and minutes, but revealing biometrics
    const grantRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/me/passport/grants",
      headers: { cookie: athlete.cookie },
      body: {
        label: "College Scout Preview",
        includeAverages: true,
        includeShootingSplits: false, // Hides shooting splits
        includeMinutes: false,
        includeGameLog: true,
        includeBiometrics: true, // Includes verified jump test
        expiresInDays: 14,
      },
    });

    expect(grantRes.statusCode).toBe(201);
    const grant = grantRes.json();
    expect(grant.token).toBeTruthy();
    expect(grant.includeShootingSplits).toBe(false);
    expect(grant.includeBiometrics).toBe(true);

    // Public visitor accesses passport via token without credentials
    const publicRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/passport/${grant.token}`,
    });

    expect(publicRes.statusCode).toBe(200);
    const passport = publicRes.json();

    // Verified profile details
    expect(passport.athlete.displayName).toBe("Maya Moore");
    expect(passport.provenance.matchStatsSource).toBe("OFFICIAL");

    // Verified achievement present
    expect(passport.achievements).toHaveLength(1);
    expect(passport.achievements[0].title).toBe("Tournament MVP");
    expect(passport.achievements[0].issuer).toBe("Metropolitan Basketball Federation");

    // Field-level privacy applied: shooting splits are 0 / redacted
    expect(passport.career.totals.fgm).toBe(0);
    expect(passport.career.totals.fga).toBe(0);

    // Biometrics included per grant with CV_ESTIMATE provenance
    expect(passport.biometrics).toHaveLength(1);
    expect(passport.biometrics[0].protocol).toBe("COUNTERMOVEMENT_JUMP");
    expect(passport.biometrics[0].sourceType).toBe("CV_ESTIMATE");
    expect(passport.biometrics[0].confidence).toBe(0.95);
  });

  it("revoking a grant causes public access to return 404 Not Found (ADR-0010)", async () => {
    const t = await testApp();
    const athlete = await makeUser(t, "athlete-revoke@example.com", "Elena Delle Donne");

    const grantRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/me/passport/grants",
      headers: { cookie: athlete.cookie },
      body: { label: "Temporary Link" },
    });
    const { id: grantId, token } = grantRes.json();

    // Verify public link is initially live
    const initialGet = await t.app.inject({
      method: "GET",
      url: `/api/v1/passport/${token}`,
    });
    expect(initialGet.statusCode).toBe(200);

    // Athlete revokes the grant
    const revokeRes = await t.app.inject({
      method: "DELETE",
      url: `/api/v1/me/passport/grants/${grantId}`,
      headers: { cookie: athlete.cookie },
    });
    expect(revokeRes.statusCode).toBe(204);

    // Subsequent public access returns 404 (ADR-0010)
    const revokedGet = await t.app.inject({
      method: "GET",
      url: `/api/v1/passport/${token}`,
    });
    expect(revokedGet.statusCode).toBe(404);
  });

  it("lists athlete's active passport grants", async () => {
    const t = await testApp();
    const athlete = await makeUser(t, "athlete-list@example.com", "Diana Taurasi");

    await t.app.inject({
      method: "POST",
      url: "/api/v1/me/passport/grants",
      headers: { cookie: athlete.cookie },
      body: { label: "Link 1" },
    });
    await t.app.inject({
      method: "POST",
      url: "/api/v1/me/passport/grants",
      headers: { cookie: athlete.cookie },
      body: { label: "Link 2" },
    });

    const listRes = await t.app.inject({
      method: "GET",
      url: "/api/v1/me/passport/grants",
      headers: { cookie: athlete.cookie },
    });

    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().items).toHaveLength(2);
  });
});
