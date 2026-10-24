import { describe, expect, it } from "vitest";
import { adultBody, cookieOf, testApp } from "./helpers.js";

async function makeUser(t: Awaited<ReturnType<typeof testApp>>, email: string) {
  const res = await t.app.inject({ method: "POST", url: "/api/v1/auth/signup", body: adultBody({ email }) });
  return cookieOf(res);
}

const sampleKeyframes = [
  {
    step: 1,
    description: "Horns Alignment: 1 top of key, 4 and 5 at elbows, 2 and 3 in corners",
    tokens: [
      { id: "p1", type: "offense", label: "1", x: 7.0, y: 0.0 },
      { id: "p2", type: "offense", label: "2", x: 13.0, y: -6.5 },
      { id: "p3", type: "offense", label: "3", x: 13.0, y: 6.5 },
      { id: "p4", type: "offense", label: "4", x: 8.5, y: -2.5 },
      { id: "p5", type: "offense", label: "5", x: 8.5, y: 2.5 },
      { id: "d1", type: "defense", label: "x1", x: 8.0, y: 0.0 },
      { id: "ball", type: "ball", label: "ball", x: 7.0, y: 0.0 },
    ],
    actions: [
      { id: "a1", type: "screen", from: { x: 8.5, y: -2.5 }, to: { x: 8.0, y: 0.0 }, label: "Ball Screen" },
      { id: "a2", type: "dribble", from: { x: 7.0, y: 0.0 }, to: { x: 8.0, y: -4.0 }, label: "Drive Right" },
    ],
  },
];

describe("Tactical Playbook Vector SVG & Practice Plan Export API (Spec §10.3, §10.4)", () => {
  it("exports a tactical play to standalone SVG and print-ready HTML with authZ checks", async () => {
    const t = await testApp();
    const coachCookie = await makeUser(t, "headcoach@example.com");
    const otherCookie = await makeUser(t, "rivalcoach@example.com");

    // 1. Create a play
    const createRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/playbook/plays",
      headers: { cookie: coachCookie },
      body: {
        title: "Horns Pick & Pop Special",
        description: "Primary scoring action against 2-3 matchup zone",
        category: "offense",
        courtMode: "half",
        keyframes: sampleKeyframes,
      },
    });
    expect(createRes.statusCode).toBe(201);
    const play = JSON.parse(createRes.body);

    // 2. Export play as standalone Vector SVG
    const svgRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/playbook/plays/${play.id}/export/svg?theme=light`,
      headers: { cookie: coachCookie },
    });
    expect(svgRes.statusCode).toBe(200);
    expect(svgRes.headers["content-type"]).toContain("image/svg+xml");
    expect(svgRes.body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(svgRes.body).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svgRes.body).toContain('data-token-id="p1"');
    expect(svgRes.body).toContain("Ball Screen");

    // 3. Export play as Print-ready HTML
    const printRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/playbook/plays/${play.id}/export/print`,
      headers: { cookie: coachCookie },
    });
    expect(printRes.statusCode).toBe(200);
    expect(printRes.headers["content-type"]).toContain("text/html");
    expect(printRes.body).toContain("Horns Pick &amp; Pop Special — Tactical Playbook");
    expect(printRes.body).toContain("window.print()");

    // 4. Negative AuthZ check: Rival coach cannot access private play exports (ADR-0010)
    const rivalSvgRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/playbook/plays/${play.id}/export/svg`,
      headers: { cookie: otherCookie },
    });
    expect(rivalSvgRes.statusCode).toBe(404);

    const rivalPrintRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/playbook/plays/${play.id}/export/print`,
      headers: { cookie: otherCookie },
    });
    expect(rivalPrintRes.statusCode).toBe(404);
  });

  it("supports ad-hoc SVG and HTML generation from request payload", async () => {
    const t = await testApp();
    const cookie = await makeUser(t, "user-adhoc@example.com");

    const adhocSvg = await t.app.inject({
      method: "POST",
      url: "/api/v1/playbook/export/svg?theme=monochrome",
      headers: { cookie },
      body: {
        title: "Draft Play",
        keyframes: sampleKeyframes,
      },
    });
    expect(adhocSvg.statusCode).toBe(200);
    expect(adhocSvg.headers["content-type"]).toContain("image/svg+xml");
    expect(adhocSvg.body).toContain("#000000"); // monochrome lines

    const adhocHtml = await t.app.inject({
      method: "POST",
      url: "/api/v1/playbook/export/print",
      headers: { cookie },
      body: {
        title: "Draft Play",
        keyframes: sampleKeyframes,
      },
    });
    expect(adhocHtml.statusCode).toBe(200);
    expect(adhocHtml.headers["content-type"]).toContain("text/html");
    expect(adhocHtml.body).toContain("Draft Play — Tactical Playbook");
  });

  it("exports a practice session to print-ready HTML with authZ checks", async () => {
    const t = await testApp();
    const coachCookie = await makeUser(t, "coach-practice@example.com");
    const otherCookie = await makeUser(t, "outsider@example.com");

    // 1. Create a team
    const teamRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { cookie: coachCookie },
      body: { name: "Boston C-Men" },
    });
    expect(teamRes.statusCode).toBe(201);
    const team = JSON.parse(teamRes.body);

    // 2. Create a practice session
    const practiceRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/teams/${team.id}/practices`,
      headers: { cookie: coachCookie },
      body: {
        title: "Game Eve Shootaround & Walkthrough",
        scheduledAt: new Date().toISOString(),
        location: "Garden Auxiliary Gym",
        focus: "Zone offensive spacing & Baseline out-of-bounds",
        blocks: [
          {
            id: "b1",
            order: 1,
            title: "Shooting Lines & Activation",
            category: "WARMUP",
            durationMins: 15,
            notes: "Spot shooting from 5 spots.",
          },
          {
            id: "b2",
            order: 2,
            title: "5v0 Horns Installation",
            category: "TACTICAL",
            durationMins: 25,
            notes: "Walkthrough timing of back screens.",
          },
        ],
      },
    });
    expect(practiceRes.statusCode).toBe(201);
    const practice = JSON.parse(practiceRes.body);

    // 3. Export practice session print HTML
    const printRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/practices/${practice.id}/export/print`,
      headers: { cookie: coachCookie },
    });
    expect(printRes.statusCode).toBe(200);
    expect(printRes.headers["content-type"]).toContain("text/html");
    expect(printRes.body).toContain("Game Eve Shootaround &amp; Walkthrough — Practice Plan");
    expect(printRes.body).toContain("Shooting Lines &amp; Activation");
    expect(printRes.body).toContain("5v0 Horns Installation");

    // 4. Negative AuthZ: Unauthorized user gets 404
    const unauthorizedRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/practices/${practice.id}/export/print`,
      headers: { cookie: otherCookie },
    });
    expect(unauthorizedRes.statusCode).toBe(404);
  });
});
