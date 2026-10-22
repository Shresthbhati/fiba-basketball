import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { matchResultLog } from "../src/db/schema.js";
import { testApp, user } from "./helpers.js";

type T = Awaited<ReturnType<typeof testApp>>;
type U = { id: string; cookie: string };

const post = (t: T, u: U, url: string, payload?: unknown) => t.app.inject({ method: "POST", url, headers: { cookie: u.cookie }, ...(payload ? { payload } : {}) });
const get = (t: T, url: string, u?: U) => t.app.inject({ url, ...(u ? { headers: { cookie: u.cookie } } : {}) });

async function league(t: T, organizer: U, format: "ROUND_ROBIN" | "SINGLE_ELIMINATION", teamNames: string[]) {
  const comp = (await post(t, organizer, "/api/v1/competitions", { name: "Summer Cup", format })).json();
  const teamIds: string[] = [];
  for (const [i, name] of teamNames.entries()) {
    const team = (await post(t, organizer, "/api/v1/teams", { name })).json();
    teamIds.push(team.id);
    expect((await post(t, organizer, `/api/v1/competitions/${comp.id}/teams`, { teamId: team.id, seed: i + 1 })).statusCode).toBe(201);
  }
  return { comp, teamIds };
}

describe("competitions", () => {
  it("round robin: schedule, results, standings, completion", async () => {
    const t = await testApp();
    const org = await user(t, "org@example.com");
    const { comp, teamIds } = await league(t, org, "ROUND_ROBIN", ["Alpha", "Bravo", "Charlie"]);

    const sched = await post(t, org, `/api/v1/competitions/${comp.id}/schedule`);
    expect(sched.statusCode).toBe(201);
    const ms = sched.json().items;
    expect(ms).toHaveLength(3);
    expect((await post(t, org, `/api/v1/competitions/${comp.id}/schedule`)).statusCode).toBe(409); // not twice

    // Higher team index wins nothing special; make Alpha win both, Bravo beat Charlie.
    const pairKey = (m: { homeTeamId: string; awayTeamId: string }) => [m.homeTeamId, m.awayTeamId].sort().join();
    const [A, B, C] = teamIds as [string, string, string];
    const winner: Record<string, string> = { [[A, B].sort().join()]: A, [[A, C].sort().join()]: A, [[B, C].sort().join()]: B };
    for (const m of ms) {
      const homeWins = winner[pairKey(m)] === m.homeTeamId;
      const res = await post(t, org, `/api/v1/matches/${m.id}/result`, { homeScore: homeWins ? 80 : 60, awayScore: homeWins ? 60 : 80 });
      expect(res.statusCode).toBe(200);
      expect(res.json().state).toBe("FINISHED");
    }
    const table = (await get(t, `/api/v1/competitions/${comp.id}/standings`)).json().items;
    expect(table.map((r: { name: string }) => r.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect(table[0]).toMatchObject({ rank: 1, wins: 2, points: 4 });
    expect((await get(t, `/api/v1/competitions/${comp.id}`)).json().status).toBe("COMPLETED");
  });

  it("corrects a result and keeps an audit trail; locked matches cannot change", async () => {
    const t = await testApp();
    const org = await user(t, "org@example.com");
    const { comp } = await league(t, org, "ROUND_ROBIN", ["A", "B"]);
    const [m] = (await post(t, org, `/api/v1/competitions/${comp.id}/schedule`)).json().items;
    expect((await post(t, org, `/api/v1/matches/${m.id}/result`, { homeScore: 50, awayScore: 50 })).statusCode).toBe(400);
    await post(t, org, `/api/v1/matches/${m.id}/result`, { homeScore: 70, awayScore: 60 });
    const fixed = await post(t, org, `/api/v1/matches/${m.id}/result`, { homeScore: 60, awayScore: 65 });
    expect(fixed.json()).toMatchObject({ homeScore: 60, awayScore: 65 });
    const log = await t.db.select().from(matchResultLog).where(eq(matchResultLog.matchId, m.id));
    expect(log.map((l) => `${l.homeScore}-${l.awayScore}`).sort()).toEqual(["60-65", "70-60"]); // both entries kept
    expect((await post(t, org, `/api/v1/matches/${m.id}/lock`)).json().state).toBe("LOCKED");
    expect((await post(t, org, `/api/v1/matches/${m.id}/result`, { homeScore: 1, awayScore: 2 })).statusCode).toBe(409);
  });

  it("single elimination with byes advances winners to the final", async () => {
    const t = await testApp();
    const org = await user(t, "org@example.com");
    const { comp, teamIds } = await league(t, org, "SINGLE_ELIMINATION", ["S1", "S2", "S3"]);
    const items = (await post(t, org, `/api/v1/competitions/${comp.id}/schedule`)).json().items;
    expect(items).toHaveLength(3); // 4-slot bracket: 2 semis + final
    const semis = items.filter((m: { round: number }) => m.round === 1);
    const bye = semis.find((m: { isBye: boolean }) => m.isBye);
    expect(bye.state).toBe("FINISHED");
    const real = semis.find((m: { isBye: boolean }) => !m.isBye);
    expect(real.homeTeamId).toBe(teamIds[1]); // S2 v S3, S1 has the bye

    await post(t, org, `/api/v1/matches/${real.id}/result`, { homeScore: 70, awayScore: 65 });
    const final = (await get(t, `/api/v1/competitions/${comp.id}/matches`)).json().items.find((m: { round: number }) => m.round === 2);
    expect([final.homeTeamId, final.awayTeamId].sort()).toEqual([teamIds[0], teamIds[1]].sort());

    // Cannot score the final before it is playable... it is, so score it, then block rewriting the semi underneath it.
    await post(t, org, `/api/v1/matches/${final.id}/result`, { homeScore: 90, awayScore: 80 });
    expect((await post(t, org, `/api/v1/matches/${real.id}/result`, { homeScore: 60, awayScore: 65 })).statusCode).toBe(409);
    expect((await get(t, `/api/v1/competitions/${comp.id}`)).json().status).toBe("COMPLETED");
    expect((await get(t, `/api/v1/competitions/${comp.id}/standings`)).statusCode).toBe(409);
  });

  it("hides drafts and blocks non-organizers from managing or scoring", async () => {
    const t = await testApp();
    const org = await user(t, "org@example.com");
    const other = await user(t, "other@example.com");
    const { comp, teamIds } = await league(t, org, "ROUND_ROBIN", ["A", "B"]);

    expect((await get(t, `/api/v1/competitions/${comp.id}`)).statusCode).toBe(404); // draft, anonymous
    expect((await get(t, `/api/v1/competitions/${comp.id}`, other)).statusCode).toBe(404);
    expect((await get(t, `/api/v1/competitions/${comp.id}`, org)).json().canManage).toBe(true);

    expect((await post(t, other, `/api/v1/competitions/${comp.id}/teams`, { teamId: teamIds[0] })).statusCode).toBe(404);
    expect((await post(t, other, `/api/v1/competitions/${comp.id}/schedule`)).statusCode).toBe(404);

    const [m] = (await post(t, org, `/api/v1/competitions/${comp.id}/schedule`)).json().items;
    expect((await post(t, other, `/api/v1/matches/${m.id}/result`, { homeScore: 2, awayScore: 1 })).statusCode).toBe(404);
    expect((await post(t, { id: "", cookie: "" }, `/api/v1/matches/${m.id}/result`, { homeScore: 2, awayScore: 1 })).statusCode).toBe(401);
    expect((await get(t, `/api/v1/competitions/${comp.id}/matches`)).statusCode).toBe(200); // published is public
  });

  it("requires 2+ teams, rejects duplicate registration, and blocks minors from organizing", async () => {
    const t = await testApp();
    const org = await user(t, "org@example.com");
    const comp = (await post(t, org, "/api/v1/competitions", { name: "x", format: "ROUND_ROBIN" })).json();
    expect((await post(t, org, `/api/v1/competitions/${comp.id}/schedule`)).statusCode).toBe(409);
    const team = (await post(t, org, "/api/v1/teams", { name: "Solo" })).json();
    await post(t, org, `/api/v1/competitions/${comp.id}/teams`, { teamId: team.id });
    expect((await post(t, org, `/api/v1/competitions/${comp.id}/teams`, { teamId: team.id })).statusCode).toBe(409);
    const teen = await user(t, "teen@example.com", { dateOfBirth: `${new Date().getUTCFullYear() - 15}-01-01` });
    expect((await post(t, teen, "/api/v1/competitions", { name: "y", format: "ROUND_ROBIN" })).statusCode).toBe(403);
    expect((await post(t, teen, "/api/v1/teams", { name: "z" })).statusCode).toBe(403);
  });
});
