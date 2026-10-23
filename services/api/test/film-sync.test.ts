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
import { videoMsOf } from "../src/film/sync.js";
import { MemoryMailer } from "../src/identity/mailer.js";
import { LocalDiskStorage } from "../src/media/storage.js";
import { plausibleTime } from "../src/match/events.js";
import { user } from "./helpers.js";

describe("pure helpers", () => {
  it("videoMsOf: real time maps 1:1 around the sync point, before and after", () => {
    const anchor = new Date("2027-03-14T18:10:00.000Z");
    expect(videoMsOf(new Date("2027-03-14T18:10:00.000Z"), anchor, 600_000)).toBe(600_000);
    expect(videoMsOf(new Date("2027-03-14T18:12:30.500Z"), anchor, 600_000)).toBe(750_500);
    expect(videoMsOf(new Date("2027-03-14T18:09:00.000Z"), anchor, 600_000)).toBe(540_000);
  });
  it("plausibleTime keeps sensible device clocks and drops silly ones", () => {
    const now = Date.parse("2027-03-14T18:00:00Z");
    expect(plausibleTime("2027-03-14T17:59:00Z", now)?.toISOString()).toBe("2027-03-14T17:59:00.000Z");
    expect(plausibleTime("2027-03-14T18:05:00Z", now)).not.toBeNull(); // a few minutes fast is fine
    expect(plausibleTime("2027-03-14T19:00:00Z", now)).toBeNull(); // an hour in the future
    expect(plausibleTime("2027-03-10T18:00:00Z", now)).toBeNull(); // days old
    expect(plausibleTime("nonsense", now)).toBeNull();
    expect(plausibleTime(undefined, now)).toBeNull();
  });
});

