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
  {
    step: 2,
    description: "Pick and Pop: 4 pops to arc, 1 passes to 4 for open 3-pointer",
    tokens: [
      { id: "p1", type: "offense", label: "1", x: 8.0, y: -4.0 },
      { id: "p2", type: "offense", label: "2", x: 13.0, y: -6.5 },
      { id: "p3", type: "offense", label: "3", x: 13.0, y: 6.5 },
      { id: "p4", type: "offense", label: "4", x: 6.0, y: -3.0 },
      { id: "p5", type: "offense", label: "5", x: 10.0, y: 1.0 },
      { id: "d1", type: "defense", label: "x1", x: 8.5, y: -3.5 },
      { id: "ball", type: "ball", label: "ball", x: 6.0, y: -3.0 },
    ],
    actions: [
      { id: "a3", type: "pass", from: { x: 8.0, y: -4.0 }, to: { x: 6.0, y: -3.0 }, label: "Skip Pass" },
      { id: "a4", type: "cut", from: { x: 8.5, y: 2.5 }, to: { x: 10.0, y: 1.0 }, label: "Roll to Rim" },
    ],
  },
];

describe("tactical plays & playbook (Phase 4 & WP-4.2)", () => {
  it("rejects unauthenticated requests", async () => {
    const t = await testApp();
    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/playbook/plays",
      body: { title: "Horns Pop", keyframes: sampleKeyframes },
    });
    expect(res.statusCode).toBe(401);
  });

  it("creates a tactical play with version 1 and returns 201", async () => {
    const t = await testApp();
    const coachCookie = await makeUser(t, "coach1@example.com");

    const res = await t.app.inject({
      method: "POST",
      url: "/api/v1/playbook/plays",
      headers: { cookie: coachCookie },
      body: {
        title: "Horns Pick and Pop",
        description: "Standard horns entry into pick and pop for stretch four",
        courtMode: "half",
        category: "offense",
        tags: ["horns", "pick-and-pop", "3-pointer"],
        keyframes: sampleKeyframes,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeTruthy();
    expect(body.title).toBe("Horns Pick and Pop");
    expect(body.courtMode).toBe("half");
    expect(body.category).toBe("offense");
    expect(body.tags).toEqual(["horns", "pick-and-pop", "3-pointer"]);
    expect(body.version).toBe(1);
    expect(body.keyframes).toHaveLength(2);
    expect(body.keyframes[0].tokens).toHaveLength(7);
  });

  it("enforces negative authorization: non-creator/non-member receives 404 (ADR-0010)", async () => {
    const t = await testApp();
    const coachCookie = await makeUser(t, "coach2@example.com");
    const otherCookie = await makeUser(t, "other@example.com");

    // Coach creates play
    const createRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/playbook/plays",
      headers: { cookie: coachCookie },
      body: {
        title: "Secret Inbound Play",
        courtMode: "half",
        category: "inbound",
        tags: ["inbound"],
        keyframes: sampleKeyframes,
      },
    });
    const playId = createRes.json().id;

    // Coach can read it
    const coachGet = await t.app.inject({
      method: "GET",
      url: `/api/v1/playbook/plays/${playId}`,
      headers: { cookie: coachCookie },
    });
    expect(coachGet.statusCode).toBe(200);

    // Other user receives 404 Not Found (not 403, preventing enumeration)
    const otherGet = await t.app.inject({
      method: "GET",
      url: `/api/v1/playbook/plays/${playId}`,
      headers: { cookie: otherCookie },
    });
    expect(otherGet.statusCode).toBe(404);

    // Other user cannot update or delete
    const otherUpdate = await t.app.inject({
      method: "PUT",
      url: `/api/v1/playbook/plays/${playId}`,
      headers: { cookie: otherCookie },
      body: { title: "Hacked Play" },
    });
    expect(otherUpdate.statusCode).toBe(404);

    const otherDelete = await t.app.inject({
      method: "DELETE",
      url: `/api/v1/playbook/plays/${playId}`,
      headers: { cookie: otherCookie },
    });
    expect(otherDelete.statusCode).toBe(404);
  });

  it("updates play details and increments version", async () => {
    const t = await testApp();
    const cookie = await makeUser(t, "coach3@example.com");

    const createRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/playbook/plays",
      headers: { cookie },
      body: {
        title: "Spanish Pick and Roll",
        courtMode: "half",
        category: "offense",
        tags: ["pnr"],
        keyframes: sampleKeyframes,
      },
    });
    const playId = createRes.json().id;

    const updateRes = await t.app.inject({
      method: "PUT",
      url: `/api/v1/playbook/plays/${playId}`,
      headers: { cookie },
      body: {
        title: "Spanish Pick and Roll (Updated v2)",
        tags: ["pnr", "backscreen", "high-percentage"],
      },
    });

    expect(updateRes.statusCode).toBe(200);
    const updated = updateRes.json();
    expect(updated.title).toBe("Spanish Pick and Roll (Updated v2)");
    expect(updated.tags).toEqual(["pnr", "backscreen", "high-percentage"]);
    expect(updated.version).toBe(2);
  });

  it("lists plays with category and tag filtering", async () => {
    const t = await testApp();
    const cookie = await makeUser(t, "coach4@example.com");

    await t.app.inject({
      method: "POST",
      url: "/api/v1/playbook/plays",
      headers: { cookie },
      body: { title: "2-3 Zone Defense", category: "defense", tags: ["zone"], keyframes: sampleKeyframes },
    });
    await t.app.inject({
      method: "POST",
      url: "/api/v1/playbook/plays",
      headers: { cookie },
      body: { title: "Baseline SLOB", category: "inbound", tags: ["slob"], keyframes: sampleKeyframes },
    });

    // List all
    const all = await t.app.inject({
      method: "GET",
      url: "/api/v1/playbook/plays",
      headers: { cookie },
    });
    expect(all.statusCode).toBe(200);
    expect(all.json().items.length).toBeGreaterThanOrEqual(2);

    // Filter by category
    const defenseOnly = await t.app.inject({
      method: "GET",
      url: "/api/v1/playbook/plays?category=defense",
      headers: { cookie },
    });
    expect(defenseOnly.statusCode).toBe(200);
    expect(defenseOnly.json().items).toHaveLength(1);
    expect(defenseOnly.json().items[0].title).toBe("2-3 Zone Defense");

    // Filter by tag
    const slobOnly = await t.app.inject({
      method: "GET",
      url: "/api/v1/playbook/plays?tag=slob",
      headers: { cookie },
    });
    expect(slobOnly.statusCode).toBe(200);
    expect(slobOnly.json().items).toHaveLength(1);
    expect(slobOnly.json().items[0].title).toBe("Baseline SLOB");
  });

  it("exports play JSON structure and deletes play cleanly", async () => {
    const t = await testApp();
    const cookie = await makeUser(t, "coach5@example.com");

    const createRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/playbook/plays",
      headers: { cookie },
      body: { title: "Exportable Set", keyframes: sampleKeyframes },
    });
    const playId = createRes.json().id;

    // Export endpoint
    const exportRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/playbook/plays/${playId}/export`,
      headers: { cookie },
    });
    expect(exportRes.statusCode).toBe(200);
    const exp = exportRes.json();
    expect(exp.format).toBe("courtiq-playbook-v1");
    expect(exp.play.id).toBe(playId);

    // Delete
    const deleteRes = await t.app.inject({
      method: "DELETE",
      url: `/api/v1/playbook/plays/${playId}`,
      headers: { cookie },
    });
    expect(deleteRes.statusCode).toBe(204);

    // Subsequent get is 404
    const getDeleted = await t.app.inject({
      method: "GET",
      url: `/api/v1/playbook/plays/${playId}`,
      headers: { cookie },
    });
    expect(getDeleted.statusCode).toBe(404);
  });
});
