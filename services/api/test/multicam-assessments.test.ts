import { describe, expect, it } from "vitest";
import { adultBody, cookieOf, testApp } from "./helpers.js";

async function makeUser(t: Awaited<ReturnType<typeof testApp>>, email: string) {
  const res = await t.app.inject({ method: "POST", url: "/api/v1/auth/signup", body: adultBody({ email }) });
  return cookieOf(res);
}

describe("Player Lab Multi-Camera Synchronization & Biomechanical Assessment Engine (Spec §4.1, §6.3, §9.2)", () => {
  it("records shooting mechanics assessment, attaches synchronized multi-camera streams, and enforces negative authZ", async () => {
    const t = await testApp();
    const athleteCookie = await makeUser(t, "shooter@example.com");
    const otherCookie = await makeUser(t, "competitor@example.com");

    // 1. Record a shooting mechanics assessment
    const assessmentRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/assessments",
      headers: { cookie: athleteCookie },
      body: {
        protocol: "SHOOTING_MECHANICS",
        status: "ACCEPTED",
        confidence: 0.94,
        modelVersion: "court-iq-pose-v1.0",
        repCount: 10,
        metrics: {
          madeCount: 8,
          attemptCount: 10,
          averageReleaseAngleDeg: 51.2,
          averageReleaseTimeS: 0.44,
        },
        feedback: ["Consistent high release above forehead corridor", "Clean follow-through with minimal lateral drift"],
      },
    });
    expect(assessmentRes.statusCode).toBe(201);
    const assessment = JSON.parse(assessmentRes.body);

    // 2. Attach Primary Sagittal camera angle (side view)
    const primaryStreamRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/assessments/${assessment.id}/streams`,
      headers: { cookie: athleteCookie },
      body: {
        cameraLabel: "PRIMARY_SAGITTAL",
        videoUrl: "https://storage.courtiq.net/assessments/cam1-sagittal.mp4",
        syncOffsetMs: 0,
        resolution: "1080p",
        fps: 60,
        isPrimary: true,
        calibratedDistanceM: 4.5,
      },
    });
    expect(primaryStreamRes.statusCode).toBe(201);
    const primaryStream = JSON.parse(primaryStreamRes.body);
    expect(primaryStream.isPrimary).toBe(true);
    expect(primaryStream.cameraLabel).toBe("PRIMARY_SAGITTAL");

    // 3. Attach Secondary Frontal camera angle (front rim view) with 120ms sync offset
    const secondaryStreamRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/assessments/${assessment.id}/streams`,
      headers: { cookie: athleteCookie },
      body: {
        cameraLabel: "SECONDARY_FRONTAL",
        videoUrl: "https://storage.courtiq.net/assessments/cam2-frontal.mp4",
        syncOffsetMs: 120,
        resolution: "1080p",
        fps: 60,
        isPrimary: false,
        calibratedDistanceM: 6.2,
      },
    });
    expect(secondaryStreamRes.statusCode).toBe(201);
    const secondaryStream = JSON.parse(secondaryStreamRes.body);
    expect(secondaryStream.syncOffsetMs).toBe(120);

    // 4. List streams for assessment
    const listStreamsRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/assessments/${assessment.id}/streams`,
      headers: { cookie: athleteCookie },
    });
    expect(listStreamsRes.statusCode).toBe(200);
    const { items: streams } = JSON.parse(listStreamsRes.body);
    expect(streams.length).toBe(2);
    expect(streams[0].isPrimary).toBe(true); // primary sorted first

    // 5. Negative AuthZ: Unauthorized rival gets 404 (ADR-0010)
    const unauthorizedRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/assessments/${assessment.id}/streams`,
      headers: { cookie: otherCookie },
    });
    expect(unauthorizedRes.statusCode).toBe(404);

    const unauthorizedPostRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/assessments/${assessment.id}/streams`,
      headers: { cookie: otherCookie },
      body: {
        cameraLabel: "BASELINE_WIDE",
        videoUrl: "https://storage.courtiq.net/assessments/unauthorized.mp4",
      },
    });
    expect(unauthorizedPostRes.statusCode).toBe(404);
  });

  it("analyzes shooting mechanics kinematics and returns structured feedback with ADR-0009 disclaimers", async () => {
    const t = await testApp();
    const athleteCookie = await makeUser(t, "marksman@example.com");

    const analysisRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/assessments/analyze-shooting",
      headers: { cookie: athleteCookie },
      body: {
        releaseAngleDeg: 42.0, // flat angle
        releaseTimeS: 0.62, // slow gather
        elbowFlareDeg: 16.5, // flared elbow
        setPoint: "CHEST_LOW",
        tier: "COLLEGIATE",
      },
    });
    expect(analysisRes.statusCode).toBe(200);
    const analysis = JSON.parse(analysisRes.body);

    expect(analysis.protocol).toBe("SHOOTING_MECHANICS");
    expect(analysis.status).toBe("NEEDS_REVIEW");
    expect(analysis.metrics.kinematicScore).toBeLessThan(70);
    expect(analysis.observations.some((o: string) => o.includes("Flat release angle"))).toBe(true);
    expect(analysis.observations.some((o: string) => o.includes("Low chest set point"))).toBe(true);
    expect(analysis.coachingCues.length).toBeGreaterThan(0);
    expect(analysis.disclaimer).toContain("ADR-0009");
  });

  it("analyzes landing stability kinematics without injury probability outputs (ADR-0009)", async () => {
    const t = await testApp();
    const athleteCookie = await makeUser(t, "jumper@example.com");

    const landingRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/assessments/analyze-landing",
      headers: { cookie: athleteCookie },
      body: {
        bilateralContactDiffMs: 75, // noticeable landing delay
        kneeFlexionAtImpactDeg: 22, // stiff landing
        valgusIndex: "NOTABLE_VALGUS",
        jumpHeightCm: 62.5,
      },
    });
    expect(landingRes.statusCode).toBe(200);
    const landing = JSON.parse(landingRes.body);

    expect(landing.protocol).toBe("LANDING_STABILITY");
    expect(landing.status).toBe("NEEDS_REVIEW");
    expect(landing.metrics.landingSymmetryIndex).toBeLessThan(60);
    expect(landing.observations.some((o: string) => o.includes("Marked bilateral landing delay"))).toBe(true);
    expect(landing.observations.some((o: string) => o.includes("Stiff-legged landing pattern"))).toBe(true);
    expect(landing.observations.some((o: string) => o.includes("Medial knee displacement"))).toBe(true);
    // ADR-0009 guarantee: NO injury forecast anywhere
    expect(landingRes.body).not.toContain("injury probability");
    expect(landingRes.body).not.toContain("tear risk");
    expect(landing.disclaimer).toContain("ADR-0009");
  });
});
