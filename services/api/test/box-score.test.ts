import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { boxScore, type StatEvent } from "../src/match/box-score.js";
import { testApp, user } from "./helpers.js";

const ev = (type: StatEvent["type"], side: "home" | "away" | null, playerId: string | null, extra: Partial<StatEvent> = {}): StatEvent =>
  ({ id: randomUUID(), type, side, playerId, correctsEventId: null, ...extra });

describe("boxScore (pure)", () => {
  it("adds up each player's line and keeps what had no player separate; sides add up", () => {
    const made = ev("FIELD_GOAL", "home", "p1");
    const s = boxScore([
      made, ev("THREE_POINT", "home", "p1"), ev("FIELD_GOAL_MISSED", "home", "p1"), ev("FREE_THROW", "home", "p1"), ev("FREE_THROW_MISSED", "home", "p1"),
      ev("REBOUND", "home", "p1"), ev("ASSIST", "home", "p2"), ev("TURNOVER", "away", "p3"), ev("PLAYER_FOUL", "away", "p3"),
      ev("FIELD_GOAL", "home", null), ev("TIMEOUT", "away", null), ev("PERIOD_START", null, null),
    ]);
    expect(s.players.get("p1")!.line).toMatchObject({ points: 6, fgm: 1, fga: 2, tpm: 1, tpa: 1, ftm: 1, fta: 2, rebounds: 1 });
    expect(s.players.get("p2")!.line.assists).toBe(1);
    expect(s.players.get("p3")).toMatchObject({ side: "away", line: { turnovers: 1, fouls: 1 } });
    expect(s.unattributed.home.points).toBe(2);
    expect(s.totals.home.points).toBe(8);
    expect(s.totals.home.points).toBe([...s.players.values()].filter((p) => p.side === "home").reduce((n, p) => n + p.line.points, 0) + s.unattributed.home.points);
  });
  it("ignores events that were corrected, and the corrections themselves", () => {
    const wrong = ev("THREE_POINT", "home", "p1");
    const s = boxScore([wrong, ev("CORRECTION", null, null, { correctsEventId: wrong.id }), ev("FIELD_GOAL", "home", "p1")]);
    expect(s.players.get("p1")!.line).toMatchObject({ points: 2, tpm: 0, tpa: 0 });
    expect(s.totals.home.points).toBe(2);
  });
  it("is empty with no events", () => {
    const s = boxScore([]);
    expect(s.players.size).toBe(0);
    expect(s.totals.home.points).toBe(0);
  });
});

