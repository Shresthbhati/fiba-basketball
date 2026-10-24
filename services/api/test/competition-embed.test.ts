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

describe("Public Tournament Embed API (Spec §8.5, §15.2)", () => {
  it("enforces negative authZ: draft or non-existent competitions return 404", async () => {
    const t = await setup();
    const org = await usr(t, "org@example.com");

    // Create competition in DRAFT status
    const comp = (await call(t, org, "POST", "/api/v1/competitions", { name: "Draft League", format: "ROUND_ROBIN" })).json().id as string;

    // Public query for draft competition -> 404 Not Found (ADR-0010)
    const draftRes = await call(t, null, "GET", `/api/v1/embed/competitions/${comp}/summary`);
    expect(draftRes.statusCode).toBe(404);

    const draftStandings = await call(t, null, "GET", `/api/v1/embed/competitions/${comp}/standings`);
    expect(draftStandings.statusCode).toBe(404);

    // Non-existent ID -> 404
    const fakeId = randomUUID();
    const fakeRes = await call(t, null, "GET", `/api/v1/embed/competitions/${fakeId}/summary`);
    expect(fakeRes.statusCode).toBe(404);
  });

  it("serves public standings and schedule for published round-robin competitions", async () => {
    const t = await setup();
    const org = await usr(t, "org@example.com");
    const coachA = await usr(t, "ca@example.com");
    const coachB = await usr(t, "cb@example.com");

    const comp = (await call(t, org, "POST", "/api/v1/competitions", { name: "EuroCup Round Robin", format: "ROUND_ROBIN" })).json().id as string;
    const teamA = (await call(t, coachA, "POST", "/api/v1/teams", { name: "Real Madrid" })).json().id as string;
    const teamB = (await call(t, coachB, "POST", "/api/v1/teams", { name: "Barcelona" })).json().id as string;

    await call(t, org, "POST", `/api/v1/competitions/${comp}/teams`, { teamId: teamA });
    await call(t, org, "POST", `/api/v1/competitions/${comp}/teams`, { teamId: teamB });

    // Generate schedule (publishes competition status to PUBLISHED)
    const schedRes = await call(t, org, "POST", `/api/v1/competitions/${comp}/schedule`);
    expect(schedRes.statusCode).toBe(201);
    const matchId = schedRes.json().items[0].id as string;

    // Score the match
    await call(t, org, "POST", `/api/v1/matches/${matchId}/result`, {
      homeScore: 88,
      awayScore: 82,
    });

    // 1. Fetch public embed summary (no cookies / anonymous)
    const summaryRes = await call(t, null, "GET", `/api/v1/embed/competitions/${comp}/summary`);
    expect(summaryRes.statusCode).toBe(200);
    const summary = summaryRes.json();

    expect(summary.competition.name).toBe("EuroCup Round Robin");
    expect(summary.competition.format).toBe("ROUND_ROBIN");
    expect(["PUBLISHED", "COMPLETED"]).toContain(summary.competition.status);
    expect(summary.stats.teamCount).toBe(2);
    expect(summary.stats.completedMatches).toBe(1);

    // Verify standings
    expect(summary.standings.length).toBe(2);
    expect(summary.standings[0].name).toBe("Real Madrid");
    expect(summary.standings[0].wins).toBe(1);
    expect(summary.standings[0].losses).toBe(0);
    expect(summary.standings[0].points).toBe(2);
    expect(summary.standings[1].name).toBe("Barcelona");
    expect(summary.standings[1].losses).toBe(1);

    // Verify schedule
    expect(summary.schedule.length).toBe(1);
    expect(summary.schedule[0].home).toBe("Real Madrid");
    expect(summary.schedule[0].away).toBe("Barcelona");
    expect(summary.schedule[0].homeScore).toBe(88);
    expect(summary.schedule[0].awayScore).toBe(82);
    expect(summary.schedule[0].winner).toBe("Real Madrid");

    // 2. Fetch standalone /standings and /schedule endpoints
    const standingsRes = await call(t, null, "GET", `/api/v1/embed/competitions/${comp}/standings`);
    expect(standingsRes.statusCode).toBe(200);
    expect(standingsRes.json().standings.length).toBe(2);

    const scheduleOnlyRes = await call(t, null, "GET", `/api/v1/embed/competitions/${comp}/schedule`);
    expect(scheduleOnlyRes.statusCode).toBe(200);
    expect(scheduleOnlyRes.json().schedule.length).toBe(1);
  });

  it("serves bracket rounds with seeded matchups for single elimination tournaments", async () => {
    const t = await setup();
    const org = await usr(t, "org@example.com");

    const comp = (await call(t, org, "POST", "/api/v1/competitions", { name: "March Madness Knockout", format: "SINGLE_ELIMINATION" })).json().id as string;

    const t1 = (await call(t, org, "POST", "/api/v1/teams", { name: "Duke" })).json().id as string;
    const t2 = (await call(t, org, "POST", "/api/v1/teams", { name: "UNC" })).json().id as string;
    const t3 = (await call(t, org, "POST", "/api/v1/teams", { name: "Kentucky" })).json().id as string;
    const t4 = (await call(t, org, "POST", "/api/v1/teams", { name: "Kansas" })).json().id as string;

    await call(t, org, "POST", `/api/v1/competitions/${comp}/teams`, { teamId: t1, seed: 1 });
    await call(t, org, "POST", `/api/v1/competitions/${comp}/teams`, { teamId: t2, seed: 2 });
    await call(t, org, "POST", `/api/v1/competitions/${comp}/teams`, { teamId: t3, seed: 3 });
    await call(t, org, "POST", `/api/v1/competitions/${comp}/teams`, { teamId: t4, seed: 4 });

    await call(t, org, "POST", `/api/v1/competitions/${comp}/schedule`);

    // Fetch public embed bracket
    const bracketRes = await call(t, null, "GET", `/api/v1/embed/competitions/${comp}/bracket`);
    expect(bracketRes.statusCode).toBe(200);
    const body = bracketRes.json();

    expect(body.competition.format).toBe("SINGLE_ELIMINATION");
    expect(body.bracket).toBeDefined();
    expect(body.bracket.length).toBeGreaterThanOrEqual(2); // Semifinals and Final

    const semiRound = body.bracket.find((b: { name: string }) => b.name === "Semifinals");
    expect(semiRound).toBeDefined();
    expect(semiRound.matches.length).toBe(2);

    const finalRound = body.bracket.find((b: { name: string }) => b.name === "Final");
    expect(finalRound).toBeDefined();
    expect(finalRound.matches.length).toBe(1);
  });
});
