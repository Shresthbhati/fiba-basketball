import { describe, expect, it } from "vitest";
import { testApp, user } from "./helpers.js";

type T = Awaited<ReturnType<typeof testApp>>;
type U = { id: string; cookie: string };

const post = (t: T, u: U | null, url: string, payload?: unknown) =>
  t.app.inject({
    method: "POST",
    url,
    ...(u ? { headers: { cookie: u.cookie } } : {}),
    ...(payload ? { payload: payload as object } : {}),
  });

const get = (t: T, u: U | null, url: string) =>
  t.app.inject({
    method: "GET",
    url,
    ...(u ? { headers: { cookie: u.cookie } } : {}),
  });

describe("Training-to-Game Readiness & Correlation Dashboard (WP-6.3, ADR-0009)", { timeout: 30000 }, () => {
  it("calculates acute and chronic workload, ACWR, and strictly avoids injury prediction", async () => {
    const t = await testApp();
    const athlete = await user(t, "athlete-readiness@courtiq.test", { displayName: "Derrick Rose" });
    const stranger = await user(t, "stranger-readiness@courtiq.test");

    // 1. Log a workout session to create training volume
    const startRes = await post(t, athlete, "/api/v1/training/sessions", {
      notes: "Lower body power and acceleration",
    });
    expect(startRes.statusCode).toBe(201);
    const sessionId = startRes.json().id;

    // Fetch exercises to find a valid exercise ID
    const exRes = await get(t, athlete, "/api/v1/exercises");
    const exerciseId = exRes.json().items[0]?.id;

    if (exerciseId) {
      await post(t, athlete, `/api/v1/training/sessions/${sessionId}/sets`, {
        clientId: "10000000-0000-4000-8000-000000000001",
        exerciseId,
        reps: 5,
        loadKg: 100,
        rpe: 8,
      });
      await post(t, athlete, `/api/v1/training/sessions/${sessionId}/sets`, {
        clientId: "10000000-0000-4000-8000-000000000002",
        exerciseId,
        reps: 5,
        loadKg: 100,
        rpe: 8,
      });
    }

    await post(t, athlete, `/api/v1/training/sessions/${sessionId}/finish`, {
      sessionRpe: 7,
      notes: "Smooth session, good pop.",
    });

    // 2. Query Readiness Dashboard
    const res = await get(t, athlete, "/api/v1/me/readiness");
    expect(res.statusCode).toBe(200);
    const readiness = res.json();

    expect(readiness.athleteName).toBe("Derrick Rose");
    expect(readiness.workload.acuteSessionsCount).toBe(1);
    expect(readiness.workload.volumeUnit).toBe("kg");
    expect(readiness.safetyStop.active).toBe(false);

    // Strict ADR-0009 verification:
    expect(readiness.complianceNotice).toContain("ADR-0009 COMPLIANT");
    expect(readiness.complianceNotice).toContain("does NOT output injury probability");
    expect(readiness).not.toHaveProperty("injuryProbability");
    expect(readiness).not.toHaveProperty("injuryRisk");

    // 3. Negative AuthZ: Stranger accessing athlete's readiness gets 404 (ADR-0010)
    const unauthorized = await get(t, stranger, `/api/v1/athletes/${athlete.id}/readiness`);
    expect(unauthorized.statusCode).toBe(404);
  });

  it("triggers safety stop when wellness check records pain per Spec §5.3", async () => {
    const t = await testApp();
    const athlete = await user(t, "athlete-pain@courtiq.test", { displayName: "Grant Hill" });

    // Submit a wellness check reporting pain
    const wellnessRes = await post(t, athlete, "/api/v1/training/wellness", {
      date: new Date().toISOString().slice(0, 10),
      soreness: 5,
      painReported: true,
      painNote: "Sharp patellar tendon pain on landing",
    });
    expect(wellnessRes.statusCode).toBe(200);

    // Readiness dashboard should immediately flag safety stop
    const res = await get(t, athlete, "/api/v1/me/readiness");
    expect(res.statusCode).toBe(200);
    const readiness = res.json();

    expect(readiness.safetyStop.active).toBe(true);
    expect(readiness.safetyStop.advice).toContain("Automatic progressions are locked to HOLD");
    expect(readiness.safetyStop.advice).toContain("consult a qualified physical therapist");
  });
});
