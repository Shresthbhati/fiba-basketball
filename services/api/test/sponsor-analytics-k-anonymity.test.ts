import { describe, expect, it } from "vitest";
import { grantRole } from "../src/authz/service.js";
import { testApp, user } from "./helpers.js";

type T = Awaited<ReturnType<typeof testApp>>;
type U = Awaited<ReturnType<typeof user>>;

const post = (t: T, u: U | null, url: string, body?: unknown) =>
  t.app.inject({
    method: "POST",
    url,
    payload: body ?? {},
    ...(u ? { headers: { cookie: u.cookie } } : {}),
  });

const get = (t: T, u: U | null, url: string) =>
  t.app.inject({
    method: "GET",
    url,
    ...(u ? { headers: { cookie: u.cookie } } : {}),
  });

const del = (t: T, u: U | null, url: string) =>
  t.app.inject({
    method: "DELETE",
    url,
    ...(u ? { headers: { cookie: u.cookie } } : {}),
  });

describe("Sponsor Analytics & Facility Metrics with k-Anonymity (k >= 5) Guardrails (Spec §8.6, §23, §24.2)", { timeout: 35000 }, () => {
  it("manages sponsor profiles, grants, and strictly enforces k-anonymity on court & competition demographics", async () => {
    const t = await testApp({ rateLimitScale: 10 });

    const admin = await user(t, "admin@courtiq.test", { displayName: "Platform Admin" });
    await grantRole(t.db, admin.id, "PLATFORM_ADMIN");

    const venueManager = await user(t, "manager@facility.test", { displayName: "Court Venue Manager" });
    const organizer = await user(t, "organizer@tourney.test", { displayName: "Tournament Director" });
    const sponsorRep = await user(t, "sponsor@brand.test", { displayName: "Brand Manager" });
    const unauthorizedSponsor = await user(t, "rogue@brand.test", { displayName: "Rogue Partner" });

    // 1. Create a court operated by venueManager
    const courtRes = await post(t, venueManager, "/api/v1/courts", {
      name: "Downtown Metropolitan Hoops Arena",
      lat: 40.7128,
      lng: -74.006,
      indoor: true,
      surface: "WOOD",
      hoops: 4,
      lit: true,
    });
    expect(courtRes.statusCode).toBe(201);
    const courtId = courtRes.json().id;

    // 2. Register Sponsor Profile
    const profileRes = await post(t, sponsorRep, "/api/v1/sponsors/profile", {
      companyName: "Apex Athletics Gear",
      contactEmail: "partnerships@apexathletics.test",
      brandCategory: "APPAREL",
      websiteUrl: "https://apexathletics.test",
    });
    expect(profileRes.statusCode).toBe(200);
    const sponsorProfile = profileRes.json();
    expect(sponsorProfile.companyName).toBe("Apex Athletics Gear");
    expect(sponsorProfile.status).toBe("ACTIVE");

    // Check sponsor me endpoint
    const meRes = await get(t, sponsorRep, "/api/v1/sponsors/me");
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().profile.companyName).toBe("Apex Athletics Gear");

    // 3. Negative AuthZ before grant is issued (ADR-0010: 404 Not Found)
    const unauthedCourtRes = await get(t, sponsorRep, `/api/v1/sponsors/analytics/courts/${courtId}`);
    expect(unauthedCourtRes.statusCode).toBe(404);

    // 4. Issue Analytics Grant for the court to Apex Athletics
    const grantRes = await post(t, venueManager, "/api/v1/sponsors/grants", {
      sponsorId: sponsorProfile.id,
      courtId,
      scope: "COURT",
    });
    expect(grantRes.statusCode).toBe(201);
    const grant = grantRes.json();
    expect(grant.courtId).toBe(courtId);

    // Rogue user cannot issue grant on this court (ADR-0010: 404)
    const unauthorizedGrantRes = await post(t, unauthorizedSponsor, "/api/v1/sponsors/grants", {
      sponsorId: sponsorProfile.id,
      courtId,
      scope: "COURT",
    });
    expect(unauthorizedGrantRes.statusCode).toBe(404);

    // List grants
    const listGrantsRes = await get(t, sponsorRep, "/api/v1/sponsors/grants");
    expect(listGrantsRes.statusCode).toBe(200);
    expect(listGrantsRes.json().items.length).toBeGreaterThanOrEqual(1);

    // 5. Test Court Analytics under k-anonymity when sample size < 5
    // Create 1 pickup game with 2 players (Alice & Bob)
    const p1 = await user(t, "player1@test.com", { displayName: "Player One", dateOfBirth: "1999-04-15" });
    const p2 = await user(t, "player2@test.com", { displayName: "Player Two", dateOfBirth: "2000-08-20" });

    const gameRes = await post(t, venueManager, "/api/v1/pickup", {
      courtId,
      title: "Morning 3v3 Run",
      startsAt: new Date(Date.now() + 3600000).toISOString(),
      endsAt: new Date(Date.now() + 7200000).toISOString(),
      capacity: 10,
      skillBand: "INTERMEDIATE",
    });
    expect(gameRes.statusCode).toBe(201);
    const gameId = gameRes.json().id;

    await post(t, p1, `/api/v1/pickup/${gameId}/rsvp`);
    await post(t, p2, `/api/v1/pickup/${gameId}/rsvp`);

    // Sponsor now queries analytics
    const smallCohortRes = await get(t, sponsorRep, `/api/v1/sponsors/analytics/courts/${courtId}`);
    expect(smallCohortRes.statusCode).toBe(200);
    const smallCohortData = smallCohortRes.json();
    expect(smallCohortData.courtId).toBe(courtId);
    expect(smallCohortData.totalSessions).toBe(1);

    // Strict k-anonymity check: since unique athletes = 2 (< 5), total and demographics MUST be suppressed!
    expect(smallCohortData.totalUniqueAthletesSuppressed).toBe(true);
    expect(smallCohortData.totalUniqueAthletesDisplay).toContain("< 5");
    expect(smallCohortData.demographicsSuppressed).toBe(true);
    expect(smallCohortData.suppressionNotice).toBeDefined();

    // Verify all age cohorts are suppressed (< 5)
    for (const cohort of smallCohortData.ageCohorts) {
      expect(cohort.isSuppressed).toBe(true);
      expect(cohort.count).toBe(0);
      expect(cohort.displayCount).toContain("< 5");
    }

    // 6. Expand cohort to >= 5 unique athletes in 25_TO_34 bracket (1998-2001 in year 2026)
    const p3 = await user(t, "player3@test.com", { displayName: "Player Three", dateOfBirth: "1999-01-10" });
    const p4 = await user(t, "player4@test.com", { displayName: "Player Four", dateOfBirth: "2000-05-12" });
    const p5 = await user(t, "player5@test.com", { displayName: "Player Five", dateOfBirth: "1998-11-23" });
    const p6 = await user(t, "player6@test.com", { displayName: "Player Six", dateOfBirth: "2001-07-04" });

    await post(t, p3, `/api/v1/pickup/${gameId}/rsvp`);
    await post(t, p4, `/api/v1/pickup/${gameId}/rsvp`);
    await post(t, p5, `/api/v1/pickup/${gameId}/rsvp`);
    await post(t, p6, `/api/v1/pickup/${gameId}/rsvp`);

    const largeCohortRes = await get(t, sponsorRep, `/api/v1/sponsors/analytics/courts/${courtId}`);
    expect(largeCohortRes.statusCode).toBe(200);
    const largeCohortData = largeCohortRes.json();

    // Now unique participants = 7 (host + 6 players >= 5)
    expect(largeCohortData.totalUniqueAthletesSuppressed).toBe(false);
    expect(largeCohortData.totalUniqueAthletesDisplay).toBe("7");
    expect(largeCohortData.demographicsSuppressed).toBe(false);

    // Players are in 25-34 prime amateur cohort: should have 6 entries in 25_TO_34 cohort
    const primeCohort = largeCohortData.ageCohorts.find((c: { category: string }) => c.category === "25_TO_34");
    expect(primeCohort).toBeDefined();
    expect(primeCohort.isSuppressed).toBe(false);
    expect(primeCohort.count).toBe(6);
    expect(primeCohort.displayCount).toBe("6");

    // Other age cohorts with 0 counts should not be suppressed, but counts are 0
    const mastersCohort = largeCohortData.ageCohorts.find((c: { category: string }) => c.category === "35_PLUS");
    expect(mastersCohort).toBeDefined();
    expect(mastersCohort.count).toBe(0);

    // 7. Test Tournament / Competition Sponsor Analytics
    const compRes = await post(t, organizer, "/api/v1/competitions", {
      name: "Metropolitan Summer Invitational",
      format: "ROUND_ROBIN",
    });
    expect(compRes.statusCode).toBe(201);
    const compId = compRes.json().id;

    // Grant tournament analytics to sponsor
    const compGrantRes = await post(t, organizer, "/api/v1/sponsors/grants", {
      sponsorId: sponsorProfile.id,
      competitionId: compId,
      scope: "COMPETITION",
    });
    expect(compGrantRes.statusCode).toBe(201);

    // Query competition analytics
    const compAnalyticsRes = await get(t, sponsorRep, `/api/v1/sponsors/analytics/competitions/${compId}`);
    expect(compAnalyticsRes.statusCode).toBe(200);
    const compData = compAnalyticsRes.json();
    expect(compData.competitionId).toBe(compId);
    expect(compData.competitionName).toBe("Metropolitan Summer Invitational");
    expect(compData.kThreshold).toBe(5);

    // 8. Negative AuthZ Tests (ADR-0010)
    // Rogue sponsor without grant querying tournament -> 404
    const rogueCompRes = await get(t, unauthorizedSponsor, `/api/v1/sponsors/analytics/competitions/${compId}`);
    expect(rogueCompRes.statusCode).toBe(404);

    // Non-existent court ID -> 404
    const fakeCourtRes = await get(t, sponsorRep, "/api/v1/sponsors/analytics/courts/00000000-0000-0000-0000-000000000000");
    expect(fakeCourtRes.statusCode).toBe(404);

    // 9. Revoke grant and confirm access is immediately cut off (404)
    const revokeRes = await del(t, venueManager, `/api/v1/sponsors/grants/${grant.id}`);
    expect(revokeRes.statusCode).toBe(200);

    const revokedAccessRes = await get(t, sponsorRep, `/api/v1/sponsors/analytics/courts/${courtId}`);
    expect(revokedAccessRes.statusCode).toBe(404);

    // 10. Audit Query Log
    const auditRes = await get(t, sponsorRep, "/api/v1/sponsors/analytics/audit-log");
    expect(auditRes.statusCode).toBe(200);
    const auditItems = auditRes.json().items;
    expect(auditItems.length).toBeGreaterThan(0);
    expect(auditItems[0].kThreshold).toBe(5);
  });
});