type U = { id: string; cookie: string };
async function setup() {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  const dir = await mkdtemp(join(tmpdir(), "sync-test-"));
  const app = await buildApp(db as unknown as Db, { secureCookies: false, requireVerifiedGuardianEmail: false, mailer: new MemoryMailer(), storage: new LocalDiskStorage(dir) });
  return { app, db: db as unknown as Db };
}
type T = Awaited<ReturnType<typeof setup>>;
const call = (t: T, u: U | null, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
  t.app.inject({ method, url, headers: u ? { cookie: u.cookie } : {}, ...(payload ? { payload } : {}) });
const usr = (t: T, email: string, over: Record<string, unknown> = {}) => user(t as never, email, over);

/** Team A (coach + rostered player) plays team B in a published competition; the coach has a film game for it. */
async function world(t: T) {
  const org = await usr(t, "org@example.com");
  const coachA = await usr(t, "ca@example.com");
  const coachB = await usr(t, "cb@example.com");
  const a1 = await usr(t, "a1@example.com", { displayName: "Ann One" });
  const b1 = await usr(t, "b1@example.com", { displayName: "Bea One" });
  const fan = await usr(t, "fan@example.com");
  const comp = (await call(t, org, "POST", "/api/v1/competitions", { name: "Cup", format: "ROUND_ROBIN" })).json().id as string;
  const teamA = (await call(t, coachA, "POST", "/api/v1/teams", { name: "Alpha" })).json().id as string;
  const teamB = (await call(t, coachB, "POST", "/api/v1/teams", { name: "Bravo" })).json().id as string;
  for (const team of [teamA, teamB]) await call(t, org, "POST", `/api/v1/competitions/${comp}/teams`, { teamId: team });
  await call(t, coachA, "POST", `/api/v1/teams/${teamA}/members`, { email: "a1@example.com", role: "PLAYER" });
  await call(t, coachB, "POST", `/api/v1/teams/${teamB}/members`, { email: "b1@example.com", role: "PLAYER" });
  await call(t, coachA, "PUT", `/api/v1/competitions/${comp}/teams/${teamA}/roster/${a1.id}`, { jersey: 7 });
  await call(t, coachB, "PUT", `/api/v1/competitions/${comp}/teams/${teamB}/roster/${b1.id}`, { jersey: 11 });
  const m = (await call(t, org, "POST", `/api/v1/competitions/${comp}/schedule`)).json().items[0] as { id: string; homeTeamId: string };
  const ours = (m.homeTeamId === teamA ? "home" : "away") as "home" | "away";
  const theirs = ours === "home" ? "away" : "home";
  const game = (await call(t, coachA, "POST", `/api/v1/teams/${teamA}/games`, { title: "vs Bravo" })).json().id as string;
  return { org, coachA, coachB, a1, b1, fan, teamA, teamB, matchId: m.id, ours, theirs, game };
}

// Events scored live at known wall-clock times (relative to "now"), e.g. t(0) = the first basket.
const T0 = Date.now() - 20 * 60_000;
const at = (sec: number) => new Date(T0 + sec * 1000).toISOString();
async function score(t: T, w: Awaited<ReturnType<typeof world>>) {
  const ids = { first: randomUUID(), second: randomUUID(), wrong: randomUUID(), untimed: randomUUID() };
  const r = await call(t, w.org, "POST", `/api/v1/matches/${w.matchId}/events`, { events: [
    { id: ids.first, localSeq: 1, type: "FIELD_GOAL", side: w.ours, period: 1, playerId: w.a1.id, occurredAt: at(0) },
    { id: ids.second, localSeq: 2, type: "THREE_POINT", side: w.theirs, period: 1, playerId: w.b1.id, occurredAt: at(95) },
    { id: ids.wrong, localSeq: 3, type: "FREE_THROW", side: w.ours, period: 1, occurredAt: at(120) },
    { id: randomUUID(), localSeq: 4, type: "CORRECTION", period: 1, correctsEventId: ids.wrong, occurredAt: at(121) },
    { id: ids.untimed, localSeq: 5, type: "TIMEOUT", side: w.ours, period: 1 }, // no recorded time
  ] });
  expect(r.statusCode).toBe(200);
  return ids;
}

describe("film sync with the scorebook", () => {
  it("stores event times (when plausible) and returns them", async () => {
    const t = await setup();
    const w = await world(t);
    await score(t, w);
    const ev = (await call(t, null, "GET", `/api/v1/matches/${w.matchId}/events`)).json().items;
    const timed = ev.filter((e: { occurredAt: string | null }) => e.occurredAt);
    expect(timed.length).toBe(4);
    const bad = await call(t, w.org, "POST", `/api/v1/matches/${w.matchId}/events`, { events: [{ id: randomUUID(), localSeq: 9, type: "FIELD_GOAL", side: w.ours, period: 1, occurredAt: "2001-01-01T00:00:00Z" }] });
    expect(bad.statusCode).toBe(200); // a bad device clock never blocks scoring; the time is just dropped
  });

  it("links a film to a match the team played in, and nothing else", async () => {
    const t = await setup();
    const w = await world(t);
    const other = await call(t, w.coachA, "POST", "/api/v1/teams", { name: "Elsewhere" });
    const otherGame = (await call(t, w.coachA, "POST", `/api/v1/teams/${other.json().id}/games`, { title: "x" })).json().id as string;
    expect((await call(t, w.coachA, "PUT", `/api/v1/film/games/${otherGame}/match`, { matchId: w.matchId })).statusCode).toBe(409); // that team isn't in the match
    const list = (await call(t, w.coachA, "GET", `/api/v1/teams/${w.teamA}/matches`)).json().items;
    expect(list).toEqual([expect.objectContaining({ id: w.matchId, competition: "Cup", home: expect.any(String), away: expect.any(String) })]);
    expect((await call(t, w.coachA, "PUT", `/api/v1/film/games/${w.game}/match`, { matchId: randomUUID() })).statusCode).toBe(409);
    expect((await call(t, w.coachA, "PUT", `/api/v1/film/games/${w.game}/match`, { matchId: w.matchId })).statusCode).toBe(204);
    expect((await call(t, w.coachA, "GET", `/api/v1/film/games/${w.game}`)).json()).toMatchObject({ matchId: w.matchId, synced: false });
    // Other people can't link, and outsiders can't even see the list.
    expect((await call(t, w.a1, "PUT", `/api/v1/film/games/${w.game}/match`, { matchId: w.matchId })).statusCode).toBe(404);
    expect((await call(t, w.fan, "GET", `/api/v1/teams/${w.teamA}/matches`)).statusCode).toBe(404);
    expect((await call(t, w.coachA, "DELETE", `/api/v1/film/games/${w.game}/match`)).statusCode).toBe(204);
    expect((await call(t, w.coachA, "GET", `/api/v1/film/games/${w.game}/timeline`)).json()).toEqual({ linked: false });
  });

  it("before syncing the timeline lists events without video positions; after, they line up with the video", async () => {
    const t = await setup();
    const w = await world(t);
    const ids = await score(t, w);
    await call(t, w.coachA, "PUT", `/api/v1/film/games/${w.game}/match`, { matchId: w.matchId });
    const before = (await call(t, w.coachA, "GET", `/api/v1/film/games/${w.game}/timeline`)).json();
    expect(before).toMatchObject({ linked: true, synced: false, ours: w.ours, untimed: 1 });
    expect(before.items.map((i: { videoMs: number | null }) => i.videoMs)).toEqual([null, null]); // corrected free throw and the correction are left out

    // The first basket happened 2:10 into the video.
    expect((await call(t, w.coachA, "PUT", `/api/v1/film/games/${w.game}/sync`, { eventId: ids.first, videoMs: 130_000 })).statusCode).toBe(204);
    const tl = (await call(t, w.coachA, "GET", `/api/v1/film/games/${w.game}/timeline`)).json();
    expect(tl.synced).toBe(true);
    expect(tl.syncPoints).toEqual([{ eventId: ids.first, videoMs: 130_000 }]);
    expect(tl.items.map((i: { type: string; videoMs: number }) => [i.type, i.videoMs])).toEqual([["FIELD_GOAL", 130_000], ["THREE_POINT", 225_000]]);
    // Running score is computed from the log, so the later basket shows the right score for its side.
    const total = (i: { homeScore: number; awayScore: number }) => i.homeScore + i.awayScore;
    expect(tl.items.map(total)).toEqual([2, 5]);
    // Players: jersey numbers for both sides, but a name only for our own team's player.
    expect(tl.items[0]).toMatchObject({ jersey: 7, playerName: "Ann One" });
    expect(tl.items[1].jersey).toBe(11);
    expect(tl.items[1]).not.toHaveProperty("playerName");
    expect((await call(t, w.a1, "GET", `/api/v1/film/games/${w.game}/timeline`)).statusCode).toBe(200); // team members can watch the timeline
    expect((await call(t, w.fan, "GET", `/api/v1/film/games/${w.game}/timeline`)).statusCode).toBe(404);
    expect((await call(t, w.coachB, "GET", `/api/v1/film/games/${w.game}/timeline`)).statusCode).toBe(404); // the opponent can't see our film
  });

  it("an event before the video starts has no position; relinking clears the sync", async () => {
    const t = await setup();
    const w = await world(t);
    const ids = await score(t, w);
    await call(t, w.coachA, "PUT", `/api/v1/film/games/${w.game}/match`, { matchId: w.matchId });
    // Sync says the SECOND basket (95 s after the first) is 60 s into the video; the first would be at -35 s: not in the video.
    await call(t, w.coachA, "PUT", `/api/v1/film/games/${w.game}/sync`, { eventId: ids.second, videoMs: 60_000 });
    const tl = (await call(t, w.coachA, "GET", `/api/v1/film/games/${w.game}/timeline`)).json();
    expect(tl.items.map((i: { videoMs: number | null }) => i.videoMs)).toEqual([null, 60_000]);
    await call(t, w.coachA, "PUT", `/api/v1/film/games/${w.game}/match`, { matchId: w.matchId });
    expect((await call(t, w.coachA, "GET", `/api/v1/film/games/${w.game}`)).json().synced).toBe(false);
  });

  it("sync needs a linked match and a real timed event from it; only staff can sync", async () => {
    const t = await setup();
    const w = await world(t);
    const ids = await score(t, w);
    const sync = (u: U, eventId: string, videoMs = 1000) => call(t, u, "PUT", `/api/v1/film/games/${w.game}/sync`, { eventId, videoMs });
    expect((await sync(w.coachA, ids.first)).statusCode).toBe(409); // not linked yet
    await call(t, w.coachA, "PUT", `/api/v1/film/games/${w.game}/match`, { matchId: w.matchId });
    expect((await sync(w.coachA, randomUUID())).statusCode).toBe(409); // not an event of this match
    expect((await sync(w.coachA, ids.untimed)).statusCode).toBe(409); // no recorded time
    expect((await sync(w.a1, ids.first)).statusCode).toBe(404); // players can't change it
    expect((await call(t, w.coachA, "PUT", `/api/v1/film/games/${w.game}/sync`, { eventId: ids.first, videoMs: -5 })).statusCode).toBe(400);
    expect((await sync(w.coachA, ids.first)).statusCode).toBe(204);
  });

  it("several sync points: each event uses the nearest one, so a cut in the video only skews what is near it", async () => {
    const t = await setup();
    const w = await world(t);
    const ids = await score(t, w); // first at t0, second at t0+95s, wrong (corrected) at +120
    await call(t, w.coachA, "PUT", `/api/v1/film/games/${w.game}/match`, { matchId: w.matchId });
    const late = randomUUID();
    await call(t, w.org, "POST", `/api/v1/matches/${w.matchId}/events`, { events: [{ id: late, localSeq: 20, type: "FIELD_GOAL", side: w.ours, period: 2, occurredAt: at(1800) }] });
    // Pairing 1: first basket at 10 s. Pairing 2: the late basket (30 min later) at 1,900 s, i.e. the video lost 10 s in between (a cut).
    const sync = (eventId: string, videoMs: number) => call(t, w.coachA, "PUT", `/api/v1/film/games/${w.game}/sync`, { eventId, videoMs });
    expect((await sync(ids.first, 10_000)).statusCode).toBe(204);
    expect((await sync(late, 1_790_000)).statusCode).toBe(204);
    const tl = (await call(t, w.coachA, "GET", `/api/v1/film/games/${w.game}/timeline`)).json();
    const pos = Object.fromEntries(tl.items.map((i: { id: string; videoMs: number }) => [i.id, i.videoMs]));
    expect(pos[ids.first]).toBe(10_000); // from point 1
    expect(pos[ids.second]).toBe(105_000); // 95 s after the first, nearest to point 1
    expect(pos[late]).toBe(1_790_000); // exactly point 2
    // Re-sending the same event replaces its position instead of adding a point.
    expect((await sync(ids.first, 12_000)).statusCode).toBe(204);
    expect((await call(t, w.coachA, "GET", `/api/v1/film/games/${w.game}/timeline`)).json().syncPoints).toHaveLength(2);
    // Removing a point: staff only, 404 if it isn't one.
    expect((await call(t, w.a1, "DELETE", `/api/v1/film/games/${w.game}/sync/${late}`)).statusCode).toBe(404);
    expect((await call(t, w.coachA, "DELETE", `/api/v1/film/games/${w.game}/sync/${late}`)).statusCode).toBe(204);
    expect((await call(t, w.coachA, "DELETE", `/api/v1/film/games/${w.game}/sync/${late}`)).statusCode).toBe(404);
    const after = (await call(t, w.coachA, "GET", `/api/v1/film/games/${w.game}/timeline`)).json();
    expect(after.syncPoints).toEqual([{ eventId: ids.first, videoMs: 12_000 }]);
    // Remove the last one: back to "not lined up".
    await call(t, w.coachA, "DELETE", `/api/v1/film/games/${w.game}/sync/${ids.first}`);
    expect((await call(t, w.coachA, "GET", `/api/v1/film/games/${w.game}`)).json().synced).toBe(false);
  });

  it("is capped at 20 sync points", async () => {
    const t = await setup();
    const w = await world(t);
    await call(t, w.coachA, "PUT", `/api/v1/film/games/${w.game}/match`, { matchId: w.matchId });
    const events = Array.from({ length: 21 }, (_, i) => ({ id: randomUUID(), localSeq: i + 1, type: "FIELD_GOAL", side: w.ours, period: 1, occurredAt: at(i * 10) }));
    await call(t, w.org, "POST", `/api/v1/matches/${w.matchId}/events`, { events });
    const put = (e: { id: string }, ms: number) => call(t, w.coachA, "PUT", `/api/v1/film/games/${w.game}/sync`, { eventId: e.id, videoMs: ms });
    for (let i = 0; i < 20; i++) expect((await put(events[i]!, i * 10_000)).statusCode).toBe(204);
    expect((await put(events[20]!, 200_000)).statusCode).toBe(409);
    expect((await put(events[0]!, 5)).statusCode).toBe(204); // changing an existing one is still fine
  });

  it("relinking to a match clears the old sync points", async () => {
    const t = await setup();
    const w = await world(t);
    const ids = await score(t, w);
    await call(t, w.coachA, "PUT", `/api/v1/film/games/${w.game}/match`, { matchId: w.matchId });
    await call(t, w.coachA, "PUT", `/api/v1/film/games/${w.game}/sync`, { eventId: ids.first, videoMs: 1000 });
    await call(t, w.coachA, "DELETE", `/api/v1/film/games/${w.game}/match`);
    await call(t, w.coachA, "PUT", `/api/v1/film/games/${w.game}/match`, { matchId: w.matchId });
    expect((await call(t, w.coachA, "GET", `/api/v1/film/games/${w.game}/timeline`)).json()).toMatchObject({ synced: false, syncPoints: [] });
  });
});
