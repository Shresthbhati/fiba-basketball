import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { pickupGames, notifications } from "../src/db/schema.js";
import { markRead, notify } from "../src/notifications/service.js";
import { testApp, user } from "./helpers.js";

type T = Awaited<ReturnType<typeof testApp>>;
type U = { id: string; cookie: string };
const call = (t: T, u: U | null, method: "GET" | "POST" | "DELETE", url: string, payload?: object) =>
  t.app.inject({ method, url, headers: u ? { cookie: u.cookie } : {}, ...(payload ? { payload } : {}) });
const inbox = async (t: T, u: U) => (await call(t, u, "GET", "/api/v1/notifications")).json() as { items: { id: string; kind: string; title: string; link: string | null; read: boolean }[]; unread: number };

async function game(t: T, capacity = 2) {
  const host = await user(t, "host@example.com");
  const court = (await call(t, host, "POST", "/api/v1/courts", { name: "Rucker", lat: 40.8, lng: -73.9 })).json().id as string;
  const g = (await call(t, host, "POST", "/api/v1/pickup", {
    courtId: court, title: "Run", capacity, startsAt: new Date(Date.now() + 3_600_000 * 5).toISOString(), endsAt: new Date(Date.now() + 3_600_000 * 7).toISOString(),
  })).json().id as string;
  return { host, g, court };
}

describe("notifications", () => {
  it("requires sign-in and starts empty", async () => {
    const t = await testApp();
    expect((await call(t, null, "GET", "/api/v1/notifications")).statusCode).toBe(401);
    const a = await user(t, "a@example.com");
    expect(await inbox(t, a)).toEqual({ items: [], unread: 0 });
  });

  it("cancelling a game tells confirmed and waitlisted players, not the host, not people who left", async () => {
    const t = await testApp();
    const { host, g } = await game(t, 2);
    const b = await user(t, "b@example.com");
    const c = await user(t, "c@example.com");
    const d = await user(t, "d@example.com");
    for (const u of [b, c, d]) await call(t, u, "POST", `/api/v1/pickup/${g}/rsvp`); // b confirmed; c, d waitlisted
    await call(t, d, "DELETE", `/api/v1/pickup/${g}/rsvp`); // d leaves
    expect((await inbox(t, c)).items).toEqual([]);
    expect((await call(t, host, "POST", `/api/v1/pickup/${g}/cancel`)).statusCode).toBe(204);
    for (const u of [b, c]) {
      const n = await inbox(t, u);
      expect(n.unread).toBe(1);
      expect(n.items[0]).toMatchObject({ kind: "GAME_CANCELLED", title: 'Cancelled: "Run"', link: `/pickup/${g}`, read: false });
    }
    expect((await inbox(t, host)).items).toEqual([]);
    expect((await inbox(t, d)).items).toEqual([]);
  });

  it("promoting someone off the waitlist tells only them", async () => {
    const t = await testApp();
    const { g } = await game(t, 2);
    const b = await user(t, "b@example.com");
    const c = await user(t, "c@example.com");
    await call(t, b, "POST", `/api/v1/pickup/${g}/rsvp`);
    await call(t, c, "POST", `/api/v1/pickup/${g}/rsvp`); // waitlisted
    expect((await inbox(t, c)).items).toEqual([]);
    await call(t, b, "DELETE", `/api/v1/pickup/${g}/rsvp`);
    const n = await inbox(t, c);
    expect(n.items).toHaveLength(1);
    expect(n.items[0]).toMatchObject({ kind: "WAITLIST_PROMOTED", link: `/pickup/${g}` });
    expect((await inbox(t, b)).items).toEqual([]);
  });

  it("stopping a weekly series tells players in each upcoming game", async () => {
    const t = await testApp();
    const host = await user(t, "host@example.com");
    const court = (await call(t, host, "POST", "/api/v1/courts", { name: "Rucker", lat: 40.8, lng: -73.9 })).json().id as string;
    const s = (await call(t, host, "POST", "/api/v1/pickup/series", { courtId: court, title: "Sunday", weekday: 0, startTime: "18:00", durationMin: 120, timezone: "UTC", capacity: 10 })).json().id as string;
    const games = await t.db.select().from(pickupGames).where(eq(pickupGames.seriesId, s));
    const p = await user(t, "p@example.com");
    for (const g of games.slice(0, 2)) await call(t, p, "POST", `/api/v1/pickup/${g.id}/rsvp`);
    await call(t, host, "POST", `/api/v1/pickup/series/${s}/cancel`);
    expect((await inbox(t, p)).items.map((n) => n.kind)).toEqual(["GAME_CANCELLED", "GAME_CANCELLED"]);
  });

  it("adding someone to a team tells them", async () => {
    const t = await testApp();
    const coach = await user(t, "coach@example.com");
    const p = await user(t, "p@example.com");
    const team = (await call(t, coach, "POST", "/api/v1/teams", { name: "Hawks" })).json().id as string;
    await call(t, coach, "POST", `/api/v1/teams/${team}/members`, { email: "p@example.com", role: "PLAYER" });
    expect((await inbox(t, p)).items[0]).toMatchObject({ kind: "ADDED_TO_TEAM", title: "You were added to Hawks", link: `/teams/${team}` });
  });

  it("mark read: one, all, and never someone else's", async () => {
    const t = await testApp();
    const a = await user(t, "a@example.com");
    const b = await user(t, "b@example.com");
    await notify(t.db, [a.id], { kind: "ADDED_TO_TEAM", title: "one" });
    await notify(t.db, [a.id], { kind: "ADDED_TO_TEAM", title: "two" });
    await notify(t.db, [b.id], { kind: "ADDED_TO_TEAM", title: "bee" });
    const mine = await inbox(t, a);
    expect(mine.unread).toBe(2);
    const bId = (await inbox(t, b)).items[0]!.id;
    // a tries to mark b's notification (and one of their own) as read: only their own changes.
    expect((await call(t, a, "POST", "/api/v1/notifications/read", { ids: [bId, mine.items[0]!.id] })).statusCode).toBe(204);
    expect((await inbox(t, a)).unread).toBe(1);
    expect((await inbox(t, b)).unread).toBe(1);
    expect((await call(t, a, "POST", "/api/v1/notifications/read", {})).statusCode).toBe(204);
    expect((await inbox(t, a)).unread).toBe(0);
    expect((await call(t, a, "POST", "/api/v1/notifications/read", { ids: ["not-a-uuid"] })).statusCode).toBe(400);
    await markRead(t.db, a.id);
    expect((await t.db.select().from(notifications).where(eq(notifications.userId, b.id)))).toHaveLength(1);
  });
});
