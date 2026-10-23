import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { roleAssignments, tacticalPlays, teams } from "../db/schema.js";
import { AuthError } from "../identity/service.js";

export type PlayCategory = "offense" | "defense" | "inbound" | "set_piece" | "press_break";
export type CourtMode = "half" | "full";

export interface TacticalTokenDto {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
}

export interface TacticalActionDto {
  id: string;
  type: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
  label?: string | undefined;
}

export interface TacticalKeyframeDto {
  step: number;
  description: string;
  tokens: TacticalTokenDto[];
  actions: TacticalActionDto[];
}

export interface CreatePlayInput {
  title: string;
  description?: string | undefined;
  teamId?: string | undefined;
  courtMode?: CourtMode | undefined;
  category?: PlayCategory | undefined;
  tags?: string[] | undefined;
  keyframes: TacticalKeyframeDto[];
}

export interface UpdatePlayInput {
  title?: string | undefined;
  description?: string | undefined;
  teamId?: string | undefined;
  courtMode?: CourtMode | undefined;
  category?: PlayCategory | undefined;
  tags?: string[] | undefined;
  keyframes?: TacticalKeyframeDto[] | undefined;
}

const toPublicPlay = (row: typeof tacticalPlays.$inferSelect) => ({
  id: row.id,
  title: row.title,
  description: row.description ?? null,
  teamId: row.teamId ?? null,
  createdBy: row.createdBy,
  courtMode: row.courtMode as CourtMode,
  category: row.category as PlayCategory,
  tags: row.tags ?? [],
  keyframes: row.keyframes ?? [],
  version: row.version,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/**
 * Checks if a user has access to view a team's tactical plays.
 */
async function canAccessTeam(db: Db, userId: string, teamId: string): Promise<boolean> {
  const [t] = await db.select({ createdBy: teams.createdBy }).from(teams).where(eq(teams.id, teamId));
  if (t?.createdBy === userId) return true;

  const [assignment] = await db
    .select()
    .from(roleAssignments)
    .where(
      and(
        eq(roleAssignments.userId, userId),
        eq(roleAssignments.resourceType, "team"),
        eq(roleAssignments.resourceId, teamId)
      )
    );

  return !!assignment;
}

export async function createTacticalPlay(db: Db, userId: string, input: CreatePlayInput) {
  if (input.teamId) {
    const hasAccess = await canAccessTeam(db, userId, input.teamId);
    if (!hasAccess) {
      throw new AuthError(404, "Team not found");
    }
  }

  const [row] = await db
    .insert(tacticalPlays)
    .values({
      title: input.title,
      description: input.description ?? null,
      teamId: input.teamId ?? null,
      createdBy: userId,
      courtMode: input.courtMode ?? "half",
      category: input.category ?? "offense",
      tags: input.tags ?? [],
      keyframes: input.keyframes,
      version: 1,
    })
    .returning();

  return toPublicPlay(row!);
}

export async function getTacticalPlay(db: Db, playId: string, currentUserId: string) {
  const [row] = await db.select().from(tacticalPlays).where(eq(tacticalPlays.id, playId));
  if (!row) return null;

  // Author has direct access
  if (row.createdBy === currentUserId) {
    return toPublicPlay(row);
  }

  // If team play, check team membership
  if (row.teamId) {
    const hasAccess = await canAccessTeam(db, currentUserId, row.teamId);
    if (hasAccess) {
      return toPublicPlay(row);
    }
  }

  // Unauthorized access returns null (404 Not Found to prevent enumeration)
  return null;
}

export async function listTacticalPlays(
  db: Db,
  currentUserId: string,
  filter?: { teamId?: string | undefined; category?: string | undefined; tag?: string | undefined }
) {
  let userTeamIds: string[] = [];
  if (filter?.teamId) {
    const hasAccess = await canAccessTeam(db, currentUserId, filter.teamId);
    if (!hasAccess) {
      return [];
    }
    userTeamIds = [filter.teamId];
  } else {
    // Find all teams the user belongs to
    const owned = await db.select({ id: teams.id }).from(teams).where(eq(teams.createdBy, currentUserId));
    const memberRoles = await db
      .select({ id: roleAssignments.resourceId })
      .from(roleAssignments)
      .where(and(eq(roleAssignments.userId, currentUserId), eq(roleAssignments.resourceType, "team")));
    userTeamIds = Array.from(
      new Set([
        ...owned.map((t) => t.id),
        ...memberRoles.map((r) => r.id).filter((id): id is string => id !== null),
      ])
    );
  }

  const allPlays = await db
    .select()
    .from(tacticalPlays)
    .where(
      userTeamIds.length > 0
        ? inArray(tacticalPlays.teamId, userTeamIds)
        : eq(tacticalPlays.createdBy, currentUserId)
    )
    .orderBy(desc(tacticalPlays.updatedAt));

  // Also include personal plays created by user if not filtering by team
  const personalPlays = filter?.teamId
    ? []
    : await db
        .select()
        .from(tacticalPlays)
        .where(eq(tacticalPlays.createdBy, currentUserId))
        .orderBy(desc(tacticalPlays.updatedAt));

  const map = new Map<string, typeof tacticalPlays.$inferSelect>();
  for (const p of [...allPlays, ...personalPlays]) {
    map.set(p.id, p);
  }

  let items = Array.from(map.values()).map(toPublicPlay);

  if (filter?.category) {
    items = items.filter((p) => p.category === filter.category);
  }
  if (filter?.tag) {
    items = items.filter((p) => p.tags.includes(filter.tag!));
  }

  return items;
}

export async function updateTacticalPlay(
  db: Db,
  playId: string,
  userId: string,
  input: UpdatePlayInput
) {
  const existing = await getTacticalPlay(db, playId, userId);
  if (!existing) {
    throw new AuthError(404, "Play not found");
  }

  // Only creator or team coach can edit
  if (existing.createdBy !== userId) {
    if (existing.teamId) {
      const isOwner = await canAccessTeam(db, userId, existing.teamId);
      if (!isOwner) throw new AuthError(404, "Play not found");
    } else {
      throw new AuthError(404, "Play not found");
    }
  }

  const [updated] = await db
    .update(tacticalPlays)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.teamId !== undefined ? { teamId: input.teamId } : {}),
      ...(input.courtMode !== undefined ? { courtMode: input.courtMode } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.keyframes !== undefined ? { keyframes: input.keyframes } : {}),
      version: existing.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(tacticalPlays.id, playId))
    .returning();

  return toPublicPlay(updated!);
}

export async function deleteTacticalPlay(db: Db, playId: string, userId: string): Promise<boolean> {
  const existing = await getTacticalPlay(db, playId, userId);
  if (!existing) {
    throw new AuthError(404, "Play not found");
  }

  if (existing.createdBy !== userId) {
    throw new AuthError(404, "Play not found");
  }

  await db.delete(tacticalPlays).where(eq(tacticalPlays.id, playId));
  return true;
}
