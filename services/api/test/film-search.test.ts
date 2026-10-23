import { describe, expect, it } from "vitest";
import { adultBody, cookieOf, testApp } from "./helpers.js";

async function makeUser(t: Awaited<ReturnType<typeof testApp>>, email: string) {
  const res = await t.app.inject({ method: "POST", url: "/api/v1/auth/signup", body: adultBody({ email }) });
  return { id: res.json().id as string, cookie: cookieOf(res) };
}

describe("film library search & scouting montages (WP-3.3 & Spec §6.5)", () => {
  it("rejects unauthenticated requests", async () => {
    const t = await testApp();
    const res = await t.app.inject({
      method: "GET",
      url: "/api/v1/teams/00000000-0000-0000-0000-000000000000/film/search",
    });
    expect(res.statusCode).toBe(401);
  });

  it("searches clips across multiple games by tag, keyword, and duration filters", async () => {
    const t = await testApp();
    const coach = await makeUser(t, "coach-film-search@example.com");

    // 1. Create team
    const teamRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { cookie: coach.cookie },
      body: { name: "Apex Basketball" },
    });
    expect(teamRes.statusCode).toBe(201);
    const teamId = teamRes.json().id;

    // 2. Create two games
    const game1Res = await t.app.inject({
      method: "POST",
      url: `/api/v1/teams/${teamId}/games`,
      headers: { cookie: coach.cookie },
      body: { title: "Game 1 vs Lions", opponent: "Lions", playedOn: "2026-10-15" },
    });
    expect(game1Res.statusCode).toBe(201);
    const game1Id = game1Res.json().id;

    const game2Res = await t.app.inject({
      method: "POST",
      url: `/api/v1/teams/${teamId}/games`,
      headers: { cookie: coach.cookie },
      body: { title: "Game 2 vs Tigers", opponent: "Tigers", playedOn: "2026-10-20" },
    });
    expect(game2Res.statusCode).toBe(201);
    const game2Id = game2Res.json().id;

    // 3. Create clips in both games
    // Clip 1 in game 1: Spain PnR
    const c1 = await t.app.inject({
      method: "POST",
      url: `/api/v1/film/games/${game1Id}/clips`,
      headers: { cookie: coach.cookie },
      body: { startMs: 10000, endMs: 25000, tags: ["spain-pnr", "clutch"], note: "Spain back-screen executed cleanly" },
    });
    expect(c1.statusCode).toBe(201);

    // Clip 2 in game 1: Fastbreak
    const c2 = await t.app.inject({
      method: "POST",
      url: `/api/v1/film/games/${game1Id}/clips`,
      headers: { cookie: coach.cookie },
      body: { startMs: 60000, endMs: 70000, tags: ["fastbreak", "transition"], note: "Outlet pass ahead to corner" },
    });
    expect(c2.statusCode).toBe(201);

    // Clip 3 in game 2: Horns pop
    const c3 = await t.app.inject({
      method: "POST",
      url: `/api/v1/film/games/${game2Id}/clips`,
      headers: { cookie: coach.cookie },
      body: { startMs: 30000, endMs: 50000, tags: ["horns", "3-pointer"], note: "Horns pop against 2-3 zone" },
    });
    expect(c3.statusCode).toBe(201);

    // 4. Cross-game search with no filters: should return all 3 clips
    const allRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/teams/${teamId}/film/search`,
      headers: { cookie: coach.cookie },
    });
    expect(allRes.statusCode).toBe(200);
    expect(allRes.json().items).toHaveLength(3);

    // 5. Filter by tag: 'spain-pnr'
    const tagRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/teams/${teamId}/film/search?tag=spain-pnr`,
      headers: { cookie: coach.cookie },
    });
    expect(tagRes.statusCode).toBe(200);
    expect(tagRes.json().items).toHaveLength(1);
    expect(tagRes.json().items[0].note).toContain("Spain back-screen");

    // 6. Filter by text keyword 'q=zone' (matches clip note "against 2-3 zone")
    const qRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/teams/${teamId}/film/search?q=zone`,
      headers: { cookie: coach.cookie },
    });
    expect(qRes.statusCode).toBe(200);
    expect(qRes.json().items).toHaveLength(1);
    expect(qRes.json().items[0].gameTitle).toBe("Game 2 vs Tigers");

    // 7. Filter by duration (minDurationMs=18000 -> only c3 with 20000ms duration)
    const durRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/teams/${teamId}/film/search?minDurationMs=18000`,
      headers: { cookie: coach.cookie },
    });
    expect(durRes.statusCode).toBe(200);
    expect(durRes.json().items).toHaveLength(1);
    expect(durRes.json().items[0].durationMs).toBe(20000);
  });

  it("manages saved searches (create, list, delete)", async () => {
    const t = await testApp();
    const coach = await makeUser(t, "coach-saved-searches@example.com");

    const teamRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { cookie: coach.cookie },
      body: { name: "Thunderhawks" },
    });
    const teamId = teamRes.json().id;

    // Create saved search
    const createRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/teams/${teamId}/film/saved-searches`,
      headers: { cookie: coach.cookie },
      body: {
        name: "Q4 Clutch Possessions",
        filters: { tag: "clutch", q: "fourth quarter", minDurationMs: 5000 },
      },
    });
    expect(createRes.statusCode).toBe(201);
    const searchId = createRes.json().id;
    expect(createRes.json().name).toBe("Q4 Clutch Possessions");

    // List saved searches
    const listRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/teams/${teamId}/film/saved-searches`,
      headers: { cookie: coach.cookie },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().items).toHaveLength(1);
    expect(listRes.json().items[0].id).toBe(searchId);

    // Delete saved search
    const deleteRes = await t.app.inject({
      method: "DELETE",
      url: `/api/v1/teams/${teamId}/film/saved-searches/${searchId}`,
      headers: { cookie: coach.cookie },
    });
    expect(deleteRes.statusCode).toBe(204);

    // List again: now empty
    const listAgainRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/teams/${teamId}/film/saved-searches`,
      headers: { cookie: coach.cookie },
    });
    expect(listAgainRes.json().items).toHaveLength(0);
  });

  it("creates, retrieves, updates and sequences scouting montages with total duration", async () => {
    const t = await testApp();
    const coach = await makeUser(t, "montage-lead@example.com");

    const teamRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { cookie: coach.cookie },
      body: { name: "Storm" },
    });
    const teamId = teamRes.json().id;

    // Create game & clip
    const gameRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/teams/${teamId}/games`,
      headers: { cookie: coach.cookie },
      body: { title: "Championship Semifinal" },
    });
    const gameId = gameRes.json().id;

    const clipRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/film/games/${gameId}/clips`,
      headers: { cookie: coach.cookie },
      body: { startMs: 5000, endMs: 25000, tags: ["pnr", "baseline"], note: "Baseline drift 3" },
    });
    const clipId = clipRes.json().id;

    // Create montage
    const montageRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/teams/${teamId}/film/montages`,
      headers: { cookie: coach.cookie },
      body: {
        title: "Opponent PnR Defensive Breakdowns Reel",
        description: "Scouting compilation highlighting drop big vulnerability and weakside tag delays.",
        tags: ["scouting", "pnr-breakdown", "playoffs"],
        items: [
          {
            clipId,
            gameId,
            order: 1,
            startMs: 5000,
            endMs: 25000,
            title: "Drop Coverage Pocket Pass",
            note: "Center drops 3m below free throw line",
          },
        ],
      },
    });
    expect(montageRes.statusCode).toBe(201);
    const montage = montageRes.json();
    expect(montage.title).toBe("Opponent PnR Defensive Breakdowns Reel");
    expect(montage.totalDurationMs).toBe(20000); // 25000 - 5000 = 20000ms

    // Retrieve via GET /film/montages/:id
    const getRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/film/montages/${montage.id}`,
      headers: { cookie: coach.cookie },
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().id).toBe(montage.id);

    // Update montage title and description
    const updateRes = await t.app.inject({
      method: "PUT",
      url: `/api/v1/film/montages/${montage.id}`,
      headers: { cookie: coach.cookie },
      body: {
        title: "Opponent PnR Defensive Breakdowns Reel (Final Cut)",
        description: "Updated notes after coach staff film session.",
      },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().title).toBe("Opponent PnR Defensive Breakdowns Reel (Final Cut)");

    // Delete montage
    const delRes = await t.app.inject({
      method: "DELETE",
      url: `/api/v1/film/montages/${montage.id}`,
      headers: { cookie: coach.cookie },
    });
    expect(delRes.statusCode).toBe(204);

    // Confirm 404
    const getDelRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/film/montages/${montage.id}`,
      headers: { cookie: coach.cookie },
    });
    expect(getDelRes.statusCode).toBe(404);
  });

  it("enforces negative authorization (404) for unauthorized users", async () => {
    const t = await testApp();
    const coach = await makeUser(t, "coach-sec@example.com");
    const intruder = await makeUser(t, "intruder-sec@example.com");

    const teamRes = await t.app.inject({
      method: "POST",
      url: "/api/v1/teams",
      headers: { cookie: coach.cookie },
      body: { name: "Raptors" },
    });
    const teamId = teamRes.json().id;

    // Intruder cannot search team film (returns 404 per ADR-0010)
    const intruderSearchRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/teams/${teamId}/film/search`,
      headers: { cookie: intruder.cookie },
    });
    expect(intruderSearchRes.statusCode).toBe(404);

    // Intruder cannot list team saved searches
    const intruderSavedRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/teams/${teamId}/film/saved-searches`,
      headers: { cookie: intruder.cookie },
    });
    expect(intruderSavedRes.statusCode).toBe(404);

    // Coach creates montage
    const gameRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/teams/${teamId}/games`,
      headers: { cookie: coach.cookie },
      body: { title: "Secret Match" },
    });
    const gameId = gameRes.json().id;

    const clipRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/film/games/${gameId}/clips`,
      headers: { cookie: coach.cookie },
      body: { startMs: 1000, endMs: 5000, tags: ["secret"] },
    });
    const clipId = clipRes.json().id;

    const montageRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/teams/${teamId}/film/montages`,
      headers: { cookie: coach.cookie },
      body: {
        title: "Private Scouting Reel",
        items: [{ clipId, gameId, order: 1, startMs: 1000, endMs: 5000 }],
      },
    });
    const montageId = montageRes.json().id;

    // Intruder cannot view private montage (returns 404 per ADR-0010)
    const intruderGetMontage = await t.app.inject({
      method: "GET",
      url: `/api/v1/film/montages/${montageId}`,
      headers: { cookie: intruder.cookie },
    });
    expect(intruderGetMontage.statusCode).toBe(404);
  });
});
