import { describe, expect, it } from "vitest";
import { testApp, user } from "./helpers.js";

type T = Awaited<ReturnType<typeof testApp>>;
type U = { id: string; cookie: string };

const post = (t: T, u: U, url: string, payload?: object) =>
  t.app.inject({ method: "POST", url, headers: { cookie: u.cookie }, ...(payload ? { payload } : {}) });
const get = (t: T, u: U | null, url: string) =>
  t.app.inject({ method: "GET", url, ...(u ? { headers: { cookie: u.cookie } } : {}) });

async function setup() {
  const t = await testApp();
  const org = await user(t, "org@example.com");
  const stranger = await user(t, "stranger@example.com");
  const scorer = await user(t, "scorer@example.com", { displayName: "Sam Scorer" });

  const comp = (await post(t, org, "/api/v1/competitions", { name: "Tourney", format: "ROUND_ROBIN" })).json();

  const teams: { id: string; name: string }[] = [];
  for (const name of ["Reds", "Blues", "Golds"]) {
    const tm = (await post(t, org, "/api/v1/teams", { name })).json();
    await post(t, org, `/api/v1/competitions/${comp.id}/teams`, { teamId: tm.id });
    teams.push(tm);
  }

  const sched = await post(t, org, `/api/v1/competitions/${comp.id}/schedule`);
  expect(sched.statusCode).toBe(201);

  return { t, org, stranger, scorer, comp, teams };
}

