import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { competitions, roleAssignments, users } from "../src/db/schema.js";
import { testApp, user } from "./helpers.js";

type T = Awaited<ReturnType<typeof testApp>>;
type U = { id: string; cookie: string };
const call = (t: T, u: U | null, method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object) =>
  t.app.inject({ method, url, headers: u ? { cookie: u.cookie } : {}, ...(payload ? { payload } : {}) });
const teen = { dateOfBirth: `${new Date().getFullYear() - 15}-01-01` };

/** An organizer's competition with two teams (each with a coach), and some players on team A. */
async function world(t: T) {
  const org = await user(t, "org@example.com");
  const coachA = await user(t, "ca@example.com");
  const coachB = await user(t, "cb@example.com");
  const [p1, p2, p3] = await Promise.all(["p1", "p2", "p3"].map((n) => user(t, `${n}@example.com`, { displayName: n.toUpperCase() })));
  const comp = (await call(t, org, "POST", "/api/v1/competitions", { name: "Summer Cup", format: "ROUND_ROBIN" })).json().id as string;
  const teamA = (await call(t, coachA, "POST", "/api/v1/teams", { name: "Alpha" })).json().id as string;
  const teamB = (await call(t, coachB, "POST", "/api/v1/teams", { name: "Bravo" })).json().id as string;
  for (const team of [teamA, teamB]) expect((await call(t, org, "POST", `/api/v1/competitions/${comp}/teams`, { teamId: team })).statusCode).toBe(201);
  for (const p of [p1, p2]) await call(t, coachA, "POST", `/api/v1/teams/${teamA}/members`, { email: `${p === p1 ? "p1" : "p2"}@example.com`, role: "PLAYER" });
  await call(t, coachB, "POST", `/api/v1/teams/${teamB}/members`, { email: "p3@example.com", role: "PLAYER" });
  return { org, coachA, coachB, p1, p2, p3: p3!, comp, teamA, teamB, p1u: p1!, p2u: p2! };
}
const url = (comp: string, team: string, userId?: string) => `/api/v1/competitions/${comp}/teams/${team}/roster${userId ? `/${userId}` : ""}`;

