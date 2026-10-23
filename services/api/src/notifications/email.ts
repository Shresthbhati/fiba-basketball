import { and, asc, eq, inArray, isNull, lte } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { notifications, users } from "../db/schema.js";
import type { Mailer } from "../identity/mailer.js";

/** Only time-sensitive events are emailed. */
export const EMAIL_KINDS = ["GAME_CANCELLED", "WAITLIST_PROMOTED"] as const;
const DELAY_MS = 60_000; // give people a minute to see it in the app first
const MAX_AGE_MS = 24 * 3_600_000; // a day-old cancellation is no longer useful news
const MAX_ATTEMPTS = 3;

const utc = (iso: string) => `${new Date(iso).toISOString().slice(0, 16).replace("T", " ")} UTC`;

/**
 * Emails pending notifications. Safe to run on every instance: each row is claimed atomically, so a notification is emailed
 * at most once. Skips (and records why) anything already read, opted out, for an under-18 account, or too old.
 */
export async function deliverEmails(db: Db, mailer: Mailer, webBaseUrl: string, now = new Date()) {
  const base = webBaseUrl.replace(/\/$/, "");
  const due = await db
    .select({ n: notifications, email: users.email, isMinor: users.isMinor, optedIn: users.emailNotifications })
    .from(notifications)
    .innerJoin(users, eq(users.id, notifications.userId))
    .where(and(isNull(notifications.emailState), inArray(notifications.kind, [...EMAIL_KINDS]), lte(notifications.createdAt, new Date(now.getTime() - DELAY_MS))))
    .orderBy(asc(notifications.createdAt))
    .limit(200);
  const out = { sent: 0, skipped: 0, failed: 0 };
  const claim = async (id: string) =>
    (await db.update(notifications).set({ emailState: "SENDING" }).where(and(eq(notifications.id, id), isNull(notifications.emailState))).returning({ id: notifications.id })).length === 1;
  const finish = (id: string, state: string | null, attempts?: number) =>
    db.update(notifications).set({ emailState: state, ...(attempts === undefined ? {} : { emailAttempts: attempts }) }).where(eq(notifications.id, id));

  for (const { n, email, isMinor, optedIn } of due) {
    if (!(await claim(n.id))) continue;
    if (n.readAt !== null || isMinor || !optedIn || now.getTime() - n.createdAt.getTime() > MAX_AGE_MS) {
      await finish(n.id, "SKIPPED");
      out.skipped++;
      continue;
    }
    const lines = [n.title, ""];
    if (n.data?.startsAt) lines.push(`Game time: ${utc(n.data.startsAt)}`, "");
    if (n.link) lines.push(`Open it: ${base}${n.link}`, "");
    lines.push(`You get this email because you play pickup games on COURT IQ. Turn these emails off any time: ${base}/notifications`);
    try {
      await mailer.send({ to: email, subject: n.title, text: lines.join("\n") });
      await finish(n.id, "SENT");
      out.sent++;
    } catch {
      const attempts = n.emailAttempts + 1;
      await finish(n.id, attempts >= MAX_ATTEMPTS ? "FAILED" : null, attempts);
      out.failed++;
    }
  }
  return out;
}

export async function getSettings(db: Db, userId: string) {
  const [u] = await db.select({ email: users.emailNotifications, isMinor: users.isMinor }).from(users).where(eq(users.id, userId));
  return { email: u?.email ?? true, emailAvailable: !u?.isMinor };
}

export async function setEmailSetting(db: Db, userId: string, enabled: boolean) {
  await db.update(users).set({ emailNotifications: enabled }).where(eq(users.id, userId));
}
