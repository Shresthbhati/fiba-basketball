import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { filmGameAngles, filmGames } from "../db/schema.js";
import { AuthError } from "../identity/service.js";
import type { MediaStorage } from "../media/storage.js";

export type AngleType = "BROADCAST" | "BASELINE" | "ENDZONE" | "TACTICAL_HIGH" | "COURT_SIDE";

export interface CreateAngleInput {
  label: string;
  angleType: AngleType;
  isPrimary?: boolean | undefined;
  timeOffsetMs?: number | undefined;
}

export interface UpdateAngleInput {
  label?: string | undefined;
  angleType?: AngleType | undefined;
  isPrimary?: boolean | undefined;
  timeOffsetMs?: number | undefined;
}

export interface FilmAngleDto {
  id: string;
  gameId: string;
  label: string;
  angleType: string;
  isPrimary: boolean;
  timeOffsetMs: number;
  video: {
    status: string;
    type: string | null;
    bytes: number | null;
  };
  createdAt: string;
  updatedAt: string;
}

function angleView(row: typeof filmGameAngles.$inferSelect): FilmAngleDto {
  return {
    id: row.id,
    gameId: row.gameId,
    label: row.label,
    angleType: row.angleType,
    isPrimary: row.isPrimary,
    timeOffsetMs: row.timeOffsetMs,
    video: {
      status: row.videoStatus,
      type: row.videoType,
      bytes: row.videoBytes,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listGameAngles(db: Db, gameId: string): Promise<FilmAngleDto[]> {
  const rows = await db
    .select()
    .from(filmGameAngles)
    .where(eq(filmGameAngles.gameId, gameId))
    .orderBy(desc(filmGameAngles.isPrimary), asc(filmGameAngles.createdAt));

  if (rows.length > 0) {
    return rows.map(angleView);
  }

  // If no angles are registered yet, but the primary game has a ready video,
  // synthesize a default primary angle so clients can treat all streams uniformly.
  const [game] = await db.select().from(filmGames).where(eq(filmGames.id, gameId));
  if (game && game.videoStatus === "READY") {
    return [
      {
        id: `primary-${game.id}`,
        gameId: game.id,
        label: "Main Broadcast",
        angleType: "BROADCAST",
        isPrimary: true,
        timeOffsetMs: 0,
        video: {
          status: game.videoStatus,
          type: game.videoType,
          bytes: game.videoBytes,
        },
        createdAt: game.createdAt.toISOString(),
        updatedAt: game.createdAt.toISOString(),
      },
    ];
  }

  return [];
}

export async function getGameAngle(db: Db, angleId: string) {
  const [angle] = await db.select().from(filmGameAngles).where(eq(filmGameAngles.id, angleId));
  if (!angle) throw new AuthError(404, "Camera angle not found");
  return angle;
}

export async function createGameAngle(
  db: Db,
  gameId: string,
  input: CreateAngleInput
): Promise<FilmAngleDto> {
  const [game] = await db.select().from(filmGames).where(eq(filmGames.id, gameId));
  if (!game) throw new AuthError(404, "Film game not found");

  const isPrimary = input.isPrimary ?? false;

  // If this angle is marked as primary, demote any existing primary angles for this game
  if (isPrimary) {
    await db
      .update(filmGameAngles)
      .set({ isPrimary: false })
      .where(and(eq(filmGameAngles.gameId, gameId), eq(filmGameAngles.isPrimary, true)));
  }

  const [created] = await db
    .insert(filmGameAngles)
    .values({
      gameId,
      label: input.label,
      angleType: input.angleType,
      isPrimary,
      timeOffsetMs: input.timeOffsetMs ?? 0,
      videoStatus: "NONE",
    })
    .returning();

  return angleView(created!);
}

export async function updateGameAngle(
  db: Db,
  angleId: string,
  input: UpdateAngleInput
): Promise<FilmAngleDto> {
  const angle = await getGameAngle(db, angleId);

  if (input.isPrimary) {
    await db
      .update(filmGameAngles)
      .set({ isPrimary: false })
      .where(and(eq(filmGameAngles.gameId, angle.gameId), eq(filmGameAngles.isPrimary, true)));
  }

  const updates: Partial<typeof filmGameAngles.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.label !== undefined) updates.label = input.label;
  if (input.angleType !== undefined) updates.angleType = input.angleType;
  if (input.isPrimary !== undefined) updates.isPrimary = input.isPrimary;
  if (input.timeOffsetMs !== undefined) updates.timeOffsetMs = input.timeOffsetMs;

  const [updated] = await db
    .update(filmGameAngles)
    .set(updates)
    .where(eq(filmGameAngles.id, angleId))
    .returning();

  return angleView(updated!);
}

export async function markAngleVideoReady(
  db: Db,
  angleId: string,
  v: { key: string; type: string; bytes: number }
) {
  await db
    .update(filmGameAngles)
    .set({
      videoStatus: "READY",
      videoKey: v.key,
      videoType: v.type,
      videoBytes: v.bytes,
      updatedAt: new Date(),
    })
    .where(eq(filmGameAngles.id, angleId));
}

export async function deleteGameAngle(db: Db, storage: MediaStorage, angleId: string) {
  const angle = await getGameAngle(db, angleId);
  if (angle.videoKey) {
    await storage.remove(angle.videoKey);
  }
  await db.delete(filmGameAngles).where(eq(filmGameAngles.id, angleId));
}
