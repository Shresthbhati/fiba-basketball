import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { LocalDiskStorage } from "../src/media/storage.js";
import { MemoryMailer } from "../src/identity/mailer.js";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../src/db/schema.js";
import type { Db } from "../src/db/index.js";
import { user } from "./helpers.js";

const teen = { dateOfBirth: `${new Date().getFullYear() - 15}-01-01` };

async function setup(maxVideoBytes = 1000) {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  const dir = await mkdtemp(join(tmpdir(), "film-test-"));
  const app = await buildApp(db as unknown as Db, {
    secureCookies: false, requireVerifiedGuardianEmail: false, mailer: new MemoryMailer(),
    storage: new LocalDiskStorage(dir), maxVideoBytes,
  });
  return { app, db: db as unknown as Db, dir };
}
type T = Awaited<ReturnType<typeof setup>>;
type U = { id: string; cookie: string };
const call = (t: T, u: U, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: unknown, headers: Record<string, string> = {}) =>
  t.app.inject({ method, url, headers: { cookie: u.cookie, ...headers }, ...(payload === undefined ? {} : { payload: payload as never }) });

async function world(t: T) {
  const coachU = await user(t as never, "coach@example.com", { displayName: "Coach" });
  const player = await user(t as never, "player@example.com", { displayName: "Pat Player" });
  const outsider = await user(t as never, "out@example.com", { displayName: "Out" });
  const teamId = (await call(t, coachU, "POST", "/api/v1/teams", { name: "Hawks" })).json().id as string;
  expect((await call(t, coachU, "POST", `/api/v1/teams/${teamId}/members`, { email: "player@example.com", role: "PLAYER" })).statusCode).toBe(201);
  const gameId = (await call(t, coachU, "POST", `/api/v1/teams/${teamId}/games`, { title: "vs Lions", opponent: "Lions", playedOn: "2026-10-01" })).json().id as string;
  return { coachU, player, outsider, teamId, gameId };
}
const mp4 = (u: U, body: Buffer) => ({ cookie: u.cookie, "content-type": "video/mp4", "content-length": String(body.length) });

