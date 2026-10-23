import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  filmClips,
  filmGames,
  filmSavedSearches,
  roleAssignments,
  scoutingMontages,
  teams,
} from "../db/schema.js";
import { AuthError } from "../identity/service.js";

export interface SearchFilmQuery {
  q?: string | undefined;
  tag?: string | undefined;
  gameId?: string | undefined;
  minDurationMs?: number | undefined;
  maxDurationMs?: number | undefined;
}

export interface MontageClipItem {
  clipId: string;
  gameId: string;
  order: number;
  startMs: number;
  endMs: number;
  title?: string | undefined;
  note?: string | undefined;
  tags?: string[] | undefined;
}

export interface CreateMontageInput {
  title: string;
  description?: string | undefined;
  tags?: string[] | undefined;
  items: MontageClipItem[];
}

export interface UpdateMontageInput {
  title?: string | undefined;
  description?: string | undefined;
  tags?: string[] | undefined;
  items?: MontageClipItem[] | undefined;
}

export interface CreateSavedSearchInput {
  name: string;
  filters: SearchFilmQuery;
}

const toPublicMontage = (m: typeof scoutingMontages.$inferSelect) => ({
  id: m.id,
  teamId: m.teamId,
  title: m.title,
  description: m.description ?? null,
  tags: m.tags ?? [],
  items: m.items ?? [],
  totalDurationMs: m.totalDurationMs,
  createdBy: m.createdBy,
  createdAt: m.createdAt.toISOString(),
  updatedAt: m.updatedAt.toISOString(),
});

