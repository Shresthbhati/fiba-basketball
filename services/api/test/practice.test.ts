import { describe, expect, it } from "vitest";
import { adultBody, cookieOf, testApp } from "./helpers.js";

async function makeUser(t: Awaited<ReturnType<typeof testApp>>, email: string) {
  const res = await t.app.inject({ method: "POST", url: "/api/v1/auth/signup", body: adultBody({ email }) });
  return { id: res.json().id as string, cookie: cookieOf(res) };
}

describe("practice planner & drill management (WP-4.3 & Spec §6.3)", () => {
  it("rejects unauthenticated requests", async () => {
    const t = await testApp();
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/teams/00000000-0000-0000-0000-000000000000/practices",
      body: { title: "Morning Shootaround", scheduledAt: new Date().toISOString(), blocks: [] },
    });
    expect(res.statusCode).toBe(401);
  });

  it("auto-seeds standard drill catalog and allows custom drill creation", async () => {
    const t = await testApp();
    const coach = await makeUser(t, "drill-coach@example.com");

    const teamRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { cookie: coach.cookie },
      body: { name: "Warriors Academy" },
    });
    expect(teamRes.statusCode).toBe(201);
    const teamId = teamRes.json().id;

    // List drills: should auto-seed standard FIBA drills
    const drillsRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/teams/${teamId}/drills`,
      headers: { cookie: coach.cookie },
    });
    expect(drillsRes.statusCode).toBe(200);
    const drills = drillsRes.json().items;
    expect(drills.length).toBeGreaterThanOrEqual(6);
    expect(drills.some((d: { title: string }) => d.title.includes("Shell Drill"))).toBe(true);

    // Filter by category
    const tacticalRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/teams/${teamId}/drills?category=TACTICAL`,
      headers: { cookie: coach.cookie },
    });
    expect(tacticalRes.statusCode).toBe(200);
    expect(tacticalRes.json().items.every((d: { category: string }) => d.category === "TACTICAL")).toBe(true);

    // Create custom drill
    const customRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/teams/${teamId}/drills`,
      headers: { cookie: coach.cookie },
      body: {
        title: "Baseline Out-of-Bounds Spain Action",
        category: "TACTICAL",
        intensity: "HIGH",
        suggestedDurationMins: 15,
        brief: "BLOB set into backscreen and flare screen.",
        tags: ["blob", "spain", "set-piece"],
      },
    });
    expect(customRes.statusCode).toBe(201);
    expect(customRes.json().title).toBe("Baseline Out-of-Bounds Spain Action");
    expect(customRes.json().teamId).toBe(teamId);
  });

  it("creates practice with sequenced blocks and calculated total duration", async () => {
    const t = await testApp();
    const coach = await makeUser(t, "practice-lead@example.com");

    const teamRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { cookie: coach.cookie },
      body: { name: "Metropolitan Ballers" },
    });
    const teamId = teamRes.json().id;

    const scheduledDate = new Date(Date.now() + 86400000).toISOString();
    const practicePayload = {
      title: "Tactical Installation & Transition Scrimmage",
      scheduledAt: scheduledDate,
      location: "Main Gymnasium - Court 1",
      focus: "P&R drop coverage defensive rotations and fastbreak spacing",
      notes: "Bring dark and light reversible jerseys.",
      blocks: [
        {
          id: "b1",
          order: 1,
          title: "Dynamic Activation & Finishing",
          category: "WARMUP",
          durationMins: 10,
          notes: "Focus on landing mechanics",
        },
        {
          id: "b2",
          order: 2,
          title: "Closeout 1-on-1",
          category: "TECHNICAL",
          durationMins: 15,
        },
        {
          id: "b3",
          order: 3,
          title: "Horns Half-Court 5-on-5",
          category: "TACTICAL",
          durationMins: 25,
          notes: "Run against 2-3 zone and man-to-man switch",
        },
        {
          id: "b4",
          order: 4,
          title: "Full-Court Controlled Scrimmage",
          category: "SCRIMMAGE",
          durationMins: 35,
          notes: "14-second offensive rebound clock",
        },
        {
          id: "b5",
          order: 5,
          title: "Pressure Free Throws & Stretch",
          category: "COOLDOWN",
          durationMins: 10,
        },
      ],
    };

    const res = await t.app.inject({
      method: "POST",
      url: `/api/v1/teams/${teamId}/practices`,
      headers: { cookie: coach.cookie },
      body: practicePayload,
    });
    expect(res.statusCode).toBe(201);
    const created = res.json();
    expect(created.title).toBe("Tactical Installation & Transition Scrimmage");
    expect(created.totalDurationMins).toBe(95); // 10 + 15 + 25 + 35 + 10 = 95
    expect(created.blocks).toHaveLength(5);
    expect(created.status).toBe("SCHEDULED");

    // Retrieve via single practice endpoint
    const getRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/practices/${created.id}`,
      headers: { cookie: coach.cookie },
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().id).toBe(created.id);
    expect(getRes.json().totalDurationMins).toBe(95);

    // List practices for team
    const listRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/teams/${teamId}/practices`,
      headers: { cookie: coach.cookie },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().items).toHaveLength(1);
    expect(listRes.json().items[0].id).toBe(created.id);
  });

  it("enforces negative authorization (404) for unauthorized users", async () => {
    const t = await testApp();
    const coach = await makeUser(t, "coach-owner@example.com");
    const intruder = await makeUser(t, "intruder@example.com");

    const teamRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { cookie: coach.cookie },
      body: { name: "Hawks" },
    });
    const teamId = teamRes.json().id;

    // Intruder cannot list practices for team (returns 404 per ADR-0010)
    const intruderListRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/teams/${teamId}/practices`,
      headers: { cookie: intruder.cookie },
    });
    expect(intruderListRes.statusCode).toBe(404);

    // Coach creates practice
    const practiceRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/teams/${teamId}/practices`,
      headers: { cookie: coach.cookie },
      body: {
        title: "Confidential Walkthrough",
        scheduledAt: new Date().toISOString(),
        blocks: [{ id: "b1", order: 1, title: "Secret Zone Offense", category: "TACTICAL", durationMins: 30 }],
      },
    });
    const practiceId = practiceRes.json().id;

    // Intruder cannot view private practice session (returns 404 per ADR-0010)
    const intruderGetRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/practices/${practiceId}`,
      headers: { cookie: intruder.cookie },
    });
    expect(intruderGetRes.statusCode).toBe(404);
  });

  it("updates practice session, records player attendance, and deletes session", async () => {
    const t = await testApp();
    const coach = await makeUser(t, "head-coach@example.com");
    const player1 = await makeUser(t, "player1@example.com");
    const player2 = await makeUser(t, "player2@example.com");

    const teamRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { cookie: coach.cookie },
      body: { name: "Bulls" },
    });
    const teamId = teamRes.json().id;

    // Create practice
    const practiceRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/teams/${teamId}/practices`,
      headers: { cookie: coach.cookie },
      body: {
        title: "Pre-Game Walkthrough",
        scheduledAt: new Date().toISOString(),
        blocks: [
          { id: "b1", order: 1, title: "Warmup", category: "WARMUP", durationMins: 15 },
          { id: "b2", order: 2, title: "Sets", category: "TACTICAL", durationMins: 30 },
        ],
      },
    });
    const practiceId = practiceRes.json().id;
    expect(practiceRes.json().totalDurationMins).toBe(45);

    // Update practice details & status
    const updateRes = await t.app.inject({
      method: "PUT",
      url: `/api/v1/practices/${practiceId}`,
      headers: { cookie: coach.cookie },
      body: {
        title: "Pre-Game Walkthrough (Updated)",
        status: "COMPLETED",
        focus: "Sharpening execution",
      },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().title).toBe("Pre-Game Walkthrough (Updated)");
    expect(updateRes.json().status).toBe("COMPLETED");

    // Record attendance
    const attendanceRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/practices/${practiceId}/attendance`,
      headers: { cookie: coach.cookie },
      body: {
        attendance: [
          { userId: player1.id, status: "PRESENT", note: "Full participant" },
          { userId: player2.id, status: "INJURED", note: "Ankle rehabilitation" },
        ],
      },
    });
    expect(attendanceRes.statusCode).toBe(200);
    expect(attendanceRes.json().attendance).toHaveLength(2);
    expect(attendanceRes.json().attendance[0].status).toBe("PRESENT");
    expect(attendanceRes.json().attendance[1].status).toBe("INJURED");

    // Delete practice
    const deleteRes = await t.app.inject({
      method: "DELETE",
      url: `/api/v1/practices/${practiceId}`,
      headers: { cookie: coach.cookie },
    });
    expect(deleteRes.statusCode).toBe(204);

    // Now practice is 404
    const getDeletedRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/practices/${practiceId}`,
      headers: { cookie: coach.cookie },
    });
    expect(getDeletedRes.statusCode).toBe(404);
  });
});
