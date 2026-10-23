import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { notifications, users } from "../src/db/schema.js";
import type { Mail, Mailer } from "../src/identity/mailer.js";
import { MemoryMailer } from "../src/identity/mailer.js";
import { deliverEmails } from "../src/notifications/email.js";
import { notify } from "../src/notifications/service.js";
import { testApp, user } from "./helpers.js";

const BASE = "https://app.example.com";
const MIN = 60_000;
type T = Awaited<ReturnType<typeof testApp>>;
const later = (ms: number) => new Date(Date.now() + ms);
const cancelled = (startsAt = "2027-03-14T22:00:00.000Z") => ({ kind: "GAME_CANCELLED" as const, title: 'Cancelled: "Run"', link: "/pickup/g1", data: { startsAt } });
const state = async (t: T, userId: string) => (await t.db.select().from(notifications).where(eq(notifications.userId, userId)))[0]!;

describe("notification emails", () => {
  it("emails a cancellation once, after a short delay, with the game time and a link", async () => {
    const t = await testApp();
    const a = await user(t, "a@example.com");
    const m = new MemoryMailer();
    await notify(t.db, [a.id], cancelled());
    expect(await deliverEmails(t.db, m, BASE)).toEqual({ sent: 0, skipped: 0, failed: 0 }); // too new
    expect(await deliverEmails(t.db, m, BASE, later(2 * MIN))).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect(m.sent).toHaveLength(1);
    expect(m.sent[0]).toMatchObject({ to: "a@example.com", subject: 'Cancelled: "Run"' });
    expect(m.sent[0]!.text).toContain("Game time: 2027-03-14 22:00 UTC");
    expect(m.sent[0]!.text).toContain(`${BASE}/pickup/g1`);
    expect(m.sent[0]!.text).toContain(`${BASE}/notifications`);
    expect((await state(t, a.id)).emailState).toBe("SENT");
    expect(await deliverEmails(t.db, m, BASE, later(5 * MIN))).toEqual({ sent: 0, skipped: 0, failed: 0 }); // never twice
  });

  it("skips what was already read, opted-out users, under-18 accounts, other kinds, and anything over a day old", async () => {
    const t = await testApp();
    const read = await user(t, "read@example.com");
    const out = await user(t, "out@example.com");
    const kid = await user(t, "kid@example.com", { dateOfBirth: `${new Date().getFullYear() - 15}-01-01` });
    const old = await user(t, "old@example.com");
    const team = await user(t, "team@example.com");
    const m = new MemoryMailer();
    for (const u of [read, out, kid, old]) await notify(t.db, [u.id], cancelled());
    await notify(t.db, [team.id], { kind: "ADDED_TO_TEAM", title: "You were added to Hawks", link: "/teams/t" });
    await t.db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.userId, read.id));
    await t.db.update(users).set({ emailNotifications: false }).where(eq(users.id, out.id));
    await t.db.update(notifications).set({ createdAt: new Date(Date.now() - 25 * 3_600_000) }).where(eq(notifications.userId, old.id));
    expect(await deliverEmails(t.db, m, BASE, later(2 * MIN))).toEqual({ sent: 0, skipped: 4, failed: 0 });
    expect(m.sent).toEqual([]);
    expect((await state(t, team.id)).emailState).toBeNull(); // not an emailed kind: left alone
    for (const u of [read, out, kid, old]) expect((await state(t, u.id)).emailState).toBe("SKIPPED");
  });

  it("retries a failed send and gives up after three attempts, without blocking others", async () => {
    const t = await testApp();
    const bad = await user(t, "bad@example.com");
    const good = await user(t, "good@example.com");
    const sent: Mail[] = [];
    const flaky: Mailer = { send: async (mail) => { if (mail.to === "bad@example.com") throw new Error("smtp down"); sent.push(mail); } };
    await notify(t.db, [bad.id, good.id], cancelled());
    expect(await deliverEmails(t.db, flaky, BASE, later(2 * MIN))).toEqual({ sent: 1, skipped: 0, failed: 1 });
    expect((await state(t, bad.id))).toMatchObject({ emailState: null, emailAttempts: 1 });
    await deliverEmails(t.db, flaky, BASE, later(3 * MIN));
    expect(await deliverEmails(t.db, flaky, BASE, later(4 * MIN))).toEqual({ sent: 0, skipped: 0, failed: 1 });
    expect((await state(t, bad.id))).toMatchObject({ emailState: "FAILED", emailAttempts: 3 });
    expect(await deliverEmails(t.db, flaky, BASE, later(5 * MIN))).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(sent.map((x) => x.to)).toEqual(["good@example.com"]);
  });

  it("two runs at once email each notification only once", async () => {
    const t = await testApp();
    const m = new MemoryMailer();
    const people = await Promise.all(["p1", "p2", "p3"].map((n) => user(t, `${n}@example.com`)));
    await notify(t.db, people.map((p) => p.id), cancelled());
    await Promise.all([deliverEmails(t.db, m, BASE, later(2 * MIN)), deliverEmails(t.db, m, BASE, later(2 * MIN))]);
    expect(m.sent.map((x) => x.to).sort()).toEqual(["p1@example.com", "p2@example.com", "p3@example.com"]);
  });

  it("settings: default on, can be turned off and on, minors are told it is not available, sign-in required", async () => {
    const t = await testApp();
    const a = await user(t, "a@example.com");
    const kid = await user(t, "kid@example.com", { dateOfBirth: `${new Date().getFullYear() - 15}-01-01` });
    const get = async (u: { cookie: string }) => (await t.app.inject({ method: "GET", url: "/api/v1/notifications/settings", headers: { cookie: u.cookie } })).json();
    const put = (u: { cookie: string }, body: object) => t.app.inject({ method: "PUT", url: "/api/v1/notifications/settings", headers: { cookie: u.cookie }, payload: body });
    expect(await get(a)).toEqual({ email: true, emailAvailable: true });
    expect((await put(a, { email: false })).statusCode).toBe(204);
    expect(await get(a)).toEqual({ email: false, emailAvailable: true });
    expect((await put(a, { email: "no" })).statusCode).toBe(400);
    expect((await put(a, { email: true })).statusCode).toBe(204);
    expect((await get(kid)).emailAvailable).toBe(false);
    expect((await t.app.inject({ method: "GET", url: "/api/v1/notifications/settings" })).statusCode).toBe(401);
  });
});
