import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  courts,
  pickupGames,
  pickupParticipants,
  pickupRecruitmentInvites,
  roleAssignments,
  teams,
  users,
} from "../db/schema.js";
import { writeAudit } from "../audit/service.js";
import { AuthError } from "../identity/service.js";
import { notify } from "../notifications/service.js";
import { isBlockedEitherWay } from "../trust/service.js";

export type RecruitmentInviteType = "TRYOUT" | "ROSTER_SPOT" | "DEVELOPMENT_SQUAD";
export type RecruitmentInviteStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED";

export interface CreateScoutingInviteInput {
  pickupGameId: string;
  athleteId: string;
  teamId: string;
  inviteType?: RecruitmentInviteType | undefined;
  message: string;
  tryoutDate?: string | undefined;
  location?: string | undefined;
  expiresInDays?: number | undefined;
}

/** Check whether user has coach/manager permission for teamId */
async function canManageTeam(db: Db, userId: string, teamId: string): Promise<boolean> {
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) return false;
  if (team.createdBy === userId) return true;

  const [coachRole] = await db
    .select({ id: roleAssignments.id })
    .from(roleAssignments)
    .where(
      and(
        eq(roleAssignments.userId, userId),
        eq(roleAssignments.resourceType, "team"),
        eq(roleAssignments.resourceId, teamId),
        inArray(roleAssignments.role, ["COACH", "TEAM_MANAGER", "ORG_ADMIN"]),
      ),
    );
  return Boolean(coachRole);
}

/**
 * Creates a formal recruitment/tryout invite from a pickup run.
 * Negative AuthZ (ADR-0010): If caller cannot manage teamId, returns 404.
 */
export async function createScoutingInvite(
  db: Db,
  coachUser: { id: string },
  input: CreateScoutingInviteInput,
) {
  const authorized = await canManageTeam(db, coachUser.id, input.teamId);
  if (!authorized) {
    throw new AuthError(404, "Not Found");
  }

  const [team] = await db.select().from(teams).where(eq(teams.id, input.teamId));
  if (!team) throw new AuthError(404, "Not Found");

  const [game] = await db.select().from(pickupGames).where(eq(pickupGames.id, input.pickupGameId));
  if (!game) throw new AuthError(404, "Not Found");

  if (coachUser.id === input.athleteId) {
    throw new AuthError(400, "Cannot send recruitment invite to yourself");
  }

  if (await isBlockedEitherWay(db, coachUser.id, input.athleteId)) {
    throw new AuthError(404, "Not Found");
  }

  // Verify athlete participated in this pickup game
  const [participant] = await db
    .select()
    .from(pickupParticipants)
    .where(
      and(
        eq(pickupParticipants.gameId, input.pickupGameId),
        eq(pickupParticipants.userId, input.athleteId),
      ),
    );

  if (!participant || participant.status !== "CONFIRMED") {
    throw new AuthError(400, "Player must be a confirmed participant of the pickup run to be scouted");
  }

  // Verify athlete is not already a member of this team
  const [existingMember] = await db
    .select({ id: roleAssignments.id })
    .from(roleAssignments)
    .where(
      and(
        eq(roleAssignments.userId, input.athleteId),
        eq(roleAssignments.resourceType, "team"),
        eq(roleAssignments.resourceId, input.teamId),
      ),
    );
  if (existingMember) {
    throw new AuthError(409, "Player is already a member of this team");
  }

  // Verify no pending invite exists for this player and team from this pickup game
  const [existingPending] = await db
    .select({ id: pickupRecruitmentInvites.id })
    .from(pickupRecruitmentInvites)
    .where(
      and(
        eq(pickupRecruitmentInvites.teamId, input.teamId),
        eq(pickupRecruitmentInvites.athleteId, input.athleteId),
        eq(pickupRecruitmentInvites.pickupGameId, input.pickupGameId),
        eq(pickupRecruitmentInvites.status, "PENDING"),
      ),
    );
  if (existingPending) {
    throw new AuthError(409, "A pending invitation already exists for this player from your team");
  }

  const days = Math.min(Math.max(input.expiresInDays ?? 14, 1), 30);
  const expiresAt = new Date(Date.now() + days * 86_400_000);

  const [invite] = await db
    .insert(pickupRecruitmentInvites)
    .values({
      pickupGameId: input.pickupGameId,
      coachId: coachUser.id,
      athleteId: input.athleteId,
      teamId: input.teamId,
      inviteType: input.inviteType ?? "TRYOUT",
      message: input.message.trim(),
      tryoutDate: input.tryoutDate ? new Date(input.tryoutDate) : null,
      location: input.location?.trim() || null,
      expiresAt,
      status: "PENDING",
    })
    .returning();

  // Notify athlete in-app
  await notify(db, [input.athleteId], {
    kind: "TEAM_ANNOUNCEMENT",
    title: `${team.name} sent you a ${(invite?.inviteType ?? "TRYOUT").toLowerCase().replace("_", " ")} invitation!`,
    link: "/opportunities",
  });

  // Audit trail
  await writeAudit(db, {
    actorId: coachUser.id,
    action: "recruitment.invite_created",
    resourceType: "pickup_recruitment_invite",
    resourceId: invite!.id,
    metadata: {
      teamId: input.teamId,
      athleteId: input.athleteId,
      pickupGameId: input.pickupGameId,
      inviteType: invite!.inviteType,
    },
  });

  return invite!;
}

