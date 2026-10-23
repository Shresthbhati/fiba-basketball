import { and, desc, eq, isNull, or, gt } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  assessmentCoachFeedback,
  assessmentShareGrants,
  movementAssessments,
  users,
} from "../db/schema.js";
import { AuthError } from "../identity/service.js";

export interface AssessmentInput {
  protocol: "BODYWEIGHT_SQUAT" | "COUNTERMOVEMENT_JUMP";
  status: "ACCEPTED" | "NEEDS_REVIEW" | "ABSTAINED";
  confidence?: number | undefined;
  modelVersion?: string | undefined;
  protocolVersion?: string | undefined;
  repCount?: number | undefined;
  metrics?: Record<string, unknown> | undefined;
  criteriaUnmeasurable?: string[] | undefined;
  feedback?: string[] | undefined;
  abstainReason?: string | undefined;
}

export interface CreateShareGrantInput {
  granteeId?: string | undefined;
  granteeEmail?: string | undefined;
  role?: "COACH" | "TRAINER" | "HEALTH_PRO" | undefined;
  expiresAt?: string | undefined;
}

export interface CreateCoachFeedbackInput {
  notes: string;
  cues?: string[] | undefined;
  suggestedDrillId?: string | undefined;
}

const toPublicAssessment = (
  row: typeof movementAssessments.$inferSelect,
  feedback: Array<typeof assessmentCoachFeedback.$inferSelect> = []
) => ({
  id: row.id,
  userId: row.userId,
  protocol: row.protocol,
  status: row.status,
  sourceType: row.sourceType,
  confidence: row.confidence ? Number(row.confidence) : null,
  modelVersion: row.modelVersion,
  protocolVersion: row.protocolVersion,
  repCount: row.repCount,
  metrics: row.metrics ?? {},
  criteriaUnmeasurable: row.criteriaUnmeasurable ?? [],
  feedback: row.feedback ?? [],
  abstainReason: row.abstainReason ?? null,
  coachFeedback: feedback.map((f) => ({
    id: f.id,
    authorId: f.authorId,
    authorRole: f.authorRole,
    notes: f.notes,
    cues: f.cues ?? [],
    suggestedDrillId: f.suggestedDrillId ?? null,
    createdAt: f.createdAt.toISOString(),
  })),
  createdAt: row.createdAt.toISOString(),
});

const toPublicGrant = (row: typeof assessmentShareGrants.$inferSelect, granteeName?: string) => ({
  id: row.id,
  assessmentId: row.assessmentId,
  athleteId: row.athleteId,
  granteeId: row.granteeId,
  granteeName: granteeName ?? null,
  role: row.role,
  revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
  expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  createdAt: row.createdAt.toISOString(),
});

export async function recordAssessment(db: Db, userId: string, input: AssessmentInput) {
  const [row] = await db
    .insert(movementAssessments)
    .values({
      userId,
      protocol: input.protocol,
      status: input.status,
      sourceType: "CV_ESTIMATE",
      confidence: input.confidence !== undefined ? String(input.confidence) : null,
      modelVersion: input.modelVersion ?? "court-iq-pose-v1.0",
      protocolVersion: input.protocolVersion ?? "protocol-v1.0",
      repCount: input.repCount ?? 0,
      metrics: input.metrics ?? {},
      criteriaUnmeasurable: input.criteriaUnmeasurable ?? [],
      feedback: input.feedback ?? [],
      abstainReason: input.abstainReason ?? null,
    })
    .returning();

  return toPublicAssessment(row!);
}

/** Check if user can view assessment: either owner or active non-revoked, unexpired grantee. */
async function canViewAssessment(db: Db, userId: string, assessment: typeof movementAssessments.$inferSelect) {
  if (assessment.userId === userId) return true;

  const now = new Date();
  const [grant] = await db
    .select()
    .from(assessmentShareGrants)
    .where(
      and(
        eq(assessmentShareGrants.assessmentId, assessment.id),
        eq(assessmentShareGrants.granteeId, userId),
        isNull(assessmentShareGrants.revokedAt),
        or(isNull(assessmentShareGrants.expiresAt), gt(assessmentShareGrants.expiresAt, now))
      )
    );

  return !!grant;
}

export async function getAssessment(db: Db, userId: string, id: string) {
  // ADR-009: Health & biomechanical data is private by default.
  // A resource that exists but is unauthorized returns 404 (ADR-0010).
  const [row] = await db.select().from(movementAssessments).where(eq(movementAssessments.id, id));
  if (!row) {
    throw new AuthError(404, "Not Found");
  }

  const authorized = await canViewAssessment(db, userId, row);
  if (!authorized) {
    throw new AuthError(404, "Not Found");
  }

  const feedback = await db
    .select()
    .from(assessmentCoachFeedback)
    .where(eq(assessmentCoachFeedback.assessmentId, id))
    .orderBy(desc(assessmentCoachFeedback.createdAt));

  return toPublicAssessment(row, feedback);
}

