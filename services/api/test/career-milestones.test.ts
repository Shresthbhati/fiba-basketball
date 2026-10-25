import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { testApp, user } from "./helpers.js";

type T = Awaited<ReturnType<typeof testApp>>;
type U = { id: string; cookie: string };
const call = (t: T, u: U | null, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
  t.app.inject({ method, url, headers: u ? { cookie: u.cookie } : {}, ...(payload ? { payload } : {}) });

async function setupCompetition(t: T, w: { org: U; coachA: U; coachB: U; a1: U; b1: U; teamA: string; teamB: string }, name: string) {
  const comp = (await call(t, w.org, "POST", "/api/v1/competitions", { name, format: "ROUND_ROBIN" })).json().id as string;
  for (const team of [w.teamA, w.teamB]) await call(t, w.org, "POST", `/api/v1/competitions/${comp}/teams`, { teamId: team });
  await call(t, w.coachA, "PUT", `/api/v1/competitions/${comp}/teams/${w.teamA}/roster/${w.a1.id}`, { jersey: 7 });
  await call(t, w.coachB, "PUT", `/api/v1/competitions/${comp}/teams/${w.teamB}/roster/${w.b1.id}`, { jersey: 11 });
  const m = (await call(t, w.org, "POST", `/api/v1/competitions/${comp}/schedule`)).json().items[0] as { id: string; homeTeamId: string };
  const side = (team: string) => (m.homeTeamId === team ? "home" : "away");
  return { comp, matchId: m.id, A: side(w.teamA), B: side(w.teamB) };
}

let seq = 1;
const ev = (e: object) => ({ id: randomUUID(), localSeq: seq++, period: 1, ...e });

describe("Career Milestones & Automated Verified Achievement Badges (Spec §11.1, §11.3)", () => {
  it("rejects unauthenticated requests to achievements endpoint with 401", async () => {
    const t = await testApp();
    const res = await call(t, null, "GET", "/api/v1/me/achievements");
    expect(res.statusCode).toBe(401);
  });

  it("calculates progression percentages accurately for in-progress milestones", async () => {
    const t = await testApp();
    const athlete = await user(t, "rookie@hoops.test", { displayName: "Rookie Star" });

    const res = await call(t, athlete, "GET", "/api/v1/me/achievements");
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.achievements).toEqual([]);
    expect(body.milestones.length).toBeGreaterThan(5);

    // Initial state: all milestones 0% and locked
    const centuryClub = body.milestones.find((m: { key: string }) => m.key === "CENTURY_CLUB_100_PTS");
    expect(centuryClub).toBeDefined();
    expect(centuryClub.targetValue).toBe(100);
    expect(centuryClub.currentValue).toBe(0);
    expect(centuryClub.progressPct).toBe(0);
    expect(centuryClub.isUnlocked).toBe(false);
    expect(centuryClub.unlockedAt).toBeNull();
  });

  it("automatically awards milestone badges when official match criteria are reached (Spec §11.3)", async () => {
    const t = await testApp();
    const org = await user(t, "org-tourney@example.com");
    const coachA = await user(t, "coach-a@example.com");
    const coachB = await user(t, "coach-b@example.com");
    const a1 = await user(t, "veteran@example.com", { displayName: "Dwyane Wade" });
    const b1 = await user(t, "defender@example.com", { displayName: "Bruce Bowen" });

    const teamA = (await call(t, coachA, "POST", "/api/v1/teams", { name: "Heat" })).json().id as string;
    const teamB = (await call(t, coachB, "POST", "/api/v1/teams", { name: "Spurs" })).json().id as string;
    await call(t, coachA, "POST", `/api/v1/teams/${teamA}/members`, { email: "veteran@example.com", role: "PLAYER" });
    await call(t, coachB, "POST", `/api/v1/teams/${teamB}/members`, { email: "defender@example.com", role: "PLAYER" });

    const w = { org, coachA, coachB, a1, b1, teamA, teamB };
    const fixture = await setupCompetition(t, w, "Championship Series");

    // Log 12 points, 10 rebounds, 3 assists (Double-Double game!)
    const events = [
      // 3 field goals (6 pts)
      ev({ type: "FIELD_GOAL", side: fixture.A, playerId: a1.id }),
      ev({ type: "FIELD_GOAL", side: fixture.A, playerId: a1.id }),
      ev({ type: "FIELD_GOAL", side: fixture.A, playerId: a1.id }),
      // 2 three pointers (6 pts -> total 12 pts)
      ev({ type: "THREE_POINT", side: fixture.A, playerId: a1.id }),
      ev({ type: "THREE_POINT", side: fixture.A, playerId: a1.id }),
      // 10 rebounds
      ...Array.from({ length: 10 }).map(() => ev({ type: "REBOUND", side: fixture.A, playerId: a1.id })),
      // 3 assists
      ...Array.from({ length: 3 }).map(() => ev({ type: "ASSIST", side: fixture.A, playerId: a1.id })),
    ];

    await call(t, org, "POST", `/api/v1/matches/${fixture.matchId}/events`, { events });
    await call(t, org, "POST", `/api/v1/matches/${fixture.matchId}/finalize`);

    // Now query athlete achievements
    const achRes = await call(t, a1, "GET", "/api/v1/me/achievements");
    expect(achRes.statusCode).toBe(200);
    const body = achRes.json();

    const centuryClub = body.milestones.find((m: { key: string }) => m.key === "CENTURY_CLUB_100_PTS");
    expect(centuryClub.currentValue).toBe(12);
    expect(centuryClub.progressPct).toBe(12); // 12 / 100 = 12%

    const glassCleaner = body.milestones.find((m: { key: string }) => m.key === "GLASS_CLEANER_50_REB");
    expect(glassCleaner.currentValue).toBe(10);
    expect(glassCleaner.progressPct).toBe(20); // 10 / 50 = 20%

    const perimeterThreat = body.milestones.find((m: { key: string }) => m.key === "PERIMETER_THREAT_25_3PM");
    expect(perimeterThreat.currentValue).toBe(2);
    expect(perimeterThreat.progressPct).toBe(8); // 2 / 25 = 8%

    // Double-Double club check: 1 recorded out of 3
    const dblClub = body.milestones.find((m: { key: string }) => m.key === "DOUBLE_DOUBLE_CLUB");
    expect(dblClub.currentValue).toBe(1);
    expect(dblClub.progressPct).toBe(33); // 1 / 3 = 33%

    // Verify refreshing awards is idempotent
    const refreshRes = await call(t, a1, "POST", "/api/v1/me/achievements/refresh");
    expect(refreshRes.statusCode).toBe(200);
  });
});
