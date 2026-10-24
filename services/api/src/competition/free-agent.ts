import { and, desc, eq } from "drizzle-orm";
import { can, grantRole } from "../authz/service.js";
import type { Db } from "../db/index.js";
import {
  competitionDraftPool,
  competitions,
  freeAgentListings,
  teamInvitations,
  teams,
  users,
} from "../db/schema.js";
import { AuthError } from "../identity/service.js";

export interface CreateFreeAgentInput {
  city: string;
  primaryPosition: "PG" | "SG" | "SF" | "PF" | "C";
  secondaryPositions?: ("PG" | "SG" | "SF" | "PF" | "C")[] | undefined;
  skillLevel?: "OPEN" | "CASUAL" | "INTERMEDIATE" | "COMPETITIVE" | undefined;
  experienceYears?: number | undefined;
  availability?: "WEEKDAYS" | "WEEKENDS" | "EVENINGS" | "ANYTIME" | undefined;
  bio?: string | undefined;
  linkedCommunityId?: string | undefined;
}

export interface ListFreeAgentsFilter {
  city?: string | undefined;
  position?: string | undefined;
  skillLevel?: string | undefined;
  availability?: string | undefined;
}

export async function createOrUpdateFreeAgentListing(
  db: Db,
  userId: string,
  input: CreateFreeAgentInput,
) {
  const [existing] = await db
    .select()
    .from(freeAgentListings)
    .where(eq(freeAgentListings.userId, userId));

  if (existing) {
    const [updated] = await db
      .update(freeAgentListings)
      .set({
        city: input.city.trim(),
        primaryPosition: input.primaryPosition,
        secondaryPositions: input.secondaryPositions ?? existing.secondaryPositions,
        skillLevel: input.skillLevel ?? existing.skillLevel,
        experienceYears: input.experienceYears ?? existing.experienceYears,
        availability: input.availability ?? existing.availability,
        bio: input.bio !== undefined ? input.bio : existing.bio,
        linkedCommunityId: input.linkedCommunityId ?? existing.linkedCommunityId,
        status: "ACTIVE",
        updatedAt: new Date(),
      })
      .where(eq(freeAgentListings.id, existing.id))
      .returning();
    return updated!;
  }

  const [created] = await db
    .insert(freeAgentListings)
    .values({
      userId,
      city: input.city.trim(),
      primaryPosition: input.primaryPosition,
      secondaryPositions: input.secondaryPositions ?? [],
      skillLevel: input.skillLevel ?? "OPEN",
      experienceYears: input.experienceYears ?? 0,
      availability: input.availability ?? "ANYTIME",
      bio: input.bio ?? null,
      linkedCommunityId: input.linkedCommunityId ?? null,
      status: "ACTIVE",
    })
    .returning();

  return created!;
}

export async function getMyFreeAgentListing(db: Db, userId: string) {
  const [listing] = await db
    .select()
    .from(freeAgentListings)
    .where(eq(freeAgentListings.userId, userId));
  return listing ?? null;
}

export async function listFreeAgents(db: Db, filters: ListFreeAgentsFilter = {}) {
  const query = db
    .select({
      id: freeAgentListings.id,
      userId: freeAgentListings.userId,
      displayName: users.displayName,
      city: freeAgentListings.city,
      primaryPosition: freeAgentListings.primaryPosition,
      secondaryPositions: freeAgentListings.secondaryPositions,
      skillLevel: freeAgentListings.skillLevel,
      experienceYears: freeAgentListings.experienceYears,
      availability: freeAgentListings.availability,
      bio: freeAgentListings.bio,
      status: freeAgentListings.status,
      linkedCommunityId: freeAgentListings.linkedCommunityId,
      createdAt: freeAgentListings.createdAt,
    })
    .from(freeAgentListings)
    .innerJoin(users, eq(users.id, freeAgentListings.userId))
    .where(
      and(
        eq(freeAgentListings.status, "ACTIVE"),
        filters.city ? eq(freeAgentListings.city, filters.city) : undefined,
        filters.position ? eq(freeAgentListings.primaryPosition, filters.position) : undefined,
        filters.skillLevel ? eq(freeAgentListings.skillLevel, filters.skillLevel) : undefined,
        filters.availability ? eq(freeAgentListings.availability, filters.availability) : undefined,
      ),
    )
    .orderBy(desc(freeAgentListings.updatedAt));

  return query;
}

