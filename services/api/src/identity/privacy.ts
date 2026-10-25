import { eq, or } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  athletePassportGrants,
  consentGrants,
  movementAssessments,
  userBlocks,
  users,
  verifiedAchievements,
  workoutSessions,
} from "../db/schema.js";
import { writeAudit } from "../audit/service.js";
import { AuthError } from "./service.js";
import { verifyPassword } from "./password.js";
import { myCareer } from "../career/service.js";

export async function exportUserData(db: Db, userId: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      dateOfBirth: users.dateOfBirth,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) {
    throw new AuthError(404, "User not found");
  }

  // 1. Consent settings
  const userConsents = await db
    .select()
    .from(consentGrants)
    .where(eq(consentGrants.subjectId, userId));

  // 2. Career record
  const career = await myCareer(db, userId);

  // 3. Verified achievements & awards
  const achievements = await db
    .select()
    .from(verifiedAchievements)
    .where(eq(verifiedAchievements.userId, userId));

  // 4. Movement assessments
  const assessments = await db
    .select()
    .from(movementAssessments)
    .where(eq(movementAssessments.userId, userId));

  // 5. Workout sessions
  const workouts = await db
    .select()
    .from(workoutSessions)
    .where(eq(workoutSessions.userId, userId));

  // 6. Passport sharing grants
  const grants = await db
    .select()
    .from(athletePassportGrants)
    .where(eq(athletePassportGrants.userId, userId));

  // 7. Blocks and mutes
  const blocks = await db
    .select()
    .from(userBlocks)
    .where(eq(userBlocks.blockerId, userId));

  // Audit this sensitive data export
  await writeAudit(db, {
    actorId: userId,
    action: "user.data_exported",
    resourceType: "user",
    resourceId: userId,
    reason: "Self-service GDPR/CCPA data export archive generated",
  });

  return {
    exportedAt: new Date().toISOString(),
    formatVersion: "1.0",
    profile: user,
    consents: userConsents,
    career,
    achievements,
    assessments,
    workouts,
    grants,
    blocks,
  };
}

export async function deleteUserAccount(db: Db, userId: string, passwordConfirmation: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId));

  if (!user) {
    throw new AuthError(404, "User not found");
  }

  const valid = await verifyPassword(user.passwordHash, passwordConfirmation);
  if (!valid) {
    throw new AuthError(401, "Incorrect password. Account deletion aborted.");
  }

  return db.transaction(async (t) => {
    const tx = t as unknown as Db;

    // Delete private sensitive personal records
    await tx.delete(consentGrants).where(eq(consentGrants.subjectId, userId));
    await tx.delete(athletePassportGrants).where(eq(athletePassportGrants.userId, userId));
    await tx.delete(movementAssessments).where(eq(movementAssessments.userId, userId));
    await tx.delete(workoutSessions).where(eq(workoutSessions.userId, userId));
    await tx.delete(userBlocks).where(or(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, userId)));

    // Anonymize user account (keeps match historical record and standings mathematically consistent)
    await tx
      .update(users)
      .set({
        displayName: "Former Player",
        email: `deleted-${userId}@anonymized.courtiq`,
        passwordHash: "DELETED",
        dateOfBirth: "1970-01-01",
        emailVerifiedAt: null,
      })
      .where(eq(users.id, userId));

    // Append-only audit record
    await writeAudit(tx, {
      actorId: userId,
      action: "user.account_deleted",
      resourceType: "user",
      resourceId: userId,
      reason: "Self-service right to erasure executed by user",
    });

    return { ok: true };
  });
}
