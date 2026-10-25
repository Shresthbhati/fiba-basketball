import { describe, it, expect } from "vitest";
import { adultBody, cookieOf, testApp } from "./helpers.js";

describe("Court Photo Gallery & Community Verification Engine (Spec §8.1, §8.3, WP-1.11, WP-2.5)", () => {
  it("enforces negative authZ on court photos and verifications for unknown court IDs (ADR-0010: 404)", async () => {
    const { app } = await testApp();
    const signupRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: adultBody({ email: "player1@example.com" }),
    });
    const cookie = cookieOf(signupRes);
    const fakeId = "00000000-0000-0000-0000-000000000000";

    const getPhotos = await app.inject({ method: "GET", url: `/api/v1/courts/${fakeId}/photos` });
    expect(getPhotos.statusCode).toBe(404);

    const postPhoto = await app.inject({
      method: "POST",
      url: `/api/v1/courts/${fakeId}/photos`,
      headers: { cookie },
      payload: { url: "https://images.courtiq.net/court1.jpg" },
    });
    expect(postPhoto.statusCode).toBe(404);

    const getVerif = await app.inject({ method: "GET", url: `/api/v1/courts/${fakeId}/verifications` });
    expect(getVerif.statusCode).toBe(404);

    const postVerif = await app.inject({
      method: "POST",
      url: `/api/v1/courts/${fakeId}/confirm-attributes`,
      headers: { cookie },
      payload: { confirmedSurface: "CONCRETE" },
    });
    expect(postVerif.statusCode).toBe(404);
  });

  it("handles photo uploads, primary photo selection, and author-only deletion", async () => {
    const { app } = await testApp();

    const u1Res = await app.inject({ method: "POST", url: "/api/v1/auth/signup", payload: adultBody({ email: "uploader@example.com" }) });
    const c1 = cookieOf(u1Res);

    const u2Res = await app.inject({ method: "POST", url: "/api/v1/auth/signup", payload: adultBody({ email: "other@example.com" }) });
    const c2 = cookieOf(u2Res);

    // Create a court
    const courtRes = await app.inject({
      method: "POST",
      url: "/api/v1/courts",
      headers: { cookie: c1 },
      payload: { name: "Rucker Park", lat: 40.829, lng: -73.936, surface: "ASPHALT", hoops: 2 },
    });
    expect(courtRes.statusCode).toBe(201);
    const court = courtRes.json();

    // 1. Upload first photo -> auto-assigned isPrimary: true
    const p1Res = await app.inject({
      method: "POST",
      url: `/api/v1/courts/${court.id}/photos`,
      headers: { cookie: c1 },
      payload: { url: "https://images.courtiq.net/rucker-wide.jpg", caption: "Full court view" },
    });
    expect(p1Res.statusCode).toBe(201);
    const p1 = p1Res.json();
    expect(p1.isPrimary).toBe(true);
    expect(p1.caption).toBe("Full court view");

    // 2. Upload second photo -> not primary by default
    const p2Res = await app.inject({
      method: "POST",
      url: `/api/v1/courts/${court.id}/photos`,
      headers: { cookie: c1 },
      payload: { url: "https://images.courtiq.net/rucker-rim.jpg", caption: "Double rim closeup" },
    });
    expect(p2Res.statusCode).toBe(201);
    const p2 = p2Res.json();
    expect(p2.isPrimary).toBe(false);

    // 3. List photos: primary first
    const listRes1 = await app.inject({ method: "GET", url: `/api/v1/courts/${court.id}/photos` });
    expect(listRes1.statusCode).toBe(200);
    const items1 = listRes1.json().items;
    expect(items1).toHaveLength(2);
    expect(items1[0].id).toBe(p1.id);

    // 4. Set p2 as primary -> p1 unseated
    const primaryRes = await app.inject({
      method: "POST",
      url: `/api/v1/courts/${court.id}/photos/${p2.id}/primary`,
      headers: { cookie: c1 },
    });
    expect(primaryRes.statusCode).toBe(200);
    expect(primaryRes.json().isPrimary).toBe(true);

    const listRes2 = await app.inject({ method: "GET", url: `/api/v1/courts/${court.id}/photos` });
    expect(listRes2.json().items[0].id).toBe(p2.id);

    // 5. User 2 attempts to delete User 1's photo -> 404 (ADR-0010 negative authZ)
    const badDelete = await app.inject({
      method: "DELETE",
      url: `/api/v1/courts/${court.id}/photos/${p2.id}`,
      headers: { cookie: c2 },
    });
    expect(badDelete.statusCode).toBe(404);

    // 6. User 1 deletes their own photo -> 200
    const okDelete = await app.inject({
      method: "DELETE",
      url: `/api/v1/courts/${court.id}/photos/${p2.id}`,
      headers: { cookie: c1 },
    });
    expect(okDelete.statusCode).toBe(200);

    const listRes3 = await app.inject({ method: "GET", url: `/api/v1/courts/${court.id}/photos` });
    expect(listRes3.json().items).toHaveLength(1);
  });

  it("aggregates community attribute confirmations and auto-promotes to COMMUNITY_CONFIRMED at threshold 3", async () => {
    const { app } = await testApp();

    const u1 = cookieOf(await app.inject({ method: "POST", url: "/api/v1/auth/signup", payload: adultBody({ email: "user1@example.com" }) }));
    const u2 = cookieOf(await app.inject({ method: "POST", url: "/api/v1/auth/signup", payload: adultBody({ email: "user2@example.com" }) }));
    const u3 = cookieOf(await app.inject({ method: "POST", url: "/api/v1/auth/signup", payload: adultBody({ email: "user3@example.com" }) }));

    // Create UNVERIFIED court
    const courtRes = await app.inject({
      method: "POST",
      url: "/api/v1/courts",
      headers: { cookie: u1 },
      payload: { name: "Venice Beach Courts", lat: 33.985, lng: -118.472 },
    });
    const court = courtRes.json();
    expect(court.verificationStatus).toBe("UNVERIFIED");

    // Confirmation 1
    const conf1 = await app.inject({
      method: "POST",
      url: `/api/v1/courts/${court.id}/confirm-attributes`,
      headers: { cookie: u1 },
      payload: { confirmedSurface: "CONCRETE", confirmedHoops: 4, confirmedLit: true },
    });
    expect(conf1.statusCode).toBe(200);
    expect(conf1.json().totalConfirmations).toBe(1);
    expect(conf1.json().verificationStatus).toBe("UNVERIFIED");

    // Confirmation 2
    const conf2 = await app.inject({
      method: "POST",
      url: `/api/v1/courts/${court.id}/confirm-attributes`,
      headers: { cookie: u2 },
      payload: { confirmedSurface: "CONCRETE", confirmedHoops: 4, confirmedLit: true },
    });
    expect(conf2.statusCode).toBe(200);
    expect(conf2.json().totalConfirmations).toBe(2);
    expect(conf2.json().verificationStatus).toBe("UNVERIFIED");

    // Confirmation 3 -> Triggers promotion to COMMUNITY_CONFIRMED!
    const conf3 = await app.inject({
      method: "POST",
      url: `/api/v1/courts/${court.id}/confirm-attributes`,
      headers: { cookie: u3 },
      payload: { confirmedSurface: "CONCRETE", confirmedHoops: 4, confirmedLit: true },
    });
    expect(conf3.statusCode).toBe(200);
    expect(conf3.json().totalConfirmations).toBe(3);
    expect(conf3.json().verificationStatus).toBe("COMMUNITY_CONFIRMED");

    // Verify GET /courts/:id shows updated status
    const refreshed = await app.inject({ method: "GET", url: `/api/v1/courts/${court.id}` });
    expect(refreshed.json().verificationStatus).toBe("COMMUNITY_CONFIRMED");

    // Verify GET /courts/:id/verifications shows consensus breakdown
    const verifSummary = await app.inject({ method: "GET", url: `/api/v1/courts/${court.id}/verifications` });
    expect(verifSummary.statusCode).toBe(200);
    const data = verifSummary.json();
    expect(data.totalConfirmations).toBe(3);
    expect(data.consensus.surfaces.CONCRETE).toBe(3);
    expect(data.consensus.hoops["4"]).toBe(3);
    expect(data.consensus.lit.yes).toBe(3);
  });
});