describe("competition rosters", () => {
  it("a coach builds the roster; members and the organizer can see it, strangers and visitors cannot", async () => {
    const t = await testApp();
    const w = await world(t);
    expect((await call(t, w.coachA, "PUT", url(w.comp, w.teamA, w.p1!.id), { jersey: 23 })).statusCode).toBe(204);
    expect((await call(t, w.coachA, "PUT", url(w.comp, w.teamA, w.p2!.id), { jersey: 7 })).statusCode).toBe(204);
    const asCoach = (await call(t, w.coachA, "GET", url(w.comp, w.teamA))).json();
    expect(asCoach).toMatchObject({ canEdit: true, max: 15 });
    expect(asCoach.items.map((x: { name: string; jersey: number }) => [x.name, x.jersey])).toEqual([["P2", 7], ["P1", 23]]);
    expect(asCoach.candidates).toEqual([{ userId: w.coachA.id, name: "Ada" }]); // not yet on the roster: only the coach (players are all on it)
    const asPlayer = (await call(t, w.p1!, "GET", url(w.comp, w.teamA))).json();
    expect(asPlayer.canEdit).toBe(false);
    expect(asPlayer.candidates).toEqual([]);
    expect(asPlayer.items).toHaveLength(2);
    expect((await call(t, w.org, "GET", url(w.comp, w.teamA))).json().canEdit).toBe(true);
    // The other team's coach, an unrelated player, and a signed-out visitor see "not found" / sign-in.
    expect((await call(t, w.coachB, "GET", url(w.comp, w.teamA))).statusCode).toBe(404);
    expect((await call(t, w.p3, "GET", url(w.comp, w.teamA))).statusCode).toBe(404);
    expect((await call(t, null, "GET", url(w.comp, w.teamA))).statusCode).toBe(401);
  });

  it("a team's members can list its competitions; outsiders cannot", async () => {
    const t = await testApp();
    const w = await world(t);
    const mine = (await call(t, w.p1!, "GET", `/api/v1/teams/${w.teamA}/competitions`)).json().items;
    expect(mine).toEqual([{ id: w.comp, name: "Summer Cup", status: "DRAFT" }]);
    expect((await call(t, w.p3, "GET", `/api/v1/teams/${w.teamA}/competitions`)).statusCode).toBe(404);
  });

  it("players cannot edit; strangers get 404; the player is told when added", async () => {
    const t = await testApp();
    const w = await world(t);
    expect((await call(t, w.p1!, "PUT", url(w.comp, w.teamA, w.p1!.id), { jersey: 1 })).statusCode).toBe(409);
    expect((await call(t, w.coachB, "PUT", url(w.comp, w.teamA, w.p1!.id), { jersey: 1 })).statusCode).toBe(404);
    expect((await call(t, w.coachA, "PUT", url(w.comp, w.teamA, w.p1!.id), { jersey: 1 })).statusCode).toBe(204);
    const inbox = (await call(t, w.p1!, "GET", "/api/v1/notifications")).json().items;
    expect(inbox.find((n: { kind: string }) => n.kind === "ADDED_TO_ROSTER")).toMatchObject({ title: "You are on Alpha's roster for Summer Cup", link: `/competitions/${w.comp}` });
  });

  it("enforces who can be on a roster, unique jerseys, one team per competition, and the size limit", async () => {
    const t = await testApp();
    const w = await world(t);
    const put = (u: U, team: string, who: string, jersey: number) => call(t, u, "PUT", url(w.comp, team, who), { jersey });
    expect((await put(w.coachA, w.teamA, w.p3.id, 5)).statusCode).toBe(409); // p3 is not on team A
    expect((await put(w.coachA, w.teamA, w.p1!.id, 100)).statusCode).toBe(400);
    expect((await put(w.coachA, w.teamA, w.p1!.id, -1)).statusCode).toBe(400);
    expect((await put(w.coachA, w.teamA, w.p1!.id, 10)).statusCode).toBe(204);
    expect((await put(w.coachA, w.teamA, w.p2!.id, 10)).statusCode).toBe(409); // jersey taken
    expect((await put(w.coachA, w.teamA, w.p1!.id, 11)).statusCode).toBe(204); // changing your own number is fine
    expect((await call(t, w.coachA, "GET", url(w.comp, w.teamA))).json().items).toHaveLength(1);
    // p1 also joins team B; they cannot be on both rosters in this competition.
    await call(t, w.coachB, "POST", `/api/v1/teams/${w.teamB}/members`, { email: "p1@example.com", role: "PLAYER" });
    expect((await put(w.coachB, w.teamB, w.p1!.id, 3)).statusCode).toBe(409);
    // Size limit: 15 players max.
    // (Players are inserted directly: signing up 15 people would trip the sign-up rate limit.)
    const extra: U[] = [];
    for (let i = 0; i < 15; i++) {
      const [u] = await t.db.insert(users).values({ email: `x${i}@example.com`, passwordHash: "x", displayName: `X${i}`, dateOfBirth: "1990-01-01", isMinor: false }).returning();
      await t.db.insert(roleAssignments).values({ userId: u!.id, role: "PLAYER", resourceType: "team", resourceId: w.teamB });
      extra.push({ id: u!.id, cookie: "" });
    }
    for (let i = 0; i < 14; i++) expect((await put(w.coachB, w.teamB, extra[i]!.id, 20 + i)).statusCode).toBe(204);
    expect((await put(w.coachB, w.teamB, w.p3.id, 60)).statusCode).toBe(204); // 15th
    const res = await put(w.coachB, w.teamB, extra[14]!.id, 61);
    expect(res.statusCode).toBe(409);
    expect(res.json().title).toContain("at most 15");
  });

  it("under-18 players cannot be rostered yet", async () => {
    const t = await testApp();
    const w = await world(t);
    const kid = await user(t, "kid@example.com", teen);
    const parent = await user(t, "parent@example.com");
    const rel = await call(t, kid, "POST", "/api/v1/guardians", { guardianEmail: "parent@example.com" });
    await call(t, parent, "POST", `/api/v1/guardians/${rel.json().id}/accept`);
    await call(t, parent, "PUT", "/api/v1/consents/MEDIA_USE", { subjectId: kid.id });
    expect((await call(t, w.coachA, "POST", `/api/v1/teams/${w.teamA}/members`, { email: "kid@example.com", role: "PLAYER" })).statusCode).toBe(201); // may join the team
    const res = await call(t, w.coachA, "PUT", url(w.comp, w.teamA, kid.id), { jersey: 9 });
    expect(res.statusCode).toBe(409);
    expect(res.json().title).toContain("Under-18");
  });

  it("team staff can edit only while registration is open; the organizer until the competition is over", async () => {
    const t = await testApp();
    const w = await world(t);
    await call(t, w.coachA, "PUT", url(w.comp, w.teamA, w.p1!.id), { jersey: 1 });
    expect((await call(t, w.org, "POST", `/api/v1/competitions/${w.comp}/schedule`)).statusCode).toBe(201); // publishes: registration closes
    expect((await call(t, w.coachA, "PUT", url(w.comp, w.teamA, w.p2!.id), { jersey: 2 })).statusCode).toBe(409);
    expect((await call(t, w.coachA, "DELETE", url(w.comp, w.teamA, w.p1!.id))).statusCode).toBe(409);
    expect((await call(t, w.coachA, "GET", url(w.comp, w.teamA))).json().canEdit).toBe(false);
    expect((await call(t, w.org, "PUT", url(w.comp, w.teamA, w.p2!.id), { jersey: 2 })).statusCode).toBe(204);
    expect((await call(t, w.org, "DELETE", url(w.comp, w.teamA, w.p1!.id))).statusCode).toBe(204);
    expect((await call(t, w.org, "DELETE", url(w.comp, w.teamA, w.p1!.id))).statusCode).toBe(404); // already gone
    await t.db.update(competitions).set({ status: "COMPLETED" }).where(eq(competitions.id, w.comp));
    expect((await call(t, w.org, "PUT", url(w.comp, w.teamA, w.p1!.id), { jersey: 3 })).statusCode).toBe(409);
    expect((await call(t, w.org, "GET", url(w.comp, w.teamA))).json().canEdit).toBe(false);
  });

  it("a team that is not in the competition has no roster", async () => {
    const t = await testApp();
    const w = await world(t);
    const teamC = (await call(t, w.coachA, "POST", "/api/v1/teams", { name: "Charlie" })).json().id as string;
    expect((await call(t, w.coachA, "GET", url(w.comp, teamC))).statusCode).toBe(404);
    expect((await call(t, w.org, "GET", url(w.comp, teamC))).statusCode).toBe(404);
  });
});
