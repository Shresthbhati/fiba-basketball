import { describe, expect, it } from "vitest";
import { testApp, user } from "./helpers.js";

type T = Awaited<ReturnType<typeof testApp>>;
type U = Awaited<ReturnType<typeof user>>;

const post = (t: T, u: U | null, url: string, body?: unknown) =>
  t.app.inject({
    method: "POST",
    url,
    payload: body ?? {},
    ...(u ? { headers: { cookie: u.cookie } } : {}),
  });

const get = (t: T, u: U | null, url: string) =>
  t.app.inject({
    method: "GET",
    url,
    ...(u ? { headers: { cookie: u.cookie } } : {}),
  });

describe("Pickup-to-Team Pathway & Free Agent Draft Pool (WP-5.5)", { timeout: 30000 }, () => {
  it("manages free agent listings, team invitations, and competition draft pools with negative authZ", async () => {
    const t = await testApp();
    const coach = await user(t, "coach-bronx@courtiq.test", { displayName: "Coach Bronx" });
    const player = await user(t, "pointguard@courtiq.test", { displayName: "Speedy Hooper" });
    const stranger = await user(t, "stranger-free@courtiq.test", { displayName: "Rando" });
    const organizer = await user(t, "organizer-tourney@courtiq.test", { displayName: "League Commish" });

    // 1. Player creates Free Agent listing
    const faRes = await post(t, player, "/api/v1/free-agents", {
      city: "New York, NY",
      primaryPosition: "PG",
      secondaryPositions: ["SG"],
      skillLevel: "COMPETITIVE",
      experienceYears: 4,
      availability: "WEEKENDS",
      bio: "Floor general, pass-first PG looking for a Sunday league squad.",
    });
    expect(faRes.statusCode).toBe(201);
    const faListing = faRes.json();
    expect(faListing.primaryPosition).toBe("PG");
    expect(faListing.status).toBe("ACTIVE");

    // 2. Discover free agents publicly with position filter
    const listRes = await get(t, null, "/api/v1/free-agents?position=PG");
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().items.length).toBeGreaterThanOrEqual(1);
    expect(listRes.json().items[0].displayName).toBe("Speedy Hooper");

    // 3. Player checks their own listing
    const mineRes = await get(t, player, "/api/v1/free-agents/mine");
    expect(mineRes.statusCode).toBe(200);
    expect(mineRes.json().item.id).toBe(faListing.id);

    // 4. Coach creates a team
    const teamRes = await post(t, coach, "/api/v1/teams", { name: "Bronx Bombers" });
    expect(teamRes.statusCode).toBe(201);
    const teamId = teamRes.json().id;

    // 5. Unauthorized stranger attempts to invite player to team -> 404 (ADR-0010)
    const badInvite = await post(t, stranger, `/api/v1/teams/${teamId}/invitations`, {
      userId: player.id,
      role: "PLAYER",
    });
    expect(badInvite.statusCode).toBe(404);

    // 6. Coach sends invitation to player
    const inviteRes = await post(t, coach, `/api/v1/teams/${teamId}/invitations`, {
      userId: player.id,
      role: "PLAYER",
      message: "We need a starting PG for the city tournament, join our squad!",
    });
    expect(inviteRes.statusCode).toBe(201);
    const inviteId = inviteRes.json().id;

    // 7. Player views pending invitations
    const myInvites = await get(t, player, "/api/v1/me/team-invitations");
    expect(myInvites.statusCode).toBe(200);
    expect(myInvites.json().items.length).toBe(1);
    expect(myInvites.json().items[0].teamName).toBe("Bronx Bombers");

    // 8. Player accepts invitation
    const acceptRes = await post(t, player, `/api/v1/me/team-invitations/${inviteId}/respond`, {
      action: "ACCEPTED",
    });
    expect(acceptRes.statusCode).toBe(200);
    expect(acceptRes.json().status).toBe("ACCEPTED");

    // 9. Free agent listing should now be MATCHED
    const updatedMine = await get(t, player, "/api/v1/free-agents/mine");
    expect(updatedMine.json().item.status).toBe("MATCHED");

    // 10. Organizer creates a tournament competition
    const compRes = await post(t, organizer, "/api/v1/competitions", {
      name: "NYC Summer Slam 2026",
      format: "SINGLE_ELIMINATION",
    });
    expect(compRes.statusCode).toBe(201);
    const compId = compRes.json().id;

    // 11. Another unsigned player enters the tournament draft pool
    const draftPlayer = await user(t, "draft-center@courtiq.test", { displayName: "Big Center" });
    const poolRes = await post(t, draftPlayer, `/api/v1/competitions/${compId}/draft-pool`, {
      primaryPosition: "C",
      skillLevel: "COMPETITIVE",
    });
    expect(poolRes.statusCode).toBe(201);
    const poolId = poolRes.json().id;
    expect(poolRes.json().draftStatus).toBe("UNDRAFTED");

    // 12. List draft pool
    const poolList = await get(t, null, `/api/v1/competitions/${compId}/draft-pool`);
    expect(poolList.statusCode).toBe(200);
    expect(poolList.json().items.length).toBe(1);
    expect(poolList.json().items[0].primaryPosition).toBe("C");

    // 13. Stranger attempts to draft player -> 404 (negative authZ)
    const badDraft = await post(t, stranger, `/api/v1/competitions/${compId}/draft-pool/${poolId}/draft`, {
      teamId,
      round: 1,
      pick: 1,
    });
    expect(badDraft.statusCode).toBe(404);

    // 14. Organizer drafts player to the Bronx Bombers
    const draftPick = await post(t, organizer, `/api/v1/competitions/${compId}/draft-pool/${poolId}/draft`, {
      teamId,
      round: 1,
      pick: 1,
    });
    expect(draftPick.statusCode).toBe(200);
    expect(draftPick.json().draftStatus).toBe("DRAFTED");
    expect(draftPick.json().draftedByTeamId).toBe(teamId);
  });
});
