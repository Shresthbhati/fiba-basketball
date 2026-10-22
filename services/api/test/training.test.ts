import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { testApp, user } from "./helpers.js";

type T = Awaited<ReturnType<typeof testApp>>;
type U = { id: string; cookie: string };
const post = (t: T, u: U | null, url: string, payload?: unknown) =>
  t.app.inject({ method: "POST", url, ...(u ? { headers: { cookie: u.cookie } } : {}), ...(payload ? { payload: payload as object } : {}) });
const call = (t: T, method: "GET" | "PATCH" | "DELETE", u: U | null, url: string, payload?: unknown) =>
  t.app.inject({ method, url, ...(u ? { headers: { cookie: u.cookie } } : {}), ...(payload ? { payload: payload as object } : {}) });

async function squatId(t: T) {
  const items = (await t.app.inject({ url: "/api/v1/exercises?category=STRENGTH" })).json().items;
  return items.find((e: { slug: string }) => e.slug === "back-squat").id as string;
}
const set = (exerciseId: string, over: Record<string, unknown> = {}) => ({ clientId: randomUUID(), exerciseId, reps: 8, loadKg: 60, rpe: 7, ...over });

async function workout(t: T, u: U, ex: string, sets: Record<string, unknown>[]) {
  const s = (await post(t, u, "/api/v1/training/sessions", {})).json();
  for (const x of sets) expect((await post(t, u, `/api/v1/training/sessions/${s.id}/sets`, set(ex, x))).statusCode).toBe(201);
  await post(t, u, `/api/v1/training/sessions/${s.id}/finish`, { sessionRpe: 7 });
  return s.id as string;
}

describe("exercise library", () => {
  it("is public, seeded, and every exercise is flagged as not yet reviewed", async () => {
    const t = await testApp();
    const all = (await t.app.inject({ url: "/api/v1/exercises" })).json().items;
    expect(all.length).toBeGreaterThanOrEqual(12);
    expect(all.every((e: { reviewed: boolean }) => e.reviewed === false)).toBe(true);
    const power = (await t.app.inject({ url: "/api/v1/exercises?category=POWER" })).json().items;
    expect(power.length).toBeGreaterThan(0);
    expect(power.every((e: { category: string }) => e.category === "POWER")).toBe(true);
    expect((await t.app.inject({ url: "/api/v1/exercises?category=NOPE" })).statusCode).toBe(400);
  });
});

describe("workout logging", () => {
  it("logs sets with automatic numbering, edits and deletes them, and finishing is harmless twice", async () => {
    const t = await testApp();
    const u = await user(t, "a@example.com");
    const ex = await squatId(t);
    const s = (await post(t, u, "/api/v1/training/sessions", { notes: "legs" })).json();
    const a = (await post(t, u, `/api/v1/training/sessions/${s.id}/sets`, set(ex))).json();
    const b = (await post(t, u, `/api/v1/training/sessions/${s.id}/sets`, set(ex, { reps: 6 }))).json();
    expect([a.setNumber, b.setNumber]).toEqual([1, 2]);
    expect(b.loadKg).toBe(60);

    const edited = (await call(t, "PATCH", u, `/api/v1/training/sets/${b.id}`, { reps: 7, rpe: null })).json();
    expect(edited).toMatchObject({ reps: 7, rpe: null, loadKg: 60 });
    expect((await call(t, "DELETE", u, `/api/v1/training/sets/${a.id}`)).statusCode).toBe(204);

    const detail = (await call(t, "GET", u, `/api/v1/training/sessions/${s.id}`)).json();
    expect(detail.sets).toHaveLength(1);
    const first = (await post(t, u, `/api/v1/training/sessions/${s.id}/finish`, { sessionRpe: 8 })).json();
    const second = (await post(t, u, `/api/v1/training/sessions/${s.id}/finish`, { sessionRpe: 2 })).json();
    expect(second.endedAt).toBe(first.endedAt);
    expect(second.sessionRpe).toBe(8); // the second call changed nothing
    const list = (await call(t, "GET", u, "/api/v1/training/sessions")).json().items;
    expect(list[0]).toMatchObject({ id: s.id, setCount: 1 });
  });

  it("is idempotent: resending the same set (lost response) does not add it twice", async () => {
    const t = await testApp();
    const u = await user(t, "a@example.com");
    const ex = await squatId(t);
    const s = (await post(t, u, "/api/v1/training/sessions", {})).json();
    const body = set(ex);
    const first = (await post(t, u, `/api/v1/training/sessions/${s.id}/sets`, body)).json();
    const again = (await post(t, u, `/api/v1/training/sessions/${s.id}/sets`, body)).json();
    expect(again.id).toBe(first.id);
    expect((await call(t, "GET", u, `/api/v1/training/sessions/${s.id}`)).json().sets).toHaveLength(1);
  });

  it("refuses sets on a finished workout and rejects bad input", async () => {
    const t = await testApp();
    const u = await user(t, "a@example.com");
    const ex = await squatId(t);
    const s = (await post(t, u, "/api/v1/training/sessions", {})).json();
    const url = `/api/v1/training/sessions/${s.id}/sets`;
    expect((await post(t, u, url, set(ex, { reps: 0 }))).statusCode).toBe(400);
    expect((await post(t, u, url, set(ex, { rpe: 11 }))).statusCode).toBe(400);
    expect((await post(t, u, url, set(ex, { loadKg: -5 }))).statusCode).toBe(400);
    expect((await post(t, u, url, set(randomUUID()))).statusCode).toBe(404);
    await post(t, u, `/api/v1/training/sessions/${s.id}/finish`, {});
    expect((await post(t, u, url, set(ex))).statusCode).toBe(409);
  });
});