describe("team film (WP-3.1 slice)", () => {
  it("team members see the game; non-members and anonymous users get 404/401", async () => {
    const t = await setup();
    const w = await world(t);
    expect((await call(t, w.player, "GET", `/api/v1/film/games/${w.gameId}`)).json().canManage).toBe(false);
    expect((await call(t, w.coachU, "GET", `/api/v1/film/games/${w.gameId}`)).json().canManage).toBe(true);
    expect((await call(t, w.player, "GET", `/api/v1/teams/${w.teamId}/members`)).json().canManage).toBe(false);
    expect((await call(t, w.player, "GET", `/api/v1/teams/${w.teamId}/games`)).json().items).toHaveLength(1);
    expect((await call(t, w.outsider, "GET", `/api/v1/film/games/${w.gameId}`)).statusCode).toBe(404);
    expect((await call(t, w.outsider, "GET", `/api/v1/teams/${w.teamId}/games`)).statusCode).toBe(404);
    expect((await call(t, w.outsider, "GET", `/api/v1/film/games/00000000-0000-4000-8000-000000000000`)).statusCode).toBe(404);
    expect((await t.app.inject({ method: "GET", url: `/api/v1/film/games/${w.gameId}` })).statusCode).toBe(401);
  });

  it("players can watch but not upload, tag or add games", async () => {
    const t = await setup();
    const w = await world(t);
    expect((await call(t, w.player, "POST", `/api/v1/teams/${w.teamId}/games`, { title: "x" })).statusCode).toBe(404);
    expect((await call(t, w.player, "POST", `/api/v1/film/games/${w.gameId}/clips`, { startMs: 0, endMs: 5000 })).statusCode).toBe(404);
    const body = Buffer.from("video");
    const up = await t.app.inject({ method: "PUT", url: `/api/v1/film/games/${w.gameId}/video`, headers: mp4(w.player, body), payload: body });
    expect(up.statusCode).toBe(404);
  });

  it("uploads a video, serves it whole and by byte range to members only, and keeps nothing in the database", async () => {
    const t = await setup();
    const w = await world(t);
    const body = Buffer.from("0123456789abcdefghij");
    const up = await t.app.inject({ method: "PUT", url: `/api/v1/film/games/${w.gameId}/video`, headers: mp4(w.coachU, body), payload: body });
    expect(up.statusCode).toBe(204);
    const g = (await call(t, w.player, "GET", `/api/v1/film/games/${w.gameId}`)).json();
    expect(g.video).toEqual({ status: "READY", type: "video/mp4", bytes: 20 });

    const full = await call(t, w.player, "GET", `/api/v1/film/games/${w.gameId}/video`);
    expect(full.statusCode).toBe(200);
    expect(full.rawPayload.equals(body)).toBe(true);
    expect(full.headers["cache-control"]).toBe("private, no-store");

    const part = await call(t, w.player, "GET", `/api/v1/film/games/${w.gameId}/video`, undefined, { range: "bytes=5-9" });
    expect(part.statusCode).toBe(206);
    expect(part.headers["content-range"]).toBe("bytes 5-9/20");
    expect(part.body).toBe("56789");
    const tail = await call(t, w.player, "GET", `/api/v1/film/games/${w.gameId}/video`, undefined, { range: "bytes=-4" });
    expect(tail.body).toBe("ghij");
    expect((await call(t, w.player, "GET", `/api/v1/film/games/${w.gameId}/video`, undefined, { range: "bytes=50-60" })).statusCode).toBe(416);

    expect((await call(t, w.outsider, "GET", `/api/v1/film/games/${w.gameId}/video`)).statusCode).toBe(404);
    expect((await t.app.inject({ method: "GET", url: `/api/v1/film/games/${w.gameId}/video` })).statusCode).toBe(401);
  });

  it("rejects wrong types, oversized and empty uploads and leaves no files behind; replacing a video removes the old file", async () => {
    const t = await setup(50);
    const w = await world(t);
    const put = (headers: Record<string, string>, payload: Buffer) =>
      t.app.inject({ method: "PUT", url: `/api/v1/film/games/${w.gameId}/video`, headers: { cookie: w.coachU.cookie, ...headers }, payload });
    expect((await put({ "content-type": "text/html" }, Buffer.from("<script>"))).statusCode).toBe(415);
    const big = Buffer.alloc(100, 1);
    expect((await put({ "content-type": "video/mp4", "content-length": "100" }, big)).statusCode).toBe(413);
    // A client that lies about Content-Length is still cut off by the streaming limit.
    expect((await put({ "content-type": "video/mp4" }, big)).statusCode).toBe(413);
    expect((await put({ "content-type": "video/mp4" }, Buffer.alloc(0))).statusCode).toBe(400);
    const files = async () => (await readdir(join(t.dir, "film"), { recursive: true }).catch(() => [])).filter((f) => f.includes("."));
    expect(await files()).toEqual([]);
    expect((await put({ "content-type": "video/mp4" }, Buffer.from("first"))).statusCode).toBe(204);
    await new Promise((r) => setTimeout(r, 5));
    expect((await put({ "content-type": "video/webm" }, Buffer.from("second"))).statusCode).toBe(204);
    expect(await files()).toHaveLength(1);
    expect((await call(t, w.coachU, "GET", `/api/v1/film/games/${w.gameId}`)).json().video.type).toBe("video/webm");
  });

  it("clips: validated, tagged, filterable by tag, deletable by staff only", async () => {
    const t = await setup();
    const w = await world(t);
    const mk = (b: object) => call(t, w.coachU, "POST", `/api/v1/film/games/${w.gameId}/clips`, b);
    expect((await mk({ startMs: 5000, endMs: 5000 })).statusCode).toBe(400);
    expect((await mk({ startMs: 0, endMs: 11 * 60_000 })).statusCode).toBe(400);
    expect((await mk({ startMs: 0, endMs: 1000, tags: ["<b>x</b>"] })).statusCode).toBe(400);
    const a = await mk({ startMs: 20_000, endMs: 30_000, tags: ["Fast Break", "fast break", "Turnover"], note: "Missed rotation" });
    expect(a.statusCode).toBe(201);
    expect(a.json().tags).toEqual(["fast break", "turnover"]);
    await mk({ startMs: 1000, endMs: 4000, tags: ["pick and roll"] });
    const all = (await call(t, w.player, "GET", `/api/v1/film/games/${w.gameId}/clips`)).json().items;
    expect(all.map((c: { startMs: number }) => c.startMs)).toEqual([1000, 20000]);
    const tagged = (await call(t, w.player, "GET", `/api/v1/film/games/${w.gameId}/clips?tag=Turnover`)).json().items;
    expect(tagged).toHaveLength(1);
    expect((await call(t, w.outsider, "GET", `/api/v1/film/games/${w.gameId}/clips`)).statusCode).toBe(404);
    expect((await call(t, w.player, "DELETE", `/api/v1/film/games/${w.gameId}/clips/${a.json().id}`)).statusCode).toBe(404);
    expect((await call(t, w.coachU, "DELETE", `/api/v1/film/games/${w.gameId}/clips/${a.json().id}`)).statusCode).toBe(204);
    expect((await call(t, w.coachU, "DELETE", `/api/v1/film/games/${w.gameId}/clips/${a.json().id}`)).statusCode).toBe(404);
  });

  it("team membership: only staff manage it; removing a member ends their access; the creator can't be removed", async () => {
    const t = await setup();
    const w = await world(t);
    expect((await call(t, w.player, "POST", `/api/v1/teams/${w.teamId}/members`, { email: "out@example.com", role: "PLAYER" })).statusCode).toBe(404);
    expect((await call(t, w.outsider, "POST", `/api/v1/teams/${w.teamId}/members`, { email: "out@example.com", role: "PLAYER" })).statusCode).toBe(404);
    expect((await call(t, w.coachU, "POST", `/api/v1/teams/${w.teamId}/members`, { email: "nobody@example.com", role: "PLAYER" })).statusCode).toBe(404);
    expect((await call(t, w.player, "GET", "/api/v1/me/teams")).json().items.map((x: { name: string }) => x.name)).toEqual(["Hawks"]);
    expect((await call(t, w.coachU, "DELETE", `/api/v1/teams/${w.teamId}/members/${w.coachU.id}`)).statusCode).toBe(409);
    expect((await call(t, w.coachU, "DELETE", `/api/v1/teams/${w.teamId}/members/${w.player.id}`)).statusCode).toBe(204);
    expect((await call(t, w.player, "GET", `/api/v1/film/games/${w.gameId}`)).statusCode).toBe(404);
    expect((await call(t, w.player, "GET", "/api/v1/me/teams")).json().items).toEqual([]);
  });

  it("an under-18 player can only join once a guardian has consented to media use", async () => {
    const t = await setup();
    const w = await world(t);
    const kid = await user(t as never, "kid@example.com", teen);
    const parent = await user(t as never, "parent@example.com");
    const add = () => call(t, w.coachU, "POST", `/api/v1/teams/${w.teamId}/members`, { email: "kid@example.com", role: "PLAYER" });
    expect((await add()).statusCode).toBe(409);
    const rel = await call(t, kid, "POST", "/api/v1/guardians", { guardianEmail: "parent@example.com" });
    expect((await call(t, parent, "POST", `/api/v1/guardians/${rel.json().id}/accept`)).statusCode).toBe(204);
    expect((await add()).statusCode).toBe(409);
    expect((await call(t, parent, "PUT", "/api/v1/consents/MEDIA_USE", { subjectId: kid.id })).statusCode).toBe(204);
    expect((await add()).statusCode).toBe(201);
  });
});
