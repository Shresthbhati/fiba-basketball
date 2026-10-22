import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { matchResultLog } from "../src/db/schema.js";
import { testApp, user } from "./helpers.js";

type T = Awaited<ReturnType<typeof testApp>>;
type U = { id: string; cookie: string };
const anon: U = { id: "", cookie: "" };

const post = (t: T, u: U, url: string, payload?: unknown) => t.app.inject({ method: "POST", url, headers: { cookie: u.cookie }, ...(payload ? { payload: payload as object } : {}) });
const patch = (t: T, u: U, url: string, payload: unknown) => t.app.inject({ method: "PATCH", url, headers: { cookie: u.cookie }, payload: payload as object });
const get = (t: T, url: string, u?: U) => t.app.inject({ url, ...(u ? { headers: { cookie: u.cookie } } : {}) });

async function league(t: T, organizer: U, format: "ROUND_ROBIN" | "SINGLE_ELIMINATION", teamNames: string[]) {
  const comp = (await post(t, organizer, "/api/v1/competitions", { name: "Summer Cup", format })).json();
  const teamIds: string[] = [];
  for (const [i, name] of teamNames.entries()) {
    const team = (await post(t, organizer, "/api/v1/teams", { name })).json();
    teamIds.push(team.id);
    await post(t, organizer, `/api/v1/competitions/${comp.id}/teams`, { teamId: team.id, seed: i + 1 });
  }
  return { comp, teamIds };
}

async function setup() {
  const t = await testApp();
  const org = await user(t, "org@example.com");
  const other = await user(t, "other@example.com");
  const keeper = await user(t, "keeper@example.com");
  const { comp, teamIds } = await league(t, org, "ROUND_ROBIN", ["Alpha", "Bravo", "Charlie"]);
  return { t, org, other, keeper, comp, teamIds };
}

