import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { grantRole } from "../src/authz/service.js";
import { auditLog } from "../src/db/schema.js";
import * as pickup from "../src/pickup/service.js";
import { testApp, user } from "./helpers.js";

const H = 3_600_000;
const now = new Date();
const in_ = (h: number) => new Date(now.getTime() + h * H);
const teen = { dateOfBirth: `${now.getFullYear() - 15}-01-01` };

type T = Awaited<ReturnType<typeof testApp>>;
type U = Awaited<ReturnType<typeof user>>;
const call = (t: T, u: U, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: unknown) =>
  t.app.inject({ method, url, headers: { cookie: u.cookie }, ...(payload === undefined ? {} : { payload: payload as object }) });

async function guardedTeen(t: T) {
  const minor = await user(t, "kid@example.com", teen);
  const parent = await user(t, "parent@example.com");
  const invite = await call(t, minor, "POST", "/api/v1/guardians", { guardianEmail: "parent@example.com" });
  expect(invite.statusCode).toBe(201);
  return { minor, parent, relId: invite.json().id as string };
}

describe("guardians and consent (WP-1.3)", () => {
  it("only under-18 accounts can invite, and not themselves", async () => {
    const t = await testApp();
    const adult = await user(t, "adult@example.com");
    expect((await call(t, adult, "POST", "/api/v1/guardians", { guardianEmail: "x@example.com" })).statusCode).toBe(403);
    const minor = await user(t, "kid@example.com", teen);
    expect((await call(t, minor, "POST", "/api/v1/guardians", { guardianEmail: "kid@example.com" })).statusCode).toBe(400);
  });

  it("lets only the addressed adult accept; everyone else gets 404", async () => {
    const t = await testApp();
    const { minor, parent, relId } = await guardedTeen(t);
    const stranger = await user(t, "stranger@example.com");
    expect((await call(t, stranger, "POST", `/api/v1/guardians/${relId}/accept`)).statusCode).toBe(404);
    expect((await call(t, minor, "POST", `/api/v1/guardians/${relId}/accept`)).statusCode).toBe(404);
    expect((await call(t, parent, "GET", "/api/v1/guardians")).json().invitations).toHaveLength(1);
    expect((await call(t, parent, "POST", `/api/v1/guardians/${relId}/accept`)).statusCode).toBe(204);
    expect((await call(t, parent, "GET", "/api/v1/guardians")).json().wards).toHaveLength(1);
  });

  it("refuses an unverified guardian email when verification is required", async () => {
    const t = await testApp();
    const strict = await (await import("../src/app.js")).buildApp(t.db, { secureCookies: false, requireVerifiedGuardianEmail: true });
    const { parent, relId } = await guardedTeen(t);
    const res = await strict.inject({ method: "POST", url: `/api/v1/guardians/${relId}/accept`, headers: { cookie: parent.cookie } });
    expect(res.statusCode).toBe(403);
  });

  it("rejects a minor guardian", async () => {
    const t = await testApp();
    const minor = await user(t, "kid@example.com", teen);
    const other = await user(t, "kid2@example.com", teen);
    const rel = await call(t, minor, "POST", "/api/v1/guardians", { guardianEmail: "kid2@example.com" });
    expect((await call(t, other, "POST", `/api/v1/guardians/${rel.json().id}/accept`)).statusCode).toBe(403);
  });

  it("a minor cannot consent for themselves; the active guardian can; revoking the guardian voids it", async () => {
    const t = await testApp();
    const { minor, parent, relId } = await guardedTeen(t);
    await call(t, parent, "POST", `/api/v1/guardians/${relId}/accept`);

    expect((await call(t, minor, "PUT", "/api/v1/consents/PUBLIC_PICKUP")).statusCode).toBe(404);
    const stranger = await user(t, "stranger@example.com");
    expect((await call(t, stranger, "PUT", "/api/v1/consents/PUBLIC_PICKUP", { subjectId: minor.id })).statusCode).toBe(404);

    expect((await call(t, parent, "PUT", "/api/v1/consents/PUBLIC_PICKUP", { subjectId: minor.id })).statusCode).toBe(204);
    expect((await call(t, minor, "GET", "/api/v1/consents")).json().PUBLIC_PICKUP).toBe(true);

    expect((await call(t, parent, "DELETE", `/api/v1/guardians/${relId}`)).statusCode).toBe(204);
    expect((await call(t, minor, "GET", "/api/v1/consents")).json().PUBLIC_PICKUP).toBe(false);
  });

  it("shows a ward's consent state only to the ward and their active guardian", async () => {
    const t = await testApp();
    const { minor, parent, relId } = await guardedTeen(t);
    const stranger = await user(t, "stranger@example.com");
    await call(t, parent, "POST", `/api/v1/guardians/${relId}/accept`);
    await call(t, parent, "PUT", "/api/v1/consents/MEDIA_USE", { subjectId: minor.id });
    expect((await call(t, parent, "GET", `/api/v1/consents?subjectId=${minor.id}`)).json().MEDIA_USE).toBe(true);
    expect((await call(t, stranger, "GET", `/api/v1/consents?subjectId=${minor.id}`)).statusCode).toBe(404);
    await call(t, parent, "DELETE", `/api/v1/guardians/${relId}`);
    expect((await call(t, parent, "GET", `/api/v1/consents?subjectId=${minor.id}`)).statusCode).toBe(404);
  });

  it("revoking consent takes effect immediately", async () => {
    const t = await testApp();
    const { minor, parent, relId } = await guardedTeen(t);
    await call(t, parent, "POST", `/api/v1/guardians/${relId}/accept`);
    await call(t, parent, "PUT", "/api/v1/consents/MEDIA_USE", { subjectId: minor.id });
    await call(t, minor, "DELETE", "/api/v1/consents/MEDIA_USE");
    expect((await call(t, minor, "GET", "/api/v1/consents")).json().MEDIA_USE).toBe(false);
  });

  it("gates public pickup for minors on guardian consent", async () => {
    const t = await testApp();
    const host = await user(t, "host@example.com");
    const court = await call(t, host, "POST", "/api/v1/courts", { name: "Rucker", lat: 40.8, lng: -73.9 });
    const game = await pickup.createGame(t.db, host.id, { courtId: court.json().id, title: "Run", startsAt: in_(2), endsAt: in_(4), capacity: 4 }, now);
    const { minor, parent, relId } = await guardedTeen(t);

    expect((await call(t, minor, "POST", `/api/v1/pickup/${game.id}/rsvp`)).statusCode).toBe(403);
    await call(t, parent, "POST", `/api/v1/guardians/${relId}/accept`);
    expect((await call(t, minor, "POST", `/api/v1/pickup/${game.id}/rsvp`)).statusCode).toBe(403); // guardian active but no consent yet
    await call(t, parent, "PUT", "/api/v1/consents/PUBLIC_PICKUP", { subjectId: minor.id });
    expect((await call(t, minor, "POST", `/api/v1/pickup/${game.id}/rsvp`)).statusCode).toBe(200);
    await call(t, parent, "DELETE", `/api/v1/guardians/${relId}`);
    expect((await call(t, minor, "POST", `/api/v1/pickup/${game.id}/rsvp`)).statusCode).toBe(403); // consent died with the guardian
  });

  it("writes audit rows that cannot be updated or deleted", async () => {
    const t = await testApp();
    const { relId, parent } = await guardedTeen(t);
    await call(t, parent, "POST", `/api/v1/guardians/${relId}/accept`);
    const rows = await t.db.select().from(auditLog);
    expect(rows.map((r) => r.action).sort()).toEqual(["guardian.accepted", "guardian.invited"]);
    await expect(t.db.update(auditLog).set({ action: "tampered" })).rejects.toThrow();
    await expect(t.db.delete(auditLog)).rejects.toThrow();
    expect(await t.db.select().from(auditLog)).toHaveLength(2);
  });
});

