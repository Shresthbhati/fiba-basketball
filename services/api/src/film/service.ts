import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { writeAudit } from "../audit/service.js";
import { activeAssignments, grantRole } from "../authz/service.js";
import { notify } from "../notifications/service.js";
import { hasConsent } from "../consent/service.js";
import type { Db } from "../db/index.js";
import { filmClips, filmGames, filmSyncPoints, roleAssignments, teams, users } from "../db/schema.js";
import { AuthError } from "../identity/service.js";

export const TEAM_ROLES = ["COACH", "PLAYER"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];
export const MAX_CLIP_MS = 10 * 60 * 1000;

const team = (id: string) => and(eq(roleAssignments.resourceType, "team"), eq(roleAssignments.resourceId, id));

export async function myTeams(db: Db, userId: string) {
  const ids = [...new Set((await activeAssignments(db, userId)).filter((a) => a.resourceType === "team" && a.resourceId).map((a) => a.resourceId!))];
  if (ids.length === 0) return [];
  return db.select({ id: teams.id, name: teams.name }).from(teams).where(inArray(teams.id, ids)).orderBy(asc(teams.name));
}

export async function listMembers(db: Db, teamId: string) {
  return db
    .select({ userId: users.id, name: users.displayName, role: roleAssignments.role })
    .from(roleAssignments)
    .innerJoin(users, eq(users.id, roleAssignments.userId))
    .where(team(teamId))
    .orderBy(asc(users.displayName));
}

export async function addMember(db: Db, actorId: string, teamId: string, emailRaw: string, role: TeamRole) {
  const [u] = await db.select().from(users).where(eq(users.email, emailRaw.trim().toLowerCase()));
  if (!u) throw new AuthError(404, "No account with that email");
  // Film shows players on video: an under-18 member needs MEDIA_USE consent from an active guardian first.
  if (u.isMinor && !(await hasConsent(db, u, "MEDIA_USE"))) {
    throw new AuthError(409, "This player is under 18 and needs guardian consent for media use before joining a team");
  }
  const [existing] = await db.select().from(roleAssignments).where(and(team(teamId), eq(roleAssignments.userId, u.id)));
  if (existing) return { userId: u.id, name: u.displayName, role: existing.role };
  await grantRole(db, u.id, role, { type: "team", id: teamId });
  const [t] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, teamId));
  await notify(db, [u.id], { kind: "ADDED_TO_TEAM", title: `You were added to ${t?.name ?? "a team"}`, link: `/teams/${teamId}` });
  await writeAudit(db, { actorId, action: "team.member_added", resourceType: "team", resourceId: teamId, metadata: { userId: u.id, role } });
  return { userId: u.id, name: u.displayName, role };
}

export async function removeMember(db: Db, actorId: string, teamId: string, userId: string) {
  const [t] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!t) throw new AuthError(404, "Not Found");
  if (t.createdBy === userId) throw new AuthError(409, "The person who created the team cannot be removed");
  await db.delete(roleAssignments).where(and(team(teamId), eq(roleAssignments.userId, userId)));
  await writeAudit(db, { actorId, action: "team.member_removed", resourceType: "team", resourceId: teamId, metadata: { userId } });
}

export type Game = typeof filmGames.$inferSelect;
const gameView = (g: Game) => ({
  id: g.id, teamId: g.teamId, title: g.title, opponent: g.opponent, playedOn: g.playedOn,
  video: { status: g.videoStatus, type: g.videoType, bytes: g.videoBytes },
  matchId: g.matchId, synced: false,
});

export async function createGame(db: Db, userId: string, teamId: string, input: { title: string; opponent?: string | undefined; playedOn?: string | undefined }) {
  const [g] = await db.insert(filmGames).values({ teamId, title: input.title, opponent: input.opponent ?? null, playedOn: input.playedOn ?? null, createdBy: userId }).returning();
  return gameView(g!);
}

export async function listGames(db: Db, teamId: string) {
  return (await db.select().from(filmGames).where(eq(filmGames.teamId, teamId)).orderBy(desc(filmGames.createdAt))).map(gameView);
}

export async function findGame(db: Db, id: string): Promise<Game | null> {
  const [g] = await db.select().from(filmGames).where(eq(filmGames.id, id));
  return g ?? null;
}

export async function readGame(db: Db, id: string) {
  const g = await findGame(db, id);
  if (!g) throw new AuthError(404, "Not Found");
  const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(filmSyncPoints).where(eq(filmSyncPoints.gameId, id));
  return { ...gameView(g), synced: n > 0 };
}

export async function markVideoReady(db: Db, id: string, v: { key: string; type: string; bytes: number }) {
  await db.update(filmGames).set({ videoStatus: "READY", videoKey: v.key, videoType: v.type, videoBytes: v.bytes }).where(eq(filmGames.id, id));
}

export function normalizeTags(tags: string[]): string[] {
  const out = new Set<string>();
  for (const t of tags) {
    const n = t.trim().toLowerCase().replace(/\s+/g, " ");
    if (!/^[a-z0-9][a-z0-9 -]{0,29}$/.test(n)) throw new AuthError(400, `Invalid tag "${t}": use letters, numbers, spaces and hyphens (max 30)`);
    out.add(n);
  }
  if (out.size > 10) throw new AuthError(400, "At most 10 tags per clip");
  return [...out];
}

export async function createClip(db: Db, userId: string, gameId: string, input: { startMs: number; endMs: number; tags: string[]; note?: string | undefined }) {
  if (input.endMs <= input.startMs) throw new AuthError(400, "A clip must end after it starts");
  if (input.endMs - input.startMs > MAX_CLIP_MS) throw new AuthError(400, "A clip can be at most 10 minutes long");
  const [c] = await db.insert(filmClips).values({
    gameId, startMs: input.startMs, endMs: input.endMs, tags: normalizeTags(input.tags), note: input.note ?? null, createdBy: userId,
  }).returning();
  return c!;
}

export async function listClips(db: Db, gameId: string, tag?: string) {
  const rows = await db.select().from(filmClips).where(eq(filmClips.gameId, gameId)).orderBy(asc(filmClips.startMs));
  const t = tag?.trim().toLowerCase();
  return t ? rows.filter((c) => c.tags.includes(t)) : rows;
}

export async function deleteClip(db: Db, gameId: string, clipId: string) {
  const gone = await db.delete(filmClips).where(and(eq(filmClips.id, clipId), eq(filmClips.gameId, gameId))).returning({ id: filmClips.id });
  if (gone.length === 0) throw new AuthError(404, "Not Found");
}
