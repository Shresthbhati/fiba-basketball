import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { notifications } from "../db/schema.js";

export type NewNotification = { kind: "GAME_CANCELLED" | "WAITLIST_PROMOTED" | "ADDED_TO_TEAM" | "ADDED_TO_ROSTER"; title: string; link?: string; data?: Record<string, string> };

/** Writes one notification per user. Never throws into the caller: a failed notification must not undo the action that caused it. */
export async function notify(db: Db, userIds: string[], n: NewNotification): Promise<void> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  try {
    await db.insert(notifications).values(ids.map((userId) => ({ userId, kind: n.kind, title: n.title, link: n.link ?? null, data: n.data ?? null })));
  } catch {
    /* best effort */
  }
}

export async function listNotifications(db: Db, userId: string, limit = 50) {
  const rows = await db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
  return rows.map((r) => ({ id: r.id, kind: r.kind, title: r.title, link: r.link, data: r.data, createdAt: r.createdAt, read: r.readAt !== null }));
}

export async function unreadCount(db: Db, userId: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return r?.n ?? 0;
}

/** Marks the given notifications (or all, when `ids` is omitted) as read. Only ever touches the caller's own rows. */
export async function markRead(db: Db, userId: string, ids?: string[]): Promise<void> {
  const own = and(eq(notifications.userId, userId), isNull(notifications.readAt));
  await db.update(notifications).set({ readAt: new Date() }).where(ids ? and(own, inArray(notifications.id, ids)) : own);
}
