import { describe, expect, it } from "vitest";
import { roleAssignments, teams } from "../src/db/schema.js";
import { testApp, user } from "./helpers.js";

const now = new Date();
const in_ = (hours: number) => new Date(now.getTime() + hours * 3_600_000);

async function setup() {
  const t = await testApp();

  const athlete = await user(t, "athlete-sensor@example.com", { displayName: "Jordan Sensor" });
  const coach = await user(t, "coach-sensor@example.com", { displayName: "Coach Pat" });
  const outsider = await user(t, "outsider-sensor@example.com", { displayName: "Outsider Sam" });

  // Coach creates team and adds Jordan as player
  const [team] = await t.db
    .insert(teams)
    .values({
      name: "Metro All-Stars",
      createdBy: coach.id,
    })
    .returning();

  await t.db.insert(roleAssignments).values([
    {
      userId: coach.id,
      role: "COACH",
      resourceType: "team",
      resourceId: team!.id,
    },
    {
      userId: athlete.id,
      role: "PLAYER",
      resourceType: "team",
      resourceId: team!.id,
    },
  ]);

  return { t, athlete, coach, outsider, team: team! };
}

describe("WP-6.4 Wearable & Sensor Device Integration Architecture (Spec §5.4-§5.9, ADR-0015)", () => {
  it("manages athlete device registration, active listing, retirement, and enforces negative authz", async () => {
    const { t, athlete, outsider } = await setup();

    // 1. Register a Catapult wearable and a Polar strap
    const regRes1 = await t.app.inject({
      method: "POST",
      url: "/api/v1/devices",
      headers: { cookie: athlete.cookie },
      payload: {
        deviceManufacturer: "CATAPULT",
        deviceModel: "Vector S7",
        deviceIdentifier: "CAT-SN-8921",
        firmwareVersion: "v4.1.2",
        calibrationDate: now.toISOString(),
      },
    });
    expect(regRes1.statusCode).toBe(201);
    const dev1 = regRes1.json();
    expect(dev1.id).toBeDefined();
    expect(dev1.deviceManufacturer).toBe("CATAPULT");
    expect(dev1.status).toBe("ACTIVE");

    const regRes2 = await t.app.inject({
      method: "POST",
      url: "/api/v1/devices",
      headers: { cookie: athlete.cookie },
      payload: {
        deviceManufacturer: "POLAR",
        deviceModel: "H10",
        deviceIdentifier: "POL-H10-994",
      },
    });
    expect(regRes2.statusCode).toBe(201);
    const dev2 = regRes2.json();
    expect(dev2.id).toBeDefined();

    // 2. List devices
    const listRes = await t.app.inject({
      method: "GET",
      url: "/api/v1/devices",
      headers: { cookie: athlete.cookie },
    });
    expect(listRes.statusCode).toBe(200);
    const devices = listRes.json().items;
    expect(devices.length).toBe(2);

    // 3. Negative AuthZ: Outsider attempting to delete/retire athlete's device gets 404
    const outsiderDelRes = await t.app.inject({
      method: "DELETE",
      url: `/api/v1/devices/${dev1.id}`,
      headers: { cookie: outsider.cookie },
    });
    expect(outsiderDelRes.statusCode).toBe(404);

    // 4. Athlete retires device
    const delRes = await t.app.inject({
      method: "DELETE",
      url: `/api/v1/devices/${dev1.id}`,
      headers: { cookie: athlete.cookie },
    });
    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().status).toBe("RETIRED");
  });

  it("ingests raw sensor telemetry with SourceType SENSOR and strictly adheres to ADR-0009 non-diagnostic rules", async () => {
    const { t, athlete, outsider } = await setup();

    // Register Vert jump monitor
    const devRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/devices",
      headers: { cookie: athlete.cookie },
      payload: {
        deviceManufacturer: "VERT",
        deviceModel: "G-VERT 2.0",
      },
    });
    const deviceId = devRes.json().id;

    // 1. Ingest telemetry session
    const started = in_(-2).toISOString();
    const ended = in_(-1).toISOString();

    const telemetryRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/devices/${deviceId}/telemetry`,
      headers: { cookie: athlete.cookie },
      payload: {
        sessionName: "Scrimmage High-Intensity Load",
        sessionType: "PRACTICE",
        startedAt: started,
        endedAt: ended,
        distanceMeters: 4850.5,
        playerLoad: 420.75,
        jumpCount: 38,
        maxJumpHeightCm: 82.5,
        maxAccelerationG: 4.8,
        maxDecelerationG: 5.2,
        avgHeartRateBpm: 158,
        maxHeartRateBpm: 189,
        timeInZoneSeconds: {
          z1: 180,
          z2: 420,
          z3: 900,
          z4: 1200,
          z5: 900,
        },
        rawFormat: "JSON",
      },
    });

    expect(telemetryRes.statusCode).toBe(201);
    const session = telemetryRes.json();
    expect(session.id).toBeDefined();
    expect(session.sourceType).toBe("SENSOR");
    expect(session.playerLoad).toBe(420.75);
    expect(session.jumpCount).toBe(38);
    expect(session.maxJumpHeightCm).toBe(82.5);
    expect(session.complianceNotice).toContain("ADR-0009 COMPLIANT");
    expect(session.complianceNotice).toContain("No injury probability");

    // 2. Negative AuthZ: Ingesting to foreign device returns 404
    const outsiderIngest = await t.app.inject({
      method: "POST",
      url: `/api/v1/devices/${deviceId}/telemetry`,
      headers: { cookie: outsider.cookie },
      payload: {
        sessionName: "Hacked Run",
        sessionType: "WORKOUT",
        startedAt: started,
        endedAt: ended,
      },
    });
    expect(outsiderIngest.statusCode).toBe(404);
  });

  it("allows athlete to view their telemetry and prevents unauthorized snooping (ADR-0010)", async () => {
    const { t, athlete, outsider } = await setup();

    const devRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/devices",
      headers: { cookie: athlete.cookie },
      payload: { deviceManufacturer: "GARMIN", deviceModel: "Forerunner 965" },
    });
    const deviceId = devRes.json().id;

    const started = in_(-3).toISOString();
    const ended = in_(-2).toISOString();

    const ingestRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/devices/${deviceId}/telemetry`,
      headers: { cookie: athlete.cookie },
      payload: {
        sessionName: "Morning Conditioning",
        sessionType: "WORKOUT",
        startedAt: started,
        endedAt: ended,
        durationSeconds: 3600,
        distanceMeters: 6200,
        avgHeartRateBpm: 142,
      },
    });
    const sessionId = ingestRes.json().id;

    // Athlete lists sessions
    const listRes = await t.app.inject({
      method: "GET",
      url: "/api/v1/athletes/me/sensor-sessions",
      headers: { cookie: athlete.cookie },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().items.length).toBe(1);
    expect(listRes.json().items[0].sessionName).toBe("Morning Conditioning");
    expect(listRes.json().items[0].deviceManufacturer).toBe("GARMIN");

    // Athlete views single session
    const viewRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/sensor-sessions/${sessionId}`,
      headers: { cookie: athlete.cookie },
    });
    expect(viewRes.statusCode).toBe(200);
    expect(viewRes.json().id).toBe(sessionId);

    // Negative AuthZ: Outsider receives 404
    const outsiderViewRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/sensor-sessions/${sessionId}`,
      headers: { cookie: outsider.cookie },
    });
    expect(outsiderViewRes.statusCode).toBe(404);
  });

  it("aggregates team sensor load summaries for authorized coaches and rejects unauthorized staff", async () => {
    const { t, athlete, coach, outsider, team } = await setup();

    // Register device and ingest session for athlete
    const devRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/devices",
      headers: { cookie: athlete.cookie },
      payload: { deviceManufacturer: "CATAPULT", deviceModel: "Vector S7" },
    });
    const deviceId = devRes.json().id;

    await t.app.inject({
      method: "POST",
      url: `/api/v1/devices/${deviceId}/telemetry`,
      headers: { cookie: athlete.cookie },
      payload: {
        sessionName: "Team Practice Session 1",
        sessionType: "PRACTICE",
        startedAt: in_(-24).toISOString(),
        endedAt: in_(-22).toISOString(),
        durationSeconds: 7200,
        playerLoad: 580.4,
        jumpCount: 45,
        avgHeartRateBpm: 154,
      },
    });

    // Coach views team sensor summary
    const summaryRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/teams/${team.id}/sensor-summary`,
      headers: { cookie: coach.cookie },
    });
    expect(summaryRes.statusCode).toBe(200);
    const summary = summaryRes.json();
    expect(summary.teamName).toBe("Metro All-Stars");
    expect(summary.athleteSummaries.length).toBe(1);
    expect(summary.athleteSummaries[0].athleteName).toBe("Jordan Sensor");
    expect(summary.athleteSummaries[0].totalActiveMinutes).toBe(120);
    expect(summary.athleteSummaries[0].totalPlayerLoad).toBe(580.4);
    expect(summary.athleteSummaries[0].totalJumps).toBe(45);
    expect(summary.complianceNotice).toContain("ADR-0009 COMPLIANT");

    // Negative AuthZ: Outsider gets 404
    const outsiderRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/teams/${team.id}/sensor-summary`,
      headers: { cookie: outsider.cookie },
    });
    expect(outsiderRes.statusCode).toBe(404);
  });
});