async function canViewTeam(db: Db, userId: string, teamId: string): Promise<boolean> {
  const [t] = await db.select({ createdBy: teams.createdBy }).from(teams).where(eq(teams.id, teamId));
  if (!t) return false;
  if (t.createdBy === userId) return true;

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

export async function searchFilmClips(
  db: Db,
  userId: string,
  teamId: string,
  query: SearchFilmQuery
) {
  const hasAccess = await canViewTeam(db, userId, teamId);
  if (!hasAccess) {
    throw new AuthError(404, "Team not found");
  }

  // Fetch all games belonging to team
  const games = await db.select().from(filmGames).where(eq(filmGames.teamId, teamId));
  const gameMap = new Map(games.map((g) => [g.id, g]));

  if (games.length === 0) {
    return { items: [] };
  }

  // Fetch clips from those games
  const allClips = await db
    .select()
    .from(filmClips)
    .orderBy(desc(filmClips.createdAt));

  const teamClips = allClips.filter((c) => gameMap.has(c.gameId));

  const filtered = teamClips.filter((clip) => {
    const game = gameMap.get(clip.gameId)!;
    const durationMs = clip.endMs - clip.startMs;

    if (query.gameId && clip.gameId !== query.gameId) return false;
    if (query.tag && !clip.tags.map((t) => t.toLowerCase()).includes(query.tag.toLowerCase())) return false;
    if (query.minDurationMs !== undefined && durationMs < query.minDurationMs) return false;
    if (query.maxDurationMs !== undefined && durationMs > query.maxDurationMs) return false;

    if (query.q) {
      const q = query.q.toLowerCase();
      const matchNote = clip.note?.toLowerCase().includes(q) ?? false;
      const matchTitle = game.title.toLowerCase().includes(q);
      const matchOpponent = game.opponent?.toLowerCase().includes(q) ?? false;
      const matchTags = clip.tags.some((t) => t.toLowerCase().includes(q));
      if (!matchNote && !matchTitle && !matchOpponent && !matchTags) return false;
    }

    return true;
  });

  const items = filtered.map((c) => {
    const g = gameMap.get(c.gameId)!;
    return {
      id: c.id,
      gameId: c.gameId,
      gameTitle: g.title,
      opponent: g.opponent ?? null,
      playedOn: g.playedOn ?? null,
      startMs: c.startMs,
      endMs: c.endMs,
      durationMs: c.endMs - c.startMs,
      tags: c.tags,
      note: c.note ?? null,
      createdAt: c.createdAt.toISOString(),
    };
  });

  return { items };
}

// Saved Searches
export async function createSavedSearch(
  db: Db,
  userId: string,
  teamId: string,
  input: CreateSavedSearchInput
) {
  const hasAccess = await canViewTeam(db, userId, teamId);
  if (!hasAccess) {
    throw new AuthError(404, "Team not found");
  }

  const [row] = await db
    .insert(filmSavedSearches)
    .values({
      teamId,
      userId,
      name: input.name,
      filters: input.filters,
    })
    .returning();

  return {
    id: row!.id,
    teamId: row!.teamId,
    userId: row!.userId,
    name: row!.name,
    filters: row!.filters,
    createdAt: row!.createdAt.toISOString(),
  };
}

export async function listSavedSearches(db: Db, userId: string, teamId: string) {
  const hasAccess = await canViewTeam(db, userId, teamId);
  if (!hasAccess) {
    throw new AuthError(404, "Team not found");
  }

  const rows = await db
    .select()
    .from(filmSavedSearches)
    .where(and(eq(filmSavedSearches.teamId, teamId), eq(filmSavedSearches.userId, userId)))
    .orderBy(desc(filmSavedSearches.createdAt));

  return {
    items: rows.map((r) => ({
      id: r.id,
      teamId: r.teamId,
      userId: r.userId,
      name: r.name,
      filters: r.filters,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export async function deleteSavedSearch(
  db: Db,
  userId: string,
  teamId: string,
  searchId: string
): Promise<boolean> {
  const hasAccess = await canViewTeam(db, userId, teamId);
  if (!hasAccess) {
    throw new AuthError(404, "Team not found");
  }

  const deleted = await db
    .delete(filmSavedSearches)
    .where(
      and(
        eq(filmSavedSearches.id, searchId),
        eq(filmSavedSearches.teamId, teamId),
        eq(filmSavedSearches.userId, userId)
      )
    )
    .returning({ id: filmSavedSearches.id });

  if (deleted.length === 0) {
    throw new AuthError(404, "Saved search not found");
  }

  return true;
}

// Scouting Montages
export async function createMontage(
  db: Db,
  userId: string,
  teamId: string,
  input: CreateMontageInput
) {
  const hasAccess = await canViewTeam(db, userId, teamId);
  if (!hasAccess) {
    throw new AuthError(404, "Team not found");
  }

  const totalDurationMs = input.items.reduce(
    (sum, item) => sum + Math.max(0, item.endMs - item.startMs),
    0
  );

  const [row] = await db
    .insert(scoutingMontages)
    .values({
      teamId,
      title: input.title,
      description: input.description ?? null,
      tags: input.tags ?? [],
      items: input.items,
      totalDurationMs,
      createdBy: userId,
    })
    .returning();

  return toPublicMontage(row!);
}

export async function getMontage(db: Db, userId: string, montageId: string) {
  const [row] = await db.select().from(scoutingMontages).where(eq(scoutingMontages.id, montageId));
  if (!row) return null;

  const hasAccess = await canViewTeam(db, userId, row.teamId);
  if (!hasAccess) {
    return null; // RFC 9457 404 per ADR-0010
  }

  return toPublicMontage(row);
}

export async function listMontages(db: Db, userId: string, teamId: string) {
  const hasAccess = await canViewTeam(db, userId, teamId);
  if (!hasAccess) {
    throw new AuthError(404, "Team not found");
  }

  const rows = await db
    .select()
    .from(scoutingMontages)
    .where(eq(scoutingMontages.teamId, teamId))
    .orderBy(desc(scoutingMontages.createdAt));

  return { items: rows.map(toPublicMontage) };
}

export async function updateMontage(
  db: Db,
  userId: string,
  montageId: string,
  input: UpdateMontageInput
) {
  const existing = await getMontage(db, userId, montageId);
  if (!existing) {
    throw new AuthError(404, "Montage not found");
  }

  const totalDurationMs = input.items
    ? input.items.reduce((sum, item) => sum + Math.max(0, item.endMs - item.startMs), 0)
    : undefined;

  const [updated] = await db
    .update(scoutingMontages)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.items !== undefined ? { items: input.items } : {}),
      ...(totalDurationMs !== undefined ? { totalDurationMs } : {}),
      updatedAt: new Date(),
    })
    .where(eq(scoutingMontages.id, montageId))
    .returning();

  return toPublicMontage(updated!);
}

export async function deleteMontage(
  db: Db,
  userId: string,
  montageId: string
): Promise<boolean> {
  const existing = await getMontage(db, userId, montageId);
  if (!existing) {
    throw new AuthError(404, "Montage not found");
  }

  await db.delete(scoutingMontages).where(eq(scoutingMontages.id, montageId));
  return true;
}
