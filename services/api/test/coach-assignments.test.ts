import { describe, expect, it } from "vitest";
import { adultBody, cookieOf, testApp } from "./helpers.js";
import { roleAssignments } from "../src/db/schema.js";

async function makeUser(t: Awaited<ReturnType<typeof testApp>>, email: string) {
  const res = await t.app.inject({ method: "POST", url: "/api/v1/auth/signup", body: adultBody({ email }) });
  return { id: res.json().id as string, cookie: cookieOf(res) };
}

describe("coach assignments & closed-loop review queue (WP-4.4 / WP-4.5 & Spec §9)", () => {
  it("rejects unauthenticated requests", async () => {
    const t = await testApp();
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/teams/00000000-0000-0000-0000-000000000000/assignments",
      body: { title: "Scouting Film Study", type: "FILM_STUDY" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("enforces negative authorization (ADR-0010: returns 404 for unauthorized team resources)", async () => {
    const t = await testApp();
    const coachA = await makeUser(t, "coach-a@example.com");
    const outsider = await makeUser(t, "outsider@example.com");

    const teamRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { cookie: coachA.cookie },
      body: { name: "Team Alpha" },
    });
    const teamId = teamRes.json().id;

    // Outsider cannot create assignment on team A
    const postRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/teams/${teamId}/assignments`,
      headers: { cookie: outsider.cookie },
      body: { title: "Malicious Assignment", type: "DRILL_PRACTICE" },
    });
    expect(postRes.statusCode).toBe(404);

    // Outsider cannot access coach dashboard on team A
    const dashRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/teams/${teamId}/coach-dashboard`,
      headers: { cookie: outsider.cookie },
    });
    expect(dashRes.statusCode).toBe(404);

    // Outsider cannot list assignments on team A
    const listRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/teams/${teamId}/assignments`,
      headers: { cookie: outsider.cookie },
    });
    expect(listRes.statusCode).toBe(404);
  });

  it("creates an assignment with quiz questions and links to resources", async () => {
    const t = await testApp();
    const coach = await makeUser(t, "head-coach@example.com");

    const teamRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { cookie: coach.cookie },
      body: { name: "Red Dragons" },
    });
    const teamId = teamRes.json().id;

    const assignmentPayload = {
      title: "Pick & Roll Coverage Film Review",
      description: "Analyze the drop vs switch coverage against high horns action.",
      type: "FILM_STUDY",
      priority: "HIGH",
      dueAt: new Date(Date.now() + 86400000).toISOString(),
      resourceRef: {
        type: "SCOUTING_MONTAGE",
        id: "00000000-0000-0000-0000-000000000001",
        title: "PNR Horns Reel",
      },
      quizQuestions: [
        {
          id: "q1",
          question: "When the ball screen is set at the 45-degree angle, where does the low-man helper position their feet?",
          options: [
            "At the 3-point line",
            "One foot in the paint with chest to baseline",
            "Behind the offensive center",
            "At half court",
          ],
          correctOptionIndex: 1,
        },
        {
          id: "q2",
          question: "In drop coverage, the dropping big should remain below what line until the guard recovers?",
          options: [
            "Free throw line extended",
            "Half court line",
            "Out of bounds line",
            "Above the 3-point arc",
          ],
          correctOptionIndex: 0,
        },
      ],
    };

    const res = await t.app.inject({
      method: "POST",
      url: `/api/v1/teams/${teamId}/assignments`,
      headers: { cookie: coach.cookie },
      body: assignmentPayload,
    });

    expect(res.statusCode).toBe(201);
    const created = res.json();
    expect(created.title).toBe("Pick & Roll Coverage Film Review");
    expect(created.type).toBe("FILM_STUDY");
    expect(created.priority).toBe("HIGH");
    expect(created.quizQuestions.length).toBe(2);
    expect(created.resourceRef.title).toBe("PNR Horns Reel");
  });

  it("allows athlete to submit quiz, auto-grades answers, and hides answer keys beforehand", async () => {
    const t = await testApp();
    const coach = await makeUser(t, "varsity-coach@example.com");
    const athlete = await makeUser(t, "point-guard@example.com");

    const teamRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { cookie: coach.cookie },
      body: { name: "Varsity Hawks" },
    });
    const teamId = teamRes.json().id;

    // Add athlete to team via role assignment
    await t.db.insert(roleAssignments).values({
      userId: athlete.id,
      role: "ATHLETE",
      resourceType: "team",
      resourceId: teamId,
    });

    // Coach creates quiz assignment
    const assignRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/teams/${teamId}/assignments`,
      headers: { cookie: coach.cookie },
      body: {
        title: "Fast Break Decision Making",
        type: "DRILL_PRACTICE",
        priority: "NORMAL",
        quizQuestions: [
          {
            id: "q1",
            question: "In a 3-on-2 transition, where should the wings sprint?",
            options: ["Straight into the paint", "To the deep corners", "Stay at center court"],
            correctOptionIndex: 1,
          },
          {
            id: "q2",
            question: "If top defender commits to the ball, what is the pass?",
            options: ["Kick out to open wing shooter", "Force a contested floater"],
            correctOptionIndex: 0,
          },
        ],
      },
    });
    const assignmentId = assignRes.json().id;

    // Athlete views assignment before submitting: correctOptionIndex must be redacted
    const getBeforeRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/assignments/${assignmentId}`,
      headers: { cookie: athlete.cookie },
    });
    expect(getBeforeRes.statusCode).toBe(200);
    const beforeData = getBeforeRes.json();
    expect(beforeData.quizQuestions[0].correctOptionIndex).toBeUndefined();
    expect(beforeData.submission).toBeNull();

    // Athlete submits answers: 1 correct (q1: 1), 1 incorrect (q2: 1 instead of 0) -> 50%
    const submitRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/assignments/${assignmentId}/submissions`,
      headers: { cookie: athlete.cookie },
      body: {
        answers: {
          selectedOptions: {
            q1: 1,
            q2: 1,
          },
          athleteNotes: "Completed film review session at home.",
        },
      },
    });
    expect(submitRes.statusCode).toBe(201);
    const submission = submitRes.json();
    expect(submission.score).toBe(50);
    expect(submission.status).toBe("SUBMITTED");

    // Athlete re-views: now has submission and answer keys available for review
    const getAfterRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/assignments/${assignmentId}`,
      headers: { cookie: athlete.cookie },
    });
    expect(getAfterRes.statusCode).toBe(200);
    expect(getAfterRes.json().submission.score).toBe(50);
  });

  it("coach reviews submission, updates score and dashboard reflects metrics and queue", async () => {
    const t = await testApp();
    const coach = await makeUser(t, "director@example.com");
    const athlete = await makeUser(t, "wing-player@example.com");

    const teamRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { cookie: coach.cookie },
      body: { name: "City All-Stars" },
    });
    const teamId = teamRes.json().id;

    await t.db.insert(roleAssignments).values({
      userId: athlete.id,
      role: "ATHLETE",
      resourceType: "team",
      resourceId: teamId,
    });

    const assignRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/teams/${teamId}/assignments`,
      headers: { cookie: coach.cookie },
      body: {
        title: "Movement Assessment: Ankle Dorsiflexion Mobility",
        type: "MOVEMENT_ASSESSMENT",
        priority: "HIGH",
      },
    });
    const assignmentId = assignRes.json().id;

    // Athlete submits
    const subRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/assignments/${assignmentId}/submissions`,
      headers: { cookie: athlete.cookie },
      body: {
        answers: {
          athleteNotes: "Uploaded bilateral assessment video; recorded 38 deg on left ankle.",
        },
      },
    });
    const submissionId = subRes.json().id;

    // Coach inspects dashboard: reviewQueue should have 1 pending review
    const dashRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/teams/${teamId}/coach-dashboard`,
      headers: { cookie: coach.cookie },
    });
    expect(dashRes.statusCode).toBe(200);
    const dash = dashRes.json();
    expect(dash.openReviewCount).toBe(1);
    expect(dash.activeAssignmentCount).toBe(1);
    expect(dash.reviewQueue.length).toBe(1);
    expect(dash.reviewQueue[0].assignmentTitle).toBe("Movement Assessment: Ankle Dorsiflexion Mobility");
    expect(dash.reviewQueue[0].athleteName).toBeDefined();

    // Coach reviews the submission
    const reviewRes = await t.app.inject({
      method: "PUT",
      url: `/api/v1/submissions/${submissionId}/review`,
      headers: { cookie: coach.cookie },
      body: {
        status: "REVIEWED",
        score: 95,
        coachNotes: "Good mobility baseline. Add 2 sets of eccentric calf drops to warmup.",
      },
    });
    expect(reviewRes.statusCode).toBe(200);
    expect(reviewRes.json().status).toBe("REVIEWED");
    expect(reviewRes.json().score).toBe(95);

    // Coach inspects dashboard again: openReviewCount should now be 0
    const updatedDashRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/teams/${teamId}/coach-dashboard`,
      headers: { cookie: coach.cookie },
    });
    expect(updatedDashRes.json().openReviewCount).toBe(0);
    expect(updatedDashRes.json().reviewQueue.length).toBe(0);
    expect(updatedDashRes.json().recentActivity.length).toBe(1);
    expect(updatedDashRes.json().recentActivity[0].type).toBe("REVIEW_COMPLETED");
  });
});
