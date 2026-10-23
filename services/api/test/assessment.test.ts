import { describe, expect, it } from "vitest";
import { adultBody, cookieOf, testApp } from "./helpers.js";

async function makeUser(t: Awaited<ReturnType<typeof testApp>>, email: string) {
  const res = await t.app.inject({ method: "POST", url: "/api/v1/auth/signup", body: adultBody({ email }) });
  return cookieOf(res);
}

describe("movement assessments (Pillar 1 & WP-2.6)", () => {
  it("requests upload intent for video clip", async () => {
    const t = await testApp();
    const cookie = await makeUser(t, "athlete1@example.com");

    // Anonymous is rejected
    const anon = await t.app.inject({
      method: "POST",
      url: "/api/v1/assessments/upload-intent",
      body: { protocol: "BODYWEIGHT_SQUAT", contentType: "video/mp4" },
    });
    expect(anon.statusCode).toBe(401);

    // Authenticated receives upload intent
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/assessments/upload-intent",
      headers: { cookie },
      body: { protocol: "BODYWEIGHT_SQUAT", contentType: "video/mp4" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.uploadUrl).toBeTruthy();
    expect(body.key).toMatch(/^assessments\/.+\.mp4$/);
    expect(body.expiresInSeconds).toBe(900);
  });

  it("records accepted assessment result with CV_ESTIMATE source type and metrics", async () => {
    const t = await testApp();
    const cookie = await makeUser(t, "athlete2@example.com");

    const payload = {
      protocol: "BODYWEIGHT_SQUAT",
      status: "ACCEPTED",
      confidence: 0.94,
      repCount: 3,
      metrics: {
        repetitions: [
          { repNumber: 1, depth: "BELOW_PARALLEL", minKneeAngleDeg: 81.2 },
          { repNumber: 2, depth: "BELOW_PARALLEL", minKneeAngleDeg: 83.0 },
          { repNumber: 3, depth: "PARALLEL", minKneeAngleDeg: 88.5 },
        ],
      },
      feedback: ["Full depth reached on all repetitions."],
    };

    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/assessments",
      headers: { cookie },
      body: payload,
    });
    expect(res.statusCode).toBe(201);
    const item = res.json();
    expect(item.id).toBeTruthy();
    expect(item.sourceType).toBe("CV_ESTIMATE");
    expect(item.confidence).toBe(0.94);
    expect(item.repCount).toBe(3);
    expect(item.metrics.repetitions).toHaveLength(3);
  });

  it("records abstained assessment with unmeasurable criteria", async () => {
    const t = await testApp();
    const cookie = await makeUser(t, "athlete3@example.com");

    const payload = {
      protocol: "COUNTERMOVEMENT_JUMP",
      status: "ABSTAINED",
      confidence: 0.35,
      repCount: 0,
      criteriaUnmeasurable: ["landmark_27_occluded", "landmark_28_occluded"],
      abstainReason: "Ankles obscured by equipment. Could not measure flight time.",
      feedback: ["Abstained: Camera angle or lighting insufficient."],
    };

    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/assessments",
      headers: { cookie },
      body: payload,
    });
    expect(res.statusCode).toBe(201);
    const item = res.json();
    expect(item.status).toBe("ABSTAINED");
    expect(item.criteriaUnmeasurable).toContain("landmark_27_occluded");
    expect(item.abstainReason).toContain("Ankles obscured");
  });

  it("enforces private-by-default access: owner gets 200, other user gets 404, anon gets 401", async () => {
    const t = await testApp();
    const ownerCookie = await makeUser(t, "owner@example.com");
    const otherCookie = await makeUser(t, "other@example.com");

    // Owner creates assessment
    const created = (
      await t.app.inject({
        method: "POST",
        url: "/api/v1/assessments",
        headers: { cookie: ownerCookie },
        body: {
          protocol: "COUNTERMOVEMENT_JUMP",
          status: "ACCEPTED",
          confidence: 0.92,
          repCount: 1,
          metrics: { jumpHeightCm: 48.5, flightTimeS: 0.628 },
        },
      })
    ).json();

    // Owner reads assessment -> 200
    const ownerRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/assessments/${created.id}`,
      headers: { cookie: ownerCookie },
    });
    expect(ownerRes.statusCode).toBe(200);
    expect(ownerRes.json().id).toBe(created.id);

    // Other user reads assessment -> 404 (ADR-009 health data privacy, indistinguishable from non-existent)
    const otherRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/assessments/${created.id}`,
      headers: { cookie: otherCookie },
    });
    expect(otherRes.statusCode).toBe(404);

    // Anonymous reads assessment -> 401
    const anonRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/assessments/${created.id}`,
    });
    expect(anonRes.statusCode).toBe(401);

    // Listing returns only owner's items
    const listRes = await t.app.inject({
      method: "GET",
      url: "/api/v1/assessments",
      headers: { cookie: ownerCookie },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().items).toHaveLength(1);

    const otherList = await t.app.inject({
      method: "GET",
      url: "/api/v1/assessments",
      headers: { cookie: otherCookie },
    });
    expect(otherList.json().items).toHaveLength(0);
  });
});
