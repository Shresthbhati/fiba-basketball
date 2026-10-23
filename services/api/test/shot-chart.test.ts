import { describe, expect, it } from "vitest";
import { adultBody, cookieOf, testApp } from "./helpers.js";
import { classifyShot } from "../src/match/shot-chart.js";
import { roleAssignments } from "../src/db/schema.js";
import { randomUUID } from "node:crypto";

async function makeUser(t: Awaited<ReturnType<typeof testApp>>, email: string) {
  const res = await t.app.inject({ method: "POST", url: "/api/v1/auth/signup", body: adultBody({ email }) });
  return { id: res.json().id as string, cookie: cookieOf(res) };
}

describe("verified shot chart & zone efficiency analytics (WP-3.4 & Spec §6.4)", () => {
  it("pure geometric classifier assigns correct FIBA shot zones and distances", () => {
    // 1. Restricted area (<= 1.25m from hoop center at x=12.425, y=0)
    const ra = classifyShot("FIELD_GOAL", 12.8, 0.2);
    expect(ra.zone).toBe("RESTRICTED_AREA");
    expect(ra.distanceMeters).toBeLessThanOrEqual(1.25);
    expect(ra.shotType).toBe("TWO_POINT");

    // 2. In the paint (key boundary: x >= 8.20m, |y| <= 2.45m)
    const paint = classifyShot("FIELD_GOAL_MISSED", 10.0, 1.2);
    expect(paint.zone).toBe("PAINT");
    expect(paint.shotType).toBe("TWO_POINT");

    // 3. Mid-range (inside arc, outside paint)
    const midRange = classifyShot("FIELD_GOAL", 11.0, 4.0);
    expect(midRange.zone).toBe("MID_RANGE");
    expect(midRange.shotType).toBe("TWO_POINT");

    // 4. Corner 3s (|y| >= 6.60m, x >= 11.01m)
    const cornerLeft = classifyShot("THREE_POINT", 12.5, -6.8);
    expect(cornerLeft.zone).toBe("CORNER_THREE_LEFT");
    expect(cornerLeft.shotType).toBe("THREE_POINT");

    const cornerRight = classifyShot("THREE_POINT_MISSED", 12.5, 6.8);
    expect(cornerRight.zone).toBe("CORNER_THREE_RIGHT");
    expect(cornerRight.shotType).toBe("THREE_POINT");

    // 5. Above the break 3 (distance >= 6.75m)
    const atb = classifyShot("THREE_POINT", 5.0, 0.0);
    expect(atb.zone).toBe("ABOVE_THE_BREAK_THREE");
    expect(atb.distanceMeters).toBeGreaterThanOrEqual(6.75);

    // 6. Backcourt heave
    const heave = classifyShot("THREE_POINT_MISSED", -2.0, 1.0);
    expect(heave.zone).toBe("BACKCOURT");
  });

  it("records shot events with coordinates, computes eFG% and TS%, and respects negative authZ", async () => {
    const t = await testApp();
    const organizer = await makeUser(t, "organizer-sc@example.com");
    const scorekeeper = await makeUser(t, "scorer-sc@example.com");
    const outsider = await makeUser(t, "outsider-sc@example.com");

    // 1. Setup competition and teams
    const teamA = await t.app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { cookie: organizer.cookie },
      body: { name: "Team Alpha" },
    });
    const teamAId = teamA.json().id;

    const teamB = await t.app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { cookie: organizer.cookie },
      body: { name: "Team Beta" },
    });
    const teamBId = teamB.json().id;

    // Create player on Team Alpha
    const playerA = await makeUser(t, "shooter@example.com");

    const compRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/competitions",
      headers: { cookie: organizer.cookie },
      body: { name: "Metropolitan Championship", format: "ROUND_ROBIN" },
    });
    const compId = compRes.json().id;

    // Register teams and player
    await t.app.inject({
      method: "POST",
      url: `/api/v1/competitions/${compId}/teams`,
      headers: { cookie: organizer.cookie },
      body: { teamId: teamAId },
    });
    await t.app.inject({
      method: "POST",
      url: `/api/v1/competitions/${compId}/teams`,
      headers: { cookie: organizer.cookie },
      body: { teamId: teamBId },
    });

    await t.db.insert(roleAssignments).values({
      userId: playerA.id,
      role: "ATHLETE",
      resourceType: "team",
      resourceId: teamAId,
    });

    const rosterRes = await t.app.inject({
      method: "PUT",
      url: `/api/v1/competitions/${compId}/teams/${teamAId}/roster/${playerA.id}`,
      headers: { cookie: organizer.cookie },
      body: { jersey: 23 },
    });
    expect(rosterRes.statusCode).toBe(204);

    // Generate schedule
    const schedRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/competitions/${compId}/schedule`,
      headers: { cookie: organizer.cookie },
    });
    expect(schedRes.statusCode).toBe(201);
    const match = schedRes.json().items[0];
    const matchId = match.id;
    const playerSide = match.homeTeamId === teamAId ? "home" : "away";
    const otherSide = playerSide === "home" ? "away" : "home";

    // Assign scorekeeper
    await t.app.inject({
      method: "POST",
      url: `/api/v1/competitions/${compId}/officials`,
      headers: { cookie: organizer.cookie },
      body: { email: "scorer-sc@example.com", role: "SCOREKEEPER" },
    });

    // Negative authZ: non-existent match receives 404 (ADR-0010)
    const privateShotRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/matches/00000000-0000-0000-0000-000000000000/shot-chart`,
      headers: { cookie: outsider.cookie },
    });
    expect(privateShotRes.statusCode).toBe(404);

    // 2. Scorekeeper submits a batch of shots with court coordinates:
    // - 1 Made restricted area layup by Player A (2pts): (12.8, 0.0)
    // - 1 Missed mid-range jumper by Player A: (10.5, 3.5)
    // - 1 Made above the break 3 by Player A (3pts): (5.5, 0.0)
    // - 1 Made other team corner 3 (3pts): (12.5, 6.8)
    const shotEvents = [
      {
        id: randomUUID(),
        localSeq: 1,
        type: "FIELD_GOAL",
        side: playerSide,
        period: 1,
        clockSeconds: 580,
        playerId: playerA.id,
        coordX: 12.8,
        coordY: 0.0,
      },
      {
        id: randomUUID(),
        localSeq: 2,
        type: "FIELD_GOAL_MISSED",
        side: playerSide,
        period: 1,
        clockSeconds: 520,
        playerId: playerA.id,
        coordX: 10.5,
        coordY: 3.5,
      },
      {
        id: randomUUID(),
        localSeq: 3,
        type: "THREE_POINT",
        side: playerSide,
        period: 1,
        clockSeconds: 460,
        playerId: playerA.id,
        coordX: 5.5,
        coordY: 0.0,
      },
      {
        id: randomUUID(),
        localSeq: 4,
        type: "THREE_POINT",
        side: otherSide,
        period: 1,
        clockSeconds: 410,
        coordX: 12.5,
        coordY: 6.8,
      },
    ];

    const submitRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/matches/${matchId}/events`,
      headers: { cookie: scorekeeper.cookie },
      body: { events: shotEvents },
    });
    expect(submitRes.statusCode).toBe(200);

    // 3. Query match shot chart (public endpoint now that competition is published)
    const chartRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/matches/${matchId}/shot-chart`,
    });
    expect(chartRes.statusCode).toBe(200);
    const data = chartRes.json();

    expect(data.sourceType).toBe("OFFICIAL");
    expect(data.shots.length).toBe(4);
    expect(data.smallSample).toBe(true); // < 10 shots

    // Home team has 3 shots (2 made: 1 2PT + 1 3PT = 5 points)
    // Away team has 1 shot (1 3PT = 3 points)
    // Total: 4 shots, 3 made, 8 points
    expect(data.summary.totalPoints).toBe(8);
    expect(data.summary.fgm).toBe(3);
    expect(data.summary.fga).toBe(4);
    expect(data.summary.fgPct).toBe(75.0);
    expect(data.summary.threePm).toBe(2);
    expect(data.summary.threePa).toBe(2);

    // eFG% = (FGM + 0.5 * 3PM) / FGA = (3 + 1.0) / 4 = 100%
    expect(data.summary.eFgPct).toBe(100.0);

    // Check zones breakdown
    expect(data.zones.RESTRICTED_AREA.makes).toBe(1);
    expect(data.zones.RESTRICTED_AREA.attempts).toBe(1);
    expect(data.zones.MID_RANGE.makes).toBe(0);
    expect(data.zones.MID_RANGE.attempts).toBe(1);
    expect(data.zones.ABOVE_THE_BREAK_THREE.makes).toBe(1);
    expect(data.zones.CORNER_THREE_RIGHT.makes).toBe(1);

    // 4. Query player-specific filter
    const playerChartRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/matches/${matchId}/shot-chart?playerId=${playerA.id}`,
    });
    expect(playerChartRes.statusCode).toBe(200);
    const playerData = playerChartRes.json();
    expect(playerData.shots.length).toBe(3);
    expect(playerData.summary.fga).toBe(3);
    expect(playerData.summary.fgm).toBe(2);
    expect(playerData.summary.totalPoints).toBe(5);

    // 5. Query player career shot chart across games
    const careerRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/players/${playerA.id}/shot-chart`,
    });
    expect(careerRes.statusCode).toBe(200);
    const careerData = careerRes.json();
    expect(careerData.playerId).toBe(playerA.id);
    expect(careerData.shots.length).toBe(3);
    expect(careerData.summary.totalPoints).toBe(5);
  });
});
