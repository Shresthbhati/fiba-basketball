import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { pickupGames, pickupParticipants } from "../src/db/schema.js";
import { cancelSeries, materializeAll, occurrences, zonedTimeToUtc } from "../src/pickup/series.js";
import { testApp, user } from "./helpers.js";

const iso = (d: Date) => d.toISOString();

describe("zonedTimeToUtc", () => {
  it("applies the right offset on either side of daylight saving", () => {
    // New York: EST (UTC-5) before 2027-03-14, EDT (UTC-4) after.
    expect(iso(zonedTimeToUtc(2027, 3, 13, 18, 0, "America/New_York"))).toBe("2027-03-13T23:00:00.000Z");
    expect(iso(zonedTimeToUtc(2027, 3, 15, 18, 0, "America/New_York"))).toBe("2027-03-15T22:00:00.000Z");
    expect(iso(zonedTimeToUtc(2027, 11, 8, 18, 0, "America/New_York"))).toBe("2027-11-08T23:00:00.000Z");
    expect(iso(zonedTimeToUtc(2027, 6, 1, 9, 30, "Asia/Kolkata"))).toBe("2027-06-01T04:00:00.000Z"); // UTC+5:30, no DST
    expect(iso(zonedTimeToUtc(2027, 6, 1, 9, 0, "UTC"))).toBe("2027-06-01T09:00:00.000Z");
  });
  it("keeps a series at the same local time across the spring-forward change", () => {
    const s = { weekday: 0, startTime: "18:00", timezone: "America/New_York" }; // Sundays 6pm
    const found = occurrences(s, new Date("2027-03-01T00:00:00Z"), 28);
    expect(found.map(iso)).toEqual([
      "2027-03-07T23:00:00.000Z", // EST
      "2027-03-14T22:00:00.000Z", // EDT (the change happens at 2am that day)
      "2027-03-21T22:00:00.000Z",
      "2027-03-28T22:00:00.000Z",
    ]);
  });
  it("uses the series' own time zone to decide which day it is", () => {
    // 2027-06-01T02:00Z is Monday 31 May 22:00 in New York but Tuesday 1 June 11:00 in Tokyo.
    const now = new Date("2027-06-01T02:00:00Z");
    // Monday 8pm in New York already passed today (it was 00:00Z), so the next one is a week later.
    expect(occurrences({ weekday: 1, startTime: "20:00", timezone: "America/New_York" }, now, 7).map(iso)).toEqual(["2027-06-08T00:00:00.000Z"]);
    // Tuesday 8pm in Tokyo is later today there.
    expect(occurrences({ weekday: 2, startTime: "20:00", timezone: "Asia/Tokyo" }, now, 8).map(iso)).toEqual(["2027-06-01T11:00:00.000Z", "2027-06-08T11:00:00.000Z"]);
  });
  it("never returns a start in the past", () => {
    const now = new Date("2027-06-01T12:00:00Z");
    expect(occurrences({ weekday: 2, startTime: "07:00", timezone: "UTC" }, now, 1)).toEqual([]);
  });
});

async function setup() {
  const t = await testApp();
  const host = await user(t, "host@example.com");
  const court = await t.app.inject({ method: "POST", url: "/api/v1/courts", headers: { cookie: host.cookie }, payload: { name: "Rucker", lat: 40.8, lng: -73.9 } });
  return { t, host, courtId: court.json().id as string };
}
type T = Awaited<ReturnType<typeof setup>>["t"];
const post = (t: T, u: { cookie: string }, url: string, payload?: object) =>
  t.app.inject({ method: "POST", url, headers: { cookie: u.cookie }, ...(payload ? { payload } : {}) });
const series = (courtId: string, over: object = {}) => ({
  courtId, title: "Sunday run", weekday: 0, startTime: "18:00", durationMin: 120, timezone: "America/New_York", capacity: 10, ...over,
});
const gamesOf = async (t: T, seriesId: string) =>
  (await t.db.select().from(pickupGames).where(eq(pickupGames.seriesId, seriesId))).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

