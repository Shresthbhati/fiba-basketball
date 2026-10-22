import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { sessions, users } from "../db/schema.js";
import { MIN_AGE, ageOn } from "./age.js";
import { hashPassword, verifyPassword } from "./password.js";

export const SESSION_TTL_MS = 14 * 24 * 3600 * 1000;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export class AuthError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

export type PublicUser = { id: string; email: string; displayName: string; isMinor: boolean; emailVerified: boolean };
const toPublic = (u: typeof users.$inferSelect): PublicUser => ({
  id: u.id, email: u.email, displayName: u.displayName, isMinor: u.isMinor, emailVerified: u.emailVerifiedAt !== null,
});

async function startSession(db: Db, userId: string) {
  const token = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({ tokenHash: sha(token), userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) });
  return token;
}

export async function signup(
  db: Db,
  input: { email: string; password: string; displayName: string; dateOfBirth: string },
  today = new Date(),
) {
  const age = ageOn(input.dateOfBirth, today);
  if (age < 0 || age > 120) throw new AuthError(400, "Invalid date of birth");
  if (age < MIN_AGE) throw new AuthError(403, `You must be at least ${MIN_AGE} to sign up`);
  const email = input.email.trim().toLowerCase();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing.length > 0) throw new AuthError(409, "Email already registered");
  const [user] = await db
    .insert(users)
    .values({
      email, passwordHash: await hashPassword(input.password), displayName: input.displayName.trim(),
      dateOfBirth: input.dateOfBirth, isMinor: age < 18,
    })
    .returning();
  return { user: toPublic(user!), token: await startSession(db, user!.id) };
}

const DUMMY = hashPassword("dummy-password-for-timing");

export async function login(db: Db, emailRaw: string, password: string) {
  const [user] = await db.select().from(users).where(eq(users.email, emailRaw.trim().toLowerCase()));
  // Verify against a dummy hash when the user is unknown so timing doesn't reveal which emails exist.
  const ok = await verifyPassword(user?.passwordHash ?? (await DUMMY), password);
  if (!user || !ok) throw new AuthError(401, "Invalid email or password");
  return { user: toPublic(user), token: await startSession(db, user.id) };
}

export async function userForToken(db: Db, token: string): Promise<PublicUser | null> {
  const rows = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha(token)), gt(sessions.expiresAt, new Date())));
  return rows[0] ? toPublic(rows[0].user) : null;
}

export async function logout(db: Db, token: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, sha(token)));
}