describe("competition command center & delay simulation", () => {
  it("provides operational summary and alert flags, accessible only to organizers", async () => {
    const { t, org, stranger, comp } = await setup();

    // Strangers get 404 (hidden), anonymous gets 401
    expect((await get(t, stranger, `/api/v1/competitions/${comp.id}/command-center`)).statusCode).toBe(404);
    expect((await get(t, null, `/api/v1/competitions/${comp.id}/command-center`)).statusCode).toBe(401);

    const cc = (await get(t, org, `/api/v1/competitions/${comp.id}/command-center`)).json();
    expect(cc.competition.id).toBe(comp.id);
    expect(cc.summary.totalMatches).toBe(3); // 3 round robin matches
    expect(cc.summary.officialsCount).toBe(0);
    expect(cc.matches.every((m: { alerts: { missingOfficials: boolean } }) => m.alerts.missingOfficials)).toBe(true);

    // Schedule match 1 in the past -> flags delayed
    const m1Id = cc.matches[0].id;
    const past = new Date(Date.now() - 3600_000).toISOString();
    await t.app.inject({
      method: "PATCH",
      url: `/api/v1/matches/${m1Id}`,
      headers: { cookie: org.cookie },
      payload: { scheduledAt: past },
    });

    const ccAfter = (await get(t, org, `/api/v1/competitions/${comp.id}/command-center`)).json();
    expect(ccAfter.summary.delayed).toBe(1);
    const m1 = ccAfter.matches.find((m: { id: string }) => m.id === m1Id);
    expect(m1.alerts.delayed).toBe(true);
  });

  it("lists assigned officials and clears missingOfficials alerts", async () => {
    const { t, org, scorer, comp } = await setup();

    // Assign scorer
    const res = await post(t, org, `/api/v1/competitions/${comp.id}/officials`, {
      email: "scorer@example.com",
      role: "SCOREKEEPER",
    });
    expect(res.statusCode).toBe(201);

    // List officials
    const offList = (await get(t, org, `/api/v1/competitions/${comp.id}/officials`)).json();
    expect(offList.items.length).toBe(1);
    expect(offList.items[0]).toMatchObject({
      userId: scorer.id,
      email: "scorer@example.com",
      role: "SCOREKEEPER",
      displayName: "Sam Scorer",
    });

    const cc = (await get(t, org, `/api/v1/competitions/${comp.id}/command-center`)).json();
    expect(cc.summary.officialsCount).toBe(1);
    expect(cc.matches.every((m: { alerts: { missingOfficials: boolean } }) => !m.alerts.missingOfficials)).toBe(true);
  });

  it("previews delay impact on downstream matches without modifying records", async () => {
    const { t, org, comp } = await setup();
    const matches = (await get(t, org, `/api/v1/competitions/${comp.id}/matches`)).json().items;

    const baseTime = Date.parse("2027-06-15T10:00:00.000Z");
    const m1Time = new Date(baseTime).toISOString();
    const m2Time = new Date(baseTime + 3600_000).toISOString(); // 1 hour later
    const m3Time = new Date(baseTime + 7200_000).toISOString(); // 2 hours later

    await t.app.inject({ method: "PATCH", url: `/api/v1/matches/${matches[0].id}`, headers: { cookie: org.cookie }, payload: { scheduledAt: m1Time } });
    await t.app.inject({ method: "PATCH", url: `/api/v1/matches/${matches[1].id}`, headers: { cookie: org.cookie }, payload: { scheduledAt: m2Time } });
    await t.app.inject({ method: "PATCH", url: `/api/v1/matches/${matches[2].id}`, headers: { cookie: org.cookie }, payload: { scheduledAt: m3Time } });

    // Preview 30 minute delay on match 1
    const previewRes = await post(t, org, `/api/v1/competitions/${comp.id}/delay-impact`, {
      matchId: matches[0].id,
      delayMinutes: 30,
    });
    expect(previewRes.statusCode).toBe(200);
    const preview = previewRes.json();
    expect(preview.delayMinutes).toBe(30);
    expect(preview.affectedCount).toBe(3); // target + 2 subsequent matches

    // Check simulated times (+30 min each)
    expect(preview.simulations[0].proposedScheduledAt).toBe(new Date(baseTime + 30 * 60_000).toISOString());
    expect(preview.simulations[1].proposedScheduledAt).toBe(new Date(baseTime + 90 * 60_000).toISOString());
    expect(preview.simulations[2].proposedScheduledAt).toBe(new Date(baseTime + 150 * 60_000).toISOString());

    // Verify DB was NOT mutated yet
    const unchanged = (await get(t, org, `/api/v1/matches/${matches[0].id}`)).json();
    expect(unchanged.scheduledAt).toBe(m1Time);
  });

  it("applies delay atomically across target and downstream matches", async () => {
    const { t, org, stranger, comp } = await setup();
    const matches = (await get(t, org, `/api/v1/competitions/${comp.id}/matches`)).json().items;

    const baseTime = Date.parse("2027-06-15T14:00:00.000Z");
    const m1Time = new Date(baseTime).toISOString();
    const m2Time = new Date(baseTime + 3600_000).toISOString();

    await t.app.inject({ method: "PATCH", url: `/api/v1/matches/${matches[0].id}`, headers: { cookie: org.cookie }, payload: { scheduledAt: m1Time } });
    await t.app.inject({ method: "PATCH", url: `/api/v1/matches/${matches[1].id}`, headers: { cookie: org.cookie }, payload: { scheduledAt: m2Time } });

    // Unauthorized stranger cannot apply delay
    const fail = await post(t, stranger, `/api/v1/competitions/${comp.id}/apply-delay`, {
      matchId: matches[0].id,
      delayMinutes: 20,
    });
    expect(fail.statusCode).toBe(404);

    // Organizer applies 20 minute delay
    const applyRes = await post(t, org, `/api/v1/competitions/${comp.id}/apply-delay`, {
      matchId: matches[0].id,
      delayMinutes: 20,
    });
    expect(applyRes.statusCode).toBe(200);

    // Verify both matches in DB have the new scheduledAt (+20 min)
    const m1Updated = (await get(t, org, `/api/v1/matches/${matches[0].id}`)).json();
    const m2Updated = (await get(t, org, `/api/v1/matches/${matches[1].id}`)).json();
    expect(m1Updated.scheduledAt).toBe(new Date(baseTime + 20 * 60_000).toISOString());
    expect(m2Updated.scheduledAt).toBe(new Date(baseTime + 80 * 60_000).toISOString());
  });
});