type T = Awaited<ReturnType<typeof testApp>>;
type U = { id: string; cookie: string };
const call = (t: T, u: U | null, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
  t.app.inject({ method, url, headers: u ? { cookie: u.cookie } : {}, ...(payload ? { payload } : {}) });

/** A published two-team competition: teams A and B each with two rostered players, plus an organizer (who can score). */
async function match(t: T) {
  const org = await user(t, "org@example.com");
  const coachA = await user(t, "ca@example.com");
  const coachB = await user(t, "cb@example.com");
  const a1 = await user(t, "a1@example.com", { displayName: "Ann One" });
  const b1 = await user(t, "b1@example.com", { displayName: "Bea One" });
  const fan = await user(t, "fan@example.com");
  const comp = (await call(t, org, "POST", "/api/v1/competitions", { name: "Cup", format: "ROUND_ROBIN" })).json().id as string;
  const teamA = (await call(t, coachA, "POST", "/api/v1/teams", { name: "Alpha" })).json().id as string;
  const teamB = (await call(t, coachB, "POST", "/api/v1/teams", { name: "Bravo" })).json().id as string;
  for (const team of [teamA, teamB]) await call(t, org, "POST", `/api/v1/competitions/${comp}/teams`, { teamId: team });
  await call(t, coachA, "POST", `/api/v1/teams/${teamA}/members`, { email: "a1@example.com", role: "PLAYER" });
  await call(t, coachB, "POST", `/api/v1/teams/${teamB}/members`, { email: "b1@example.com", role: "PLAYER" });
  await call(t, coachA, "PUT", `/api/v1/competitions/${comp}/teams/${teamA}/roster/${a1.id}`, { jersey: 7 });
  await call(t, coachB, "PUT", `/api/v1/competitions/${comp}/teams/${teamB}/roster/${b1.id}`, { jersey: 11 });
  const [m] = (await call(t, org, "POST", `/api/v1/competitions/${comp}/schedule`)).json().items as { id: string; homeTeamId: string; awayTeamId: string }[];
  // Home/away depends on the schedule; map "ours" accordingly.
  const homeIsA = m!.homeTeamId === teamA;
  return { comp, teamA, org, coachA, coachB, a1, b1, fan, matchId: m!.id, homeIsA, sideOf: (team: "A" | "B") => ((team === "A") === homeIsA ? "home" : "away") as "home" | "away" };
}
let seq = 1;
const send = (t: T, u: U, matchId: string, events: object[]) =>
  call(t, u, "POST", `/api/v1/matches/${matchId}/events`, { events: events.map((e) => ({ id: randomUUID(), localSeq: seq++, period: 1, ...e })) });

describe("player attribution", () => {
  it("accepts events credited to rostered players of the right team, and refuses the rest", async () => {
    const t = await testApp();
    const w = await match(t);
    const A = w.sideOf("A"), B = w.sideOf("B");
    expect((await send(t, w.org, w.matchId, [{ type: "FIELD_GOAL", side: A, playerId: w.a1.id }, { type: "REBOUND", side: B, playerId: w.b1.id }])).statusCode).toBe(200);
    // Player of the other team, a player not on any roster, an event type that has no player, and a player without a side.
    const wrongTeam = await send(t, w.org, w.matchId, [{ type: "FIELD_GOAL", side: B, playerId: w.a1.id }]);
    expect(wrongTeam.statusCode).toBe(422);
    expect(wrongTeam.json().title).toContain("not on the roster");
    expect((await send(t, w.org, w.matchId, [{ type: "FIELD_GOAL", side: A, playerId: w.fan.id }])).statusCode).toBe(422);
    expect((await send(t, w.org, w.matchId, [{ type: "TIMEOUT", side: A, playerId: w.a1.id }])).statusCode).toBe(422);
    expect((await send(t, w.org, w.matchId, [{ type: "GAME_START", playerId: w.a1.id }])).statusCode).toBe(422);
    // Nothing from the refused batches was stored: the score is still 2-0 for A.
    const state = (await call(t, null, "GET", `/api/v1/matches/${w.matchId}/state`)).json();
    expect(A === "home" ? [state.homeScore, state.awayScore] : [state.awayScore, state.homeScore]).toEqual([2, 0]);
  });

  it("events without a player still work, and resending an attributed event is harmless", async () => {
    const t = await testApp();
    const w = await match(t);
    const id = randomUUID();
    const body = { events: [{ id, localSeq: 1, type: "THREE_POINT", side: w.sideOf("A"), period: 1, playerId: w.a1.id }, { id: randomUUID(), localSeq: 2, type: "FIELD_GOAL", side: w.sideOf("B"), period: 1 }] };
    const first = await call(t, w.org, "POST", `/api/v1/matches/${w.matchId}/events`, body);
    const again = await call(t, w.org, "POST", `/api/v1/matches/${w.matchId}/events`, body);
    expect(first.json()).toMatchObject({ accepted: 2, duplicates: 0 });
    expect(again.json()).toMatchObject({ accepted: 0, duplicates: 2 });
  });

  it("only scorers can read the rosters for a match", async () => {
    const t = await testApp();
    const w = await match(t);
    const r = (await call(t, w.org, "GET", `/api/v1/matches/${w.matchId}/rosters`)).json();
    const A = w.sideOf("A");
    expect(r[A]).toEqual([{ userId: w.a1.id, name: "Ann One", jersey: 7 }]);
    expect((await call(t, w.fan, "GET", `/api/v1/matches/${w.matchId}/rosters`)).statusCode).toBe(404);
    expect((await call(t, w.coachA, "GET", `/api/v1/matches/${w.matchId}/rosters`)).statusCode).toBe(404);
    expect((await call(t, null, "GET", `/api/v1/matches/${w.matchId}/rosters`)).statusCode).toBe(401);
  });

  it("box score: jersey numbers for the public, names for the team and organizer, totals that add up, corrections applied", async () => {
    const t = await testApp();
    const w = await match(t);
    const A = w.sideOf("A"), B = w.sideOf("B");
    const wrong = randomUUID();
    await call(t, w.org, "POST", `/api/v1/matches/${w.matchId}/events`, { events: [
      { id: randomUUID(), localSeq: 1, type: "FIELD_GOAL", side: A, period: 1, playerId: w.a1.id },
      { id: randomUUID(), localSeq: 2, type: "THREE_POINT", side: A, period: 1, playerId: w.a1.id },
      { id: wrong, localSeq: 3, type: "FREE_THROW", side: A, period: 1, playerId: w.a1.id },
      { id: randomUUID(), localSeq: 4, type: "CORRECTION", period: 1, correctsEventId: wrong },
      { id: randomUUID(), localSeq: 5, type: "FIELD_GOAL", side: A, period: 1 }, // no player named
      { id: randomUUID(), localSeq: 6, type: "REBOUND", side: B, period: 1, playerId: w.b1.id },
    ] });
    const pub = (await call(t, null, "GET", `/api/v1/matches/${w.matchId}/box-score`)).json();
    expect(pub[A].players).toEqual([expect.objectContaining({ jersey: 7, points: 5, fgm: 1, tpm: 1, ftm: 0 })]);
    expect(pub[A].players[0]).not.toHaveProperty("name"); // names are not public
    expect(pub[A].unattributed.points).toBe(2);
    expect(pub[A].total.points).toBe(7);
    expect(pub[B].players[0]).toMatchObject({ jersey: 11, rebounds: 1 });
    expect((await call(t, w.fan, "GET", `/api/v1/matches/${w.matchId}/box-score`)).json()[A].players[0]).not.toHaveProperty("name");
    expect((await call(t, w.coachA, "GET", `/api/v1/matches/${w.matchId}/box-score`)).json()[A].players[0].name).toBe("Ann One");
    expect((await call(t, w.coachA, "GET", `/api/v1/matches/${w.matchId}/box-score`)).json()[B].players[0]).not.toHaveProperty("name"); // not their team
    expect((await call(t, w.org, "GET", `/api/v1/matches/${w.matchId}/box-score`)).json()[B].players[0].name).toBe("Bea One");
    expect((await call(t, w.a1, "GET", `/api/v1/matches/${w.matchId}/box-score`)).json()[A].players[0].name).toBe("Ann One");
  });
});

describe("substitutions", () => {
  it("records who comes on and who leaves, and refuses nonsense", async () => {
    const t = await testApp();
    const w = await match(t);
    const A = w.sideOf("A"), B = w.sideOf("B");
    const a2 = await user(t, "a2@example.com", { displayName: "Abe Two" });
    const { teamA, comp } = w;
    expect((await call(t, w.coachA, "POST", `/api/v1/teams/${teamA}/members`, { email: "a2@example.com", role: "PLAYER" })).statusCode).toBeLessThan(300);
    const put = await call(t, w.org, "PUT", `/api/v1/competitions/${comp}/teams/${teamA}/roster/${a2.id}`, { jersey: 9 });
    expect(put.statusCode, put.body).toBeLessThan(300);

    // A starter is declared with no player leaving; a substitution names both.
    const ok = await send(t, w.org, w.matchId, [
      { type: "SUBSTITUTION", side: A, playerId: w.a1.id, clockSeconds: 600 },
      { type: "SUBSTITUTION", side: A, playerId: a2.id, playerOutId: w.a1.id, clockSeconds: 420 },
    ]);
    expect(ok.statusCode, ok.body).toBe(200);
    const stored = (await call(t, w.org, "GET", `/api/v1/matches/${w.matchId}/events`)).json().items as { type: string; playerId: string; playerOutId: string | null }[];
    expect(stored.map((e) => e.playerOutId)).toEqual([null, w.a1.id]);
    // Subs never score.
    expect((await call(t, w.org, "GET", `/api/v1/matches/${w.matchId}/state`)).json().homeScore).toBe(0);

    const bad = (events: object[]) => send(t, w.org, w.matchId, events);
    expect((await bad([{ type: "SUBSTITUTION", side: A, clockSeconds: 300 }])).statusCode).toBe(422); // nobody coming on
    expect((await bad([{ type: "SUBSTITUTION", side: A, playerId: a2.id, playerOutId: a2.id }])).statusCode).toBe(422); // self
    expect((await bad([{ type: "SUBSTITUTION", side: A, playerId: a2.id, playerOutId: w.b1.id }])).statusCode).toBe(422); // leaving player on the other team
    expect((await bad([{ type: "SUBSTITUTION", side: B, playerId: w.b1.id, playerOutId: w.a1.id }])).statusCode).toBe(422);
    expect((await bad([{ type: "FIELD_GOAL", side: A, playerId: a2.id, playerOutId: w.a1.id }])).statusCode).toBe(422); // only subs can name who leaves
    await bad([{ type: "REBOUND", side: B, playerId: w.b1.id }]);
    // Bench-only players show in the box score with an empty line; the side total is unchanged.
    const box = (await call(t, w.org, "GET", `/api/v1/matches/${w.matchId}/box-score`)).json();
    expect(box[A].players.map((p: { points: number }) => p.points)).toEqual([0, 0]);
    // Minutes: no PERIOD_START, so the period length is the highest clock seen (10:00). Ann 10:00 -> 7:00, Abe 7:00 -> 0:00.
    expect(box[A].players.map((p: { seconds: number | null }) => p.seconds)).toEqual([180, 420]);
    // The other side never had a lineup recorded: unknown, not zero.
    expect(box[B].players.map((p: { seconds: number | null }) => p.seconds)).toEqual([null]);
  });
});
