import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  communities,
  communityMembers,
  courts,
  pickupGames,
  users,
} from "../db/schema.js";
import { AuthError } from "../identity/service.js";

export interface CreateCommunityInput {
  name: string;
  description?: string | undefined;
  city: string;
  primaryCourtId?: string | undefined;
  isPrivate?: boolean | undefined;
  skillLevel?: string | undefined;
}

export interface ListCommunitiesFilter {
  city?: string | undefined;
  skillLevel?: string | undefined;
  search?: string | undefined;
}

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
  const suffix = Math.random().toString(36).substring(2, 7);
  return `${base}-${suffix}`;
}

export async function createCommunity(
  db: Db,
  creatorId: string,
  input: CreateCommunityInput,
) {
  const slug = slugify(input.name);

  const [comm] = await db
    .insert(communities)
    .values({
      slug,
      name: input.name,
      description: input.description ?? null,
      city: input.city,
      primaryCourtId: input.primaryCourtId ?? null,
      isPrivate: input.isPrivate ?? false,
      creatorId,
      memberCount: 1,
      skillLevel: input.skillLevel ?? "OPEN",
    })
    .returning();

  // Add creator as LEADER
  await db.insert(communityMembers).values({
    communityId: comm!.id,
    userId: creatorId,
    role: "LEADER",
    status: "ACTIVE",
  });

  return comm!;
}

export async function listCommunities(
  db: Db,
  filter: ListCommunitiesFilter = {},
  actorId?: string | undefined,
) {
  const conditions = [];

  if (filter.city) {
    conditions.push(sql`lower(${communities.city}) = lower(${filter.city})`);
  }
  if (filter.skillLevel && filter.skillLevel !== "ALL") {
    conditions.push(eq(communities.skillLevel, filter.skillLevel));
  }
  if (filter.search) {
    conditions.push(sql`lower(${communities.name}) like ${`%${filter.search.toLowerCase()}%`}`);
  }

  // Hide private communities unless the actor is an active member
  if (actorId) {
    const memberComms = await db
      .select({ communityId: communityMembers.communityId })
      .from(communityMembers)
      .where(
        and(
          eq(communityMembers.userId, actorId),
          eq(communityMembers.status, "ACTIVE"),
        ),
      );
    const memberCommIds = memberComms.map((m) => m.communityId);

    if (memberCommIds.length > 0) {
      conditions.push(
        sql`(${communities.isPrivate} = false or ${inArray(communities.id, memberCommIds)})`,
      );
    } else {
      conditions.push(eq(communities.isPrivate, false));
    }
  } else {
    conditions.push(eq(communities.isPrivate, false));
  }

  const rows = await db
    .select({
      id: communities.id,
      slug: communities.slug,
      name: communities.name,
      description: communities.description,
      city: communities.city,
      primaryCourtId: communities.primaryCourtId,
      primaryCourtName: courts.name,
      isPrivate: communities.isPrivate,
      creatorId: communities.creatorId,
      memberCount: communities.memberCount,
      skillLevel: communities.skillLevel,
      createdAt: communities.createdAt,
    })
    .from(communities)
    .leftJoin(courts, eq(courts.id, communities.primaryCourtId))
    .where(and(...conditions))
    .orderBy(desc(communities.createdAt))
    .limit(50);

  return rows;
}

export async function getCommunityById(
  db: Db,
  communityId: string,
  actorId?: string | undefined,
) {
  const [comm] = await db
    .select({
      id: communities.id,
      slug: communities.slug,
      name: communities.name,
      description: communities.description,
      city: communities.city,
      primaryCourtId: communities.primaryCourtId,
      primaryCourtName: courts.name,
      isPrivate: communities.isPrivate,
      creatorId: communities.creatorId,
      memberCount: communities.memberCount,
      skillLevel: communities.skillLevel,
      createdAt: communities.createdAt,
    })
    .from(communities)
    .leftJoin(courts, eq(courts.id, communities.primaryCourtId))
    .where(eq(communities.id, communityId));

  if (!comm) {
    throw new AuthError(404, "Community not found");
  }

  // If private, verify membership (ADR-0010: return 404 for unauthorized actors)
  if (comm.isPrivate) {
    if (!actorId) throw new AuthError(404, "Community not found");
    const [membership] = await db
      .select()
      .from(communityMembers)
      .where(
        and(
          eq(communityMembers.communityId, communityId),
          eq(communityMembers.userId, actorId),
          eq(communityMembers.status, "ACTIVE"),
        ),
      );
    if (!membership) {
      throw new AuthError(404, "Community not found");
    }
  }

  return comm;
}

