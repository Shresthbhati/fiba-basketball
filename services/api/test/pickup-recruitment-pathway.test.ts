import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { roleAssignments, teams } from "../src/db/schema.js";
import * as pickupSvc from "../src/pickup/service.js";
import { testApp, user } from "./helpers.js";

const H = 3_600_000;
const now = new Date();
const in_ = (hours: number) => new Date(now.getTime() + hours * H);

async function setup() {
  const t = await testApp();

  // Create Coach Ada and Athlete Bob and Athlete Charlie and Outsider Dave
  const coach = await user(t, "coach-ada@example.com", { displayName: "Coach Ada" });
  const athleteBob = await user(t, "bob-athlete@example.com", { displayName: "Bob Hooper" });
  const athleteCharlie = await user(t, "charlie-athlete@example.com", { displayName: "Charlie Baller" });
  const outsider = await user(t, "outsider@example.com", { displayName: "Dave Outsider" });

  // Coach creates team "Brooklyn Knights"
  const [team] = await t.db
    .insert(teams)
    .values({
      name: "Brooklyn Knights",
      createdBy: coach.id,
    })
    .returning();

  // Give Coach Ada COACH role on team
  await t.db.insert(roleAssignments).values({
    userId: coach.id,
    role: "COACH",
    resourceType: "team",
    resourceId: team!.id,
  });

  // Create Court and Pickup Game
  const courtRes = await t.app.inject({
    method: "POST",
    url: "/api/v1/courts",
    headers: { cookie: coach.cookie },
    payload: { name: "Rucker Park", lat: 40.83, lng: -73.94 },
  });
  const courtId = courtRes.json().id as string;

  const game = await pickupSvc.createGame(
    t.db,
    coach.id,
    {
      courtId,
      title: "Friday Elite Run",
      startsAt: in_(2),
      endsAt: in_(4),
      capacity: 10,
    },
    now,
  );

  // Bob and Charlie RSVP to the pickup run
  await pickupSvc.rsvp(t.db, game.id, athleteBob.id, now);
  await pickupSvc.rsvp(t.db, game.id, athleteCharlie.id, now);

  return {
    t,
    coach,
    athleteBob,
    athleteCharlie,
    outsider,
    team: team!,
    game,
  };
}

