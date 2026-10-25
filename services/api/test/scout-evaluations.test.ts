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

const patch = (t: T, u: U | null, url: string, payload?: unknown) =>
  t.app.inject({
    method: "PATCH",
    url,
    ...(u ? { headers: { cookie: u.cookie } } : {}),
    ...(payload ? { payload: payload as object } : {}),
  });

const del = (t: T, u: U | null, url: string) =>
  t.app.inject({
    method: "DELETE",
    url,
    ...(u ? { headers: { cookie: u.cookie } } : {}),
  });

describe("Scout Talent Evaluation & 20-80 Scale Consensus Engine (Spec §13.1–§13.4, §14.2)", { timeout: 30000 }, () => {
  it("enforces negative authZ on private evaluation cards (ADR-0010)", async () => {
    const t = await testApp();
    const scoutA = await user(t, "scout-a@team.test");
    const scoutB = await user(t, "scout-b@rival.test");
    const prospect = await user(t, "prospect-1@hoops.test");

    // Scout A creates profile in Team A
    await post(t, scoutA, "/api/v1/scout/profile", {
      organization: "EuroLeague Scouting Dept A",
      roleTitle: "Director of International Scouting",
    });

    // Scout B creates profile in Team B
    await post(t, scoutB, "/api/v1/scout/profile", {
      organization: "NBA Team B",
      roleTitle: "Regional Scout",
    });

    // Scout A logs a private evaluation card for prospect
    const createRes = await post(t, scoutA, "/api/v1/scout/evaluations", {
      athleteId: prospect.id,
      gameContext: "LIVE_GAME",
      projectedRole: "PRIMARY_INITIATOR",
      playerComparison: "Luka Doncic",
      shootingPresent: 60,
      shootingFuture: 70,
      finishingPresent: 65,
      finishingFuture: 70,
      playmakingPresent: 75,
      playmakingFuture: 80,
      strengthsSummary: "Exceptional court vision, deceptive pace, and high-level pick-and-roll manipulation.",
      weaknessesSummary: "Lateral foot speed on perimeter containment against explosive guards.",
      isSharedWithOrg: false,
    });

    expect(createRes.statusCode).toBe(201);
    const evalId = createRes.json().id;

    // Scout A can view their evaluation
    const scoutARes = await get(t, scoutA, `/api/v1/scout/evaluations/${evalId}`);
    expect(scoutARes.statusCode).toBe(200);
    expect(scoutARes.json().playerComparison).toBe("Luka Doncic");

    // Scout B from rival organization gets 404 (ADR-0010: private resources return 404)
    const rivalRes = await get(t, scoutB, `/api/v1/scout/evaluations/${evalId}`);
    expect(rivalRes.statusCode).toBe(404);

    // Scout B attempting to patch or delete also receives 404
    const rivalPatch = await patch(t, scoutB, `/api/v1/scout/evaluations/${evalId}`, {
      strengthsSummary: "Overrated player",
    });
    expect(rivalPatch.statusCode).toBe(404);

    const rivalDel = await del(t, scoutB, `/api/v1/scout/evaluations/${evalId}`);
    expect(rivalDel.statusCode).toBe(404);
  });

  it("creates 20-80 evaluation card with grade clamping and auto-calculated overall projections", async () => {
    const t = await testApp();
    const scout = await user(t, "eval-scout@pro.test");
    const prospect = await user(t, "eval-prospect@pro.test");

    await post(t, scout, "/api/v1/scout/profile", {
      organization: "Pro Personnel Group",
      roleTitle: "Lead Talent Analyst",
    });

    const res = await post(t, scout, "/api/v1/scout/evaluations", {
      athleteId: prospect.id,
      gameContext: "COMBINE_WORKOUT",
      projectedRole: "3_AND_D_WING",
      playerComparison: "OG Anunoby",
      shootingPresent: 55,
      shootingFuture: 65,
      finishingPresent: 50,
      finishingFuture: 60,
      playmakingPresent: 45,
      playmakingFuture: 50,
      perimeterDefensePresent: 65,
      perimeterDefenseFuture: 75,
      interiorDefensePresent: 55,
      interiorDefenseFuture: 60,
      reboundingPresent: 50,
      reboundingFuture: 55,
      athleticismPresent: 70,
      athleticismFuture: 70,
      basketballIqPresent: 60,
      basketballIqFuture: 70,
      strengthsSummary: "Elite point-of-attack defensive switchability and repeatable catch-and-shoot release mechanics.",
      weaknessesSummary: "Self-creation off live dribble in halfcourt settings.",
      swingSkills: "Above-the-break pull-up 3-pointer consistency.",
      intangiblesNotes: "Vocal on backline rotations; communicates through ball screens.",
    });

    expect(res.statusCode).toBe(201);
    const card = res.json();
    expect(card.athleteId).toBe(prospect.id);
    expect(card.scoutId).toBe(scout.id);
    expect(card.projectedRole).toBe("3_AND_D_WING");
    expect(card.shootingPresent).toBe(55);
    expect(card.shootingFuture).toBe(65);
    expect(card.overallPresent).toBe(56); // mean of (55+50+45+65+55+50+70+60)/8 = 56.25 -> 56
    expect(card.overallFuture).toBe(63);  // mean of (65+60+50+75+60+55+70+70)/8 = 63.125 -> 63
    expect(card.organization).toBe("Pro Personnel Group");

    // Test update
    const patchRes = await patch(t, scout, `/api/v1/scout/evaluations/${card.id}`, {
      shootingFuture: 70,
      swingSkills: "Pull-up shooting off baseline curls.",
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().shootingFuture).toBe(70);
    expect(patchRes.json().swingSkills).toBe("Pull-up shooting off baseline curls.");
  });

  it("calculates multi-scout consensus evaluation and standard deviations across shared cards (Spec §13.4)", async () => {
    const t = await testApp();
    const scout1 = await user(t, "org-scout-1@warriors.test");
    const scout2 = await user(t, "org-scout-2@warriors.test");
    const prospect = await user(t, "consensus-prospect@college.test");

    // Both scouts belong to Golden State
    await post(t, scout1, "/api/v1/scout/profile", {
      organization: "Golden State Basketball Operations",
      roleTitle: "National Scout",
    });

    await post(t, scout2, "/api/v1/scout/profile", {
      organization: "Golden State Basketball Operations",
      roleTitle: "Assistant General Manager",
    });

    // Scout 1 submits evaluation with isSharedWithOrg: true
    await post(t, scout1, "/api/v1/scout/evaluations", {
      athleteId: prospect.id,
      gameContext: "LIVE_GAME",
      projectedRole: "3_AND_D_WING",
      shootingPresent: 60,
      shootingFuture: 70,
      perimeterDefensePresent: 65,
      perimeterDefenseFuture: 75,
      overallPresent: 60,
      overallFuture: 70,
      strengthsSummary: "Quick catch-and-shoot release and lockdown perimeter closeouts.",
      weaknessesSummary: "Playmaking volume under heavy ball pressure.",
      isSharedWithOrg: true,
    });

    // Scout 2 submits evaluation with isSharedWithOrg: true
    await post(t, scout2, "/api/v1/scout/evaluations", {
      athleteId: prospect.id,
      gameContext: "FILM_REVIEW",
      projectedRole: "3_AND_D_WING",
      shootingPresent: 50,
      shootingFuture: 60,
      perimeterDefensePresent: 55,
      perimeterDefenseFuture: 65,
      overallPresent: 54,
      overallFuture: 64,
      strengthsSummary: "Solid motor and positional size.",
      weaknessesSummary: "Inconsistent shooting form away from corners.",
      isSharedWithOrg: true,
    });

    // Scout 2 requests consensus evaluation for prospect
    const consensusRes = await get(t, scout2, `/api/v1/scout/athletes/${prospect.id}/consensus`);
    expect(consensusRes.statusCode).toBe(200);
    const consensus = consensusRes.json();

    expect(consensus.athleteId).toBe(prospect.id);
    expect(consensus.totalEvaluations).toBe(2);
    expect(consensus.uniqueScouts).toBe(2);
    expect(consensus.consensusRole).toBe("3_AND_D_WING");
    expect(consensus.consensusOverallPresent).toBe(57); // (60 + 54) / 2 = 57
    expect(consensus.consensusOverallFuture).toBe(67);  // (70 + 64) / 2 = 67

    // Competency consensus checks:
    // Shooting: Scout 1 = 60/70, Scout 2 = 50/60 -> mean 55/65, stdDev = 5
    expect(consensus.competencies.shooting.present).toBe(55);
    expect(consensus.competencies.shooting.future).toBe(65);
    expect(consensus.competencies.shooting.stdDev).toBe(5);

    // Perimeter Defense: Scout 1 = 65/75, Scout 2 = 55/65 -> mean 60/70, stdDev = 5
    expect(consensus.competencies.perimeterDefense.present).toBe(60);
    expect(consensus.competencies.perimeterDefense.future).toBe(70);
    expect(consensus.competencies.perimeterDefense.stdDev).toBe(5);
  });
});