export async function invitePlayerToTeam(
  db: Db,
  teamId: string,
  inviterId: string,
  input: { userId: string; role?: "PLAYER" | "COACH" | undefined; message?: string | undefined },
) {
  // 1. Verify team exists
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) throw new AuthError(404, "Team not found");

  // 2. Verify inviter is coach or manager
  const canManage =
    (await can(db, inviterId, "film:manage", { type: "team", id: teamId })) ||
    (await can(db, inviterId, "competition:manage", { type: "team", id: teamId }));

  if (!canManage) {
    throw new AuthError(404, "Team not found or permission denied");
  }

  // 3. Verify target player exists
  const [targetUser] = await db.select().from(users).where(eq(users.id, input.userId));
  if (!targetUser) throw new AuthError(404, "Target player not found");

  // 4. Create invitation
  const [invitation] = await db
    .insert(teamInvitations)
    .values({
      teamId,
      userId: input.userId,
      inviterId,
      role: input.role ?? "PLAYER",
      message: input.message ?? null,
      status: "PENDING",
    })
    .returning();

  return invitation!;
}

export async function listTeamInvitations(db: Db, teamId: string, viewerId: string) {
  const canManage = await can(db, viewerId, "film:manage", { type: "team", id: teamId });
  if (!canManage) throw new AuthError(404, "Not Found");

  return db
    .select({
      id: teamInvitations.id,
      teamId: teamInvitations.teamId,
      userId: teamInvitations.userId,
      playerName: users.displayName,
      role: teamInvitations.role,
      message: teamInvitations.message,
      status: teamInvitations.status,
      createdAt: teamInvitations.createdAt,
    })
    .from(teamInvitations)
    .innerJoin(users, eq(users.id, teamInvitations.userId))
    .where(eq(teamInvitations.teamId, teamId))
    .orderBy(desc(teamInvitations.createdAt));
}

export async function listMyInvitations(db: Db, userId: string) {
  return db
    .select({
      id: teamInvitations.id,
      teamId: teamInvitations.teamId,
      teamName: teams.name,
      role: teamInvitations.role,
      message: teamInvitations.message,
      status: teamInvitations.status,
      createdAt: teamInvitations.createdAt,
    })
    .from(teamInvitations)
    .innerJoin(teams, eq(teams.id, teamInvitations.teamId))
    .where(eq(teamInvitations.userId, userId))
    .orderBy(desc(teamInvitations.createdAt));
}

export async function respondToTeamInvitation(
  db: Db,
  invitationId: string,
  userId: string,
  action: "ACCEPTED" | "DECLINED",
) {
  const [invitation] = await db
    .select()
    .from(teamInvitations)
    .where(eq(teamInvitations.id, invitationId));

  if (!invitation || invitation.userId !== userId) {
    throw new AuthError(404, "Invitation not found");
  }

  if (invitation.status !== "PENDING") {
    throw new AuthError(400, "Invitation has already been responded to");
  }

  const [updated] = await db
    .update(teamInvitations)
    .set({
      status: action,
      respondedAt: new Date(),
    })
    .where(eq(teamInvitations.id, invitationId))
    .returning();

  if (action === "ACCEPTED") {
    // Add user to team via role assignment
    await grantRole(db, userId, (invitation.role as "PLAYER" | "COACH") ?? "PLAYER", {
      type: "team",
      id: invitation.teamId,
    });

    // Mark free agent listing as MATCHED
    await db
      .update(freeAgentListings)
      .set({ status: "MATCHED", updatedAt: new Date() })
      .where(eq(freeAgentListings.userId, userId));
  }

  return updated!;
}

