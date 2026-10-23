// @vitest-environment node
// Checks the real API returns every field the competition screens read.
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../../services/api/src/app";
import * as schema from "../../../services/api/src/db/schema";

describe("competition API shape", () => {
  it("returns the fields the web app depends on", async () => {
    const db = drizzle(new PGlite(), { schema });
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../../services/api/drizzle", import.meta.url)) });
    const app = await buildApp(db as never, { secureCookies: false });
    const su = await app.inject({ method: "POST", url: "/api/v1/auth/signup", payload: { email: "o@example.com", password: "correct-horse-battery", displayName: "Org", dateOfBirth: "1990-01-01" } });
    const h = { cookie: String(su.headers["set-cookie"]).split(";")[0]! };
    const post = (url: string, payload?: object) => app.inject({ method: "POST", url, headers: h, ...(payload ? { payload } : {}) });

    const comp = (await post("/api/v1/competitions", { name: "Cup", format: "ROUND_ROBIN" })).json();
    for (const [i, name] of ["Reds", "Blues"].entries()) {
      const t = (await post("/api/v1/teams", { name })).json();
      await post(`/api/v1/competitions/${comp.id}/teams`, { teamId: t.id, seed: i + 1 });
    }
    const list = (await app.inject({ url: "/api/v1/competitions", headers: h })).json().items[0];
    for (const k of ["id", "name", "format", "status", "mine"]) expect(list, k).toHaveProperty(k);

    const detail = (await app.inject({ url: `/api/v1/competitions/${comp.id}`, headers: h })).json();
    for (const k of ["id", "name", "format", "status", "teams", "canManage"]) expect(detail, k).toHaveProperty(k);
    for (const k of ["id", "name", "seed"]) expect(detail.teams[0], k).toHaveProperty(k);

    const [m] = (await post(`/api/v1/competitions/${comp.id}/schedule`)).json().items;
    for (const k of ["id", "round", "slot", "homeTeamId", "awayTeamId", "state", "isBye", "homeScore", "awayScore"]) expect(m, k).toHaveProperty(k);
    await post(`/api/v1/matches/${m.id}/result`, { homeScore: 80, awayScore: 70 });

    const row = (await app.inject({ url: `/api/v1/competitions/${comp.id}/standings` })).json().items[0];
    for (const k of ["rank", "name", "played", "wins", "losses", "points", "pointsFor", "pointsAgainst", "diff"]) expect(row, k).toHaveProperty(k);

    const official = await post(`/api/v1/competitions/${comp.id}/officials`, { email: "o@example.com", role: "SCOREKEEPER" });
    expect(official.statusCode).toBe(201);
    await app.close();
  }, 60_000);
});
