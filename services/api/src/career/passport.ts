import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  athletePassportGrants,
  movementAssessments,
  users,
  verifiedAchievements,
} from "../db/schema.js";
import { AuthError } from "../identity/service.js";
import { myCareer } from "./service.js";

export interface CreatePassportGrantInput {
  label?: string | undefined;
  includeAverages?: boolean | undefined;
  includeShootingSplits?: boolean | undefined;
  includeMinutes?: boolean | undefined;
  includeGameLog?: boolean | undefined;
  includeBiometrics?: boolean | undefined;
  expiresInDays?: number | undefined;
}

export async function createPassportGrant(
  db: Db,
  userId: string,
  input: CreatePassportGrantInput = {}
) {
  const token = randomBytes(16).toString("hex");
  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  const [grant] = await db
    .insert(athletePassportGrants)
    .values({
      userId,
      token,
      label: input.label ?? null,
      includeAverages: input.includeAverages ?? true,
      includeShootingSplits: input.includeShootingSplits ?? true,
      includeMinutes: input.includeMinutes ?? false,
      includeGameLog: input.includeGameLog ?? true,
      includeBiometrics: input.includeBiometrics ?? false,
      expiresAt,
    })
    .returning();

  return grant!;
}

export async function listPassportGrants(db: Db, userId: string) {
  return db
    .select()
    .from(athletePassportGrants)
    .where(eq(athletePassportGrants.userId, userId))
    .orderBy(desc(athletePassportGrants.createdAt));
}

export async function revokePassportGrant(db: Db, userId: string, grantId: string) {
  const [existing] = await db
    .select()
    .from(athletePassportGrants)
    .where(and(eq(athletePassportGrants.id, grantId), eq(athletePassportGrants.userId, userId)));

  if (!existing) {
    throw new AuthError(404, "Passport grant not found");
  }

  await db
    .update(athletePassportGrants)
    .set({ revokedAt: new Date() })
    .where(eq(athletePassportGrants.id, grantId));

  return true;
}

/**
 * Public resolver for an athlete passport using a shared grant token.
 * Strictly respects field-level privacy grants (ADR-0010).
 * If revoked or expired, returns null (causing 404 Not Found).
 */
export async function getPublicPassport(db: Db, token: string) {
  const [grant] = await db
    .select()
    .from(athletePassportGrants)
    .where(
      and(
        eq(athletePassportGrants.token, token),
        isNull(athletePassportGrants.revokedAt)
      )
    );

  if (!grant) return null;

  // Check expiration if set
  if (grant.expiresAt && grant.expiresAt < new Date()) {
    return null;
  }

  // Fetch athlete profile
  const [athlete] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, grant.userId));

  if (!athlete) return null;

  // Fetch official career statistics
  const career = await myCareer(db, grant.userId);

  // Fetch verified achievements
  const achievements = await db
    .select({
      id: verifiedAchievements.id,
      title: verifiedAchievements.title,
      category: verifiedAchievements.category,
      issuer: verifiedAchievements.issuer,
      verifiedAt: verifiedAchievements.verifiedAt,
    })
    .from(verifiedAchievements)
    .where(eq(verifiedAchievements.userId, grant.userId))
    .orderBy(desc(verifiedAchievements.verifiedAt));

  // Fetch verified biometrics if permitted by grant
  let biometrics = null;
  if (grant.includeBiometrics) {
    const assessments = await db
      .select({
        protocol: movementAssessments.protocol,
        status: movementAssessments.status,
        confidence: movementAssessments.confidence,
        repCount: movementAssessments.repCount,
        metrics: movementAssessments.metrics,
        sourceType: movementAssessments.sourceType,
        createdAt: movementAssessments.createdAt,
      })
      .from(movementAssessments)
      .where(
        and(
          eq(movementAssessments.userId, grant.userId),
          eq(movementAssessments.status, "ACCEPTED")
        )
      )
      .orderBy(desc(movementAssessments.createdAt));

    biometrics = assessments.map((a) => ({
      protocol: a.protocol,
      status: a.status,
      sourceType: a.sourceType,
      confidence: a.confidence ? Number(a.confidence) : null,
      repCount: a.repCount,
      metrics: a.metrics ?? {},
      createdAt: a.createdAt.toISOString(),
    }));
  }

  // Build projected passport respecting field-level grants
  const totals = { ...career.totals };
  if (!grant.includeShootingSplits) {
    totals.fgm = 0;
    totals.fga = 0;
    totals.tpm = 0;
    totals.tpa = 0;
    totals.ftm = 0;
    totals.fta = 0;
  }

  return {
    athlete: {
      displayName: athlete.displayName,
    },
    grant: {
      token: grant.token,
      label: grant.label,
      expiresAt: grant.expiresAt?.toISOString() ?? null,
      permissions: {
        includeAverages: grant.includeAverages,
        includeShootingSplits: grant.includeShootingSplits,
        includeMinutes: grant.includeMinutes,
        includeGameLog: grant.includeGameLog,
        includeBiometrics: grant.includeBiometrics,
      },
    },
    provenance: {
      matchStatsSource: "OFFICIAL",
      verifiedAchievementsCount: achievements.length,
    },
    achievements: achievements.map((a) => ({
      ...a,
      verifiedAt: a.verifiedAt.toISOString(),
    })),
    career: {
      games: career.games,
      totals,
      perGame: grant.includeAverages ? career.perGame : null,
      minutes: grant.includeMinutes ? career.minutes : null,
      competitions: career.competitions.map((c) => ({
        name: c.name,
        games: c.games,
        totals: grant.includeShootingSplits
          ? c.totals
          : { ...c.totals, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 },
        recent: grant.includeGameLog ? c.recent : [],
      })),
    },
    biometrics,
  };
}

/** Admin or Competition Organizer awards a verified achievement to an athlete */
export async function awardVerifiedAchievement(
  db: Db,
  userId: string,
  input: { title: string; category: string; issuer: string; competitionId?: string | undefined }
) {
  const [award] = await db
    .insert(verifiedAchievements)
    .values({
      userId,
      title: input.title,
      category: input.category,
      issuer: input.issuer,
      competitionId: input.competitionId ?? null,
    })
    .returning();

  return award!;
}
