import { beforeEach, describe, expect, it } from "vitest";
import { ApiError, NetworkError } from "../lib/api";
import { ScoreQueue, type Post, type Saved, type Store } from "../lib/score-queue";
import { project } from "../../../services/api/src/match/projection";

const memStore = (): Store & { data: Map<string, Saved> } => {
  const data = new Map<string, Saved>();
  return { data, load: (k) => data.get(k) ?? null, save: (k, v) => void data.set(k, structuredClone(v)) };
};

/** A tiny in-memory stand-in for the real endpoint: idempotent by event id, conflicts on stale baseVersion from another user. */
function fakeServer() {
  const log: { id: string; serverSeq: number; type: string; side?: string; period: number; by: string; correctsEventId?: string }[] = [];
  let online = true;
  let dropNextResponse = false;
  const stateOf = () => {
    const s = project(log.map((e) => ({ id: e.id, serverSeq: e.serverSeq, type: e.type as never, side: (e.side ?? null) as never, period: e.period, correctsEventId: e.correctsEventId ?? null })));
    return { version: s.version, homeScore: s.homeScore, awayScore: s.awayScore, period: s.period };
  };
  const postAs = (user: string): Post => async (_p, body) => {
    if (!online) throw new NetworkError("offline");
    const b = body as { baseVersion?: number; events: { id: string; type: string; side?: string; period: number; correctsEventId?: string }[] };
    const fresh = b.events.filter((e) => !log.some((l) => l.id === e.id));
    const newer = log.filter((l) => l.serverSeq > (b.baseVersion ?? 0) && l.by !== user);
    if (fresh.length && newer.length) {
      throw new ApiError(409, "conflict", { currentVersion: log.at(-1)!.serverSeq, state: stateOf(), newerEvents: newer });
    }
    for (const e of fresh) log.push({ ...e, serverSeq: log.length + 1, by: user });
    const result = { version: log.length, accepted: fresh.length, duplicates: b.events.length - fresh.length, state: stateOf() };
    if (dropNextResponse) { dropNextResponse = false; throw new NetworkError("response lost"); }
    return result;
  };
  return { log, postAs, setOnline: (v: boolean) => (online = v), loseNextResponse: () => (dropNextResponse = true), stateOf };
}

describe("ScoreQueue", () => {
  let store: ReturnType<typeof memStore>;
  beforeEach(() => { store = memStore(); });

  it("offline: queues 10 events, shows the score, then syncs and matches the server", async () => {
    const srv = fakeServer();
    const q = new ScoreQueue("m1", srv.postAs("a"), store);
    srv.setOnline(false);
    for (let i = 0; i < 5; i++) q.add("FIELD_GOAL", { side: "home", period: 1 });
    for (let i = 0; i < 4; i++) q.add("THREE_POINT", { side: "away", period: 1 });
    q.add("FREE_THROW", { side: "home", period: 1 });
    expect(q.score).toEqual({ home: 11, away: 12 });
    expect(await q.sync()).toBe("offline");
    expect(q.pendingCount).toBe(10);

    srv.setOnline(true);
    expect(await q.sync()).toBe("idle");
    expect(q.pendingCount).toBe(0);
    expect(q.score).toEqual({ home: 11, away: 12 });
    expect(srv.stateOf()).toMatchObject({ homeScore: 11, awayScore: 12 });
  });

  it("survives a reload: pending events are restored from storage", async () => {
    const srv = fakeServer();
    srv.setOnline(false);
    const q1 = new ScoreQueue("m1", srv.postAs("a"), store);
    q1.add("FIELD_GOAL", { side: "home", period: 1 });
    await q1.sync();
    const q2 = new ScoreQueue("m1", srv.postAs("a"), store); // page reloaded
    expect(q2.pendingCount).toBe(1);
    srv.setOnline(true);
    await q2.sync();
    expect(srv.stateOf().homeScore).toBe(2);
  });

  it("a lost response does not double count when the same events are resent", async () => {
    const srv = fakeServer();
    const q = new ScoreQueue("m1", srv.postAs("a"), store);
    q.add("FIELD_GOAL", { side: "home", period: 1 });
    srv.loseNextResponse();
    expect(await q.sync()).toBe("offline");
    expect(srv.log).toHaveLength(1); // server did store it
    expect(await q.sync()).toBe("idle");
    expect(srv.log).toHaveLength(1);
    expect(srv.stateOf().homeScore).toBe(2);
  });

  it("undo cancels the last unsent event with a correction", async () => {
    const srv = fakeServer();
    const q = new ScoreQueue("m1", srv.postAs("a"), store);
    q.add("FIELD_GOAL", { side: "home", period: 1 });
    q.add("THREE_POINT", { side: "away", period: 1 });
    q.undoLast(1);
    expect(q.score).toEqual({ home: 2, away: 0 });
    q.undoLast(1);
    expect(q.score).toEqual({ home: 0, away: 0 });
    expect(q.undoLast(1)).toBeNull();
    await q.sync();
    expect(srv.stateOf()).toMatchObject({ homeScore: 0, awayScore: 0 });
  });

  it("dual device: second scorer gets a conflict, reviews it, resends, and totals are right", async () => {
    const srv = fakeServer();
    const a = new ScoreQueue("m1", srv.postAs("a"), memStore());
    const b = new ScoreQueue("m1", srv.postAs("b"), memStore());
    a.add("FIELD_GOAL", { side: "home", period: 1 });
    await a.sync();
    b.add("THREE_POINT", { side: "away", period: 1 });
    expect(await b.sync()).toBe("conflict");
    expect(b.conflict?.newerEvents).toHaveLength(1);
    expect(b.pendingCount).toBe(1); // nothing lost
    expect(await b.sync()).toBe("conflict"); // stays blocked until the scorer decides
    expect(await b.acceptConflictAndResend()).toBe("idle");
    expect(srv.stateOf()).toMatchObject({ homeScore: 2, awayScore: 3 });
    expect(b.score).toEqual({ home: 2, away: 3 });
  });

  it("can discard its own unsent events after a conflict", async () => {
    const srv = fakeServer();
    const a = new ScoreQueue("m1", srv.postAs("a"), memStore());
    const b = new ScoreQueue("m1", srv.postAs("b"), memStore());
    a.add("FIELD_GOAL", { side: "home", period: 1 });
    await a.sync();
    b.add("FIELD_GOAL", { side: "home", period: 1 }); // same basket entered by both devices
    await b.sync();
    b.discardPendingAndReset();
    expect(b.pendingCount).toBe(0);
    expect(b.score).toEqual({ home: 2, away: 0 });
    expect(srv.stateOf().homeScore).toBe(2);
  });
});