export async function joinCommunity(
  db: Db,
  communityId: string,
  userId: string,
) {
  const [comm] = await db
    .select()
    .from(communities)
    .where(eq(communities.id, communityId));

  if (!comm) {
    throw new AuthError(404, "Community not found");
  }

  const [existing] = await db
    .select()
    .from(communityMembers)
    .where(
      and(
        eq(communityMembers.communityId, communityId),
        eq(communityMembers.userId, userId),
      ),
    );

  if (existing) {
    if (existing.status === "ACTIVE") {
      return existing;
    }
    if (existing.status === "BANNED") {
      throw new AuthError(403, "You cannot join this community.");
    }
    return existing;
  }

  const status = comm.isPrivate ? "PENDING" : "ACTIVE";

  const [member] = await db
    .insert(communityMembers)
    .values({
      communityId,
      userId,
      role: "MEMBER",
      status,
    })
    .returning();

  if (status === "ACTIVE") {
    await db
      .update(communities)
      .set({
        memberCount: sql`${communities.memberCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(communities.id, communityId));
  }

  return member!;
}

export async function leaveCommunity(
  db: Db,
  communityId: string,
  userId: string,
) {
  const [member] = await db
    .select()
    .from(communityMembers)
    .where(
      and(
        eq(communityMembers.communityId, communityId),
        eq(communityMembers.userId, userId),
      ),
    );

  if (!member) {
    throw new AuthError(404, "You are not a member of this community");
  }

  if (member.role === "LEADER") {
    throw new AuthError(400, "Community leaders must transfer ownership before leaving");
  }

  await db
    .delete(communityMembers)
    .where(eq(communityMembers.id, member.id));

  if (member.status === "ACTIVE") {
    await db
      .update(communities)
      .set({
        memberCount: sql`greatest(1, ${communities.memberCount} - 1)`,
        updatedAt: new Date(),
      })
      .where(eq(communities.id, communityId));
  }
}

export async function listCommunityMembers(
  db: Db,
  communityId: string,
  actorId: string,
) {
  // Check access to community
  await getCommunityById(db, communityId, actorId);

  const members = await db
    .select({
      id: communityMembers.id,
      userId: communityMembers.userId,
      displayName: users.displayName,
      role: communityMembers.role,
      status: communityMembers.status,
      joinedAt: communityMembers.joinedAt,
    })
    .from(communityMembers)
    .innerJoin(users, eq(users.id, communityMembers.userId))
    .where(
      and(
        eq(communityMembers.communityId, communityId),
        eq(communityMembers.status, "ACTIVE"),
      ),
    )
    .orderBy(desc(communityMembers.joinedAt));

  return members;
}

export async function listCommunityGames(
  db: Db,
  communityId: string,
  actorId?: string | undefined,
) {
  await getCommunityById(db, communityId, actorId);

  const games = await db
    .select({
      id: pickupGames.id,
      title: pickupGames.title,
      startsAt: pickupGames.startsAt,
      endsAt: pickupGames.endsAt,
      capacity: pickupGames.capacity,
      skillBand: pickupGames.skillBand,
      status: pickupGames.status,
      courtName: courts.name,
    })
    .from(pickupGames)
    .innerJoin(courts, eq(courts.id, pickupGames.courtId))
    .where(eq(pickupGames.communityId, communityId))
    .orderBy(desc(pickupGames.startsAt))
    .limit(20);

  return games;
}
