import { describe, expect, it } from "vitest";
import * as svc from "../src/pickup/service.js";
import { testApp, user } from "./helpers.js";

const H = 3_600_000;
const now = new Date();
const in_ = (hours: number) => new Date(now.getTime() + hours * H);

async function setup() {
  const t = await testApp();
  const host = await user(t, "host@example.com");
  const court = await t.app.inject({ method: "POST", url: "/api/v1/courts", headers: { cookie: host.cookie }, payload: { name: "Rucker", lat: 40.8, lng: -73.9 } });
  const game = await svc.createGame(t.db, host.id, { courtId: court.json().id, title: "Run", startsAt: in_(2), endsAt: in_(4), capacity: 2 }, now);
  return { t, host, courtId: court.json().id as string, game };
}

describe("pickup lifecycle", () => {
  it("fills, waitlists, and auto-promotes the first waitlisted player on cancel", async () => {
    const { t, game } = await setup();
    const b = await user(t, "b@example.com");
    const c = await user(t, "c@example.com");
    const d = await user(t, "d@example.com");
    expect(game.confirmedCount).toBe(1);
    expect(await svc.rsvp(t.db, game.id, b.id, now)).toEqual({ status: "CONFIRMED" });
    expect(await svc.rsvp(t.db, game.id, b.id, now)).toEqual({ status: "CONFIRMED" }); // idempotent
    expect(await svc.rsvp(t.db, game.id, c.id, in_(0.1))).toEqual({ status: "WAITLIST" });
    expect(await svc.rsvp(t.db, game.id, d.id, in_(0.2))).toEqual({ status: "WAITLIST" });
    expect((await svc.getGame(t.db, game.id, b.id, now)).phase).toBe("FULL");

    await svc.cancelRsvp(t.db, game.id, b.id);
    const after = await svc.getGame(t.db, game.id, c.id, now);
    expect(after.myStatus).toBe("CONFIRMED"); // c joined the waitlist before d
    expect(after.waitlistCount).toBe(1);
    expect((await svc.getGame(t.db, game.id, d.id, now)).myStatus).toBe("WAITLIST");
  });

  it("never over-fills when several players race for the last spot", async () => {
    const { t, game } = await setup();
    const users = await Promise.all(["r1", "r2", "r3", "r4"].map((n) => user(t, `${n}@example.com`)));
    await Promise.all(users.map((u) => svc.rsvp(t.db, game.id, u.id, now)));
    const g = await svc.getGame(t.db, game.id, null, now);
    expect(g.confirmedCount).toBe(2);
    expect(g.waitlistCount).toBe(3);
  });

  it("limits check-in to confirmed players inside the window and is idempotent", async () => {
    const { t, game } = await setup();
    const b = await user(t, "b@example.com");
    const w = await user(t, "w@example.com");
    await svc.rsvp(t.db, game.id, b.id, now);
    await svc.rsvp(t.db, game.id, w.id, now); // waitlist (capacity 2: host + b)
    await expect(svc.checkIn(t.db, game.id, b.id, now)).rejects.toMatchObject({ statusCode: 409 }); // too early
    const during = in_(2.5);
    const first = await svc.checkIn(t.db, game.id, b.id, during);
    expect((await svc.checkIn(t.db, game.id, b.id, in_(3))).checkedInAt).toEqual(first.checkedInAt);
    await expect(svc.checkIn(t.db, game.id, w.id, during)).rejects.toMatchObject({ statusCode: 403 });
    await expect(svc.checkIn(t.db, game.id, b.id, in_(5))).rejects.toMatchObject({ statusCode: 409 }); // after end
    expect((await svc.getGame(t.db, game.id, b.id, during)).checkInCount).toBe(1);
  });

  it("is UNCONFIRMED after the end time and only completes on explicit host confirmation", async () => {
    const { t, host, game } = await setup();
    const b = await user(t, "b@example.com");
    await expect(svc.confirmComplete(t.db, game.id, host.id, now)).rejects.toMatchObject({ statusCode: 409 }); // not started
    await expect(svc.confirmComplete(t.db, game.id, b.id, in_(5))).rejects.toMatchObject({ statusCode: 404 }); // not the host
    expect((await svc.getGame(t.db, game.id, null, in_(10))).phase).toBe("UNCONFIRMED");
    const done = await svc.confirmComplete(t.db, game.id, host.id, in_(5));
    expect(done.phase).toBe("COMPLETED");
    expect(done.hostConfirmedAt).not.toBeNull();
  });

  it("hides the roster from outsiders and blocks RSVPs after cancel", async () => {
    const { t, host, game } = await setup();
    const b = await user(t, "b@example.com");
    expect((await svc.getGame(t.db, game.id, b.id, now)).participants).toBeUndefined();
    await svc.rsvp(t.db, game.id, b.id, now);
    expect((await svc.getGame(t.db, game.id, b.id, now)).participants).toHaveLength(2);
    await svc.cancelGame(t.db, game.id, host.id);
    await expect(svc.rsvp(t.db, game.id, (await user(t, "z@example.com")).id, now)).rejects.toMatchObject({ statusCode: 409 });
  });

  it("validates new games", async () => {
    const { t, host, courtId } = await setup();
    const base = { courtId, title: "x", capacity: 4 };
    await expect(svc.createGame(t.db, host.id, { ...base, startsAt: in_(-1), endsAt: in_(1) }, now)).rejects.toMatchObject({ statusCode: 400 });
    await expect(svc.createGame(t.db, host.id, { ...base, startsAt: in_(1), endsAt: in_(9) }, now)).rejects.toMatchObject({ statusCode: 400 });
    await expect(svc.createGame(t.db, host.id, { ...base, courtId: crypto.randomUUID(), startsAt: in_(1), endsAt: in_(2) }, now)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe("pickup API", () => {
  it("hosts, searches by point and radius, joins over HTTP; minors are blocked", async () => {
    const { t, host, courtId } = await setup();
    const make = (cookie: string) => t.app.inject({
      method: "POST", url: "/api/v1/pickup", headers: { cookie },
      payload: { courtId, title: "Evening run", startsAt: in_(5).toISOString(), endsAt: in_(7).toISOString(), capacity: 10 },
    });
    const created = await make(host.cookie);
    expect(created.statusCode).toBe(201);

    const search = await t.app.inject({ url: "/api/v1/pickup?lat=40.8&lng=-73.9&radius_m=2000" });
    expect(search.json().items.map((g: { title: string }) => g.title)).toContain("Evening run");
    expect((await t.app.inject({ url: "/api/v1/pickup?lat=10&lng=10&radius_m=2000" })).json().items).toHaveLength(0);

    const player = await user(t, "p@example.com");
    const join = await t.app.inject({ method: "POST", url: `/api/v1/pickup/${created.json().id}/rsvp`, headers: { cookie: player.cookie } });
    expect(join.json()).toEqual({ status: "CONFIRMED" });

    const year = new Date().getUTCFullYear();
    const teen = await user(t, "teen@example.com", { dateOfBirth: `${year - 15}-01-01` });
    expect((await make(teen.cookie)).statusCode).toBe(403);
    expect((await t.app.inject({ method: "POST", url: `/api/v1/pickup/${created.json().id}/rsvp`, headers: { cookie: teen.cookie } })).statusCode).toBe(403);
    expect((await t.app.inject({ method: "POST", url: `/api/v1/pickup/${created.json().id}/rsvp` })).statusCode).toBe(401);
    expect((await t.app.inject({ url: `/api/v1/pickup/${crypto.randomUUID()}` })).statusCode).toBe(404);
  });
});
