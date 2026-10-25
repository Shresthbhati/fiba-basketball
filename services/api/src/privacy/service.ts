import { createHash, randomBytes } from "node:crypto";
import { eq, desc } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  accountErasureRequests,
  athleticTestSessions,
  auditLog,
  courtPhotos,
  courtVerifications,
  dataExportRequests,
  movementAssessments,
  pickupParticipants,
  roleAssignments,
  sessions,
  users,
  verifiedAchievements,
  wellnessChecks,
  workoutSessions,
} from "../db/schema.js";
import { verifyPassword, hashPassword } from "../identity/password.js";

const sha256 = (str: string) => createHash("sha256").update(str).digest("hex");

export class PrivacyError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

export interface UserExportArchive {
  exportedAt: string;
  dataVersion: string;
  profile: {
    id: string;
    email: string;
    displayName: string;
    isMinor: boolean;
    emailVerified: boolean;
    totpEnabled: boolean;
    createdAt: string;
  };
  roles: Array<{ role: string; resourceType: string | null; resourceId: string | null }>;
  athleticTesting: Array<unknown>;
  movementAssessments: Array<unknown>;
  workoutSessions: Array<unknown>;
  wellnessChecks: Array<unknown>;
  verifiedAchievements: Array<unknown>;
  courtContributions: {
    photos: Array<unknown>;
    verifications: Array<unknown>;
  };
  pickupParticipations: Array<unknown>;
}

export async function exportUserData(db: Db, userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || user.isErased) {
    throw new PrivacyError(404, "User profile not found or already erased");
  }

  // Gather records from across modules
  const [
    roles,
    tests,
    movements,
    workouts,
    wellness,
    achievements,
    photos,
    verifs,
    pickups,
  ] = await Promise.all([
    db.select({ role: roleAssignments.role, resourceType: roleAssignments.resourceType, resourceId: roleAssignments.resourceId })
      .from(roleAssignments)
      .where(eq(roleAssignments.userId, userId))
      .catch(() => []),
    db.select().from(athleticTestSessions).where(eq(athleticTestSessions.userId, userId)).catch(() => []),
    db.select().from(movementAssessments).where(eq(movementAssessments.userId, userId)).catch(() => []),
    db.select().from(workoutSessions).where(eq(workoutSessions.userId, userId)).catch(() => []),
    db.select().from(wellnessChecks).where(eq(wellnessChecks.userId, userId)).catch(() => []),
    db.select().from(verifiedAchievements).where(eq(verifiedAchievements.userId, userId)).catch(() => []),
    db.select().from(courtPhotos).where(eq(courtPhotos.userId, userId)).catch(() => []),
    db.select().from(courtVerifications).where(eq(courtVerifications.userId, userId)).catch(() => []),
    db.select().from(pickupParticipants).where(eq(pickupParticipants.userId, userId)).catch(() => []),
  ]);

  const archive: UserExportArchive = {
    exportedAt: new Date().toISOString(),
    dataVersion: "1.0-GDPR-CCPA",
    profile: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      isMinor: user.isMinor,
      emailVerified: !!user.emailVerifiedAt,
      totpEnabled: user.totpEnabled,
      createdAt: user.createdAt.toISOString(),
    },
    roles,
    athleticTesting: tests,
    movementAssessments: movements,
    workoutSessions: workouts,
    wellnessChecks: wellness,
    verifiedAchievements: achievements,
    courtContributions: {
      photos,
      verifications: verifs,
    },
    pickupParticipations: pickups,
  };

  const payloadString = JSON.stringify(archive, null, 2);
  const checksum = sha256(payloadString);
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000); // 7 days retention

  const [inserted] = await db.insert(dataExportRequests).values({
    userId,
    status: "READY",
    payload: payloadString,
    checksumSha256: checksum,
    expiresAt,
    createdAt: new Date(),
  }).returning({ id: dataExportRequests.id });

  return {
    id: inserted?.id ?? crypto.randomUUID(),
    status: "READY",
    checksumSha256: checksum,
    expiresAt: expiresAt.toISOString(),
    createdAt: new Date().toISOString(),
    archive,
  };
}

