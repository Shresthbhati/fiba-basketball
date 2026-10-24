import { asc, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { can } from "../authz/service.js";
import { filmClips, scoutingMontages } from "../db/schema.js";
import { AuthError } from "../identity/service.js";
import { type EventType } from "../match/event-type.js";
import { findGame } from "./service.js";
import { timeline } from "./sync.js";

export type AutoClipCategory =
  | "THREE_POINTERS"
  | "ALL_SCORING"
  | "ASSISTS"
  | "TURNOVERS"
  | "REBOUNDS"
  | "FOULS"
  | "CUSTOM";

export type SideFilter = "OUR_TEAM" | "OPPONENT" | "BOTH";

export interface AutoClipInput {
  category?: AutoClipCategory | undefined;
  eventTypes?: EventType[] | undefined;
  playerId?: string | undefined;
  sideFilter?: SideFilter | undefined;
  leadSeconds?: number | undefined; // Pre-roll: default 4s
  lagSeconds?: number | undefined;  // Post-roll: default 2s
  maxClips?: number | undefined;     // Default 40, max 100
}

export interface AutoMontageInput {
  title?: string | undefined;
  description?: string | undefined;
  category?: AutoClipCategory | undefined;
  playerId?: string | undefined;
  clipIds?: string[] | undefined;
  tags?: string[] | undefined;
  leadSeconds?: number | undefined;
  lagSeconds?: number | undefined;
}

const CATEGORY_MAP: Record<Exclude<AutoClipCategory, "CUSTOM">, EventType[]> = {
  THREE_POINTERS: ["THREE_POINT"],
  ALL_SCORING: ["FIELD_GOAL", "THREE_POINT", "FREE_THROW"],
  ASSISTS: ["ASSIST"],
  TURNOVERS: ["TURNOVER"],
  REBOUNDS: ["REBOUND"],
  FOULS: ["PLAYER_FOUL", "TECHNICAL_FOUL"],
};

export async function autoGenerateClips(
  db: Db,
  userId: string,
  gameId: string,
  input: AutoClipInput
) {
  const game = await findGame(db, gameId);
  if (!game) throw new AuthError(404, "Not Found");

  const allowed = await can(db, userId, "film:manage", { type: "team", id: game.teamId });
  if (!allowed) throw new AuthError(404, "Not Found");

  const tl = await timeline(db, gameId);
  if (!tl.linked || !tl.synced) {
    throw new AuthError(400, "Film must be linked and synced to match events before generating clips");
  }

  const category = input.category ?? "ALL_SCORING";
  const targetTypes: EventType[] =
    category === "CUSTOM"
      ? (input.eventTypes ?? [])
      : (CATEGORY_MAP[category] ?? CATEGORY_MAP.ALL_SCORING);

  if (targetTypes.length === 0) {
    throw new AuthError(400, "At least one event type must be specified");
  }

  const leadMs = Math.max(1000, Math.min(15000, (input.leadSeconds ?? 4) * 1000));
  const lagMs = Math.max(1000, Math.min(10000, (input.lagSeconds ?? 2) * 1000));
  const maxClips = Math.max(1, Math.min(100, input.maxClips ?? 40));
  const sideFilter = input.sideFilter ?? "OUR_TEAM";

  // Existing clips to prevent duplicate generation
  const existingClips = await db
    .select({ startMs: filmClips.startMs, endMs: filmClips.endMs })
    .from(filmClips)
    .where(eq(filmClips.gameId, gameId));

  const isDuplicate = (sMs: number, eMs: number) =>
    existingClips.some(
      (c) => Math.abs(c.startMs - sMs) < 2000 && Math.abs(c.endMs - eMs) < 2000
    );

  const matchedItems = tl.items.filter((item) => {
    if (item.videoMs === null || item.videoMs < 0) return false;
    if (!targetTypes.includes(item.type as EventType)) return false;

    if (sideFilter === "OUR_TEAM" && item.side !== tl.ours) return false;
    if (sideFilter === "OPPONENT" && item.side === tl.ours) return false;

    if (input.playerId && item.playerId !== input.playerId) return false;

    return true;
  });

  const createdClips = [];

  for (const item of matchedItems) {
    if (createdClips.length >= maxClips) break;

    const startMs = Math.max(0, item.videoMs! - leadMs);
    const endMs = item.videoMs! + lagMs;

    if (isDuplicate(startMs, endMs)) {
      continue;
    }

    const typeTag = item.type.toLowerCase().replace(/_/g, "-");
    const periodTag = item.period <= 4 ? `q${item.period}` : `ot${item.period - 4}`;
    const tags = ["auto-clip", typeTag, periodTag];
    if (item.jersey !== null) {
      tags.push(`#${item.jersey}`);
    }

    const periodStr = item.period <= 4 ? `Q${item.period}` : `OT${item.period - 4}`;
    const sideStr = item.side === tl.ours ? "Our" : "Opponent";
    const playerStr = item.playerName ? ` - #${item.jersey ?? ""} ${item.playerName}` : "";
    const note = `${periodStr} · ${sideStr} ${item.type.replace(/_/g, " ")}${playerStr} (${item.homeScore}-${item.awayScore})`;

    const [row] = await db
      .insert(filmClips)
      .values({
        gameId,
        startMs,
        endMs,
        tags,
        note,
        createdBy: userId,
      })
      .returning();

    if (row) {
      createdClips.push(row);
      existingClips.push({ startMs: row.startMs, endMs: row.endMs });
    }
  }

  return {
    generatedCount: createdClips.length,
    clips: createdClips.map((c) => ({
      id: c.id,
      gameId: c.gameId,
      startMs: c.startMs,
      endMs: c.endMs,
      tags: c.tags,
      note: c.note,
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

export async function autoAssembleHighlightReel(
  db: Db,
  userId: string,
  gameId: string,
  input: AutoMontageInput
) {
  const game = await findGame(db, gameId);
  if (!game) throw new AuthError(404, "Not Found");

  const allowed = await can(db, userId, "film:manage", { type: "team", id: game.teamId });
  if (!allowed) throw new AuthError(404, "Not Found");

  let clipRows: (typeof filmClips.$inferSelect)[] = [];

  if (input.clipIds && input.clipIds.length > 0) {
    const all = await db
      .select()
      .from(filmClips)
      .where(eq(filmClips.gameId, gameId));
    const byId = new Map(all.map((c) => [c.id, c]));
    clipRows = input.clipIds.map((id) => byId.get(id)).filter((x): x is typeof filmClips.$inferSelect => !!x);
  } else {
    // Generate clips if none exist, or fetch matching clips
    const existing = await db
      .select()
      .from(filmClips)
      .where(eq(filmClips.gameId, gameId))
      .orderBy(asc(filmClips.startMs));

    if (existing.length === 0) {
      // Trigger automatic clip generation first
      const generated = await autoGenerateClips(db, userId, gameId, {
        category: input.category ?? "ALL_SCORING",
        playerId: input.playerId,
        leadSeconds: input.leadSeconds ?? 4,
        lagSeconds: input.lagSeconds ?? 2,
      });

      const freshIds = new Set(generated.clips.map((c) => c.id));
      clipRows = await db
        .select()
        .from(filmClips)
        .where(eq(filmClips.gameId, gameId))
        .orderBy(asc(filmClips.startMs));
      clipRows = clipRows.filter((c) => freshIds.has(c.id));
    } else {
      clipRows = existing;
    }
  }

  if (clipRows.length === 0) {
    throw new AuthError(400, "No clips available to assemble montage reel");
  }

  const items = clipRows.map((c, index) => ({
    clipId: c.id,
    gameId: c.gameId,
    order: index + 1,
    startMs: c.startMs,
    endMs: c.endMs,
    title: c.note ? c.note.split("(")[0]?.trim() || `Clip #${index + 1}` : `Clip #${index + 1}`,
    note: c.note ?? undefined,
    tags: c.tags,
  }));

  const totalDurationMs = items.reduce((sum, item) => sum + (item.endMs - item.startMs), 0);
  const title = input.title ?? `Game Highlights: ${game.title}`;
  const description = input.description ?? `Auto-assembled highlight reel (${items.length} clips, ${(totalDurationMs / 1000).toFixed(0)}s).`;
  const tags = input.tags ?? ["auto-highlight", "mixtape", ...(input.category ? [input.category.toLowerCase()] : [])];

  const [montage] = await db
    .insert(scoutingMontages)
    .values({
      teamId: game.teamId,
      title,
      description,
      tags,
      items,
      totalDurationMs,
      createdBy: userId,
    })
    .returning();

  return {
    id: montage!.id,
    teamId: montage!.teamId,
    title: montage!.title,
    description: montage!.description ?? null,
    tags: montage!.tags,
    totalDurationMs: montage!.totalDurationMs,
    clipCount: items.length,
    items,
    createdBy: montage!.createdBy,
    createdAt: montage!.createdAt.toISOString(),
  };
}
