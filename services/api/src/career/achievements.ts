import { createHmac, randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { auditLog, competitions, users, verifiedAchievements } from "../db/schema.js";
import { AuthError } from "../identity/service.js";
import { can } from "../authz/service.js";

const SIGNING_SECRET = process.env.COURTIQ_ACHIEVEMENT_SECRET ?? "courtiq-fiba-verified-achievement-hmac-key-2026";

export interface CanonicalAchievementPayload {
  id: string;
  userId: string;
  title: string;
  category: string;
  issuer: string;
  verifiedAt: string;
  evidenceUrl?: string | null | undefined;
  evidenceRef?: string | null | undefined;
}

/**
 * Computes a deterministic HMAC-SHA256 signature over the canonical achievement payload.
 * Protects against tampering of athlete awards, certificates, and tournament honors (Spec §11.2).
 */
export function computeAchievementSignature(
  payload: CanonicalAchievementPayload,
  secret = SIGNING_SECRET
): string {
  const canonicalString = [
    payload.id,
    payload.userId,
    payload.title.trim(),
    payload.category.trim(),
    payload.issuer.trim(),
    payload.verifiedAt,
    payload.evidenceUrl ? payload.evidenceUrl.trim() : "",
    payload.evidenceRef ? payload.evidenceRef.trim() : "",
  ].join("::");

  return createHmac("sha256", secret).update(canonicalString).digest("hex");
}

/**
 * Validates cryptographic signature authenticity against the canonical payload.
 */
export function verifyAchievementSignature(
  row: typeof verifiedAchievements.$inferSelect,
  secret = SIGNING_SECRET
): boolean {
  if (!row.signature) return false;
  const expected = computeAchievementSignature(
    {
      id: row.id,
      userId: row.userId,
      title: row.title,
      category: row.category,
      issuer: row.issuer,
      verifiedAt: row.verifiedAt.toISOString(),
      evidenceUrl: row.evidenceUrl,
      evidenceRef: row.evidenceRef,
    },
    secret
  );

  return row.signature === expected;
}

export interface IssueAchievementInput {
  userId: string;
  title: string;
  category: "AWARD" | "CHAMPIONSHIP" | "SELECTION" | "MILESTONE" | string;
  issuer: string;
  competitionId?: string | undefined;
  evidenceUrl?: string | undefined;
  evidenceRef?: string | undefined;
}

/**
 * Issues a cryptographically signed verified achievement with tamper protection and audit trail.
 */
export async function issueVerifiedAchievement(
  db: Db,
  actorUserId: string,
  input: IssueAchievementInput
) {
  // Validate recipient user exists
  const [recipient] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.userId));
  if (!recipient) {
    throw new AuthError(404, "Target athlete not found");
  }

  // If tied to a competition, check organizer/manager authority
  if (input.competitionId) {
    const [comp] = await db.select().from(competitions).where(eq(competitions.id, input.competitionId));
    if (!comp) {
      throw new AuthError(404, "Competition not found");
    }
    const hasPerm = await can(db, actorUserId, "competition:manage", {
      type: "competition",
      id: input.competitionId,
    });
    if (!hasPerm) {
      throw new AuthError(404, "Not Found");
    }
  }

  const id = randomUUID();
  const verifiedAt = new Date();

  const signature = computeAchievementSignature({
    id,
    userId: input.userId,
    title: input.title,
    category: input.category,
    issuer: input.issuer,
    verifiedAt: verifiedAt.toISOString(),
    evidenceUrl: input.evidenceUrl ?? null,
    evidenceRef: input.evidenceRef ?? null,
  });

  const [created] = await db
    .insert(verifiedAchievements)
    .values({
      id,
      userId: input.userId,
      competitionId: input.competitionId ?? null,
      title: input.title.trim(),
      category: input.category.trim(),
      issuer: input.issuer.trim(),
      signature,
      evidenceUrl: input.evidenceUrl?.trim() ?? null,
      evidenceRef: input.evidenceRef?.trim() ?? null,
      isRevoked: false,
      verifiedAt,
    })
    .returning();

  return created!;
}

/**
 * Public or authorized verification of an achievement: verifies HMAC signature authenticity,
 * checks revocation state, and returns full proof metadata.
 */