/**
 * Returns incoming recruitment invitations for an athlete.
 * Automatically marks expired pending invites as EXPIRED.
 */
export async function listAthleteInvites(
  db: Db,
  athleteId: string,
  filterStatus?: RecruitmentInviteStatus,
) {
  const now = new Date();

  // Expire overdue pending invites
  await db
    .update(pickupRecruitmentInvites)
    .set({ status: "EXPIRED" })
    .where(
      and(
        eq(pickupRecruitmentInvites.athleteId, athleteId),
        eq(pickupRecruitmentInvites.status, "PENDING"),
        sql`${pickupRecruitmentInvites.expiresAt} < ${now}`,
      ),
    );

  const query = db
    .select({
      id: pickupRecruitmentInvites.id,
      pickupGameId: pickupRecruitmentInvites.pickupGameId,
      pickupGameTitle: pickupGames.title,
      playedStartsAt: pickupGames.startsAt,
      courtName: courts.name,
      coachId: pickupRecruitmentInvites.coachId,
      coachName: users.displayName,
      teamId: pickupRecruitmentInvites.teamId,
      teamName: teams.name,
      inviteType: pickupRecruitmentInvites.inviteType,
      message: pickupRecruitmentInvites.message,
      tryoutDate: pickupRecruitmentInvites.tryoutDate,
      location: pickupRecruitmentInvites.location,
      status: pickupRecruitmentInvites.status,
      expiresAt: pickupRecruitmentInvites.expiresAt,
      respondedAt: pickupRecruitmentInvites.respondedAt,
      createdAt: pickupRecruitmentInvites.createdAt,
    })
    .from(pickupRecruitmentInvites)
    .innerJoin(teams, eq(teams.id, pickupRecruitmentInvites.teamId))
    .innerJoin(users, eq(users.id, pickupRecruitmentInvites.coachId))
    .innerJoin(pickupGames, eq(pickupGames.id, pickupRecruitmentInvites.pickupGameId))
    .innerJoin(courts, eq(courts.id, pickupGames.courtId))
    .where(
      filterStatus
        ? and(
            eq(pickupRecruitmentInvites.athleteId, athleteId),
            eq(pickupRecruitmentInvites.status, filterStatus),
          )
        : eq(pickupRecruitmentInvites.athleteId, athleteId),
    )
    .orderBy(desc(pickupRecruitmentInvites.createdAt));

  const items = await query;
  return items;
}

/**
 * Get single invitation details.
 * Negative AuthZ: Only the athlete or team coaches can view.
 */
export async function getRecruitmentInvite(db: Db, inviteId: string, userId: string) {
  const [invite] = await db
    .select({
      id: pickupRecruitmentInvites.id,
      pickupGameId: pickupRecruitmentInvites.pickupGameId,
      pickupGameTitle: pickupGames.title,
      playedStartsAt: pickupGames.startsAt,
      courtName: courts.name,
      coachId: pickupRecruitmentInvites.coachId,
      coachName: users.displayName,
      athleteId: pickupRecruitmentInvites.athleteId,
      teamId: pickupRecruitmentInvites.teamId,
      teamName: teams.name,
      inviteType: pickupRecruitmentInvites.inviteType,
      message: pickupRecruitmentInvites.message,
      tryoutDate: pickupRecruitmentInvites.tryoutDate,
      location: pickupRecruitmentInvites.location,
      status: pickupRecruitmentInvites.status,
      expiresAt: pickupRecruitmentInvites.expiresAt,
      respondedAt: pickupRecruitmentInvites.respondedAt,
      createdAt: pickupRecruitmentInvites.createdAt,
    })
    .from(pickupRecruitmentInvites)
    .innerJoin(teams, eq(teams.id, pickupRecruitmentInvites.teamId))
    .innerJoin(users, eq(users.id, pickupRecruitmentInvites.coachId))
    .innerJoin(pickupGames, eq(pickupGames.id, pickupRecruitmentInvites.pickupGameId))
    .innerJoin(courts, eq(courts.id, pickupGames.courtId))
    .where(eq(pickupRecruitmentInvites.id, inviteId));

  if (!invite) throw new AuthError(404, "Not Found");

  // Check viewer is either the athlete or a team manager/coach
  if (invite.athleteId !== userId) {
    const isCoach = await canManageTeam(db, userId, invite.teamId);
    if (!isCoach) throw new AuthError(404, "Not Found");
  }

  // Update expiration if overdue
  if (invite.status === "PENDING" && new Date() > invite.expiresAt) {
    await db
      .update(pickupRecruitmentInvites)
      .set({ status: "EXPIRED" })
      .where(eq(pickupRecruitmentInvites.id, inviteId));
    invite.status = "EXPIRED";
  }

  return invite;
}

