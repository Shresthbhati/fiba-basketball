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
import { user } from "./helpers.js";

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
const usr = (t: T, email: string, over: Record<string, unknown> = {}) => user(t as never, email, over);

async function world(t: T) {
  const org = await usr(t, "org@example.com");
  const coachOur = await usr(t, "coach-our@example.com");
  const coachOpp = await usr(t, "coach-opp@example.com");
  const starShooter = await usr(t, "curry@example.com", { displayName: "Steph Curry" });
  const fan = await usr(t, "fan@example.com");

  const comp = (await call(t, org, "POST", "/api/v1/competitions", { name: "Pro League", format: "ROUND_ROBIN" })).json().id as string;
  const ourTeam = (await call(t, coachOur, "POST", "/api/v1/teams", { name: "Golden State" })).json().id as string;
  const oppTeam = (await call(t, coachOpp, "POST", "/api/v1/teams", { name: "Houston Rockets" })).json().id as string;

  await call(t, org, "POST", `/api/v1/competitions/${comp}/teams`, { teamId: ourTeam });
  await call(t, org, "POST", `/api/v1/competitions/${comp}/teams`, { teamId: oppTeam });

  await call(t, coachOpp, "POST", `/api/v1/teams/${oppTeam}/members`, { email: "curry@example.com", role: "PLAYER" });
  await call(t, coachOpp, "PUT", `/api/v1/competitions/${comp}/teams/${oppTeam}/roster/${starShooter.id}`, { jersey: 30 });

  const sched = (await call(t, org, "POST", `/api/v1/competitions/${comp}/schedule`)).json().items;
  const matchId = sched[0].id as string;

  return { org, coachOur, coachOpp, starShooter, fan, ourTeam, oppTeam, matchId, comp };
}

describe("Opponent Tendency Breakdown & Automated Tactical Scouting Dossier (Spec §10.2, §11.1, §11.4)", () => {
  it("enforces negative authZ on scouting tendency endpoints (ADR-0010)", async () => {
    const t = await setup();
    const w = await world(t);

    // 1. Anonymous request -> 401
    const anonRes = await call(t, null, "GET", `/api/v1/teams/${w.ourTeam}/scouting/opponents/${w.oppTeam}`);
    expect(anonRes.statusCode).toBe(401);

    // 2. Unaffiliated fan -> 404 (ADR-0010: private scouting dossiers return 404)
    const fanRes = await call(t, w.fan, "GET", `/api/v1/teams/${w.ourTeam}/scouting/opponents/${w.oppTeam}`);
    expect(fanRes.statusCode).toBe(404);

    // 3. Non-existent team -> 404
    const fakeId = randomUUID();
    const fakeRes = await call(t, w.coachOur, "GET", `/api/v1/teams/${fakeId}/scouting/opponents/${w.oppTeam}`);
    expect(fakeRes.statusCode).toBe(404);
  });

  it("analyzes opponent shot profile, turnovers, and key threats from match events (Spec §10.2)", async () => {
    const t = await setup();
    const w = await world(t);

    // Score the match with specific events for opponent team
    // Opponent is away: 3x 3-pointers by Curry, 1x 2-pointer, 2 turnovers, 2 assists
    await call(t, w.org, "POST", `/api/v1/matches/${w.matchId}/events`, {
      events: [
        { id: randomUUID(), localSeq: 1, type: "THREE_POINT", side: "away", period: 1, playerId: w.starShooter.id },
        { id: randomUUID(), localSeq: 2, type: "THREE_POINT", side: "away", period: 1, playerId: w.starShooter.id },
        { id: randomUUID(), localSeq: 3, type: "THREE_POINT", side: "away", period: 2, playerId: w.starShooter.id },
        { id: randomUUID(), localSeq: 4, type: "FIELD_GOAL", side: "away", period: 2, playerId: w.starShooter.id },
        { id: randomUUID(), localSeq: 5, type: "ASSIST", side: "away", period: 2, playerId: w.starShooter.id },
        { id: randomUUID(), localSeq: 6, type: "TURNOVER", side: "away", period: 3, playerId: w.starShooter.id },
        { id: randomUUID(), localSeq: 7, type: "TURNOVER", side: "away", period: 4, playerId: w.starShooter.id },
        { id: randomUUID(), localSeq: 8, type: "FIELD_GOAL", side: "home", period: 4 },
      ],
    });

    // Mark match as FINISHED
    await call(t, w.org, "POST", `/api/v1/matches/${w.matchId}/result`, {
      homeScore: 80,
      awayScore: 85,
    });

    // Query opponent tendencies as coach of our team
    const res = await call(t, w.coachOur, "GET", `/api/v1/teams/${w.ourTeam}/scouting/opponents/${w.oppTeam}`);
    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.opponent.name).toBe("Houston Rockets");
    expect(body.sampleSize).toBe(1);
    expect(body.record.wins).toBe(1);

    // Shot profile: 3 TPM/TPA out of 4 FGA = 75% 3PT rate
    expect(body.shotProfile.threePointRate).toBeGreaterThanOrEqual(70);
    expect(body.ballControl.turnoversPerGame).toBe(2);

    // Key threats: Steph Curry should be listed with Perimeter Sharpshooter tag
    expect(body.keyThreats.length).toBe(1);
    expect(body.keyThreats[0].name).toBe("Steph Curry");
    expect(body.keyThreats[0].roleTag).toBe("Perimeter Sharpshooter");

    // Tactical recommendations: should advise perimeter defense
    expect(body.tacticalRecommendations.length).toBeGreaterThan(0);
    expect(body.tacticalRecommendations[0]).toMatch(/perimeter/i);
  });

  it("automatically generates and saves a 5-block tactical scouting dossier (Spec §11.1, §11.4)", async () => {
    const t = await setup();
    const w = await world(t);

    await call(t, w.org, "POST", `/api/v1/matches/${w.matchId}/events`, {
      events: [
        { id: randomUUID(), localSeq: 1, type: "THREE_POINT", side: "away", period: 1, playerId: w.starShooter.id },
        { id: randomUUID(), localSeq: 2, type: "FIELD_GOAL", side: "home", period: 1 },
      ],
    });

    await call(t, w.org, "POST", `/api/v1/matches/${w.matchId}/result`, {
      homeScore: 70,
      awayScore: 75,
    });

    const genRes = await call(t, w.coachOur, "POST", `/api/v1/teams/${w.ourTeam}/scouting/opponents/${w.oppTeam}/generate`, {
      title: "Playoff Game 1 Opponent Scouting Dossier",
    });

    expect(genRes.statusCode).toBe(201);
    const { report, analysis } = genRes.json();

    expect(analysis.sampleSize).toBe(1);
    expect(report.title).toBe("Playoff Game 1 Opponent Scouting Dossier");
    expect(report.blocks.length).toBe(5);
    expect(report.blocks[0].title).toMatch(/Offensive Pace/i);
    expect(report.blocks[1].title).toMatch(/Shot Selection/i);
    expect(report.blocks[2].title).toMatch(/Ball Security/i);
    expect(report.blocks[3].title).toMatch(/Key Personnel/i);
    expect(report.blocks[4].title).toMatch(/Tactical Counters/i);

    // Verify it is saved in team's tactical reports
    const listReportsRes = await call(t, w.coachOur, "GET", `/api/v1/teams/${w.ourTeam}/reports`);
    expect(listReportsRes.statusCode).toBe(200);
    expect(listReportsRes.json().items.length).toBe(1);
    expect(listReportsRes.json().items[0].id).toBe(report.id);
  });
});