describe("trust and safety (WP-1.4)", () => {
  it("block is two-way, mute is one-way, and both hide people from the participant list", async () => {
    const t = await testApp();
    const host = await user(t, "host@example.com");
    const a = await user(t, "a@example.com");
    const b = await user(t, "b@example.com");
    const court = await call(t, host, "POST", "/api/v1/courts", { name: "Rucker", lat: 40.8, lng: -73.9 });
    const game = await pickup.createGame(t.db, host.id, { courtId: court.json().id, title: "Run", startsAt: in_(2), endsAt: in_(4), capacity: 6 }, now);
    await call(t, a, "POST", `/api/v1/pickup/${game.id}/rsvp`);
    await call(t, b, "POST", `/api/v1/pickup/${game.id}/rsvp`);
    const names = async (u: U) => ((await call(t, u, "GET", `/api/v1/pickup/${game.id}`)).json().participants as { name: string }[]).map((p) => p.name);

    expect(await names(a)).toHaveLength(3);
    expect((await call(t, a, "PUT", `/api/v1/blocks/${b.id}`, { kind: "MUTE" })).statusCode).toBe(204);
    expect(await names(a)).toHaveLength(2); // a no longer sees b
    expect(await names(b)).toHaveLength(3); // b still sees a: mutes are one-way

    await call(t, a, "PUT", `/api/v1/blocks/${b.id}`, { kind: "BLOCK" });
    expect(await names(b)).toHaveLength(2); // block hides a from b as well
    expect((await call(t, a, "GET", "/api/v1/blocks")).json().items).toEqual([{ userId: b.id, displayName: "Ada", kind: "BLOCK" }]);

    await call(t, a, "DELETE", `/api/v1/blocks/${b.id}`);
    expect(await names(a)).toHaveLength(3);
  });

  it("stops a blocked user joining the blocker's game, and reads as 'not found'", async () => {
    const t = await testApp();
    const host = await user(t, "host@example.com");
    const pest = await user(t, "pest@example.com");
    const court = await call(t, host, "POST", "/api/v1/courts", { name: "Rucker", lat: 40.8, lng: -73.9 });
    const game = await pickup.createGame(t.db, host.id, { courtId: court.json().id, title: "Run", startsAt: in_(2), endsAt: in_(4), capacity: 6 }, now);
    await call(t, host, "PUT", `/api/v1/blocks/${pest.id}`, { kind: "BLOCK" });
    expect((await call(t, pest, "POST", `/api/v1/pickup/${game.id}/rsvp`)).statusCode).toBe(404);
  });

  it("validates block targets", async () => {
    const t = await testApp();
    const a = await user(t, "a@example.com");
    expect((await call(t, a, "PUT", `/api/v1/blocks/${a.id}`, { kind: "BLOCK" })).statusCode).toBe(400);
    expect((await call(t, a, "PUT", "/api/v1/blocks/3f1f2f0e-0000-4000-8000-000000000000", { kind: "BLOCK" })).statusCode).toBe(404);
  });

  async function reportedUser() {
    const t = await testApp();
    const [r1, r2, bad] = [await user(t, "r1@example.com"), await user(t, "r2@example.com"), await user(t, "bad@example.com")];
    const mod = await user(t, "mod@example.com");
    await grantRole(t.db, mod.id, "MODERATOR");
    return { t, r1, r2, bad, mod };
  }

  it("rolls repeat reports on one target into one case, one report per reporter", async () => {
    const { t, r1, r2, bad, mod } = await reportedUser();
    const body = { targetType: "USER", targetId: bad.id, reason: "HARASSMENT", note: "rude" };
    expect((await call(t, r1, "POST", "/api/v1/reports", body)).statusCode).toBe(202);
    expect((await call(t, r1, "POST", "/api/v1/reports", body)).statusCode).toBe(202); // duplicate is a no-op
    expect((await call(t, r2, "POST", "/api/v1/reports", body)).statusCode).toBe(202);
    const cases = (await call(t, mod, "GET", "/api/v1/moderation/cases")).json().items;
    expect(cases).toHaveLength(1);
    expect(cases[0].reportCount).toBe(2);
  });

  it("rejects reports about yourself or things that do not exist", async () => {
    const { t, r1 } = await reportedUser();
    expect((await call(t, r1, "POST", "/api/v1/reports", { targetType: "USER", targetId: r1.id, reason: "SPAM" })).statusCode).toBe(400);
    expect((await call(t, r1, "POST", "/api/v1/reports", { targetType: "COURT", targetId: "3f1f2f0e-0000-4000-8000-000000000000", reason: "UNSAFE" })).statusCode).toBe(404);
  });

  it("keeps the moderation queue away from ordinary users", async () => {
    const { t, r1, bad } = await reportedUser();
    await call(t, r1, "POST", "/api/v1/reports", { targetType: "USER", targetId: bad.id, reason: "SPAM" });
    expect((await call(t, r1, "GET", "/api/v1/moderation/cases")).statusCode).toBe(403);
    expect((await call(t, r1, "GET", "/api/v1/admin/audit?reason=curiosity+only")).statusCode).toBe(403);
  });

  it("requires a stated reason to read a case, audits the read, and lets a case close once", async () => {
    const { t, r1, bad, mod } = await reportedUser();
    await call(t, r1, "POST", "/api/v1/reports", { targetType: "USER", targetId: bad.id, reason: "HARASSMENT", note: "rude" });
    const id = (await call(t, mod, "GET", "/api/v1/moderation/cases")).json().items[0].id as string;

    expect((await call(t, mod, "GET", `/api/v1/moderation/cases/${id}`)).statusCode).toBe(400);
    expect((await call(t, mod, "GET", `/api/v1/moderation/cases/${id}?reason=short`)).statusCode).toBe(400);
    const read = await call(t, mod, "GET", `/api/v1/moderation/cases/${id}?reason=ticket+4521+follow-up`);
    expect(read.statusCode).toBe(200);
    expect(read.json().reports[0]).toMatchObject({ reporterId: r1.id, reason: "HARASSMENT", note: "rude" });

    const audit = await t.db.select().from(auditLog).where(eq(auditLog.action, "moderation.case_read"));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: mod.id, resourceId: id, reason: "ticket 4521 follow-up" });

    expect((await call(t, mod, "POST", `/api/v1/moderation/cases/${id}/resolve`, { outcome: "RESOLVED", note: "warned user" })).statusCode).toBe(204);
    expect((await call(t, mod, "POST", `/api/v1/moderation/cases/${id}/resolve`, { outcome: "DISMISSED", note: "again" })).statusCode).toBe(409);
    expect((await call(t, mod, "GET", "/api/v1/moderation/cases")).json().items).toHaveLength(0);
  });

  it("lets a platform admin read the audit trail, and audits that read", async () => {
    const t = await testApp();
    const admin = await user(t, "admin@example.com");
    await grantRole(t.db, admin.id, "PLATFORM_ADMIN");
    expect((await call(t, admin, "GET", "/api/v1/admin/audit")).statusCode).toBe(400);
    expect((await call(t, admin, "GET", "/api/v1/admin/audit?reason=quarterly+access+review")).statusCode).toBe(200);
    const rows = await t.db.select().from(auditLog).where(eq(auditLog.action, "audit.read"));
    expect(rows).toHaveLength(1);
  });
});

