import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { testApp, user } from "./helpers.js";

type T = Awaited<ReturnType<typeof testApp>>;
type U = { id: string; cookie: string };
const post = (t: T, u: U, url: string, payload?: unknown) => t.app.inject({ method: "POST", url, headers: { cookie: u.cookie }, ...(payload ? { payload } : {}) });

let seq = 0;
const ev = (type: string, side?: "home" | "away", extra: Record<string, unknown> = {}) => ({
  id: randomUUID(), localSeq: ++seq, type, period: 1, ...(side ? { side } : {}), ...extra,
});

async function liveMatch() {
  const t = await testApp();
  const org = await user(t, "org@example.com");
  const keeper = await user(t, "keeper@example.com");
  const comp = (await post(t, org, "/api/v1/competitions", { name: "Cup", format: "ROUND_ROBIN" })).json();
  for (const name of ["Reds", "Blues"]) {
    const team = (await post(t, org, "/api/v1/teams", { name })).json();
    await post(t, org, `/api/v1/competitions/${comp.id}/teams`, { teamId: team.id });
  }
  const [match] = (await post(t, org, `/api/v1/competitions/${comp.id}/schedule`)).json().items;
  expect((await post(t, org, `/api/v1/competitions/${comp.id}/officials`, { email: "keeper@example.com", role: "SCOREKEEPER" })).statusCode).toBe(201);
  const url = `/api/v1/matches/${match.id}`;
  return { t, org, keeper, comp, match, url };
}

