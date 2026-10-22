import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { authTokens, sessions, users } from "../db/schema.js";
import { AuthError } from "./service.js";
import { hashPassword } from "./password.js";
import type { Mailer } from "./mailer.js";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const HOUR = 3_600_000;
export const TTL = { PASSWORD_RESET: HOUR, EMAIL_VERIFY: 48 * HOUR } as const;
type Purpose = keyof typeof TTL;

async function issue(db: Db, userId: string, purpose: Purpose): Promise<string> {
  // Only the newest link works: older unused ones for the same purpose are invalidated.
  await db.update(authTokens).set({ usedAt: new Date() })
    .where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt)));
  const token = randomBytes(32).toString("base64url");
  await db.insert(authTokens).values({ tokenHash: sha(token), userId, purpose, expiresAt: new Date(Date.now() + TTL[purpose]) });
  return token;
}

/** Marks the token used and returns its user, or throws one generic error for unknown/used/expired tokens. */
async function consume(db: Db, token: string, purpose: Purpose): Promise<string> {
  const used = await db.update(authTokens).set({ usedAt: new Date() })
    .where(and(eq(authTokens.tokenHash, sha(token)), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())))
    .returning({ userId: authTokens.userId });
  if (!used[0]) throw new AuthError(400, "This link is invalid or has expired");
  return used[0].userId;
}

/** Always succeeds from the caller's point of view, so it can't be used to discover which emails have accounts. */
export async function requestPasswordReset(db: Db, mailer: Mailer, webBaseUrl: string, emailRaw: string) {
  const [u] = await db.select().from(users).where(eq(users.email, emailRaw.trim().toLowerCase()));
  if (!u) return;
  const token = await issue(db, u.id, "PASSWORD_RESET");
  await mailer.send({
    to: u.email, subject: "Reset your COURT IQ password",
    text: `Use this link within 1 hour to choose a new password:\n${webBaseUrl}/reset-password?token=${token}\n\nIf you didn't ask for this, ignore this email.`,
  });
}

export async function confirmPasswordReset(db: Db, token: string, newPassword: string) {
  const userId = await consume(db, token, "PASSWORD_RESET");
  await db.update(users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(users.id, userId));
  // Anyone holding an old session (including an attacker) is signed out.
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function sendVerification(db: Db, mailer: Mailer, webBaseUrl: string, userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  if (!u || u.emailVerifiedAt) return;
  const token = await issue(db, u.id, "EMAIL_VERIFY");
  await mailer.send({
    to: u.email, subject: "Confirm your COURT IQ email",
    text: `Confirm your email address:\n${webBaseUrl}/verify-email?token=${token}`,
  });
}

export async function verifyEmail(db: Db, token: string) {
  const userId = await consume(db, token, "EMAIL_VERIFY");
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
}