export async function getLatestExport(db: Db, userId: string) {
  const [latest] = await db
    .select()
    .from(dataExportRequests)
    .where(eq(dataExportRequests.userId, userId))
    .orderBy(desc(dataExportRequests.createdAt))
    .limit(1);

  if (!latest) {
    throw new PrivacyError(404, "No data export archive found for this user");
  }

  return {
    id: latest.id,
    status: latest.status,
    checksumSha256: latest.checksumSha256,
    expiresAt: latest.expiresAt.toISOString(),
    createdAt: latest.createdAt.toISOString(),
    archive: JSON.parse(latest.payload) as UserExportArchive,
  };
}

export async function getPrivacyStatus(db: Db, userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    throw new PrivacyError(404, "User profile not found");
  }

  const [latestExport] = await db
    .select()
    .from(dataExportRequests)
    .where(eq(dataExportRequests.userId, userId))
    .orderBy(desc(dataExportRequests.createdAt))
    .limit(1);

  return {
    userId: user.id,
    isErased: user.isErased,
    erasedAt: user.erasedAt?.toISOString() ?? null,
    dataRetentionDays: 30,
    hasActiveExport: !!latestExport && new Date(latestExport.expiresAt) > new Date(),
    latestExport: latestExport
      ? {
          id: latestExport.id,
          checksumSha256: latestExport.checksumSha256,
          createdAt: latestExport.createdAt.toISOString(),
          expiresAt: latestExport.expiresAt.toISOString(),
        }
      : null,
  };
}

export async function requestAccountErasure(
  db: Db,
  userId: string,
  input: { passwordVerify: string; reason?: string | undefined }
) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    throw new PrivacyError(404, "User not found");
  }

  if (user.isErased) {
    throw new PrivacyError(400, "Account is already erased");
  }

  // Password verification
  const validPassword = await verifyPassword(user.passwordHash, input.passwordVerify).catch(() => false);
  if (!validPassword) {
    throw new PrivacyError(403, "Invalid password confirmation. Erasure request rejected.");
  }

  const now = new Date();
  const anonymizedEmail = `erased-${user.id}@anonymized.courtiq`;
  const scrubbedPasswordHash = await hashPassword(randomBytes(32).toString("hex"));
  const emailHash = sha256(user.email.toLowerCase().trim());

  // Cascade scrub / anonymization
  // 1. Invalidate active sessions
  await db.delete(sessions).where(eq(sessions.userId, userId));

  // 2. Scrub sensitive health data (wellness/pain reports) per ADR-0009
  await db.delete(wellnessChecks).where(eq(wellnessChecks.userId, userId)).catch(() => null);

  // 3. Anonymize user record
  await db
    .update(users)
    .set({
      email: anonymizedEmail,
      displayName: "[Former Member]",
      passwordHash: scrubbedPasswordHash,
      totpSecret: null,
      totpRecoveryCodes: null,
      totpEnabled: false,
      totpVerifiedAt: null,
      isErased: true,
      erasedAt: now,
    })
    .where(eq(users.id, userId));

  // 4. Record account erasure request audit
  const [erasureRow] = await db.insert(accountErasureRequests).values({
    userId,
    originalEmailHash: emailHash,
    status: "COMPLETED",
    reason: input.reason ?? "User self-serve Right to Erasure request",
    erasedAt: now,
    createdAt: now,
  }).returning({ id: accountErasureRequests.id });

  // 5. Append-only system audit log
  await db.insert(auditLog).values({
    actorId: userId,
    action: "USER_RIGHT_TO_ERASURE",
    resourceType: "USER",
    resourceId: userId,
    reason: input.reason ?? "Self-serve right to erasure",
    metadata: {
      erasureId: erasureRow?.id ?? crypto.randomUUID(),
      reason: input.reason ?? "Self-serve right to erasure",
      originalEmailHash: emailHash,
      timestamp: now.toISOString(),
    },
  }).catch(() => null);

  return {
    ok: true,
    erasureId: erasureRow?.id,
    status: "COMPLETED",
    erasedAt: now.toISOString(),
    message: "Your account and personal data have been erased. Official match scorebooks retain [Former Member] per FIBA record integrity.",
  };
}
