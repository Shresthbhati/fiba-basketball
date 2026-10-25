import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { filmAnnotations, filmGames } from "../db/schema.js";
import { can } from "../authz/service.js";
import { AuthError } from "../identity/service.js";

export interface AnnotationShape {
  id: string;
  type: "ARROW" | "CIRCLE" | "SPOTLIGHT" | "RECTANGLE" | "FREEHAND" | "TEXT";
  color: string;
  strokeWidth?: number | undefined;
  coordinates: {
    x1: number;
    y1: number;
    x2?: number | undefined;
    y2?: number | undefined;
    radius?: number | undefined;
    points?: Array<{ x: number; y: number }> | undefined;
    text?: string | undefined;
  };
}

export interface CreateAnnotationInput {
  clipId?: string | undefined;
  timestampMs: number;
  durationMs?: number | undefined;
  title?: string | undefined;
  category?: string | undefined;
  shapes: AnnotationShape[];
  notes?: string | undefined;
}

export interface UpdateAnnotationInput {
  title?: string | undefined;
  category?: string | undefined;
  durationMs?: number | undefined;
  shapes?: AnnotationShape[] | undefined;
  notes?: string | undefined;
}

async function verifyGameAccess(db: Db, userId: string, gameId: string) {
  const [game] = await db.select().from(filmGames).where(eq(filmGames.id, gameId));
  if (!game) throw new AuthError(404, "Game film not found");

  const allowed = await can(db, userId, "team:view", { type: "team", id: game.teamId });
  if (!allowed) throw new AuthError(404, "Game film not found");

  return game;
}

export async function createAnnotation(
  db: Db,
  userId: string,
  gameId: string,
  input: CreateAnnotationInput,
) {
  const game = await verifyGameAccess(db, userId, gameId);

  const [annotation] = await db
    .insert(filmAnnotations)
    .values({
      gameId: game.id,
      clipId: input.clipId ?? null,
      timestampMs: input.timestampMs,
      durationMs: input.durationMs ?? 3000,
      title: input.title ?? "Annotation",
      category: input.category ?? "TACTICAL",
      shapes: input.shapes ?? [],
      notes: input.notes ?? null,
      createdBy: userId,
    })
    .returning();

  return annotation!;
}

export async function listAnnotations(
  db: Db,
  userId: string,
  gameId: string,
  options?: { clipId?: string | undefined },
) {
  await verifyGameAccess(db, userId, gameId);

  const conditions = [eq(filmAnnotations.gameId, gameId)];
  if (options?.clipId) {
    conditions.push(eq(filmAnnotations.clipId, options.clipId));
  }

  return db
    .select()
    .from(filmAnnotations)
    .where(and(...conditions))
    .orderBy(asc(filmAnnotations.timestampMs));
}

export async function getAnnotation(
  db: Db,
  userId: string,
  gameId: string,
  annotationId: string,
) {
  await verifyGameAccess(db, userId, gameId);

  const [annotation] = await db
    .select()
    .from(filmAnnotations)
    .where(and(eq(filmAnnotations.id, annotationId), eq(filmAnnotations.gameId, gameId)));

  if (!annotation) {
    throw new AuthError(404, "Annotation not found");
  }

  return annotation;
}

export async function updateAnnotation(
  db: Db,
  userId: string,
  gameId: string,
  annotationId: string,
  input: UpdateAnnotationInput,
) {
  const game = await verifyGameAccess(db, userId, gameId);

  const [existing] = await db
    .select()
    .from(filmAnnotations)
    .where(and(eq(filmAnnotations.id, annotationId), eq(filmAnnotations.gameId, gameId)));

  if (!existing) {
    throw new AuthError(404, "Annotation not found");
  }

  // Only author or coach can update
  const isCoach = await can(db, userId, "film:manage", { type: "team", id: game.teamId });
  if (existing.createdBy !== userId && !isCoach) {
    throw new AuthError(404, "Annotation not found");
  }

  const [updated] = await db
    .update(filmAnnotations)
    .set({
      title: input.title ?? existing.title,
      category: input.category ?? existing.category,
      durationMs: input.durationMs ?? existing.durationMs,
      shapes: input.shapes ?? existing.shapes,
      notes: input.notes !== undefined ? input.notes : existing.notes,
      updatedAt: new Date(),
    })
    .where(eq(filmAnnotations.id, annotationId))
    .returning();

  return updated!;
}

export async function deleteAnnotation(
  db: Db,
  userId: string,
  gameId: string,
  annotationId: string,
) {
  const game = await verifyGameAccess(db, userId, gameId);

  const [existing] = await db
    .select()
    .from(filmAnnotations)
    .where(and(eq(filmAnnotations.id, annotationId), eq(filmAnnotations.gameId, gameId)));

  if (!existing) {
    throw new AuthError(404, "Annotation not found");
  }

  const isCoach = await can(db, userId, "film:manage", { type: "team", id: game.teamId });
  if (existing.createdBy !== userId && !isCoach) {
    throw new AuthError(404, "Annotation not found");
  }

  await db.delete(filmAnnotations).where(eq(filmAnnotations.id, annotationId));
}
