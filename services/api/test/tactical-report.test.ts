import { describe, expect, it } from "vitest";
import { adultBody, cookieOf, testApp } from "./helpers.js";

async function makeUser(t: Awaited<ReturnType<typeof testApp>>, email: string) {
  const res = await t.app.inject({ method: "POST", url: "/api/v1/auth/signup", body: adultBody({ email }) });
  return { id: res.json().id as string, cookie: cookieOf(res) };
}

describe("evidence-linked tactical reports (WP-3.5 & Spec §6.4)", () => {
  it("rejects unauthenticated requests", async () => {
    const t = await testApp();
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/teams/00000000-0000-0000-0000-000000000000/reports",
      body: { title: "Scouting Report", blocks: [] },
    });
    expect(res.statusCode).toBe(401);
  });

  it("creates evidence-linked report with OBSERVED, DERIVED, and HYPOTHESIS claims", async () => {
    const t = await testApp();
    const coach = await makeUser(t, "coach-report@example.com");

    // Create team
    const teamRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { cookie: coach.cookie },
      body: { name: "City Thunder" },
    });
    expect(teamRes.statusCode).toBe(201);
    const teamId = teamRes.json().id;

    const payload = {
      title: "Pick & Roll Coverage Scouting vs Wildcats",
      summary: "Tendency analysis showing high frequency of drop coverage with weakside tag delay.",
      tags: ["scouting", "pnr-defense", "drop-coverage"],
      blocks: [
        {
          id: "b1",
          title: "Center Drops Deep in Drop Coverage",
          claimType: "OBSERVED",
          statement: "Opponent center consistently drops 2.5 meters below free-throw line on middle ball screens.",
          citations: [
            { citationType: "CLIP", targetId: "clip-001", timestampMs: 45000, note: "Q1 8:12 drop coverage" },
            { citationType: "EVENT", targetId: "evt-002", note: "Opponent foul on recovery" },
          ],
        },
        {
          id: "b2",
          title: "High Efficiency on Mid-Range Pull-Ups",
          claimType: "DERIVED",
          statement: "Our ball handlers generated 1.27 points per possession when taking the open elbow pull-up against their drop.",
          sampleSize: 15,
          confidence: 0.91,
          citations: [
            { citationType: "METRIC", targetId: "PPP_MID_RANGE_PULLUP", note: "Computed from official box score events" },
          ],
        },
        {
          id: "b3",
          title: "Hammer Action Exploits Corner Help",
          claimType: "HYPOTHESIS",
          statement: "Executing baseline hammer screen will yield wide open corner 3 due to weakside guard over-helping on rim roller.",
          citations: [
            { citationType: "CLIP", targetId: "clip-003", timestampMs: 124000, note: "Late rotation to shooter" },
          ],
        },
      ],
    };

    const res = await t.app.inject({
      method: "POST",
      url: `/api/v1/teams/${teamId}/reports`,
      headers: { cookie: coach.cookie },
      body: payload,
    });

    expect(res.statusCode).toBe(201);
    const report = res.json();
    expect(report.id).toBeTruthy();
    expect(report.title).toBe(payload.title);
    expect(report.version).toBe(1);
    expect(report.blocks).toHaveLength(3);
    expect(report.blocks[0].claimType).toBe("OBSERVED");
    expect(report.blocks[1].claimType).toBe("DERIVED");
    expect(report.blocks[1].sampleSize).toBe(15);
    expect(report.blocks[1].confidence).toBe(0.91);
    expect(report.blocks[2].claimType).toBe("HYPOTHESIS");
  });

  it("enforces negative authorization: non-team-member receives 404 (ADR-0010)", async () => {
    const t = await testApp();
    const coach = await makeUser(t, "coach-sec@example.com");
    const otherUser = await makeUser(t, "outsider@example.com");

    // Coach creates team and report
    const teamRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { cookie: coach.cookie },
      body: { name: "Hawks" },
    });
    const teamId = teamRes.json().id;

    const reportRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/teams/${teamId}/reports`,
      headers: { cookie: coach.cookie },
      body: {
        title: "Confidential Playbook Report",
        blocks: [
          {
            id: "b1",
            title: "Private Tactics",
            claimType: "OBSERVED",
            statement: "Observed tendencies",
            citations: [],
          },
        ],
      },
    });
    const reportId = reportRes.json().id;

    // Coach can read it (200)
    const coachGet = await t.app.inject({
      method: "GET",
      url: `/api/v1/reports/${reportId}`,
      headers: { cookie: coach.cookie },
    });
    expect(coachGet.statusCode).toBe(200);

    // Non-member receives 404 Not Found (not 403, preventing enumeration)
    const outsiderGet = await t.app.inject({
      method: "GET",
      url: `/api/v1/reports/${reportId}`,
      headers: { cookie: otherUser.cookie },
    });
    expect(outsiderGet.statusCode).toBe(404);

    // Non-member cannot list reports of the team
    const outsiderList = await t.app.inject({
      method: "GET",
      url: `/api/v1/teams/${teamId}/reports`,
      headers: { cookie: otherUser.cookie },
    });
    expect(outsiderList.statusCode).toBe(404);

    // Non-member cannot update or delete
    const outsiderUpdate = await t.app.inject({
      method: "PUT",
      url: `/api/v1/reports/${reportId}`,
      headers: { cookie: otherUser.cookie },
      body: { title: "Tampered" },
    });
    expect(outsiderUpdate.statusCode).toBe(404);

    const outsiderDelete = await t.app.inject({
      method: "DELETE",
      url: `/api/v1/reports/${reportId}`,
      headers: { cookie: otherUser.cookie },
    });
    expect(outsiderDelete.statusCode).toBe(404);
  });

  it("updates report details, increments version, and allows deletion", async () => {
    const t = await testApp();
    const coach = await makeUser(t, "coach-edit@example.com");

    const teamRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { cookie: coach.cookie },
      body: { name: "Bulls" },
    });
    const teamId = teamRes.json().id;

    const createRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/teams/${teamId}/reports`,
      headers: { cookie: coach.cookie },
      body: {
        title: "Draft Scouting Report",
        blocks: [
          {
            id: "b1",
            title: "First Look",
            claimType: "OBSERVED",
            statement: "Initial notes",
            citations: [],
          },
        ],
      },
    });
    const reportId = createRes.json().id;

    // Update report
    const updateRes = await t.app.inject({
      method: "PUT",
      url: `/api/v1/reports/${reportId}`,
      headers: { cookie: coach.cookie },
      body: {
        title: "Final Scouting Report (v2)",
        summary: "Verified film analysis",
      },
    });
    expect(updateRes.statusCode).toBe(200);
    const updated = updateRes.json();
    expect(updated.title).toBe("Final Scouting Report (v2)");
    expect(updated.summary).toBe("Verified film analysis");
    expect(updated.version).toBe(2);

    // List reports for team
    const listRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/teams/${teamId}/reports`,
      headers: { cookie: coach.cookie },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().items).toHaveLength(1);

    // Delete report
    const deleteRes = await t.app.inject({
      method: "DELETE",
      url: `/api/v1/reports/${reportId}`,
      headers: { cookie: coach.cookie },
    });
    expect(deleteRes.statusCode).toBe(204);

    // Subsequent get is 404
    const getDeleted = await t.app.inject({
      method: "GET",
      url: `/api/v1/reports/${reportId}`,
      headers: { cookie: coach.cookie },
    });
    expect(getDeleted.statusCode).toBe(404);
  });
});