describe("live scoring", () => {
  it("records events, derives the score, starts the match, and is safe to retry", async () => {
    const { t, keeper, url } = await liveMatch();
    const events = [ev("GAME_START"), ev("FIELD_GOAL", "home"), ev("THREE_POINT", "away"), ev("FREE_THROW", "home"), ev("FIELD_GOAL_MISSED", "away")];
    const first = await post(t, keeper, `${url}/events`, { baseVersion: 0, events });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ accepted: 5, duplicates: 0, version: 5, state: { homeScore: 3, awayScore: 3 } });

    // The device never got the response and sends the same batch again.
    const retry = await post(t, keeper, `${url}/events`, { baseVersion: 0, events });
    expect(retry.json()).toMatchObject({ accepted: 0, duplicates: 5, version: 5, state: { homeScore: 3, awayScore: 3 } });

    const pub = await t.app.inject({ url: `${url}/state` });
    expect(pub.json()).toMatchObject({ matchState: "LIVE", homeScore: 3, awayScore: 3, version: 5 });
    expect((await t.app.inject({ url: `${url}/events?after=3` })).json().items).toHaveLength(2);
  });

  it("corrects a mistake with a compensating event and rejects invalid batches atomically", async () => {
    const { t, keeper, url } = await liveMatch();
    const wrong = ev("THREE_POINT", "home");
    await post(t, keeper, `${url}/events`, { events: [ev("GAME_START"), wrong] });
    const fix = await post(t, keeper, `${url}/events`, { events: [ev("CORRECTION", undefined, { correctsEventId: wrong.id }), ev("FIELD_GOAL", "home")] });
    expect(fix.json().state).toMatchObject({ homeScore: 2, version: 4 });

    // Second correction of the same event, bundled with a valid event: whole batch is refused.
    const bad = await post(t, keeper, `${url}/events`, { events: [ev("FIELD_GOAL", "away"), ev("CORRECTION", undefined, { correctsEventId: wrong.id })] });
    expect(bad.statusCode).toBe(422);
    expect((await t.app.inject({ url: `${url}/state` })).json()).toMatchObject({ awayScore: 0, version: 4 });

    expect((await post(t, keeper, `${url}/events`, { events: [ev("FIELD_GOAL")] })).statusCode).toBe(422); // scoring needs a side
    expect((await post(t, keeper, `${url}/events`, { events: [ev("CORRECTION", undefined, { correctsEventId: randomUUID() })] })).statusCode).toBe(422);
    expect((await post(t, keeper, `${url}/events`, { events: [] })).statusCode).toBe(400);
  });

  it("detects two scorers diverging and lets the second resend after reconciling", async () => {
    const { t, org, keeper, url } = await liveMatch();
    await post(t, keeper, `${url}/events`, { baseVersion: 0, events: [ev("GAME_START"), ev("FIELD_GOAL", "home")] });

    // The organizer's tablet last synced at version 0, so it is unaware of the keeper's two events.
    const stale = await post(t, org, `${url}/events`, { baseVersion: 0, events: [ev("FIELD_GOAL", "away")] });
    expect(stale.statusCode).toBe(409);
    expect(stale.headers["content-type"]).toContain("application/problem+json");
    expect(stale.json()).toMatchObject({ currentVersion: 2, state: { homeScore: 2, awayScore: 0 } });
    expect(stale.json().newerEvents).toHaveLength(2);
    expect((await t.app.inject({ url: `${url}/state` })).json().awayScore).toBe(0); // nothing was written

    const ok = await post(t, org, `${url}/events`, { baseVersion: 2, events: [ev("FIELD_GOAL", "away")] });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().state).toMatchObject({ homeScore: 2, awayScore: 2, version: 3 });

    // The keeper is now behind the organizer's event (seq 3), so they conflict too. Their own events never do.
    const own = await post(t, keeper, `${url}/events`, { baseVersion: 2, events: [ev("FREE_THROW", "home")] });
    expect(own.statusCode).toBe(409); // org's event (seq 3) is newer than keeper's baseVersion 2
    expect((await post(t, keeper, `${url}/events`, { baseVersion: 3, events: [ev("FREE_THROW", "home")] })).statusCode).toBe(200);
    expect((await post(t, keeper, `${url}/events`, { baseVersion: 3, events: [ev("FREE_THROW", "home")] })).statusCode).toBe(200); // own events don't conflict
  });

  it("finalizes into the official result, closes scoring, and refuses a tied score", async () => {
    const { t, keeper, comp, url } = await liveMatch();
    await post(t, keeper, `${url}/events`, { events: [ev("GAME_START"), ev("FIELD_GOAL", "home"), ev("FIELD_GOAL", "away")] });
    expect((await post(t, keeper, `${url}/finalize`)).statusCode).toBe(400); // 2-2

    await post(t, keeper, `${url}/events`, { events: [ev("THREE_POINT", "home"), ev("GAME_END")] });
    const done = await post(t, keeper, `${url}/finalize`);
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ state: "FINISHED", homeScore: 5, awayScore: 2 });

    expect((await post(t, keeper, `${url}/events`, { events: [ev("FIELD_GOAL", "home")] })).statusCode).toBe(409);
    const table = (await t.app.inject({ url: `/api/v1/competitions/${comp.id}/standings` })).json().items;
    expect(table[0]).toMatchObject({ name: expect.any(String), wins: 1, points: 2 });
  });

  it("only assigned officials can score; outsiders get 404 and anonymous gets 401", async () => {
    const { t, url } = await liveMatch();
    const outsider = await user(t, "out@example.com");
    expect((await post(t, outsider, `${url}/events`, { events: [ev("GAME_START")] })).statusCode).toBe(404);
    expect((await post(t, outsider, `${url}/finalize`)).statusCode).toBe(404);
    expect((await t.app.inject({ method: "POST", url: `${url}/events`, payload: { events: [ev("GAME_START")] } })).statusCode).toBe(401);
    expect((await post(t, outsider, `/api/v1/competitions/${randomUUID()}/officials`, { email: "x@example.com", role: "SCOREKEEPER" })).statusCode).toBe(404);
  });

  it("streams state updates to a connected viewer", async () => {
    const { t, keeper, url } = await liveMatch();
    await t.app.listen({ port: 0, host: "127.0.0.1" });
    const addr = t.app.server.address() as { port: number };
    const ctl = new AbortController();
    const res = await fetch(`http://127.0.0.1:${addr.port}${url}/stream`, { signal: ctl.signal });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const read = (async () => {
      let text = "";
      const dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return text;
        text += dec.decode(value);
        if (text.includes("match.state.updated")) return text;
      }
    })();
    await new Promise((r) => setTimeout(r, 100)); // let the subscription register
    await post(t, keeper, `${url}/events`, { events: [ev("GAME_START"), ev("THREE_POINT", "home")] });
    const text = await Promise.race([read, new Promise<string>((_, rej) => setTimeout(() => rej(new Error("no SSE message")), 5000))]);
    ctl.abort();
    const data = JSON.parse(text.split("\n").find((l) => l.startsWith("data: "))!.slice(6));
    expect(data).toMatchObject({ schemaVersion: 1, type: "match.state.updated", resourceVersion: 2, data: { homeScore: 3 } });
    await t.app.close();
  });
});
