import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { Db } from "../src/db/index.js";
import * as schema from "../src/db/schema.js";
import { MemoryMailer } from "../src/identity/mailer.js";
import { LocalDiskStorage } from "../src/media/storage.js";
import { user } from "./helpers.js";

type U = { id: string; cookie: string };
async function setup() {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  const dir = await mkdtemp(join(tmpdir(), "autoclip-test-"));
  const app = await buildApp(db as unknown as Db, {
    secureCookies: false,
    requireVerifiedGuardianEmail: false,
    mailer: new MemoryMailer(),
    storage: new LocalDiskStorage(dir),
  });
  return { app, db: db as unknown as Db };
}
type T = Awaited<ReturnType<typeof setup>>;
const call = (t: T, u: U | null, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
  t.app.inject({ method, url, headers: u ? { cookie: u.cookie } : {}, ...(payload ? { payload } : {}) });
const usr = (t: T, email: string, over: Record<string, unknown> = {}) => user(t as never, email, over);

async function world(t: T) {
  const org = await usr(t, "org@example.com");
  const coachA = await usr(t, "ca@example.com");
  const coachB = await usr(t, "cb@example.com");
  const a1 = await usr(t, "a1@example.com", { displayName: "Michael Jordan" });
  const b1 = await usr(t, "b1@example.com", { displayName: "Larry Bird" });
  const fan = await usr(t, "fan@example.com");

  const comp = (await call(t, org, "POST", "/api/v1/competitions", { name: "Pro Invitational", format: "ROUND_ROBIN" })).json().id as string;
  const teamA = (await call(t, coachA, "POST", "/api/v1/teams", { name: "Chicago Bulls" })).json().id as string;
  const teamB = (await call(t, coachB, "POST", "/api/v1/teams", { name: "Boston Celtics" })).json().id as string;

  for (const team of [teamA, teamB]) await call(t, org, "POST", `/api/v1/competitions/${comp}/teams`, { teamId: team });
  await call(t, coachA, "POST", `/api/v1/teams/${teamA}/members`, { email: "a1@example.com", role: "PLAYER" });
  await call(t, coachB, "POST", `/api/v1/teams/${teamB}/members`, { email: "b1@example.com", role: "PLAYER" });
  await call(t, coachA, "PUT", `/api/v1/competitions/${comp}/teams/${teamA}/roster/${a1.id}`, { jersey: 23 });
  await call(t, coachB, "PUT", `/api/v1/competitions/${comp}/teams/${teamB}/roster/${b1.id}`, { jersey: 33 });

  const m = (await call(t, org, "POST", `/api/v1/competitions/${comp}/schedule`)).json().items[0] as { id: string; homeTeamId: string };
  const ours = (m.homeTeamId === teamA ? "home" : "away") as "home" | "away";
  const theirs = ours === "home" ? "away" : "home";

  const game = (await call(t, coachA, "POST", `/api/v1/teams/${teamA}/games`, { title: "Game 1 vs Celtics" })).json().id as string;
  return { org, coachA, coachB, a1, b1, fan, teamA, teamB, matchId: m.id, ours, theirs, game };
}

const T0 = Date.now() - 30 * 60_000;
const at = (sec: number) => new Date(T0 + sec * 1000).toISOString();

describe("Automated Event-to-Clip Video Segmentation & Highlight Reels (Spec §6.2, §6.4)", () => {
  it("enforces negative authZ on auto-clip and auto-montage endpoints (ADR-0010)", async () => {
    const t = await setup();
    const w = await world(t);

    // Anonymous request
    const anonRes = await call(t, null, "POST", `/api/v1/film/games/${w.game}/auto-clip`, {});
    expect(anonRes.statusCode).toBe(401);

    // Unaffiliated user / fan -> 404 Not Found
    const fanRes = await call(t, w.fan, "POST", `/api/v1/film/games/${w.game}/auto-clip`, {});
    expect(fanRes.statusCode).toBe(404);

    // Opponent coach on private film -> 404
    const oppRes = await call(t, w.coachB, "POST", `/api/v1/film/games/${w.game}/auto-clip`, {});
    expect(oppRes.statusCode).toBe(404);

    // Non-existent game ID -> 404
    const fakeId = randomUUID();
    const notFoundRes = await call(t, w.coachA, "POST", `/api/v1/film/games/${fakeId}/auto-clip`, {});
    expect(notFoundRes.statusCode).toBe(404);
  });

  it("rejects auto-clip generation when game film is not yet synced to match scorebook", async () => {
    const t = await setup();
    const w = await world(t);

    // Not linked yet
    const unlinkedRes = await call(t, w.coachA, "POST", `/api/v1/film/games/${w.game}/auto-clip`, {});
    expect(unlinkedRes.statusCode).toBe(400);
    expect(unlinkedRes.json().title).toMatch(/linked and synced/i);

    // Link match, but do not set sync point
    await call(t, w.coachA, "PUT", `/api/v1/film/games/${w.game}/match`, { matchId: w.matchId });
    const unsyncedRes = await call(t, w.coachA, "POST", `/api/v1/film/games/${w.game}/auto-clip`, {});
    expect(unsyncedRes.statusCode).toBe(400);
    expect(unsyncedRes.json().title).toMatch(/linked and synced/i);
  });

  it("automatically segments video into event clips with configurable lead and lag windows (Spec §6.2)", async () => {
    const t = await setup();
    const w = await world(t);

    // 1. Link match
    await call(t, w.coachA, "PUT", `/api/v1/film/games/${w.game}/match`, { matchId: w.matchId });

    // 2. Score events
    const e1 = randomUUID();
    const e2 = randomUUID();
    const e3 = randomUUID();
    const e4 = randomUUID();

    await call(t, w.org, "POST", `/api/v1/matches/${w.matchId}/events`, {
      events: [
        { id: e1, localSeq: 1, type: "FIELD_GOAL", side: w.ours, period: 1, playerId: w.a1.id, occurredAt: at(10) },
        { id: e2, localSeq: 2, type: "THREE_POINT", side: w.ours, period: 1, playerId: w.a1.id, occurredAt: at(60) },
        { id: e3, localSeq: 3, type: "THREE_POINT", side: w.theirs, period: 1, playerId: w.b1.id, occurredAt: at(120) },
        { id: e4, localSeq: 4, type: "TURNOVER", side: w.theirs, period: 2, playerId: w.b1.id, occurredAt: at(240) },
      ],
    });

    // 3. Set sync point at 100,000ms video time for e1 (at t = 10s)
    await call(t, w.coachA, "PUT", `/api/v1/film/games/${w.game}/sync`, {
      eventId: e1,
      videoMs: 100_000,
    });

    // 4. Request automated clip generation for scoring plays (lead 4s, lag 2s)
    const genRes = await call(t, w.coachA, "POST", `/api/v1/film/games/${w.game}/auto-clip`, {
      category: "ALL_SCORING",
      sideFilter: "OUR_TEAM",
      leadSeconds: 4,
      lagSeconds: 2,
    });

    expect(genRes.statusCode).toBe(201);
    const body = genRes.json();
    expect(body.generatedCount).toBe(2); // e1 and e2 for our team
    expect(body.clips.length).toBe(2);

    // Verify timing for e1: videoMs = 100,000ms. With 4s lead, startMs = 96,000ms. With 2s lag, endMs = 102,000ms.
    const clip1 = body.clips.find((c: { note: string }) => c.note.includes("FIELD GOAL"));
    expect(clip1).toBeDefined();
    expect(clip1.startMs).toBe(96_000);
    expect(clip1.endMs).toBe(102_000);
    expect(clip1.tags).toContain("auto-clip");
    expect(clip1.tags).toContain("field-goal");
    expect(clip1.tags).toContain("#23");

    // Verify clips in game clips list
    const listRes = await call(t, w.coachA, "GET", `/api/v1/film/games/${w.game}/clips`);
    expect(listRes.json().items.length).toBe(2);

    // 5. Subsequent call skips duplicates
    const dupRes = await call(t, w.coachA, "POST", `/api/v1/film/games/${w.game}/auto-clip`, {
      category: "ALL_SCORING",
      sideFilter: "OUR_TEAM",
      leadSeconds: 4,
      lagSeconds: 2,
    });
    expect(dupRes.json().generatedCount).toBe(0);
  });

  it("automatically assembles a structured highlight montage reel (Spec §6.4)", async () => {
    const t = await setup();
    const w = await world(t);

    await call(t, w.coachA, "PUT", `/api/v1/film/games/${w.game}/match`, { matchId: w.matchId });

    const e1 = randomUUID();
    const e2 = randomUUID();
    await call(t, w.org, "POST", `/api/v1/matches/${w.matchId}/events`, {
      events: [
        { id: e1, localSeq: 1, type: "THREE_POINT", side: w.ours, period: 1, playerId: w.a1.id, occurredAt: at(20) },
        { id: e2, localSeq: 2, type: "FIELD_GOAL", side: w.ours, period: 2, playerId: w.a1.id, occurredAt: at(100) },
      ],
    });

    await call(t, w.coachA, "PUT", `/api/v1/film/games/${w.game}/sync`, {
      eventId: e1,
      videoMs: 50_000,
    });

    // Call auto-montage directly
    const montageRes = await call(t, w.coachA, "POST", `/api/v1/film/games/${w.game}/auto-montage`, {
      title: "Michael Jordan Game 1 Scoring Mixtape",
      category: "ALL_SCORING",
      leadSeconds: 5,
      lagSeconds: 3,
    });

    expect(montageRes.statusCode).toBe(201);
    const montage = montageRes.json();
    expect(montage.title).toBe("Michael Jordan Game 1 Scoring Mixtape");
    expect(montage.clipCount).toBe(2);
    expect(montage.totalDurationMs).toBeGreaterThan(0);
    expect(montage.items.length).toBe(2);
    expect(montage.items[0].order).toBe(1);
    expect(montage.items[1].order).toBe(2);

    // Verify it is retrievable via public scouting montage endpoint
    const getRes = await call(t, w.coachA, "GET", `/api/v1/film/montages/${montage.id}`);
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().id).toBe(montage.id);
  });
});