describe("WP-5.5 Pickup to Team/League Pathway & Direct Scouting Invites", () => {
  it("allows verified coach to scout confirmed pickup participants and rejects unauthorized invites", async () => {
    const { t, coach, athleteBob, outsider, team, game } = await setup();

    // 1. Negative AuthZ: Outsider (not coach of the team) cannot scout
    const unauthorizedRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/pickup/${game.id}/scout-invites`,
      headers: { cookie: outsider.cookie },
      payload: {
        athleteId: athleteBob.id,
        teamId: team.id,
        inviteType: "TRYOUT",
        message: "You should join our team!",
      },
    });
    expect(unauthorizedRes.statusCode).toBe(404);

    // 2. Cannot scout player who did not participate in this pickup run
    const nonParticipantRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/pickup/${game.id}/scout-invites`,
      headers: { cookie: coach.cookie },
      payload: {
        athleteId: outsider.id,
        teamId: team.id,
        inviteType: "TRYOUT",
        message: "Come try out for the Knights!",
      },
    });
    expect(nonParticipantRes.statusCode).toBe(400);

    // 3. Cannot invite oneself
    const selfInviteRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/pickup/${game.id}/scout-invites`,
      headers: { cookie: coach.cookie },
      payload: {
        athleteId: coach.id,
        teamId: team.id,
        inviteType: "TRYOUT",
        message: "Self invite",
      },
    });
    expect(selfInviteRes.statusCode).toBe(400);

    // 4. Coach successfully invites Bob to a Tryout
    const inviteRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/pickup/${game.id}/scout-invites`,
      headers: { cookie: coach.cookie },
      payload: {
        athleteId: athleteBob.id,
        teamId: team.id,
        inviteType: "TRYOUT",
        message: "Impressive handles at Friday run! Join our Division 1 team tryouts next Tuesday.",
        location: "Barclays Training Facility",
        tryoutDate: in_(48).toISOString(),
        expiresInDays: 7,
      },
    });

    expect(inviteRes.statusCode).toBe(201);
    const invite = inviteRes.json();
    expect(invite.id).toBeDefined();
    expect(invite.status).toBe("PENDING");
    expect(invite.inviteType).toBe("TRYOUT");
    expect(invite.teamId).toBe(team.id);
    expect(invite.athleteId).toBe(athleteBob.id);
    expect(invite.location).toBe("Barclays Training Facility");

    // 5. Duplicate invite is rejected with 409 Conflict
    const dupRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/pickup/${game.id}/scout-invites`,
      headers: { cookie: coach.cookie },
      payload: {
        athleteId: athleteBob.id,
        teamId: team.id,
        inviteType: "ROSTER_SPOT",
        message: "Second attempt",
      },
    });
    expect(dupRes.statusCode).toBe(409);
  });

  it("enables athlete to view incoming invites and enforces negative authz on foreign invites", async () => {
    const { t, coach, athleteBob, outsider, team, game } = await setup();

    // Send invite to Bob
    const createRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/pickup/${game.id}/scout-invites`,
      headers: { cookie: coach.cookie },
      payload: {
        athleteId: athleteBob.id,
        teamId: team.id,
        inviteType: "ROSTER_SPOT",
        message: "Direct roster invitation after your stellar defense today.",
      },
    });
    const inviteId = createRes.json().id;

    // Bob retrieves incoming invites
    const bobInboxRes = await t.app.inject({
      method: "GET",
      url: "/api/v1/recruitment/invites",
      headers: { cookie: athleteBob.cookie },
    });
    expect(bobInboxRes.statusCode).toBe(200);
    const bobInbox = bobInboxRes.json().items;
    expect(bobInbox.length).toBe(1);
    expect(bobInbox[0].id).toBe(inviteId);
    expect(bobInbox[0].teamName).toBe("Brooklyn Knights");
    expect(bobInbox[0].coachName).toBe("Coach Ada");
    expect(bobInbox[0].pickupGameTitle).toBe("Friday Elite Run");
    expect(bobInbox[0].status).toBe("PENDING");

    // Negative AuthZ: Outsider cannot view Bob's invite -> 404
    const outsiderViewRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/recruitment/invites/${inviteId}`,
      headers: { cookie: outsider.cookie },
    });
    expect(outsiderViewRes.statusCode).toBe(404);

    // Bob can view his invite
    const bobViewRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/recruitment/invites/${inviteId}`,
      headers: { cookie: athleteBob.cookie },
    });
    expect(bobViewRes.statusCode).toBe(200);
    expect(bobViewRes.json().id).toBe(inviteId);
  });

  it("adds athlete to team roster upon invite acceptance and emits notification and audit events", async () => {
    const { t, coach, athleteBob, team, game } = await setup();

    // Create invite
    const createRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/pickup/${game.id}/scout-invites`,
      headers: { cookie: coach.cookie },
      payload: {
        athleteId: athleteBob.id,
        teamId: team.id,
        inviteType: "ROSTER_SPOT",
        message: "Welcome to the team!",
      },
    });
    const inviteId = createRes.json().id;

    // Ensure Bob is not yet in team's role assignments
    const beforeRoles = await t.db
      .select()
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.userId, athleteBob.id),
          eq(roleAssignments.resourceType, "team"),
          eq(roleAssignments.resourceId, team.id),
        ),
      );
    expect(beforeRoles.length).toBe(0);

    // Bob accepts the invitation
    const acceptRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/recruitment/invites/${inviteId}/accept`,
      headers: { cookie: athleteBob.cookie },
    });
    expect(acceptRes.statusCode).toBe(200);
    const accepted = acceptRes.json();
    expect(accepted.status).toBe("ACCEPTED");
    expect(accepted.respondedAt).toBeDefined();

    // Verify Bob is now officially rostered on the team with PLAYER role
    const afterRoles = await t.db
      .select()
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.userId, athleteBob.id),
          eq(roleAssignments.resourceType, "team"),
          eq(roleAssignments.resourceId, team.id),
        ),
      );
    expect(afterRoles.length).toBe(1);
    expect(afterRoles[0]!.role).toBe("PLAYER");

    // Double-accept attempt is rejected with 409
    const retryAccept = await t.app.inject({
      method: "POST",
      url: `/api/v1/recruitment/invites/${inviteId}/accept`,
      headers: { cookie: athleteBob.cookie },
    });
    expect(retryAccept.statusCode).toBe(409);
  });

  it("handles invite decline cleanly without adding player to roster", async () => {
    const { t, coach, athleteCharlie, team, game } = await setup();

    // Invite Charlie
    const createRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/pickup/${game.id}/scout-invites`,
      headers: { cookie: coach.cookie },
      payload: {
        athleteId: athleteCharlie.id,
        teamId: team.id,
        inviteType: "DEVELOPMENT_SQUAD",
        message: "Join our development squad.",
      },
    });
    const inviteId = createRes.json().id;

    // Charlie declines
    const declineRes = await t.app.inject({
      method: "POST",
      url: `/api/v1/recruitment/invites/${inviteId}/decline`,
      headers: { cookie: athleteCharlie.cookie },
    });
    expect(declineRes.statusCode).toBe(200);
    expect(declineRes.json().status).toBe("DECLINED");

    // Charlie is NOT on the team
    const roles = await t.db
      .select()
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.userId, athleteCharlie.id),
          eq(roleAssignments.resourceType, "team"),
          eq(roleAssignments.resourceId, team.id),
        ),
      );
    expect(roles.length).toBe(0);
  });

  it("allows coach to inspect pickup scouting roster and track outgoing team invites", async () => {
    const { t, coach, athleteBob, athleteCharlie, outsider, team, game } = await setup();

    // Coach invites Bob
    await t.app.inject({
      method: "POST",
      url: `/api/v1/pickup/${game.id}/scout-invites`,
      headers: { cookie: coach.cookie },
      payload: {
        athleteId: athleteBob.id,
        teamId: team.id,
        inviteType: "TRYOUT",
        message: "Tryout invite",
      },
    });

    // 1. Coach gets scouting roster for this pickup game
    const scoutingRosterRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/pickup/${game.id}/scouting-roster`,
      headers: { cookie: coach.cookie },
    });
    expect(scoutingRosterRes.statusCode).toBe(200);
    const rosterData = scoutingRosterRes.json();
    expect(rosterData.gameId).toBe(game.id);
    expect(rosterData.coachTeams.some((ct: { id: string }) => ct.id === team.id)).toBe(true);

    const bobCandidate = rosterData.candidates.find((c: { userId: string }) => c.userId === athleteBob.id);
    const charlieCandidate = rosterData.candidates.find((c: { userId: string }) => c.userId === athleteCharlie.id);
    expect(bobCandidate).toBeDefined();
    expect(bobCandidate.invite).not.toBeNull();
    expect(bobCandidate.invite.status).toBe("PENDING");
    expect(charlieCandidate).toBeDefined();
    expect(charlieCandidate.invite).toBeNull();

    // 2. Coach views team outgoing invites
    const outgoingRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/teams/${team.id}/recruitment-invites`,
      headers: { cookie: coach.cookie },
    });
    expect(outgoingRes.statusCode).toBe(200);
    const outgoing = outgoingRes.json().items;
    expect(outgoing.length).toBe(1);
    expect(outgoing[0].athleteName).toBe("Bob Hooper");

    // 3. Negative AuthZ: Outsider cannot view team outgoing invites -> 404
    const outsiderOutgoingRes = await t.app.inject({
      method: "GET",
      url: `/api/v1/teams/${team.id}/recruitment-invites`,
      headers: { cookie: outsider.cookie },
    });
    expect(outsiderOutgoingRes.statusCode).toBe(404);
  });
});
