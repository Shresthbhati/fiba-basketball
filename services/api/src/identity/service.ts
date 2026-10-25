import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { roleAssignments, sessions, users } from "../db/schema.js";
import { grantRole } from "../authz/service.js";
import { MIN_AGE, ageOn } from "./age.js";
import { hashPassword, verifyPassword } from "./password.js";
import {
  createMfaChallengeToken,
  generateOtpauthUri,
  generateRecoveryCodes,
  generateTotpSecret,
  verifyAndConsumeRecoveryCode,
  verifyMfaChallengeToken,
  verifyTotpCode,
} from "./totp.js";

export const SESSION_TTL_MS = 14 * 24 * 3600 * 1000;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export class AuthError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

export type PublicUser = {
  id: string;
  email: string;
  displayName: string;
  isMinor: boolean;
  emailVerified: boolean;
  totpEnabled: boolean;
};

const toPublic = (u: typeof users.$inferSelect): PublicUser => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  isMinor: u.isMinor,
  emailVerified: u.emailVerifiedAt !== null,
  totpEnabled: u.totpEnabled,
});

async function startSession(db: Db, userId: string, isMfaVerified = false) {
  const token = randomBytes(32).toString("base64url");
  await db.insert(sessions).values({
    tokenHash: sha(token),
    userId,
    isMfaVerified,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
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
  await grantRole(db, user!.id, "PLAYER");
  return { user: toPublic(user!), token: await startSession(db, user!.id, false) };
}

const DUMMY = hashPassword("dummy-password-for-timing");

export async function login(db: Db, emailRaw: string, password: string) {
  const [user] = await db.select().from(users).where(eq(users.email, emailRaw.trim().toLowerCase()));
  // Verify against a dummy hash when the user is unknown so timing doesn't reveal which emails exist.
  const ok = await verifyPassword(user?.passwordHash ?? (await DUMMY), password);
  if (!user || !ok) throw new AuthError(401, "Invalid email or password");

  // Check if TOTP is enabled on user
  if (user.totpEnabled) {
    return {
      requiresTotp: true as const,
      challengeToken: createMfaChallengeToken(user.id),
      user: toPublic(user),
      token: null,
    };
  }

  // Check if user is a platform admin without TOTP
  const adminRoles = await db
    .select({ id: roleAssignments.id })
    .from(roleAssignments)
    .where(
      and(
        eq(roleAssignments.userId, user.id),
        eq(roleAssignments.role, "PLATFORM_ADMIN"),
        isNull(roleAssignments.resourceId),
      ),
    );

  if (adminRoles.length > 0) {
    // Platform administrators are required to have TOTP MFA enrolled (Spec §1.1, §2.2)
    // If not yet enrolled, prompt challenge flow or enrollment requirement
    if (!user.totpSecret) {
      // Auto-initiate secret for admin setup
      const secret = generateTotpSecret();
      const { hashedCodes } = generateRecoveryCodes();
      await db
        .update(users)
        .set({ totpSecret: secret, totpRecoveryCodes: JSON.stringify(hashedCodes) })
        .where(eq(users.id, user.id));
    }
    return {
      requiresTotp: true as const,
      challengeToken: createMfaChallengeToken(user.id),
      user: toPublic(user),
      token: null,
    };
  }

  return {
    requiresTotp: false as const,
    challengeToken: null,
    user: toPublic(user),
    token: await startSession(db, user.id, false),
  };
}

export async function completeMfaLogin(db: Db, challengeToken: string, code: string) {
  const { valid, userId } = verifyMfaChallengeToken(challengeToken);
  if (!valid || !userId) {
    throw new AuthError(401, "MFA challenge expired or invalid. Please log in again.");
  }
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !user.totpSecret) {
    throw new AuthError(401, "User not found or TOTP not configured");
  }

  let codeValid = verifyTotpCode(user.totpSecret, code);

  if (!codeValid && user.totpRecoveryCodes) {
    const recoveryResult = verifyAndConsumeRecoveryCode(user.totpRecoveryCodes, code);
    if (recoveryResult.valid) {
      codeValid = true;
      await db
        .update(users)
        .set({ totpRecoveryCodes: recoveryResult.remainingHashedCodesJson })
        .where(eq(users.id, user.id));
    }
  }

  if (!codeValid) {
    throw new AuthError(401, "Invalid authentication code or recovery code");
  }

  // If this was an admin user first verifying their secret, automatically set totpEnabled
  if (!user.totpEnabled) {
    await db
      .update(users)
      .set({ totpEnabled: true, totpVerifiedAt: new Date() })
      .where(eq(users.id, user.id));
    user.totpEnabled = true;
  }

  return { user: toPublic(user), token: await startSession(db, user.id, true) };
}

export async function getTotpStatus(db: Db, userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new AuthError(404, "User not found");
  return {
    enabled: user.totpEnabled,
    verifiedAt: user.totpVerifiedAt ? user.totpVerifiedAt.toISOString() : null,
  };
}

export async function setupTotp(db: Db, userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new AuthError(404, "User not found");

  const secret = generateTotpSecret();
  const { codes, hashedCodes } = generateRecoveryCodes();
  await db
    .update(users)
    .set({
      totpSecret: secret,
      totpRecoveryCodes: JSON.stringify(hashedCodes),
    })
    .where(eq(users.id, userId));

  return {
    secret,
    uri: generateOtpauthUri(user.email, secret),
    recoveryCodes: codes,
  };
}

export async function enableTotp(db: Db, userId: string, code: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user || !user.totpSecret) throw new AuthError(400, "TOTP setup has not been initiated");

  const valid = verifyTotpCode(user.totpSecret, code);
  if (!valid) throw new AuthError(400, "Invalid 6-digit TOTP verification code");

  await db
    .update(users)
    .set({ totpEnabled: true, totpVerifiedAt: new Date() })
    .where(eq(users.id, userId));

  return { ok: true };
}

export async function disableTotp(db: Db, userId: string, password: string, code: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new AuthError(404, "User not found");

  // Verify password
  const pwOk = await verifyPassword(user.passwordHash, password);
  if (!pwOk) throw new AuthError(401, "Invalid password");

  // Enforce: Platform administrators cannot disable TOTP MFA
  const adminRoles = await db
    .select({ id: roleAssignments.id })
    .from(roleAssignments)
    .where(
      and(
        eq(roleAssignments.userId, user.id),
        eq(roleAssignments.role, "PLATFORM_ADMIN"),
        isNull(roleAssignments.resourceId),
      ),
    );
  if (adminRoles.length > 0) {
    throw new AuthError(403, "Platform administrators are strictly required to maintain active TOTP MFA");
  }

  // Verify code or recovery code
  let codeValid = user.totpSecret ? verifyTotpCode(user.totpSecret, code) : false;
  if (!codeValid && user.totpRecoveryCodes) {
    const rec = verifyAndConsumeRecoveryCode(user.totpRecoveryCodes, code);
    if (rec.valid) codeValid = true;
  }
  if (!codeValid) throw new AuthError(401, "Invalid authentication code or recovery code");

  await db
    .update(users)
    .set({
      totpEnabled: false,
      totpSecret: null,
      totpRecoveryCodes: null,
      totpVerifiedAt: null,
    })
    .where(eq(users.id, userId));

  return { ok: true };
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