describe("match admin: detail, time, forfeit", () => {
  it("GET /matches/:id returns names, is public once published, 404 before", async () => {
    const { t, org, comp } = await setup();
    const first = (await get(t, `/api/v1/competitions/${comp.id}`, org)).json();
    expect(first.status).toBe("DRAFT");
    const [m] = (await post(t, org, `/api/v1/competitions/${comp.id}/schedule`)).json().items;
    expect(m).toHaveProperty("scheduledAt");
    const res = await get(t, `/api/v1/matches/${m.id}`);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      id: m.id, competitionId: comp.id, competitionName: "Summer Cup", state: "SCHEDULED", isBye: false, scheduledAt: null,
      home: { name: expect.any(String) }, away: { name: expect.any(String) }, homeScore: null, awayScore: null,
    });
    expect((await get(t, "/api/v1/matches/00000000-0000-4000-8000-000000000000")).statusCode).toBe(404);
  });

  it("sets and clears a time; outsiders 404, anonymous 401, scorekeepers refused", async () => {
    const { t, org, other, keeper, comp } = await setup();
    const [m] = (await post(t, org, `/api/v1/competitions/${comp.id}/schedule`)).json().items;
    await post(t, org, `/api/v1/competitions/${comp.id}/officials`, { email: "keeper@example.com", role: "SCOREKEEPER" });
    const url = `/api/v1/matches/${m.id}`;
    const iso = "2030-06-01T18:30:00.000Z";
    expect((await patch(t, org, url, { scheduledAt: iso })).json().scheduledAt).toBe(iso);
    expect((await get(t, url)).json().scheduledAt).toBe(iso);
    const listed = (await get(t, `/api/v1/competitions/${comp.id}/matches`)).json().items.find((x: { id: string }) => x.id === m.id);
    expect(listed.scheduledAt).toBe(iso);
    expect((await patch(t, org, url, { scheduledAt: "not a date" })).statusCode).toBe(400);
    expect((await patch(t, other, url, { scheduledAt: iso })).statusCode).toBe(404);
    expect((await patch(t, anon, url, { scheduledAt: iso })).statusCode).toBe(401);
    expect((await patch(t, keeper, url, { scheduledAt: iso })).statusCode).toBe(404);
    expect((await patch(t, org, url, { scheduledAt: null })).json().scheduledAt).toBeNull();
  });

  it("refuses rescheduling finished, locked and bye matches", async () => {
    const { t, org, comp } = await setup();
    const [m] = (await post(t, org, `/api/v1/competitions/${comp.id}/schedule`)).json().items;
    await post(t, org, `/api/v1/matches/${m.id}/result`, { homeScore: 2, awayScore: 1 });
    expect((await patch(t, org, `/api/v1/matches/${m.id}`, { scheduledAt: "2030-01-01T10:00:00Z" })).statusCode).toBe(409);
    await post(t, org, `/api/v1/matches/${m.id}/lock`);
    expect((await patch(t, org, `/api/v1/matches/${m.id}`, { scheduledAt: null })).statusCode).toBe(409);

    const t2 = await testApp();
    const o2 = await user(t2, "o2@example.com");
    const { comp: c2 } = await league(t2, o2, "SINGLE_ELIMINATION", ["S1", "S2", "S3"]);
    const bye = (await post(t2, o2, `/api/v1/competitions/${c2.id}/schedule`)).json().items.find((x: { isBye: boolean }) => x.isBye);
    expect((await patch(t2, o2, `/api/v1/matches/${bye.id}`, { scheduledAt: "2030-01-01T10:00:00Z" })).statusCode).toBe(409);
    expect((await post(t2, o2, `/api/v1/matches/${bye.id}/forfeit`, { winner: "home" })).statusCode).toBe(409);
  });

  it("forfeit records 20-0, audits, gives the loser 0 table points; authz negatives", async () => {
    const { t, org, other, keeper, comp } = await setup();
    const [m] = (await post(t, org, `/api/v1/competitions/${comp.id}/schedule`)).json().items;
    await post(t, org, `/api/v1/competitions/${comp.id}/officials`, { email: "keeper@example.com", role: "SCOREKEEPER" });
    const url = `/api/v1/matches/${m.id}/forfeit`;
    expect((await post(t, other, url, { winner: "home" })).statusCode).toBe(404);
    expect((await post(t, anon, url, { winner: "home" })).statusCode).toBe(401);
    expect((await post(t, keeper, url, { winner: "home" })).statusCode).toBe(404);
    expect((await post(t, org, url, { winner: "nobody" })).statusCode).toBe(400);

    const res = await post(t, org, url, { winner: "away" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ state: "FINISHED", homeScore: 0, awayScore: 20 });
    const log = await t.db.select().from(matchResultLog).where(eq(matchResultLog.matchId, m.id));
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ forfeit: true, userId: org.id });
    const table = (await get(t, `/api/v1/competitions/${comp.id}/standings`)).json().items;
    const loserName = (await get(t, `/api/v1/matches/${m.id}`)).json().home.name;
    expect(table.find((r: { name: string }) => r.name === loserName)).toMatchObject({ points: 0, losses: 1 });
    await post(t, org, `/api/v1/matches/${m.id}/lock`);
    expect((await post(t, org, url, { winner: "home" })).statusCode).toBe(409);
  });

  it("forfeit advances the knockout bracket", async () => {
    const t = await testApp();
    const org = await user(t, "o@example.com");
    const { comp, teamIds } = await league(t, org, "SINGLE_ELIMINATION", ["S1", "S2", "S3"]);
    const items = (await post(t, org, `/api/v1/competitions/${comp.id}/schedule`)).json().items;
    const real = items.find((x: { isBye: boolean; round: number }) => !x.isBye && x.round === 1);
    await post(t, org, `/api/v1/matches/${real.id}/forfeit`, { winner: "home" });
    const final = (await get(t, `/api/v1/competitions/${comp.id}/matches`)).json().items.find((x: { round: number }) => x.round === 2);
    expect([final.homeTeamId, final.awayTeamId].sort()).toEqual([teamIds[0], teamIds[1]].sort());
  });
});
