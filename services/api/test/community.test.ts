import { describe, expect, it } from "vitest";
import { testApp, user } from "./helpers.js";

type T = Awaited<ReturnType<typeof testApp>>;
type U = { id: string; cookie: string };

const post = (t: T, u: U | null, url: string, payload?: unknown) =>
  t.app.inject({
    method: "POST",
    url,
    ...(u ? { headers: { cookie: u.cookie } } : {}),
    ...(payload ? { payload: payload as object } : {}),
  });

const get = (t: T, u: U | null, url: string) =>
  t.app.inject({
    method: "GET",
    url,
    ...(u ? { headers: { cookie: u.cookie } } : {}),
  });

describe("Basketball Communities & Squad Hubs (WP-5.2)", { timeout: 30000 }, () => {
  it("creates public and private communities, manages membership, and enforces negative authZ", async () => {
    const t = await testApp();
    const leader = await user(t, "comm-leader@courtiq.test");
    const playerA = await user(t, "comm-player-a@courtiq.test");
    const outsider = await user(t, "comm-outsider@courtiq.test");

    // 1. Create a Public Community
    const createPubRes = await post(t, leader, "/api/v1/communities", {
      name: "Seattle Downtown Tuesday Run",
      description: "High-paced 5v5 full court runs every Tuesday evening.",
      city: "Seattle",
      isPrivate: false,
      skillLevel: "COMPETITIVE",
    });
    expect(createPubRes.statusCode).toBe(201);
    const pubComm = createPubRes.json();
    expect(pubComm.name).toBe("Seattle Downtown Tuesday Run");
    expect(pubComm.memberCount).toBe(1);

    // 2. Player A joins public community
    const joinRes = await post(t, playerA, `/api/v1/communities/${pubComm.id}/join`);
    expect(joinRes.statusCode).toBe(200);
    expect(joinRes.json().role).toBe("MEMBER");

    // Check members list
    const membersRes = await get(t, leader, `/api/v1/communities/${pubComm.id}/members`);
    expect(membersRes.statusCode).toBe(200);
    expect(membersRes.json().items.length).toBe(2);

    // 3. Create a Private Community
    const createPrivRes = await post(t, leader, "/api/v1/communities", {
      name: "Elite Closed Invitational",
      description: "Invitation-only run for semi-pro and varsity alumni.",
      city: "Seattle",
      isPrivate: true,
      skillLevel: "COLLEGIATE_PRO",
    });
    expect(createPrivRes.statusCode).toBe(201);
    const privCommId = createPrivRes.json().id;

    // 4. Negative AuthZ: Outsider trying to inspect private community gets 404 (ADR-0010)
    const unauthorizedGet = await get(t, outsider, `/api/v1/communities/${privCommId}`);
    expect(unauthorizedGet.statusCode).toBe(404);

    // Public list hides private communities from non-members
    const listRes = await get(t, outsider, "/api/v1/communities?city=Seattle");
    expect(listRes.statusCode).toBe(200);
    const comms = listRes.json().items;
    expect(comms.some((c: { id: string }) => c.id === pubComm.id)).toBe(true);
    expect(comms.some((c: { id: string }) => c.id === privCommId)).toBe(false);

    // 5. Player A leaves public community
    const leaveRes = await post(t, playerA, `/api/v1/communities/${pubComm.id}/leave`);
    expect(leaveRes.statusCode).toBe(204);

    const afterLeave = await get(t, leader, `/api/v1/communities/${pubComm.id}`);
    expect(afterLeave.json().memberCount).toBe(1);

    // 6. Leader cannot leave without transferring ownership (400)
    const leaderLeaveRes = await post(t, leader, `/api/v1/communities/${pubComm.id}/leave`);
    expect(leaderLeaveRes.statusCode).toBe(400);
  });
});