describe("privacy", () => {
  it("everything is private to the owner: other users get 404 and anonymous gets 401", async () => {
    const t = await testApp();
    const owner = await user(t, "owner@example.com");
    const other = await user(t, "other@example.com");
    const ex = await squatId(t);
    const sid = await workout(t, owner, ex, [{}, {}]);
    const detail = (await call(t, "GET", owner, `/api/v1/training/sessions/${sid}`)).json();
    const setId = detail.sets[0].id;

    for (const [method, url, body] of [
      ["GET", `/api/v1/training/sessions/${sid}`, undefined],
      ["POST", `/api/v1/training/sessions/${sid}/finish`, {}],
      ["POST", `/api/v1/training/sessions/${sid}/sets`, set(ex)],
      ["PATCH", `/api/v1/training/sets/${setId}`, { reps: 1 }],
      ["DELETE", `/api/v1/training/sets/${setId}`, undefined],
    ] as const) {
      const res = method === "POST" ? await post(t, other, url, body) : await call(t, method, other, url, body);
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
    // nothing leaked into the other user's own lists, and nothing was changed
    expect((await call(t, "GET", other, "/api/v1/training/sessions")).json().items).toHaveLength(0);
    expect((await call(t, "GET", other, `/api/v1/training/history/${ex}`)).json()).toMatchObject({ sampleSize: 0, items: [] });
    expect((await call(t, "GET", owner, `/api/v1/training/sessions/${sid}`)).json().sets).toHaveLength(2);

    for (const url of ["/api/v1/training/sessions", `/api/v1/training/sessions/${sid}`, "/api/v1/training/wellness", `/api/v1/training/progression/${ex}`]) {
      expect((await call(t, "GET", null, url)).statusCode, url).toBe(401);
    }
    expect((await post(t, null, "/api/v1/training/sessions", {})).statusCode).toBe(401);
  });

  it("another user cannot reuse a set id from someone else's session", async () => {
    const t = await testApp();
    const owner = await user(t, "owner@example.com");
    const other = await user(t, "other@example.com");
    const ex = await squatId(t);
    const clientId = randomUUID();
    const s1 = (await post(t, owner, "/api/v1/training/sessions", {})).json();
    await post(t, owner, `/api/v1/training/sessions/${s1.id}/sets`, set(ex, { clientId }));
    const s2 = (await post(t, other, "/api/v1/training/sessions", {})).json();
    const res = await post(t, other, `/api/v1/training/sessions/${s2.id}/sets`, set(ex, { clientId }));
    expect(res.statusCode).toBe(409);
    expect(JSON.stringify(res.json())).not.toContain(s1.id);
  });
});

describe("history and progression", () => {
  it("history shows each workout and the sample size", async () => {
    const t = await testApp();
    const u = await user(t, "a@example.com");
    const ex = await squatId(t);
    await workout(t, u, ex, [{ loadKg: 60, reps: 8 }, { loadKg: 60, reps: 8 }]);
    await workout(t, u, ex, [{ loadKg: 62.5, reps: 8 }]);
    const h = (await call(t, "GET", u, `/api/v1/training/history/${ex}`)).json();
    expect(h.sampleSize).toBe(2);
    expect(h.items[0]).toMatchObject({ topLoadKg: 62.5, sets: 1, repsAtTopLoad: [8] }); // newest first
    expect(h.items[1]).toMatchObject({ topLoadKg: 60, sets: 2 });
  });

  it("suggests nothing with one workout, then an explained increase after two good ones", async () => {
    const t = await testApp();
    const u = await user(t, "a@example.com");
    const ex = await squatId(t);
    await workout(t, u, ex, [{ loadKg: 60, reps: 8, rpe: 7 }, { loadKg: 60, reps: 9, rpe: 7 }]);
    const one = (await call(t, "GET", u, `/api/v1/training/progression/${ex}`)).json();
    expect(one).toMatchObject({ action: "INSUFFICIENT_DATA", basedOnSessions: 1 });
    await workout(t, u, ex, [{ loadKg: 60, reps: 8, rpe: 7 }, { loadKg: 60, reps: 8, rpe: 8 }]);
    const two = (await call(t, "GET", u, `/api/v1/training/progression/${ex}`)).json();
    expect(two).toMatchObject({ action: "INCREASE", suggestedLoadKg: 61.25, basedOnSessions: 2 });
    expect(two.explanation).toContain("60 kg");
  });
});

describe("wellness and the pain safety stop", () => {
  it("a pain report pauses suggestions with calm, non-diagnostic wording; it is private and is replaced per day", async () => {
    const t = await testApp();
    const u = await user(t, "a@example.com");
    const other = await user(t, "other@example.com");
    const ex = await squatId(t);
    await workout(t, u, ex, [{ loadKg: 60, reps: 8, rpe: 6 }, { loadKg: 60, reps: 8, rpe: 6 }]);
    await workout(t, u, ex, [{ loadKg: 60, reps: 8, rpe: 6 }, { loadKg: 60, reps: 8, rpe: 6 }]);
    expect((await call(t, "GET", u, `/api/v1/training/progression/${ex}`)).json().action).toBe("INCREASE");

    const res = await post(t, u, "/api/v1/training/wellness", { painReported: true, painNote: "left knee", fatigue: 3 });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ trainingPaused: true, latest: { painReported: true, painNote: "left knee" } });
    expect(res.json().message).toBe("You reported pain. Training suggestions are paused. Please consider speaking to a qualified professional before continuing.");
    const paused = (await call(t, "GET", u, `/api/v1/training/progression/${ex}`)).json();
    expect(paused.action).toBe("HOLD");
    expect(paused.suggestedLoadKg).toBeUndefined();
    expect(JSON.stringify(paused).toLowerCase()).not.toMatch(/injur|diagnos/);

    expect((await call(t, "GET", other, "/api/v1/training/wellness")).json()).toMatchObject({ latest: null, trainingPaused: false });

    // Same day again, no pain: replaces the earlier entry (and drops the note); suggestions resume.
    const cleared = (await post(t, u, "/api/v1/training/wellness", { painReported: false, painNote: "ignored" })).json();
    expect(cleared).toMatchObject({ trainingPaused: false, message: null, latest: { painReported: false, painNote: null } });
    expect((await call(t, "GET", u, `/api/v1/training/progression/${ex}`)).json().action).toBe("INCREASE");
  });

  it("an old pain report (8+ days ago) no longer pauses suggestions; bad values are refused", async () => {
    const t = await testApp();
    const u = await user(t, "a@example.com");
    const old = new Date(Date.now() - 8 * 86_400_000).toISOString().slice(0, 10);
    expect((await post(t, u, "/api/v1/training/wellness", { date: old, painReported: true })).json().trainingPaused).toBe(false);
    const recent = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
    expect((await post(t, u, "/api/v1/training/wellness", { date: recent, painReported: true })).json().trainingPaused).toBe(true);
    expect((await post(t, u, "/api/v1/training/wellness", { painReported: false, fatigue: 9 })).statusCode).toBe(400);
    expect((await post(t, u, "/api/v1/training/wellness", { painReported: false, sleepHours: 30 })).statusCode).toBe(400);
  });
});
