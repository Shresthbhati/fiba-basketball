import { describe, expect, it } from "vitest";
import { ApiError, NetworkError } from "../lib/api";
import { SetQueue, type SetPost, type SetStore } from "../lib/set-queue";

const store = (): SetStore & { data: Map<string, { pending: unknown[] }> } => {
  const data = new Map<string, { pending: unknown[] }>();
  return { data, load: (k) => (data.get(k) as never) ?? null, save: (k, v) => void data.set(k, structuredClone(v)) };
};
const ex = "11111111-1111-4111-8111-111111111111";

describe("SetQueue", () => {
  it("sends sets in order and empties the queue", async () => {
    const sent: { reps: number }[] = [];
    const q = new SetQueue("s1", async (_p, b) => void sent.push(b as { reps: number }), store());
    q.add({ exerciseId: ex, reps: 8 });
    q.add({ exerciseId: ex, reps: 7 });
    expect(await q.sync()).toBe("idle");
    expect(sent.map((s) => s.reps)).toEqual([8, 7]);
    expect(q.items).toHaveLength(0);
  });

  it("keeps sets when offline and sends them later; the queue survives a reload", async () => {
    const st = store();
    let online = false;
    const received: string[] = [];
    const post: SetPost = async (_p, b) => { if (!online) throw new NetworkError("offline"); received.push((b as { clientId: string }).clientId); };
    const q1 = new SetQueue("s1", post, st);
    q1.add({ exerciseId: ex, reps: 8, loadKg: 60 });
    q1.add({ exerciseId: ex, reps: 8, loadKg: 60 });
    expect(await q1.sync()).toBe("offline");
    expect(q1.items).toHaveLength(2);

    const q2 = new SetQueue("s1", post, st); // page reloaded
    expect(q2.items).toHaveLength(2);
    online = true;
    expect(await q2.sync()).toBe("idle");
    expect(received).toHaveLength(2);
    expect(new Set(received).size).toBe(2);
  });

  it("resends the same id after a lost response, so the server can ignore the duplicate", async () => {
    const seen: string[] = [];
    let lose = true;
    const post: SetPost = async (_p, b) => { seen.push((b as { clientId: string }).clientId); if (lose) { lose = false; throw new NetworkError("response lost"); } };
    const q = new SetQueue("s1", post, store());
    q.add({ exerciseId: ex, reps: 5 });
    expect(await q.sync()).toBe("offline");
    expect(await q.sync()).toBe("idle");
    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(seen[1]);
  });

  it("drops a set the server refuses for good, reports why, and keeps going", async () => {
    const post: SetPost = async (_p, b) => { if ((b as { reps: number }).reps === 1) throw new ApiError(409, "This workout is finished"); };
    const q = new SetQueue("s1", post, store());
    q.add({ exerciseId: ex, reps: 1 });
    q.add({ exerciseId: ex, reps: 9 });
    expect(await q.sync()).toBe("idle");
    expect(q.items).toHaveLength(0);
    expect(q.rejected).toEqual(["This workout is finished"]);
  });

  it("asks you to log in on 401 and keeps the sets; treats server errors as retry-later", async () => {
    let code = 401;
    const post: SetPost = async () => { throw new ApiError(code, "nope"); };
    const q = new SetQueue("s1", post, store());
    q.add({ exerciseId: ex, reps: 8 });
    expect(await q.sync()).toBe("signin");
    expect(q.items).toHaveLength(1);
    code = 500;
    expect(await q.sync()).toBe("offline");
    expect(q.items).toHaveLength(1);
    expect(q.rejected).toEqual([]);
  });

  it("can remove a not-yet-sent set", async () => {
    const q = new SetQueue("s1", async () => undefined, store());
    const a = q.add({ exerciseId: ex, reps: 8 });
    q.add({ exerciseId: ex, reps: 9 });
    q.remove(a.clientId);
    expect(q.items.map((i) => i.reps)).toEqual([9]);
  });
});
