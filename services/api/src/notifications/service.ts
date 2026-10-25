import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  notificationDeliveryLogs,
  notificationPreferences,
  notifications,
  pushSubscriptions,
} from "../db/schema.js";
import { isInQuietHours } from "./vapid.js";

export type NewNotification = {
  kind:
    | "GAME_CANCELLED"
    | "WAITLIST_PROMOTED"
    | "ADDED_TO_TEAM"
    | "ADDED_TO_ROSTER"
    | "GAME_INVITE"
    | "COURT_ALERT"
    | "TEAM_ANNOUNCEMENT";
  title: string;
  link?: string;
  data?: Record<string, string>;
};

/** Writes one notification per user. Never throws into the caller: a failed notification must not undo the action that caused it. */
export async function notify(db: Db, userIds: string[], n: NewNotification): Promise<void> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return;
  try {
    await db.insert(notifications).values(
      ids.map((userId) => ({
        userId,
        kind: n.kind,
        title: n.title,
        link: n.link ?? null,
        data: n.data ?? null,
      }))
    );
  } catch {
    /* best effort */
  }
}

export async function listNotifications(db: Db, userId: string, limit = 50) {
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    link: r.link,
    data: r.data,
    createdAt: r.createdAt,
    read: r.readAt !== null,
  }));
}

export async function unreadCount(db: Db, userId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return r?.n ?? 0;
}

/** Marks the given notifications (or all, when `ids` is omitted) as read. Only ever touches the caller's own rows. */
export async function markRead(db: Db, userId: string, ids?: string[]): Promise<void> {
  const own = and(eq(notifications.userId, userId), isNull(notifications.readAt));
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(ids ? and(own, inArray(notifications.id, ids)) : own);
}

// -------------------------------------------------------------
// Preferences, Quiet Hours & Daily Volume Caps (WP-5.1)
// -------------------------------------------------------------

export interface NotificationPreferencesPatch {
  webPushEnabled?: boolean | undefined;
  emailEnabled?: boolean | undefined;
  gameInvites?: boolean | undefined;
  courtAlerts?: boolean | undefined;
  teamAnnouncements?: boolean | undefined;
  quietHoursEnabled?: boolean | undefined;
  quietHoursStart?: string | undefined;
  quietHoursEnd?: string | undefined;
  quietHoursTimezone?: string | undefined;
  dailyCap?: number | undefined;
}

export async function getNotificationPreferences(db: Db, userId: string, now = new Date()) {
  let [row] = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);

  if (!row) {
    const [created] = await db
      .insert(notificationPreferences)
      .values({
        userId,
        webPushEnabled: true,
        emailEnabled: true,
        gameInvites: true,
        courtAlerts: true,
        teamAnnouncements: true,
        quietHoursEnabled: true,
        quietHoursStart: "22:00",
        quietHoursEnd: "08:00",
        quietHoursTimezone: "UTC",
        dailyCap: 10,
        updatedAt: new Date(),
      })
      .returning();
    row = created;
  }

  // Count past 24h delivered notifications
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 3600 * 1000);
  const [delivCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationDeliveryLogs)
    .where(
      and(
        eq(notificationDeliveryLogs.userId, userId),
        eq(notificationDeliveryLogs.status, "DELIVERED"),
        gte(notificationDeliveryLogs.sentAt, twentyFourHoursAgo)
      )
    );

  const deliveredPast24h = delivCount?.count ?? 0;
  const inQuietHours = row!.quietHoursEnabled
    ? isInQuietHours(now, row!.quietHoursStart, row!.quietHoursEnd, row!.quietHoursTimezone)
    : false;

  return {
    ...row!,
    deliveredPast24h,
    inQuietHours,
    isCapped: deliveredPast24h >= row!.dailyCap,
  };
}

export async function updateNotificationPreferences(
  db: Db,
  userId: string,
  patch: NotificationPreferencesPatch
) {
  // Ensure row exists
  await getNotificationPreferences(db, userId);

  const [updated] = await db
    .update(notificationPreferences)
    .set({
      ...patch,
      updatedAt: new Date(),
    })
    .where(eq(notificationPreferences.userId, userId))
    .returning();

  return updated!;
}

// -------------------------------------------------------------
// Push Subscriptions Lifecycle (RFC 8291 / RFC 8292)
// -------------------------------------------------------------

