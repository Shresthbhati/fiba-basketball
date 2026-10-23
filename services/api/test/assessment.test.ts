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

  it("handles sharing grants, coach feedback, and immediate revocation (WP-2.8)", async () => {
    const t = await testApp();
    const athleteRes = await t.app.inject({ method: "POST", url: "/api/v1/auth/signup", body: adultBody({ email: "athlete-share@example.com" }) });
    const athleteCookie = cookieOf(athleteRes);

    const coachRes = await t.app.inject({ method: "POST", url: "/api/v1/auth/signup", body: adultBody({ email: "coach-feedback@example.com" }) });
    const coachCookie = cookieOf(coachRes);
    const coachId = coachRes.json().id;

    // Athlete creates assessment
    const created = (
      await t.app.inject({
        method: "POST",
        url: "/api/v1/assessments",
        headers: { cookie: athleteCookie },
        body: {
          protocol: "BODYWEIGHT_SQUAT",
          status: "ACCEPTED",
          confidence: 0.95,
          repCount: 5,
          metrics: { minKneeAngleDeg: 84.0 },
        },
      })
    ).json();

    // Coach cannot view assessment before grant -> 404
    const coachGetBefore = await t.app.inject({
      method: "GET",
      url: `/api/v1/assessments/${created.id}`,
      headers: { cookie: coachCookie },
    });
    expect(coachGetBefore.statusCode).toBe(404);

    // Athlete shares assessment with coach
    const grantRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/assessments/${created.id}/grants`,
      headers: { cookie: athleteCookie },
      body: { granteeId: coachId, role: "COACH" },
    });
    expect(grantRes.statusCode).toBe(201);
    const grant = grantRes.json();
    expect(grant.granteeId).toBe(coachId);

    // Coach can now access assessment -> 200
    const coachGetAfter = await t.app.inject({
      method: "GET",
      url: `/api/v1/assessments/${created.id}`,
      headers: { cookie: coachCookie },
    });
    expect(coachGetAfter.statusCode).toBe(200);
    expect(coachGetAfter.json().id).toBe(created.id);

    // Coach adds feedback with technical cues
    const feedbackRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/assessments/${created.id}/feedback`,
      headers: { cookie: coachCookie },
      body: {
        notes: "Solid eccentric tempo. Maintain knee tracking over 2nd toe on ascent.",
        cues: ["Drive through midfoot", "Keep chest upright"],
      },
    });
    expect(feedbackRes.statusCode).toBe(201);
    expect(feedbackRes.json().notes).toContain("Solid eccentric tempo");
    expect(feedbackRes.json().cues).toHaveLength(2);

    // Athlete reads assessment and sees coach feedback
    const athleteGetWithFeedback = await t.app.inject({
      method: "GET",
      url: `/api/v1/assessments/${created.id}`,
      headers: { cookie: athleteCookie },
    });
    expect(athleteGetWithFeedback.json().coachFeedback).toHaveLength(1);
    expect(athleteGetWithFeedback.json().coachFeedback[0].notes).toContain("Solid eccentric tempo");

    // Athlete updates status to ACCEPTED
    const patchRes = await t.app.inject({
      method: "PATCH",
      url: `/api/v1/assessments/${created.id}`,
      headers: { cookie: athleteCookie },
      body: { status: "ACCEPTED" },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().status).toBe("ACCEPTED");

    // Athlete revokes share grant
    const revokeRes = await t.app.inject({
      method: "DELETE",
      url: `/api/v1/assessments/${created.id}/grants/${grant.id}`,
      headers: { cookie: athleteCookie },
    });
    expect(revokeRes.statusCode).toBe(204);

    // Immediately after revocation, coach gets 404 (ADR-0010 negative authorization)
    const coachGetRevoked = await t.app.inject({
      method: "GET",
      url: `/api/v1/assessments/${created.id}`,
      headers: { cookie: coachCookie },
    });
    expect(coachGetRevoked.statusCode).toBe(404);
  });
});