/**
 * Athlete accepts or declines an invitation.
 * On accept: automatically enlists athlete to team roster (roleAssignments: PLAYER).
 */
export async function respondToInvite(
  db: Db,
  inviteId: string,
  athleteId: string,
  decision: "ACCEPT" | "DECLINE",
) {
  const [invite] = await db
    .select()
    .from(pickupRecruitmentInvites)
    .where(eq(pickupRecruitmentInvites.id, inviteId));

  if (!invite || invite.athleteId !== athleteId) {
    throw new AuthError(404, "Not Found");
  }

  if (invite.status !== "PENDING") {
    throw new AuthError(409, "Invitation is no longer pending");
  }

  if (new Date() > invite.expiresAt) {
    await db
      .update(pickupRecruitmentInvites)
      .set({ status: "EXPIRED" })
      .where(eq(pickupRecruitmentInvites.id, inviteId));
    throw new AuthError(409, "Invitation has expired");
  }

  const [team] = await db.select().from(teams).where(eq(teams.id, invite.teamId));
  const [athlete] = await db.select().from(users).where(eq(users.id, athleteId));
  const now = new Date();

  if (decision === "ACCEPT") {
    // 1. Update invite status
    await db
      .update(pickupRecruitmentInvites)
      .set({ status: "ACCEPTED", respondedAt: now })
      .where(eq(pickupRecruitmentInvites.id, inviteId));

    // 2. Add athlete to team roster
    const [existingRole] = await db
      .select({ id: roleAssignments.id })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.userId, athleteId),
          eq(roleAssignments.resourceType, "team"),
          eq(roleAssignments.resourceId, invite.teamId),
        ),
      );

    if (!existingRole) {
      await db.insert(roleAssignments).values({
        userId: athleteId,
        role: "PLAYER",
        resourceType: "team",
        resourceId: invite.teamId,
      });
    }

    // 3. Notify coach and athlete
    await notify(db, [invite.coachId], {
      kind: "TEAM_ANNOUNCEMENT",
      title: `${athlete?.displayName ?? "Player"} accepted your recruitment invite to ${team?.name ?? "the team"}!`,
      link: `/teams/${invite.teamId}`,
    });

    await notify(db, [athleteId], {
      kind: "ADDED_TO_TEAM",
      title: `You joined ${team?.name ?? "the team"} via pickup pathway!`,
      link: `/teams/${invite.teamId}`,
    });

    // 4. Audit
    await writeAudit(db, {
      actorId: athleteId,
      action: "recruitment.invite_accepted",
      resourceType: "pickup_recruitment_invite",
      resourceId: invite.id,
      metadata: { teamId: invite.teamId, pickupGameId: invite.pickupGameId },
    });

    return { ...invite, status: "ACCEPTED" as const, respondedAt: now };
  } else {
    // DECLINE
    await db
      .update(pickupRecruitmentInvites)
      .set({ status: "DECLINED", respondedAt: now })
      .where(eq(pickupRecruitmentInvites.id, inviteId));

    await notify(db, [invite.coachId], {
      kind: "TEAM_ANNOUNCEMENT",
      title: `${athlete?.displayName ?? "Player"} declined your recruitment invite to ${team?.name ?? "the team"}.`,
    });

    await writeAudit(db, {
      actorId: athleteId,
      action: "recruitment.invite_declined",
      resourceType: "pickup_recruitment_invite",
      resourceId: invite.id,
      metadata: { teamId: invite.teamId, pickupGameId: invite.pickupGameId },
    });

    return { ...invite, status: "DECLINED" as const, respondedAt: now };
  }
}

