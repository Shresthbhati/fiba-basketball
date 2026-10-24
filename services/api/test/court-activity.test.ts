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

describe("Privacy-Preserving Court Activity & Headcount History (WP-5.4)", { timeout: 30000 }, () => {
  it("records court check-ins, tracks condition, and aggregates anonymous activity", async () => {
    const t = await testApp();
    const athlete = await user(t, "athlete-checkin@courtiq.test");

    // 1. Create a court
    const courtRes = await post(t, athlete, "/api/v1/courts", {
      name: "Venice Beach Basketball Courts",
      lat: 33.98,
      lng: -118.47,
      indoor: false,
      surface: "ASPHALT",
      hoops: 4,
      lit: false,
    });
    const courtId = courtRes.json().id;

    // 2. Initial empty activity summary
    const emptyRes = await get(t, null, `/api/v1/courts/${courtId}/activity`);
    expect(emptyRes.statusCode).toBe(200);
    expect(emptyRes.json().totalCheckInsCount).toBe(0);
    expect(emptyRes.json().currentEstimatedStatus).toBe("QUIET");
    expect(emptyRes.json().privacyNotice).toContain("ADR-0004 & Master Spec §8.1");

    // 3. Record check-in with headcount estimate and surface report
    const checkInRes = await post(t, athlete, `/api/v1/courts/${courtId}/check-in`, {
      headcountEstimate: 14, // > 12 -> PACKED
      conditionReport: "EXCELLENT",
      notes: "High energy, two full-court games running.",
    });
    expect(checkInRes.statusCode).toBe(201);
    expect(checkInRes.json().headcountEstimate).toBe(14);
    expect(checkInRes.json().conditionReport).toBe("EXCELLENT");

    // 4. Activity summary now reflects check-in and estimated status
    const summaryRes = await get(t, null, `/api/v1/courts/${courtId}/activity`);
    expect(summaryRes.statusCode).toBe(200);
    const summary = summaryRes.json();

    expect(summary.courtName).toBe("Venice Beach Basketball Courts");
    expect(summary.totalCheckInsCount).toBe(1);
    expect(summary.averageHeadcount).toBe(14);
    expect(summary.currentEstimatedStatus).toBe("PACKED");
    expect(summary.latestConditionReport).toBe("EXCELLENT");
    expect(summary.hourlyHeatmap.length).toBeGreaterThanOrEqual(1);

    // K-Anonymity verification: No personal user IDs or email trails are leaked in activity history
    expect(summary).not.toHaveProperty("userId");
    expect(summary).not.toHaveProperty("userEmail");
  });
});
