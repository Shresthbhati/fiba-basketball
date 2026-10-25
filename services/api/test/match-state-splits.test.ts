import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { Db } from "../src/db/index.js";
import * as schema from "../src/db/schema.js";
import { MemoryMailer } from "../src/identity/mailer.js";
import { project, type ScoredEvent } from "../src/match/projection.js";
import { user } from "./helpers.js";

let seq = 0;
const mkEvent = (
  type: ScoredEvent["type"],
  side: ScoredEvent["side"],
  period = 1,
  clockSeconds?: number,
  over: Partial<ScoredEvent> = {}
): ScoredEvent => ({
  id: `e-${++seq}`,
  serverSeq: seq,
  type,
  side,
  period,
  clockSeconds: clockSeconds ?? null,
  correctsEventId: null,
  ...over,
});

type U = { id: string; cookie: string };
async function setup() {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  const app = await buildApp(db as unknown as Db, {
    secureCookies: false,
    requireVerifiedGuardianEmail: false,
    mailer: new MemoryMailer(),
  });
  return { app, db: db as unknown as Db };
}
type T = Awaited<ReturnType<typeof setup>>;
const call = (t: T, u: U | null, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
  t.app.inject({ method, url, headers: u ? { cookie: u.cookie } : {}, ...(payload ? { payload } : {}) });

describe("Match State Splits & Momentum Run Projection", () => {
  it("projects quarter-by-quarter scoring splits accurately", () => {
    seq = 0;
    const events: ScoredEvent[] = [
      mkEvent("FIELD_GOAL", "home", 1, 580), // 2-0
      mkEvent("THREE_POINT", "away", 1, 560), // 2-3
      mkEvent("FIELD_GOAL", "home", 1, 520), // 4-3
      mkEvent("PERIOD_START", null, 2, 600),
      mkEvent("THREE_POINT", "home", 2, 570), // 7-3
      mkEvent("FIELD_GOAL", "away", 2, 540), // 7-5
      mkEvent("PERIOD_START", null, 3, 600),
      mkEvent("FREE_THROW", "home", 3, 500), // 8-5
      mkEvent("PERIOD_START", null, 5, 300), // OT1
      mkEvent("FIELD_GOAL", "away", 5, 250), // 8-7
    ];

    const state = project(events);
    expect(state.homeScore).toBe(8);
    expect(state.awayScore).toBe(7);
    expect(state.period).toBe(5);
    expect(state.clockSeconds).toBe(250);

    // Q1..Q4 + OT1
    expect(state.periodScores).toHaveLength(5);
    expect(state.periodScores[0]).toEqual({ period: 1, label: "Q1", home: 4, away: 3 });
    expect(state.periodScores[1]).toEqual({ period: 2, label: "Q2", home: 3, away: 2 });
    expect(state.periodScores[2]).toEqual({ period: 3, label: "Q3", home: 1, away: 0 });
    expect(state.periodScores[3]).toEqual({ period: 4, label: "Q4", home: 0, away: 0 });
    expect(state.periodScores[4]).toEqual({ period: 5, label: "OT1", home: 0, away: 2 });
  });

  it("calculates momentum scoring runs and resets when opposing team scores", () => {
    seq = 0;
    const events: ScoredEvent[] = [
      mkEvent("FIELD_GOAL", "home", 1), // Home +2 (2-0)
      mkEvent("THREE_POINT", "home", 1), // Home +3 (5-0 run)
      mkEvent("FIELD_GOAL", "home", 1), // Home +2 (7-0 run)
    ];

    let state = project(events);
    expect(state.currentRun).toEqual({
      side: "home",
      points: 7,
      unanswered: true,
    });
    expect(state.lastScoringSide).toBe("home");

    // Opponent answers with a 2-pointer
    events.push(mkEvent("FIELD_GOAL", "away", 1));
    state = project(events);
    expect(state.currentRun).toEqual({
      side: "away",
      points: 2,
      unanswered: true,
    });
    expect(state.lastScoringSide).toBe("away");
  });
});

describe("Public Match Embed Scoreboard API (Spec §16.3, §17.2, ADR-0010)", () => {
  it("serves live scoreboard payload with negative authZ on draft tournaments", async () => {
    const t = await setup();
    const org = await user(t as never, "organizer@test.com");
    const coachA = await user(t as never, "coachA@test.com");
    const coachB = await user(t as never, "coachB@test.com");

    const compRes = await call(t, org, "POST", "/api/v1/competitions", {
      name: "Championship 2026",
      format: "ROUND_ROBIN",
    });
    const compId = compRes.json().id as string;

    const teamARes = await call(t, coachA, "POST", "/api/v1/teams", { name: "Boston Celtics" });
    const teamBRes = await call(t, coachB, "POST", "/api/v1/teams", { name: "LA Lakers" });
    const teamAId = teamARes.json().id as string;
    const teamBId = teamBRes.json().id as string;

    await call(t, org, "POST", `/api/v1/competitions/${compId}/teams`, { teamId: teamAId });
    await call(t, org, "POST", `/api/v1/competitions/${compId}/teams`, { teamId: teamBId });

    // While still in DRAFT (before schedule generation), check match embed / state returns 404
    const fakeMatchId = randomUUID();
    const draftRes = await call(t, null, "GET", `/api/v1/embed/competitions/${compId}/matches/${fakeMatchId}`);
    expect(draftRes.statusCode).toBe(404);

    // Negative AuthZ test on unknown match ID -> 404
    const unknownRes = await call(t, null, "GET", `/api/v1/embed/competitions/${randomUUID()}/matches/${fakeMatchId}`);
    expect(unknownRes.statusCode).toBe(404);

    // Generate schedule (publishes competition status to PUBLISHED)
    const schedRes = await call(t, org, "POST", `/api/v1/competitions/${compId}/schedule`);
    expect(schedRes.statusCode).toBe(201);
    const matchId = schedRes.json().items[0].id as string;

    // Fetch published match embed scoreboard
    const pubRes = await call(t, null, "GET", `/api/v1/embed/competitions/${compId}/matches/${matchId}`);
    expect(pubRes.statusCode).toBe(200);
    const body = pubRes.json();

    expect(body.competition.name).toBe("Championship 2026");
    expect(body.match.id).toBe(matchId);
    expect(body.homeTeam?.name).toBe("Boston Celtics");
    expect(body.awayTeam?.name).toBe("LA Lakers");
    expect(body.score.homeScore).toBe(0);
    expect(body.score.awayScore).toBe(0);
    expect(body.score.periodScores).toHaveLength(4);
    expect(body.streamUrl).toBe(`/api/v1/streams/matches/${matchId}`);

    // Verify /api/v1/matches/:id/state also returns enriched match details
    const stateRes = await call(t, null, "GET", `/api/v1/matches/${matchId}/state`);
    expect(stateRes.statusCode).toBe(200);
    const stateBody = stateRes.json();
    expect(stateBody.competitionName).toBe("Championship 2026");
    expect(stateBody.homeTeam?.name).toBe("Boston Celtics");
    expect(stateBody.awayTeam?.name).toBe("LA Lakers");
    expect(stateBody.periodScores).toHaveLength(4);
  });
});