describe("recurring pickup", () => {
  it("creates the coming weeks of games with the host confirmed, and re-running adds nothing", async () => {
    const { t, host, courtId } = await setup();
    const res = await post(t, host, "/api/v1/pickup/series", series(courtId));
    expect(res.statusCode).toBe(201);
    const id = res.json().id as string;
    expect(res.json().createdGames).toBeGreaterThanOrEqual(4);
    const games = await gamesOf(t, id);
    expect(games).toHaveLength(res.json().createdGames);
    for (const g of games) {
      expect(g.startsAt.getTime()).toBeGreaterThan(Date.now());
      expect(g.endsAt.getTime() - g.startsAt.getTime()).toBe(2 * 3_600_000);
      expect(g.hostId).toBe(host.id);
      const roster = await t.db.select().from(pickupParticipants).where(eq(pickupParticipants.gameId, g.id));
      expect(roster.map((r) => [r.userId, r.status])).toEqual([[host.id, "CONFIRMED"]]);
    }
    expect(await materializeAll(t.db)).toBe(0);
    expect(await gamesOf(t, id)).toHaveLength(games.length);
    // Later, the horizon moves forward and only the new week is added.
    const later = new Date(Date.now() + 7 * 86_400_000);
    expect(await materializeAll(t.db, later)).toBe(1);
  });

  it("a cancelled occurrence stays cancelled when the series is refreshed", async () => {
    const { t, host, courtId } = await setup();
    const id = (await post(t, host, "/api/v1/pickup/series", series(courtId))).json().id as string;
    const [first] = await gamesOf(t, id);
    expect((await post(t, host, `/api/v1/pickup/${first!.id}/cancel`)).statusCode).toBe(204);
    expect(await materializeAll(t.db)).toBe(0);
    expect((await gamesOf(t, id))[0]!.status).toBe("CANCELLED");
  });

  it("people can join an occurrence like any game, and the games show up in search", async () => {
    const { t, host, courtId } = await setup();
    const id = (await post(t, host, "/api/v1/pickup/series", series(courtId))).json().id as string;
    const [first] = await gamesOf(t, id);
    const p = await user(t, "p@example.com");
    expect((await post(t, p, `/api/v1/pickup/${first!.id}/rsvp`)).json()).toEqual({ status: "CONFIRMED" });
    const found = await t.app.inject({ method: "GET", url: `/api/v1/pickup?lat=40.8&lng=-73.9&radius_m=1000&to=${new Date(Date.now() + 40 * 86_400_000).toISOString()}` });
    expect(found.json().items.filter((g: { seriesId: string }) => g.seriesId === id).length).toBeGreaterThanOrEqual(4);
  });

  it("only the host can cancel a series; it cancels future games, keeps played ones, and stops new ones", async () => {
    const { t, host, courtId } = await setup();
    const other = await user(t, "other@example.com");
    const id = (await post(t, host, "/api/v1/pickup/series", series(courtId))).json().id as string;
    expect((await post(t, other, `/api/v1/pickup/series/${id}/cancel`)).statusCode).toBe(404);
    expect((await t.app.inject({ method: "GET", url: "/api/v1/pickup/series/mine", headers: { cookie: other.cookie } })).json().items).toEqual([]);
    expect((await t.app.inject({ method: "GET", url: "/api/v1/pickup/series/mine", headers: { cookie: host.cookie } })).json().items).toHaveLength(1);

    // Pretend the first game already happened and was completed.
    const [first, ...rest] = await gamesOf(t, id);
    await t.db.update(pickupGames).set({ status: "COMPLETED" }).where(eq(pickupGames.id, first!.id));
    const res = await post(t, host, `/api/v1/pickup/series/${id}/cancel`);
    expect(res.json()).toEqual({ cancelledGames: rest.length });
    const after = await gamesOf(t, id);
    expect(after[0]!.status).toBe("COMPLETED");
    expect(after.slice(1).every((g) => g.status === "CANCELLED")).toBe(true);
    expect(await materializeAll(t.db, new Date(Date.now() + 14 * 86_400_000))).toBe(0);
    expect(await cancelSeries(t.db, id, host.id).then((r) => r.cancelledGames)).toBe(0); // idempotent
    expect((await t.app.inject({ method: "GET", url: "/api/v1/pickup/series/mine", headers: { cookie: host.cookie } })).json().items).toEqual([]);
  });

  it("validates input and enforces the same hosting rules as one-off games", async () => {
    const { t, host, courtId } = await setup();
    const bad = async (over: object) => (await post(t, host, "/api/v1/pickup/series", series(courtId, over))).statusCode;
    expect(await bad({ timezone: "Mars/Olympus" })).toBe(400);
    expect(await bad({ startTime: "25:00" })).toBe(400);
    expect(await bad({ startTime: "6pm" })).toBe(400);
    expect(await bad({ weekday: 7 })).toBe(400);
    expect(await bad({ durationMin: 10 })).toBe(400);
    expect(await bad({ capacity: 1 })).toBe(400);
    expect(await bad({ courtId: "00000000-0000-4000-8000-000000000000" })).toBe(404);
    expect((await t.app.inject({ method: "POST", url: "/api/v1/pickup/series", payload: series(courtId) })).statusCode).toBe(401);
    const kid = await user(t, "kid@example.com", { dateOfBirth: `${new Date().getFullYear() - 15}-01-01` });
    expect((await post(t, kid, "/api/v1/pickup/series", series(courtId))).statusCode).toBe(403);
  });
});
