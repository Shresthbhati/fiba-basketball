import { and, asc, count, eq, inArray, or } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { courts, moderationCases, pickupGames, reports, userBlocks, users } from "../db/schema.js";
import { writeAudit } from "../audit/service.js";
import { AuthError } from "../identity/service.js";

export type BlockKind = "BLOCK" | "MUTE";
export type TargetType = "USER" | "PICKUP_GAME" | "COURT";

export async function setBlock(db: Db, blockerId: string, blockedId: string, kind: BlockKind) {
  if (blockerId === blockedId) throw new AuthError(400, "You cannot block yourself");
  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, blockedId));
  if (!target) throw new AuthError(404, "Not Found");
  await db.insert(userBlocks).values({ blockerId, blockedId, kind })
    .onConflictDoUpdate({ target: [userBlocks.blockerId, userBlocks.blockedId], set: { kind } });
}

export async function removeBlock(db: Db, blockerId: string, blockedId: string) {
  await db.delete(userBlocks).where(and(eq(userBlocks.blockerId, blockerId), eq(userBlocks.blockedId, blockedId)));
}

export async function listBlocks(db: Db, blockerId: string) {
  return db
    .select({ userId: userBlocks.blockedId, displayName: users.displayName, kind: userBlocks.kind })
    .from(userBlocks).innerJoin(users, eq(users.id, userBlocks.blockedId))
    .where(eq(userBlocks.blockerId, blockerId));
}

/** Users whose content `viewerId` must not see: everyone they blocked or muted, and everyone who blocked them. */
export async function hiddenUserIds(db: Db, viewerId: string): Promise<Set<string>> {
  const rows = await db.select().from(userBlocks)
    .where(or(eq(userBlocks.blockerId, viewerId), and(eq(userBlocks.blockedId, viewerId), eq(userBlocks.kind, "BLOCK"))));
  return new Set(rows.map((r) => (r.blockerId === viewerId ? r.blockedId : r.blockerId)));
}

/** True when `a` blocked `b` or `b` blocked `a` (mutes do not count). */
export async function isBlockedEitherWay(db: Db, a: string, b: string) {
  const rows = await db.select().from(userBlocks).where(and(
    eq(userBlocks.kind, "BLOCK"),
    or(and(eq(userBlocks.blockerId, a), eq(userBlocks.blockedId, b)), and(eq(userBlocks.blockerId, b), eq(userBlocks.blockedId, a))),
  ));
  return rows.length > 0;
}

async function targetExists(db: Db, type: TargetType, id: string) {
  const table = type === "USER" ? users : type === "COURT" ? courts : pickupGames;
  const [row] = await db.select({ id: table.id }).from(table).where(eq(table.id, id));
  return !!row;
}

/** One open case per target; each reporter adds at most one report to it. */
export async function fileReport(
  db: Db, reporterId: string,
  input: { targetType: TargetType; targetId: string; reason: string; note?: string | undefined },
) {
  if (input.targetType === "USER" && input.targetId === reporterId) throw new AuthError(400, "You cannot report yourself");
  if (!(await targetExists(db, input.targetType, input.targetId))) throw new AuthError(404, "Not Found");
  return db.transaction(async (t) => {
    const tx = t as unknown as Db;
    let [c] = await tx.select().from(moderationCases).where(and(
      eq(moderationCases.targetType, input.targetType), eq(moderationCases.targetId, input.targetId), eq(moderationCases.status, "OPEN")));
    if (!c) [c] = await tx.insert(moderationCases).values({ targetType: input.targetType, targetId: input.targetId }).returning();
    await tx.insert(reports).values({ caseId: c!.id, reporterId, reason: input.reason, note: input.note ?? null }).onConflictDoNothing();
    return { caseId: c!.id };
  });
}

export async function listCases(db: Db, status: "OPEN" | "RESOLVED" | "DISMISSED") {
  const cases = await db.select().from(moderationCases).where(eq(moderationCases.status, status)).orderBy(asc(moderationCases.createdAt)).limit(100);
  const counts = cases.length === 0 ? [] : await db.select({ caseId: reports.caseId, n: count() }).from(reports)
    .where(inArray(reports.caseId, cases.map((c) => c.id))).groupBy(reports.caseId);
  const n = new Map(counts.map((c) => [c.caseId, Number(c.n)]));
  return cases.map((c) => ({ id: c.id, targetType: c.targetType, targetId: c.targetId, status: c.status, reportCount: n.get(c.id) ?? 0, createdAt: c.createdAt }));
}

/** Reporter identities and notes are sensitive: the caller must state a reason and the read is audited. */
export async function readCase(db: Db, moderatorId: string, caseId: string, reason: string) {
  const [c] = await db.select().from(moderationCases).where(eq(moderationCases.id, caseId));
  if (!c) throw new AuthError(404, "Not Found");
  const rows = await db.select().from(reports).where(eq(reports.caseId, caseId));
  await writeAudit(db, { actorId: moderatorId, action: "moderation.case_read", resourceType: "moderation_case", resourceId: caseId, reason });
  return { ...c, reports: rows.map((r) => ({ reporterId: r.reporterId, reason: r.reason, note: r.note, createdAt: r.createdAt })) };
}

export async function resolveCase(db: Db, moderatorId: string, caseId: string, outcome: "RESOLVED" | "DISMISSED", note: string) {
  return db.transaction(async (t) => {
    const tx = t as unknown as Db;
    const [c] = await tx.select().from(moderationCases).where(eq(moderationCases.id, caseId));
    if (!c) throw new AuthError(404, "Not Found");
    if (c.status !== "OPEN") throw new AuthError(409, "Case already closed");
    await tx.update(moderationCases).set({ status: outcome, resolvedBy: moderatorId, resolutionNote: note, resolvedAt: new Date() })
      .where(eq(moderationCases.id, caseId));
    await writeAudit(tx, { actorId: moderatorId, action: "moderation.case_closed", resourceType: "moderation_case", resourceId: caseId, reason: note, metadata: { outcome } });
  });
}
