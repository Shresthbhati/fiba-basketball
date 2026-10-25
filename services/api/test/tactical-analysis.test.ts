import { describe, expect, it } from "vitest";
import { testApp, user } from "./helpers.js";

type T = Awaited<ReturnType<typeof testApp>>;
type U = Awaited<ReturnType<typeof user>>;

const post = (t: T, u: U | null, url: string, body?: unknown) =>
  t.app.inject({
    method: "POST",
    url,
    payload: body ?? {},
    ...(u ? { headers: { cookie: u.cookie } } : {}),
  });

const patch = (t: T, u: U | null, url: string, body?: unknown) =>
  t.app.inject({
    method: "PATCH",
    url,
    payload: body ?? {},
    ...(u ? { headers: { cookie: u.cookie } } : {}),
  });

const get = (t: T, u: U | null, url: string) =>
  t.app.inject({
    method: "GET",
    url,
    ...(u ? { headers: { cookie: u.cookie } } : {}),
  });

describe("Advanced Tactical Analysis, Tracking & Evaluated ML (Phase 7, WP-7.1–WP-7.4, ADR-0016)", { timeout: 30000 }, () => {
  it("manages candidate review queue, play similarity, scenario simulator, and model registry with negative authZ", async () => {
    const t = await testApp({ rateLimitScale: 10 });

    const coach = await user(t, "coach-tactical@courtiq.test", { displayName: "Coach Popovich" });
    const stranger = await user(t, "stranger-tactical@courtiq.test", { displayName: "Stranger Scout" });

    // 1. Setup team and film game
    const teamRes = await post(t, coach, "/api/v1/teams", { name: "San Antonio Ballers" });
    expect(teamRes.statusCode).toBe(201);
    const team = teamRes.json();

    const gameRes = await post(t, coach, `/api/v1/teams/${team.id}/games`, {
      title: "Championship Finals vs Miami",
    });
    expect(gameRes.statusCode).toBe(201);
    const game = gameRes.json();

    // -------------------------------------------------------------------------
    // WP-7.1: Candidate Events & Human Review Queue
    // -------------------------------------------------------------------------
    const candidateRes = await post(t, coach, "/api/v1/tactical/candidates", {
      gameId: game.id,
      teamId: team.id,
      eventType: "PICK_AND_ROLL",
      timestampSeconds: 142.5,
      courtCoordinates: { x: 0.5, y: 7.2, endX: 1.2, endY: 3.5 },
      involvedPlayerIds: [coach.id],
      confidenceScore: 0.89,
      modelVersion: "v1.2.0",
    });
    expect(candidateRes.statusCode).toBe(201);
    const candidate = candidateRes.json();
    expect(candidate.status).toBe("CANDIDATE");
    expect(candidate.eventType).toBe("PICK_AND_ROLL");
    expect(candidate.confidenceScore).toBe(0.89);

    // List candidate queue for coach's team
    const listRes = await get(t, coach, `/api/v1/tactical/teams/${team.id}/candidates`);
    expect(listRes.statusCode).toBe(200);
    const listData = listRes.json();
    expect(listData.count).toBe(1);
    expect(listData.candidates[0].id).toBe(candidate.id);

    // Filter candidate queue by minConfidence
    const filteredRes = await get(t, coach, `/api/v1/tactical/teams/${team.id}/candidates?minConfidence=0.95`);
    expect(filteredRes.statusCode).toBe(200);
    expect(filteredRes.json().count).toBe(0);

    // Negative AuthZ (ADR-0010): Stranger cannot view team's internal candidate queue
    const unauthorizedListRes = await get(t, stranger, `/api/v1/tactical/teams/${team.id}/candidates`);
    expect(unauthorizedListRes.statusCode).toBe(404);

    // Review candidate event: Confirm
    const reviewRes = await patch(t, coach, `/api/v1/tactical/candidates/${candidate.id}/review`, {
      status: "CONFIRMED",
      reviewNotes: "Clean high pick-and-roll with short roll kickout.",
    });
    expect(reviewRes.statusCode).toBe(200);
    const reviewed = reviewRes.json();
    expect(reviewed.status).toBe("CONFIRMED");
    expect(reviewed.reviewNotes).toContain("Clean high pick-and-roll");
    expect(reviewed.reviewedById).toBe(coach.id);

    // -------------------------------------------------------------------------
    // WP-7.2: Play Diagram Vector Embeddings & Concept Similarity
    // -------------------------------------------------------------------------
    // Create Play 1 (Horns PnR)
    const play1Res = await post(t, coach, "/api/v1/playbook/plays", {
      teamId: team.id,
      title: "Horns Pick and Roll",
      category: "offense",
      keyframes: [
        {
          step: 1,
          description: "Initial Horns alignment",
          tokens: [
            { id: "1", type: "offense", label: "PG", x: 0, y: 8 },
            { id: "4", type: "offense", label: "PF", x: -4, y: 6 },
            { id: "5", type: "offense", label: "C", x: 4, y: 6 },
          ],
          actions: [
            { id: "a1", type: "screen", from: { x: 4, y: 6 }, to: { x: 1, y: 7.5 } },
            { id: "a2", type: "dribble", from: { x: 0, y: 8 }, to: { x: 2, y: 6 } },
          ],
        },
        {
          step: 2,
          description: "Roll to rim",
          tokens: [
            { id: "1", type: "offense", label: "PG", x: 2, y: 6 },
            { id: "5", type: "offense", label: "C", x: 1, y: 7.5 },
          ],
          actions: [
            { id: "a3", type: "cut", from: { x: 1, y: 7.5 }, to: { x: 0, y: 2 } },
            { id: "a4", type: "pass", from: { x: 2, y: 6 }, to: { x: 0, y: 2 } },
          ],
        },
      ],
    });
    expect(play1Res.statusCode).toBe(201);
    const play1 = play1Res.json();

    // Create Play 2 (Horns Pop - similar structure with screen and pass)
    const play2Res = await post(t, coach, "/api/v1/playbook/plays", {
      teamId: team.id,
      title: "Horns Pick and Pop",
      category: "offense",
      keyframes: [
        {
          step: 1,
          description: "Initial Horns alignment",
          tokens: [
            { id: "1", type: "offense", label: "PG", x: 0, y: 8 },
            { id: "4", type: "offense", label: "PF", x: -4, y: 6 },
          ],
          actions: [
            { id: "b1", type: "screen", from: { x: -4, y: 6 }, to: { x: -1, y: 7.5 } },
            { id: "b2", type: "dribble", from: { x: 0, y: 8 }, to: { x: -2, y: 6 } },
          ],
        },
        {
          step: 2,
          description: "Pop to 3pt arc",
          tokens: [
            { id: "1", type: "offense", label: "PG", x: -2, y: 6 },
            { id: "4", type: "offense", label: "PF", x: -1, y: 7.5 },
          ],
          actions: [
            { id: "b3", type: "cut", from: { x: -1, y: 7.5 }, to: { x: -5, y: 7.5 } },
            { id: "b4", type: "pass", from: { x: -2, y: 6 }, to: { x: -5, y: 7.5 } },
          ],
        },
      ],
    });
    expect(play2Res.statusCode).toBe(201);
    const play2 = play2Res.json();

    // Generate Play Embedding for Play 1
    const embedRes = await post(t, coach, `/api/v1/tactical/plays/${play1.id}/embeddings`);
    expect(embedRes.statusCode).toBe(201);
    const embedding = embedRes.json();
    expect(embedding.embeddingVector.length).toBe(8);
    expect(embedding.spatialFeatures.screenCount).toBe(1);
    expect(embedding.spatialFeatures.passCount).toBe(1);

    // Pre-generate embedding for Play 2
    await post(t, coach, `/api/v1/tactical/plays/${play2.id}/embeddings`);

    // Query Similar Plays for Play 1
    const similarRes = await get(t, coach, `/api/v1/tactical/plays/${play1.id}/similar`);
    expect(similarRes.statusCode).toBe(200);
    const similarData = similarRes.json();
    expect(similarData.total).toBeGreaterThanOrEqual(1);
    expect(similarData.matches[0].play.id).toBe(play2.id);
    expect(similarData.matches[0].similarityPercent).toBeGreaterThan(60);

    // Negative AuthZ (ADR-0010): Stranger cannot query play similarity
    const unauthorizedSimilarRes = await get(t, stranger, `/api/v1/tactical/plays/${play1.id}/similar`);
    expect(unauthorizedSimilarRes.statusCode).toBe(404);

    // -------------------------------------------------------------------------
    // WP-7.3: Level 3 Rule-Based Scenario Simulator
    // -------------------------------------------------------------------------
    const simRes = await post(t, coach, "/api/v1/tactical/simulations", {
      teamId: team.id,
      playId: play1.id,
      title: "Horns PnR vs Drop Coverage",
      coverageType: "DROP",
      offensiveSetup: { action: "SPREAD_HORNS_PNR", ballHandler: "PG", screener: "C" },
    });
    expect(simRes.statusCode).toBe(201);
    const simulation = simRes.json();
    expect(simulation.simulationLevel).toBe(3);
    expect(simulation.coverageType).toBe("DROP");
    expect(simulation.coverageMetrics.spaceAdvantageScore).toBe(74);
    expect(simulation.coverageMetrics.contestedShotRisk).toBe(26);
    expect(simulation.disclaimer).toContain("Level 3 Rule-Based Scenario Simulation");

    // Fetch simulation details
    const getSimRes = await get(t, coach, `/api/v1/tactical/simulations/${simulation.id}`);
    expect(getSimRes.statusCode).toBe(200);
    expect(getSimRes.json().id).toBe(simulation.id);

    // List team simulations
    const listSimsRes = await get(t, coach, `/api/v1/tactical/teams/${team.id}/simulations`);
    expect(listSimsRes.statusCode).toBe(200);
    expect(listSimsRes.json().count).toBe(1);

    // Negative AuthZ: Stranger gets 404 for team simulation
    const unauthSimRes = await get(t, stranger, `/api/v1/tactical/simulations/${simulation.id}`);
    expect(unauthSimRes.statusCode).toBe(404);

    // -------------------------------------------------------------------------
    // WP-7.4: Model Registry & Evaluation Dashboard
    // -------------------------------------------------------------------------
    // Register candidate model v1.2.0
    const regModelRes = await post(t, coach, "/api/v1/tactical/models", {
      modelVersion: "v1.2.0",
      modelType: "TACTICAL_CANDIDATE",
      benchmarkDataset: "NCAA-2026-TOURNAMENT-VALIDATION-SET",
      metrics: {
        accuracy: 0.924,
        f1Score: 0.912,
        precision: 0.935,
        recall: 0.891,
        sampleSize: 1500,
      },
      status: "CANDIDATE",
    });
    expect(regModelRes.statusCode).toBe(201);
    const model = regModelRes.json();
    expect(model.modelVersion).toBe("v1.2.0");
    expect(model.status).toBe("CANDIDATE");

    // Register active base model v1.1.0
    await post(t, coach, "/api/v1/tactical/models", {
      modelVersion: "v1.1.0",
      modelType: "TACTICAL_CANDIDATE",
      benchmarkDataset: "NCAA-2025-BASE-SET",
      metrics: {
        accuracy: 0.871,
        f1Score: 0.865,
        precision: 0.880,
        recall: 0.850,
        sampleSize: 1200,
      },
      status: "ACTIVE",
    });

    // List models
    const listModelsRes = await get(t, coach, "/api/v1/tactical/models?modelType=TACTICAL_CANDIDATE");
    expect(listModelsRes.statusCode).toBe(200);
    expect(listModelsRes.json().count).toBe(2);

    // Promote candidate model v1.2.0 to ACTIVE
    const promoteRes = await post(t, coach, "/api/v1/tactical/models/v1.2.0/promote");
    expect(promoteRes.statusCode).toBe(200);
    expect(promoteRes.json().status).toBe("ACTIVE");

    // Rollback model v1.2.0 due to validation drift
    const rollbackRes = await post(t, coach, "/api/v1/tactical/models/v1.2.0/rollback", {
      reason: "False positive spike on baseline cut classifications",
    });
    expect(rollbackRes.statusCode).toBe(200);
    const rolledBack = rollbackRes.json();
    expect(rolledBack.status).toBe("ROLLED_BACK");
    expect(rolledBack.rollbackReason).toContain("False positive spike");
  });
});
