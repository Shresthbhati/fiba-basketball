import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { testApp, user } from "./helpers.js";

type T = Awaited<ReturnType<typeof testApp>>;
type U = { id: string; cookie: string };
const call = (t: T, u: U | null, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
  t.app.inject({ method, url, headers: u ? { cookie: u.cookie } : {}, ...(payload ? { payload } : {}) });

/** A competition in which teams A and B (already created) play one match; both coaches roster their one player. */
async function competition(t: T, w: { org: U; coachA: U; coachB: U; a1: U; b1: U; teamA: string; teamB: string }, name: string) {
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

describe("career (a player's own record)", () => {
  it("counts only official results, ignores corrected events, and adds up across competitions", async () => {
    const t = await testApp();
    const org = await user(t, "org@example.com");
    const coachA = await user(t, "ca@example.com");
    const coachB = await user(t, "cb@example.com");
    const a1 = await user(t, "a1@example.com", { displayName: "Ann One" });
    const b1 = await user(t, "b1@example.com", { displayName: "Bea One" });
    const teamA = (await call(t, coachA, "POST", "/api/v1/teams", { name: "Alpha" })).json().id as string;
    const teamB = (await call(t, coachB, "POST", "/api/v1/teams", { name: "Bravo" })).json().id as string;
    await call(t, coachA, "POST", `/api/v1/teams/${teamA}/members`, { email: "a1@example.com", role: "PLAYER" });
    await call(t, coachB, "POST", `/api/v1/teams/${teamB}/members`, { email: "b1@example.com", role: "PLAYER" });
    const w = { org, coachA, coachB, a1, b1, teamA, teamB };

    expect((await call(t, null, "GET", "/api/v1/me/career")).statusCode).toBe(401);
    expect((await call(t, a1, "GET", "/api/v1/me/career")).json()).toMatchObject({ games: 0, perGame: null, competitions: [] });

    const one = await competition(t, w, "Cup One");
    const wrong = randomUUID();
    await call(t, org, "POST", `/api/v1/matches/${one.matchId}/events`, { events: [
      ev({ type: "FIELD_GOAL", side: one.A, playerId: a1.id }), ev({ type: "THREE_POINT", side: one.A, playerId: a1.id }),
      { ...ev({ type: "FREE_THROW", side: one.A, playerId: a1.id }), id: wrong }, ev({ type: "CORRECTION", correctsEventId: wrong }),
      ev({ type: "REBOUND", side: one.A, playerId: a1.id }), ev({ type: "FIELD_GOAL", side: one.B, playerId: b1.id }),
      // A lineup for Ann's side only: she starts a 10:00 period and the period ends with 2:00 left => 8 minutes.
      ev({ type: "PERIOD_START", clockSeconds: 600 }), ev({ type: "SUBSTITUTION", side: one.A, playerId: a1.id, clockSeconds: 600 }), ev({ type: "PERIOD_END", clockSeconds: 120 }),
    ] });
    // A match still in progress is not part of the record.
    expect((await call(t, a1, "GET", "/api/v1/me/career")).json().games).toBe(0);

    expect((await call(t, org, "POST", `/api/v1/matches/${one.matchId}/finalize`)).statusCode).toBe(200);
    const after1 = (await call(t, a1, "GET", "/api/v1/me/career")).json();
    expect(after1.games).toBe(1);
    expect(after1.totals).toMatchObject({ points: 5, fgm: 1, tpm: 1, ftm: 0, fta: 0, rebounds: 1 });
    expect(after1.perGame).toEqual({ points: 5, rebounds: 1, assists: 0, turnovers: 0, fouls: 0 });
    expect(after1.competitions).toHaveLength(1);
    expect(after1.competitions[0]).toMatchObject({ name: "Cup One", games: 1 });
    expect(after1.competitions[0].recent[0]).toMatchObject({ opponent: "Bravo", line: { points: 5 }, seconds: 480 });
    expect(after1.minutes).toEqual({ games: 1, total: 8, perGame: 8 });

    // A second competition: points add up and the averages are per game.
    const two = await competition(t, w, "Cup Two");
    await call(t, org, "POST", `/api/v1/matches/${two.matchId}/events`, { events: [ev({ type: "FIELD_GOAL", side: two.A, playerId: a1.id }), ev({ type: "ASSIST", side: two.A, playerId: a1.id })] });
    await call(t, org, "POST", `/api/v1/matches/${two.matchId}/finalize`);
    const both = (await call(t, a1, "GET", "/api/v1/me/career")).json();
    expect(both.games).toBe(2);
    expect(both.totals).toMatchObject({ points: 7, assists: 1, rebounds: 1 });
    expect(both.perGame).toEqual({ points: 3.5, rebounds: 0.5, assists: 0.5, turnovers: 0, fouls: 0 });
    expect(both.competitions.map((c: { name: string }) => c.name).sort()).toEqual(["Cup One", "Cup Two"]);
    // Cup Two had no lineup, so it is left out of the minutes average rather than counted as 0.
    expect(both.minutes).toEqual({ games: 1, total: 8, perGame: 8 });
    expect(both.competitions.find((c: { name: string }) => c.name === "Cup Two").recent[0].seconds).toBeNull();
    expect((await call(t, b1, "GET", "/api/v1/me/career")).json().minutes).toBeNull();

    // It is private: the other player only ever sees their own record, and someone never credited sees nothing.
    expect((await call(t, b1, "GET", "/api/v1/me/career")).json()).toMatchObject({ games: 1, totals: { points: 2 } });
    expect((await call(t, coachA, "GET", "/api/v1/me/career")).json()).toMatchObject({ games: 0 });
  });

  it("a game whose credited events were all corrected does not count", async () => {
    const t = await testApp();
    const org = await user(t, "org@example.com");
    const coachA = await user(t, "ca@example.com");
    const coachB = await user(t, "cb@example.com");
    const a1 = await user(t, "a1@example.com");
    const b1 = await user(t, "b1@example.com");
    const teamA = (await call(t, coachA, "POST", "/api/v1/teams", { name: "Alpha" })).json().id as string;
    const teamB = (await call(t, coachB, "POST", "/api/v1/teams", { name: "Bravo" })).json().id as string;
    await call(t, coachA, "POST", `/api/v1/teams/${teamA}/members`, { email: "a1@example.com", role: "PLAYER" });
    await call(t, coachB, "POST", `/api/v1/teams/${teamB}/members`, { email: "b1@example.com", role: "PLAYER" });
    const c = await competition(t, { org, coachA, coachB, a1, b1, teamA, teamB }, "Cup");
    const only = randomUUID();
    await call(t, org, "POST", `/api/v1/matches/${c.matchId}/events`, { events: [{ ...ev({ type: "FIELD_GOAL", side: c.A, playerId: a1.id }), id: only }, ev({ type: "CORRECTION", correctsEventId: only })] });
    await call(t, org, "POST", `/api/v1/matches/${c.matchId}/finalize`);
    expect((await call(t, a1, "GET", "/api/v1/me/career")).json()).toMatchObject({ games: 0, perGame: null });
  });
});
