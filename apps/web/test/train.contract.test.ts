// @vitest-environment node
// The real SetQueue against the real API (in-process, embedded Postgres): offline sets arrive once, retries never double count,
// and the response shapes the training screens read are all present.
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../../services/api/src/app";
import * as schema from "../../../services/api/src/db/schema";
import { ApiError, NetworkError } from "../lib/api";
import { SetQueue, type SetStore } from "../lib/set-queue";

const memStore = (): SetStore => { const d = new Map<string, never>(); return { load: (k) => d.get(k) ?? null, save: (k, v) => void d.set(k, v as never) }; };

describe("training API and SetQueue", () => {
  it("delivers offline sets exactly once and exposes the fields the screens read", async () => {
    const db = drizzle(new PGlite(), { schema });
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../../services/api/drizzle", import.meta.url)) });
    const app = await buildApp(db as never, { secureCookies: false });
    const su = await app.inject({ method: "POST", url: "/api/v1/auth/signup", payload: { email: "t@example.com", password: "correct-horse-battery", displayName: "Tia", dateOfBirth: "1990-01-01" } });
    const cookie = String(su.headers["set-cookie"]).split(";")[0]!;
    const call = (method: "GET" | "POST", url: string, payload?: object) => app.inject({ method, url: `/api/v1${url}`, headers: { cookie }, ...(payload ? { payload } : {}) });

    const exs = (await app.inject({ url: "/api/v1/exercises" })).json().items;
    for (const k of ["id", "slug", "name", "category", "equipment", "cues", "safetyNotes", "reviewed"]) expect(exs[0], k).toHaveProperty(k);
    const squat = exs.find((e: { slug: string }) => e.slug === "back-squat").id;
    const session = (await call("POST", "/training/sessions", {})).json();

    let online = false;
    let loseOne = false;
    const q = new SetQueue(session.id, async (path, body) => {
      if (!online) throw new NetworkError("offline");
      const res = await call("POST", path, body as object);
      if (res.statusCode >= 400) throw new ApiError(res.statusCode, res.json().title, res.json());
      if (loseOne) { loseOne = false; throw new NetworkError("response lost"); }
      return res.json();
    }, memStore());

    q.add({ exerciseId: squat, reps: 8, loadKg: 60, rpe: 7 });
    q.add({ exerciseId: squat, reps: 8, loadKg: 60, rpe: 8 });
    q.add({ exerciseId: squat, reps: 6, loadKg: 62.5 });
    expect(await q.sync()).toBe("offline");
    online = true;
    loseOne = true; // the server stores the first set but the device never hears back
    expect(await q.sync()).toBe("offline");
    expect(await q.sync()).toBe("idle");

    const detail = (await call("GET", `/training/sessions/${session.id}`)).json();
    expect(detail.sets.map((s: { reps: number }) => s.reps)).toEqual([8, 8, 6]); // each exactly once
    expect(detail.sets.map((s: { setNumber: number }) => s.setNumber)).toEqual([1, 2, 3]);
    for (const k of ["id", "exerciseId", "setNumber", "reps", "loadKg", "rpe", "clientId"]) expect(detail.sets[0], k).toHaveProperty(k);
    for (const k of ["id", "startedAt", "endedAt", "notes", "sessionRpe"]) expect(detail, k).toHaveProperty(k);

    const list = (await call("GET", "/training/sessions")).json().items[0];
    expect(list).toHaveProperty("setCount", 3);
    const hist = (await call("GET", `/training/history/${squat}`)).json();
    expect(hist).toHaveProperty("sampleSize", 1);
    for (const k of ["sessionId", "date", "sets", "topLoadKg", "repsAtTopLoad"]) expect(hist.items[0], k).toHaveProperty(k);
    const prog = (await call("GET", `/training/progression/${squat}`)).json();
    for (const k of ["action", "explanation", "basedOnSessions"]) expect(prog, k).toHaveProperty(k);
    const w = (await call("GET", "/training/wellness")).json();
    for (const k of ["latest", "trainingPaused", "message"]) expect(w, k).toHaveProperty(k);
    await app.close();
  }, 60_000);
});