export async function savePushSubscription(
  db: Db,
  userId: string,
  sub: { endpoint: string; p256dh: string; auth: string; userAgent?: string | undefined }
) {
  const [existing] = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, sub.endpoint))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(pushSubscriptions)
      .set({
        userId,
        p256dh: sub.p256dh,
        auth: sub.auth,
        userAgent: sub.userAgent ?? null,
      })
      .where(eq(pushSubscriptions.endpoint, sub.endpoint))
      .returning();
    return updated!;
  }

  const [created] = await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      userAgent: sub.userAgent ?? null,
    })
    .returning();

  return created!;
}

export async function deletePushSubscription(db: Db, userId: string, endpoint: string) {
  await db
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

export async function listPushSubscriptions(db: Db, userId: string) {
  return db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(desc(pushSubscriptions.createdAt));
}

// -------------------------------------------------------------
// Delivery Evaluator & Rate Capper (Quiet Hours, Caps, Opt-outs)
// -------------------------------------------------------------

export type SuppressionReason = "QUIET_HOURS" | "DAILY_CAP_EXCEEDED" | "OPTED_OUT";

export async function evaluateNotificationDelivery(
  db: Db,
  userId: string,
  kind: string,
  channel: "PUSH" | "EMAIL" | "IN_APP",
  now = new Date()
): Promise<{ shouldDeliver: boolean; suppressionReason: SuppressionReason | null }> {
  const prefs = await getNotificationPreferences(db, userId, now);

  // 1. Channel check
  if (channel === "PUSH" && !prefs.webPushEnabled) {
    return { shouldDeliver: false, suppressionReason: "OPTED_OUT" };
  }
  if (channel === "EMAIL" && !prefs.emailEnabled) {
    return { shouldDeliver: false, suppressionReason: "OPTED_OUT" };
  }

  // 2. Category check
  if ((kind === "GAME_INVITE" || kind === "WAITLIST_PROMOTED" || kind === "GAME_CANCELLED") && !prefs.gameInvites) {
    return { shouldDeliver: false, suppressionReason: "OPTED_OUT" };
  }
  if (kind === "COURT_ALERT" && !prefs.courtAlerts) {
    return { shouldDeliver: false, suppressionReason: "OPTED_OUT" };
  }
  if ((kind === "TEAM_ANNOUNCEMENT" || kind === "ADDED_TO_TEAM" || kind === "ADDED_TO_ROSTER") && !prefs.teamAnnouncements) {
    return { shouldDeliver: false, suppressionReason: "OPTED_OUT" };
  }

  // 3. In-App notifications bypass quiet hours and daily caps
  if (channel === "IN_APP") {
    return { shouldDeliver: true, suppressionReason: null };
  }

  // 4. Quiet hours check
  if (prefs.quietHoursEnabled && isInQuietHours(now, prefs.quietHoursStart, prefs.quietHoursEnd, prefs.quietHoursTimezone)) {
    return { shouldDeliver: false, suppressionReason: "QUIET_HOURS" };
  }

  // 5. Daily volume cap check
  if (prefs.deliveredPast24h >= prefs.dailyCap) {
    return { shouldDeliver: false, suppressionReason: "DAILY_CAP_EXCEEDED" };
  }

  return { shouldDeliver: true, suppressionReason: null };
}

export async function logNotificationDelivery(
  db: Db,
  userId: string,
  kind: string,
  channel: "PUSH" | "EMAIL" | "IN_APP",
  status: "DELIVERED" | "SUPPRESSED",
  suppressionReason: SuppressionReason | null = null,
  now = new Date()
) {
  const [row] = await db
    .insert(notificationDeliveryLogs)
    .values({
      userId,
      kind,
      channel,
      status,
      suppressionReason,
      sentAt: now,
    })
    .returning();
  return row!;
}

export async function testDispatchNotification(
  db: Db,
  userId: string,
  kind: string,
  channel: "PUSH" | "EMAIL" | "IN_APP" = "PUSH",
  simulatedTimeIso?: string | undefined
) {
  const now = simulatedTimeIso ? new Date(simulatedTimeIso) : new Date();
  const evaluation = await evaluateNotificationDelivery(db, userId, kind, channel, now);

  const status = evaluation.shouldDeliver ? "DELIVERED" : "SUPPRESSED";
  const log = await logNotificationDelivery(
    db,
    userId,
    kind,
    channel,
    status,
    evaluation.suppressionReason,
    now
  );

  return {
    delivered: evaluation.shouldDeliver,
    suppressionReason: evaluation.suppressionReason,
    channel,
    kind,
    timestamp: now.toISOString(),
    deliveryLogId: log.id,
  };
}
