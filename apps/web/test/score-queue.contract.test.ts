// @vitest-environment node
// Drives the real ScoreQueue against the real API (in-process, embedded Postgres) so the client and server cannot drift apart.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../../services/api/src/app";
import * as schema from "../../../services/api/src/db/schema";
import { ApiError, NetworkError } from "../lib/api";
import { ScoreQueue, type Post, type Saved, type Store } from "../lib/score-queue";

const memStore = (): Store => {
  const d = new Map<string, Saved>();
  return { load: (k) => d.get(k) ?? null, save: (k, v) => void d.set(k, structuredClone(v)) };
};

describe("ScoreQueue against the real API", () => {
  it("offline events sync to the real server, retries are idempotent, and two devices conflict then reconcile", async () => {
    const db = drizzle(new PGlite(), { schema });
    await migrate(db, { migrationsFolder: new URL("../../../services/api/drizzle", import.meta.url).pathname });
    const app = await buildApp(db as never, { secureCookies: false });

    const signup = async (email: string) => {
      const r = await app.inject({ method: "POST", url: "/api/v1/auth/signup", payload: { email, password: "correct-horse-battery", displayName: email, dateOfBirth: "1990-01-01" } });
      return { cookie: String(r.headers["set-cookie"]).split(";")[0]! };
    };
    const post = async (u: { cookie: string }, url: string, payload?: unknown) =>
      app.inject({ method: "POST", url, headers: { cookie: u.cookie }, ...(payload ? { payload } : {}) });

    const org = await signup("org@example.com");
    const other = await signup("other@example.com");
    const comp = (await post(org, "/api/v1/competitions", { name: "Cup", format: "ROUND_ROBIN" })).json();
    for (const n of ["Reds", "Blues"]) {
      const t = (await post(org, "/api/v1/teams", { name: n })).json();
      await post(org, `/api/v1/competitions/${comp.id}/teams`, { teamId: t.id });
    }
    const [match] = (await post(org, `/api/v1/competitions/${comp.id}/schedule`)).json().items;
    await post(org, `/api/v1/competitions/${comp.id}/officials`, { email: "other@example.com", role: "SCOREKEEPER" });

    let online = true;
    const poster = (u: { cookie: string }): Post => async (path, body) => {
      if (!online) throw new NetworkError("offline");
      const res = await app.inject({ method: "POST", url: `/api/v1${path}`, headers: { cookie: u.cookie }, payload: body as object });
      const json = res.json();
      if (res.statusCode >= 400) throw new ApiError(res.statusCode, json.title, json);
      return json;
    };

    const a = new ScoreQueue(match.id, poster(org), memStore());
    const b = new ScoreQueue(match.id, poster(other), memStore());

    online = false;
    a.add("GAME_START", { period: 1 });
    for (let i = 0; i < 4; i++) a.add("FIELD_GOAL", { side: "home", period: 1 });
    a.add("THREE_POINT", { side: "away", period: 1 });
    expect(await a.sync()).toBe("offline");
    online = true;
    expect(await a.sync()).toBe("idle");
    const server = (await app.inject({ url: `/api/v1/matches/${match.id}/state` })).json();
    expect(server).toMatchObject({ homeScore: 8, awayScore: 3, version: 6 });
    expect(a.score).toEqual({ home: 8, away: 3 });

    // Device B was never told about those 6 events, so its first sync must conflict, then succeed after review.
    b.add("FREE_THROW", { side: "away", period: 1 });
    expect(await b.sync()).toBe("conflict");
    expect(b.conflict?.newerEvents).toHaveLength(6);
    expect(await b.acceptConflictAndResend()).toBe("idle");
    expect((await app.inject({ url: `/api/v1/matches/${match.id}/state` })).json()).toMatchObject({ homeScore: 8, awayScore: 4, version: 7 });
    await app.close();
  }, 60_000);
});
