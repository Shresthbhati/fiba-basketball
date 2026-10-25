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

const get = (t: T, u: U | null, url: string) =>
  t.app.inject({
    method: "GET",
    url,
    ...(u ? { headers: { cookie: u.cookie } } : {}),
  });

const patch = (t: T, u: U | null, url: string, body?: unknown) =>
  t.app.inject({
    method: "PATCH",
    url,
    payload: body ?? {},
    ...(u ? { headers: { cookie: u.cookie } } : {}),
  });

const del = (t: T, u: U | null, url: string) =>
  t.app.inject({
    method: "DELETE",
    url,
    ...(u ? { headers: { cookie: u.cookie } } : {}),
  });

describe("Comprehensive IDOR & Negative Authorization Suite (Spec §13, ADR-0010, Plan §5)", { timeout: 45000 }, () => {
  it("enforces strict RFC 9457 404 Not Found across all private resource endpoints when attacked by an unauthorized user", async () => {
    const t = await testApp({ rateLimitScale: 20 });

    const owner = await user(t, "resource-owner@courtiq.test", { displayName: "Legitimate Owner" });
    const stranger = await user(t, "malicious-stranger@courtiq.test", { displayName: "Foreign Attacker" });

    // 1. Setup Team & Private Resources
    const teamRes = await post(t, owner, "/api/v1/teams", { name: "Protected Spartans" });
    expect(teamRes.statusCode).toBe(201);
    const team = teamRes.json();

    // 2. Setup Film Game
    const gameRes = await post(t, owner, `/api/v1/teams/${team.id}/games`, {
      title: "Classified Playoff Game",
    });
    expect(gameRes.statusCode).toBe(201);
    const game = gameRes.json();

    // 3. Setup Tactical Play
    const playRes = await post(t, owner, "/api/v1/playbook/plays", {
      teamId: team.id,
      title: "Secret Inbound Baseline Play",
      keyframes: [
        {
          step: 1,
          description: "Alignment",
          tokens: [{ id: "1", type: "offense", label: "PG", x: 0, y: 7 }],
          actions: [],
        },
      ],
    });
    expect(playRes.statusCode).toBe(201);
    const play = playRes.json();

    // 4. Setup Tactical Simulation
    const simRes = await post(t, owner, "/api/v1/tactical/simulations", {
      teamId: team.id,
      playId: play.id,
      title: "Simulated Counter vs Blitz",
      coverageType: "BLITZ_TRAP",
    });
    expect(simRes.statusCode).toBe(201);
    const simulation = simRes.json();

    // 5. Setup Candidate Event
    const candRes = await post(t, owner, "/api/v1/tactical/candidates", {
      gameId: game.id,
      teamId: team.id,
      eventType: "PICK_AND_ROLL",
      timestampSeconds: 50.0,
      courtCoordinates: { x: 0, y: 7 },
      confidenceScore: 0.9,
    });
    expect(candRes.statusCode).toBe(201);
    const candidate = candRes.json();

    // 6. Setup Workout Session
    const workoutRes = await post(t, owner, "/api/v1/training/sessions", {
      notes: "Private elite training session",
    });
    expect(workoutRes.statusCode).toBe(201);
    const workout = workoutRes.json();

    // 7. Setup Practice Session
    const practiceRes = await post(t, owner, `/api/v1/teams/${team.id}/practices`, {
      title: "Private Team Practice",
      scheduledAt: "2026-11-01T18:00:00.000Z",
      blocks: [
        {
          id: "block-1",
          order: 1,
          title: "Warmup & Stretching",
          category: "WARMUP",
          durationMins: 15,
        },
      ],
    });
    expect(practiceRes.statusCode).toBe(201);
    const practice = practiceRes.json();

    // 8. Setup Scout Evaluation
    const evalRes = await post(t, owner, "/api/v1/scout/evaluations", {
      athleteId: owner.id,
      shootingPresent: 60,
      shootingFuture: 70,
      strengthsSummary: "Elite catch-and-shoot perimeter release with high release corridor.",
      weaknessesSummary: "Needs improvement fighting through off-ball screens.",
      isSharedWithOrg: false,
    });
    expect(evalRes.statusCode).toBe(201);
    const evaluation = evalRes.json();

    // 9. Setup Verified Court & Facility Claim
    const courtRes = await post(t, owner, "/api/v1/courts", {
      name: "Downtown Secure Hardwood Facility",
      lat: 40.7128,
      lng: -74.006,
      surface: "WOOD",
      hoops: 2,
      lit: true,
      indoor: true,
    });
    expect(courtRes.statusCode).toBe(201);
    const court = courtRes.json();

    // =========================================================================
    // SYSTEMATIC IDOR ATTACK MATRIX — All must return 404 Not Found (ADR-0010)
    // =========================================================================

    const testCases: Array<{ name: string; request: Promise<{ statusCode: number; json: () => { status: number; type: string } }> }> = [
      // A. Teams & Internal Assets
      {
        name: "Stranger attempts to view private team games",
        request: get(t, stranger, `/api/v1/teams/${team.id}/games`),
      },
      {
        name: "Stranger attempts to delete legitimate team member",
        request: del(t, stranger, `/api/v1/teams/${team.id}/members/${owner.id}`),
      },

      // B. Film Games, Clips & Annotations
      {
        name: "Stranger attempts to view private game film record",
        request: get(t, stranger, `/api/v1/film/games/${game.id}`),
      },
      {
        name: "Stranger attempts to view game film clips",
        request: get(t, stranger, `/api/v1/film/games/${game.id}/clips`),
      },
      {
        name: "Stranger attempts to view game film annotations",
        request: get(t, stranger, `/api/v1/film/games/${game.id}/annotations`),
      },

      // C. Tactical Playbook & Simulations
      {
        name: "Stranger attempts to get private tactical play",
        request: get(t, stranger, `/api/v1/playbook/plays/${play.id}`),
      },
      {
        name: "Stranger attempts to query similar plays for foreign play",
        request: get(t, stranger, `/api/v1/tactical/plays/${play.id}/similar`),
      },
      {
        name: "Stranger attempts to view team tactical candidate review queue",
        request: get(t, stranger, `/api/v1/tactical/teams/${team.id}/candidates`),
      },
      {
        name: "Stranger attempts to view private scenario simulation",
        request: get(t, stranger, `/api/v1/tactical/simulations/${simulation.id}`),
      },
      {
        name: "Stranger attempts to list team scenario simulations",
        request: get(t, stranger, `/api/v1/tactical/teams/${team.id}/simulations`),
      },
      {
        name: "Stranger attempts to review foreign candidate event",
        request: patch(t, stranger, `/api/v1/tactical/candidates/${candidate.id}/review`, {
          status: "REJECTED",
        }),
      },

      // D. Workout & Training
      {
        name: "Stranger attempts to get private workout session",
        request: get(t, stranger, `/api/v1/training/sessions/${workout.id}`),
      },

      // E. Practices & Coach OS
      {
        name: "Stranger attempts to get private team practice session",
        request: get(t, stranger, `/api/v1/practices/${practice.id}`),
      },

      // F. Scout Evaluations
      {
        name: "Stranger attempts to get foreign scout evaluation card",
        request: get(t, stranger, `/api/v1/scout/evaluations/${evaluation.id}`),
      },

      // G. Facility Analytics
      {
        name: "Stranger attempts to access court facility manager analytics",
        request: get(t, stranger, `/api/v1/courts/${court.id}/facility-analytics`),
      },

      // H. Non-existent IDs
      {
        name: "Stranger queries completely random UUID on private route",
        request: get(t, stranger, "/api/v1/tactical/simulations/00000000-0000-0000-0000-000000000000"),
      },
    ];

    for (const testCase of testCases) {
      const res = await testCase.request;
      expect(
        res.statusCode,
        `Expected 404 for IDOR probe: ${testCase.name}, received ${res.statusCode}`
      ).toBe(404);

      // Verify RFC 9457 problem+json response envelope
      const body = res.json();
      expect(body.status).toBe(404);
      expect(body.type).toBe("about:blank");
    }
  });
});