// -------------------------------------------------------------
// Competition Draft Pool
// -------------------------------------------------------------

export async function joinCompetitionDraftPool(
  db: Db,
  competitionId: string,
  userId: string,
  input: { primaryPosition: string; skillLevel?: string | undefined },
) {
  const [comp] = await db.select().from(competitions).where(eq(competitions.id, competitionId));
  if (!comp) throw new AuthError(404, "Competition not found");

  const [existing] = await db
    .select()
    .from(competitionDraftPool)
    .where(
      and(
        eq(competitionDraftPool.competitionId, competitionId),
        eq(competitionDraftPool.userId, userId),
      ),
    );

  if (existing) {
    if (existing.draftStatus === "DRAFTED") {
      throw new AuthError(400, "Already drafted in this competition");
    }
    const [updated] = await db
      .update(competitionDraftPool)
      .set({
        primaryPosition: input.primaryPosition,
        skillLevel: input.skillLevel ?? existing.skillLevel,
        draftStatus: "UNDRAFTED",
      })
      .where(eq(competitionDraftPool.id, existing.id))
      .returning();
    return updated!;
  }

  const [created] = await db
    .insert(competitionDraftPool)
    .values({
      competitionId,
      userId,
      primaryPosition: input.primaryPosition,
      skillLevel: input.skillLevel ?? "OPEN",
      draftStatus: "UNDRAFTED",
    })
    .returning();

  return created!;
}

export async function listCompetitionDraftPool(db: Db, competitionId: string) {
  return db
    .select({
      id: competitionDraftPool.id,
      competitionId: competitionDraftPool.competitionId,
      userId: competitionDraftPool.userId,
      playerName: users.displayName,
      primaryPosition: competitionDraftPool.primaryPosition,
      skillLevel: competitionDraftPool.skillLevel,
      draftStatus: competitionDraftPool.draftStatus,
      draftedByTeamId: competitionDraftPool.draftedByTeamId,
      draftRound: competitionDraftPool.draftRound,
      draftPick: competitionDraftPool.draftPick,
      registeredAt: competitionDraftPool.registeredAt,
    })
    .from(competitionDraftPool)
    .innerJoin(users, eq(users.id, competitionDraftPool.userId))
    .where(eq(competitionDraftPool.competitionId, competitionId))
    .orderBy(desc(competitionDraftPool.registeredAt));
}

export async function draftPlayerFromPool(
  db: Db,
  competitionId: string,
  poolId: string,
  actorId: string,
  input: { teamId: string; round?: number | undefined; pick?: number | undefined },
) {
  // Verify organizer or team coach
  const isOrganizer = await can(db, actorId, "competition:manage", {
    type: "competition",
    id: competitionId,
  });
  const isCoach = await can(db, actorId, "film:manage", {
    type: "team",
    id: input.teamId,
  });

  if (!isOrganizer && !isCoach) {
    throw new AuthError(404, "Permission denied or competition not found");
  }

  // Verify pool entry
  const [poolEntry] = await db
    .select()
    .from(competitionDraftPool)
    .where(
      and(
        eq(competitionDraftPool.id, poolId),
        eq(competitionDraftPool.competitionId, competitionId),
      ),
    );

  if (!poolEntry) {
    throw new AuthError(404, "Draft pool entry not found");
  }

  if (poolEntry.draftStatus === "DRAFTED") {
    throw new AuthError(400, "Player has already been drafted");
  }

  // Update draft pool
  const [drafted] = await db
    .update(competitionDraftPool)
    .set({
      draftStatus: "DRAFTED",
      draftedByTeamId: input.teamId,
      draftRound: input.round ?? null,
      draftPick: input.pick ?? null,
      draftedAt: new Date(),
    })
    .where(eq(competitionDraftPool.id, poolId))
    .returning();

  // Add player to team role assignment
  await grantRole(db, poolEntry.userId, "PLAYER", {
    type: "team",
    id: input.teamId,
  });

  return drafted!;
}