export async function listAssessments(db: Db, userId: string) {
  const rows = await db
    .select()
    .from(movementAssessments)
    .where(eq(movementAssessments.userId, userId))
    .orderBy(desc(movementAssessments.createdAt));

  return rows.map((r) => toPublicAssessment(r));
}

// Share Grants (WP-2.8)
export async function createShareGrant(
  db: Db,
  athleteId: string,
  assessmentId: string,
  input: CreateShareGrantInput
) {
  const [row] = await db
    .select()
    .from(movementAssessments)
    .where(and(eq(movementAssessments.id, assessmentId), eq(movementAssessments.userId, athleteId)));

  if (!row) {
    throw new AuthError(404, "Assessment not found");
  }

  let granteeId = input.granteeId;
  if (!granteeId && input.granteeEmail) {
    const [u] = await db.select().from(users).where(eq(users.email, input.granteeEmail.trim().toLowerCase()));
    if (!u) {
      throw new AuthError(404, "Recipient user not found with that email");
    }
    granteeId = u.id;
  }

  if (!granteeId) {
    throw new AuthError(400, "Must provide granteeId or granteeEmail");
  }

  const [grant] = await db
    .insert(assessmentShareGrants)
    .values({
      assessmentId,
      athleteId,
      granteeId,
      role: input.role ?? "COACH",
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    })
    .returning();

  const [grantee] = await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, granteeId));

  return toPublicGrant(grant!, grantee?.displayName);
}

export async function listShareGrants(db: Db, athleteId: string, assessmentId: string) {
  const [row] = await db
    .select()
    .from(movementAssessments)
    .where(and(eq(movementAssessments.id, assessmentId), eq(movementAssessments.userId, athleteId)));

  if (!row) {
    throw new AuthError(404, "Assessment not found");
  }

  const grants = await db
    .select({
      grant: assessmentShareGrants,
      granteeName: users.displayName,
    })
    .from(assessmentShareGrants)
    .innerJoin(users, eq(users.id, assessmentShareGrants.granteeId))
    .where(eq(assessmentShareGrants.assessmentId, assessmentId))
    .orderBy(desc(assessmentShareGrants.createdAt));

  return { items: grants.map((g) => toPublicGrant(g.grant, g.granteeName)) };
}

export async function revokeShareGrant(
  db: Db,
  athleteId: string,
  assessmentId: string,
  grantId: string
) {
  const [grant] = await db
    .select()
    .from(assessmentShareGrants)
    .where(
      and(
        eq(assessmentShareGrants.id, grantId),
        eq(assessmentShareGrants.assessmentId, assessmentId),
        eq(assessmentShareGrants.athleteId, athleteId)
      )
    );

  if (!grant) {
    throw new AuthError(404, "Share grant not found");
  }

  await db
    .update(assessmentShareGrants)
    .set({ revokedAt: new Date() })
    .where(eq(assessmentShareGrants.id, grantId));

  return true;
}

// Coach Feedback (WP-2.8)
export async function addCoachFeedback(
  db: Db,
  authorId: string,
  assessmentId: string,
  input: CreateCoachFeedbackInput
) {
  const [row] = await db.select().from(movementAssessments).where(eq(movementAssessments.id, assessmentId));
  if (!row) {
    throw new AuthError(404, "Assessment not found");
  }

  const authorized = await canViewAssessment(db, authorId, row);
  if (!authorized) {
    throw new AuthError(404, "Assessment not found");
  }

  const authorRole = row.userId === authorId ? "ATHLETE" : "COACH";

  const [feedback] = await db
    .insert(assessmentCoachFeedback)
    .values({
      assessmentId,
      authorId,
      authorRole,
      notes: input.notes,
      cues: input.cues ?? [],
      suggestedDrillId: input.suggestedDrillId ?? null,
    })
    .returning();

  return {
    id: feedback!.id,
    assessmentId: feedback!.assessmentId,
    authorId: feedback!.authorId,
    authorRole: feedback!.authorRole,
    notes: feedback!.notes,
    cues: feedback!.cues ?? [],
    suggestedDrillId: feedback!.suggestedDrillId ?? null,
    createdAt: feedback!.createdAt.toISOString(),
  };
}

export async function updateAssessmentStatus(
  db: Db,
  userId: string,
  assessmentId: string,
  input: { status?: "ACCEPTED" | "NEEDS_REVIEW" | "ABSTAINED" | undefined }
) {
  const [row] = await db.select().from(movementAssessments).where(eq(movementAssessments.id, assessmentId));
  if (!row) {
    throw new AuthError(404, "Assessment not found");
  }

  const authorized = await canViewAssessment(db, userId, row);
  if (!authorized) {
    throw new AuthError(404, "Assessment not found");
  }

  const [updated] = await db
    .update(movementAssessments)
    .set({
      ...(input.status !== undefined ? { status: input.status } : {}),
    })
    .where(eq(movementAssessments.id, assessmentId))
    .returning();

  return toPublicAssessment(updated!);
}