/**
 * Lists outgoing recruitment invites for a team.
 * Negative AuthZ: Caller must be coach or manager of that team.
 */
export async function listTeamOutgoingInvites(db: Db, teamId: string, currentUserId: string) {
  const authorized = await canManageTeam(db, currentUserId, teamId);
  if (!authorized) {
    throw new AuthError(404, "Not Found");
  }

  const items = await db
    .select({
      id: pickupRecruitmentInvites.id,
      athleteId: pickupRecruitmentInvites.athleteId,
      athleteName: users.displayName,
      pickupGameId: pickupRecruitmentInvites.pickupGameId,
      pickupGameTitle: pickupGames.title,
      inviteType: pickupRecruitmentInvites.inviteType,
      message: pickupRecruitmentInvites.message,
      tryoutDate: pickupRecruitmentInvites.tryoutDate,
      location: pickupRecruitmentInvites.location,
      status: pickupRecruitmentInvites.status,
      expiresAt: pickupRecruitmentInvites.expiresAt,
      respondedAt: pickupRecruitmentInvites.respondedAt,
      createdAt: pickupRecruitmentInvites.createdAt,
    })
    .from(pickupRecruitmentInvites)
    .innerJoin(users, eq(users.id, pickupRecruitmentInvites.athleteId))
    .innerJoin(pickupGames, eq(pickupGames.id, pickupRecruitmentInvites.pickupGameId))
    .where(eq(pickupRecruitmentInvites.teamId, teamId))
    .orderBy(desc(pickupRecruitmentInvites.createdAt));

  return items;
}

/**
 * Returns scouting roster of participants in a pickup game with existing invite statuses
 * relative to the coach's teams.
 */
export async function getPickupScoutingRoster(
  db: Db,
  pickupGameId: string,
  coachUserId: string,
) {
  const [game] = await db.select().from(pickupGames).where(eq(pickupGames.id, pickupGameId));
  if (!game) throw new AuthError(404, "Not Found");

  // Find teams managed by this coach
  const createdTeams = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.createdBy, coachUserId));

  const roleTeams = await db
    .select({ id: teams.id, name: teams.name })
    .from(roleAssignments)
    .innerJoin(teams, eq(teams.id, roleAssignments.resourceId))
    .where(
      and(
        eq(roleAssignments.userId, coachUserId),
        eq(roleAssignments.resourceType, "team"),
        inArray(roleAssignments.role, ["COACH", "TEAM_MANAGER", "ORG_ADMIN"]),
      ),
    );

  const teamMap = new Map<string, string>();
  for (const t of [...createdTeams, ...roleTeams]) {
    teamMap.set(t.id, t.name);
  }
  const managedTeamIds = Array.from(teamMap.keys());

  // Confirmed participants of this game
  const participants = await db
    .select({
      userId: pickupParticipants.userId,
      name: users.displayName,
      status: pickupParticipants.status,
      checkedInAt: pickupParticipants.checkedInAt,
    })
    .from(pickupParticipants)
    .innerJoin(users, eq(users.id, pickupParticipants.userId))
    .where(eq(pickupParticipants.gameId, pickupGameId))
    .orderBy(asc(pickupParticipants.joinedAt));

  // Find existing invites for this game sent by this coach's teams
  const existingInvites = managedTeamIds.length > 0
    ? await db
        .select()
        .from(pickupRecruitmentInvites)
        .where(
          and(
            eq(pickupRecruitmentInvites.pickupGameId, pickupGameId),
            inArray(pickupRecruitmentInvites.teamId, managedTeamIds),
          ),
        )
    : [];

  const candidateRoster = participants
    .filter((p) => p.userId !== coachUserId && p.status === "CONFIRMED")
    .map((p) => {
      const invite = existingInvites.find((inv) => inv.athleteId === p.userId);
      return {
        userId: p.userId,
        displayName: p.name,
        checkedIn: p.checkedInAt !== null,
        invite: invite
          ? {
              id: invite.id,
              teamId: invite.teamId,
              teamName: teamMap.get(invite.teamId) ?? "Team",
              inviteType: invite.inviteType,
              status: invite.status,
              expiresAt: invite.expiresAt,
            }
          : null,
      };
    });

  return {
    gameId: game.id,
    gameTitle: game.title,
    coachTeams: Array.from(teamMap.entries()).map(([id, name]) => ({ id, name })),
    candidates: candidateRoster,
  };
}