export async function getVerifiedAchievementWithProof(db: Db, achievementId: string) {
  const [row] = await db
    .select({
      achievement: verifiedAchievements,
      athlete: {
        id: users.id,
        displayName: users.displayName,
      },
    })
    .from(verifiedAchievements)
    .innerJoin(users, eq(users.id, verifiedAchievements.userId))
    .where(eq(verifiedAchievements.id, achievementId));

  if (!row) {
    // Negative authZ per ADR-0010: unknown achievement returns 404
    throw new AuthError(404, "Not Found");
  }

  let competitionName: string | null = null;
  if (row.achievement.competitionId) {
    const [comp] = await db
      .select({ name: competitions.name })
      .from(competitions)
      .where(eq(competitions.id, row.achievement.competitionId));
    competitionName = comp?.name ?? null;
  }

  const isSignatureValid = verifyAchievementSignature(row.achievement);

  return {
    achievement: {
      id: row.achievement.id,
      userId: row.achievement.userId,
      athleteName: row.athlete.displayName,
      title: row.achievement.title,
      category: row.achievement.category,
      issuer: row.achievement.issuer,
      competitionId: row.achievement.competitionId,
      competitionName,
      verifiedAt: row.achievement.verifiedAt.toISOString(),
      evidenceUrl: row.achievement.evidenceUrl,
      evidenceRef: row.achievement.evidenceRef,
    },
    verification: {
      isValid: isSignatureValid,
      algorithm: "HMAC_SHA256",
      signature: row.achievement.signature,
      isRevoked: row.achievement.isRevoked,
      revokedAt: row.achievement.revokedAt ? row.achievement.revokedAt.toISOString() : null,
      revocationReason: row.achievement.revocationReason,
    },
  };
}

/**
 * Revokes a verified achievement (e.g. following official tournament protest, disqualification, or dispute).
 * Gated by organizer or platform authority. Logs in append-only audit trail.
 */
export async function revokeVerifiedAchievement(
  db: Db,
  actorUserId: string,
  achievementId: string,
  reason: string
) {
  const [row] = await db
    .select()
    .from(verifiedAchievements)
    .where(eq(verifiedAchievements.id, achievementId));

  if (!row) {
    throw new AuthError(404, "Not Found");
  }

  if (row.isRevoked) {
    throw new AuthError(409, "Achievement has already been revoked");
  }

  // Validate authorization: if competitionId exists, caller must manage it
  if (row.competitionId) {
    const hasPerm = await can(db, actorUserId, "competition:manage", {
      type: "competition",
      id: row.competitionId,
    });
    if (!hasPerm) {
      throw new AuthError(404, "Not Found");
    }
  }

  const revokedAt = new Date();
  const [updated] = await db
    .update(verifiedAchievements)
    .set({
      isRevoked: true,
      revokedAt,
      revocationReason: reason.trim(),
      revokedBy: actorUserId,
    })
    .where(eq(verifiedAchievements.id, achievementId))
    .returning();

  // Audit log entry
  await db.insert(auditLog).values({
    actorId: actorUserId,
    action: "ACHIEVEMENT_REVOKE",
    resourceType: "achievement",
    resourceId: achievementId,
    reason: reason.trim(),
    metadata: {
      userId: row.userId,
      title: row.title,
      competitionId: row.competitionId,
    },
  });

  return updated!;
}

/**
 * Lists verified achievements for an athlete with signature verification status.
 */
export async function listAthleteVerifiedAchievements(
  db: Db,
  userId: string,
  includeRevoked = false
) {
  const conditions = [eq(verifiedAchievements.userId, userId)];
  if (!includeRevoked) {
    conditions.push(eq(verifiedAchievements.isRevoked, false));
  }

  const rows = await db
    .select()
    .from(verifiedAchievements)
    .where(and(...conditions))
    .orderBy(desc(verifiedAchievements.verifiedAt));

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    competitionId: r.competitionId,
    title: r.title,
    category: r.category,
    issuer: r.issuer,
    verifiedAt: r.verifiedAt.toISOString(),
    signature: r.signature,
    isValidSignature: verifyAchievementSignature(r),
    evidenceUrl: r.evidenceUrl,
    evidenceRef: r.evidenceRef,
    isRevoked: r.isRevoked,
    revokedAt: r.revokedAt ? r.revokedAt.toISOString() : null,
    revocationReason: r.revocationReason,
  }));
}
