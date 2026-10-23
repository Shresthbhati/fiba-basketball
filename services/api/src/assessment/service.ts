import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { movementAssessments } from "../db/schema.js";
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

const toPublicAssessment = (row: typeof movementAssessments.$inferSelect) => ({
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

export async function getAssessment(db: Db, userId: string, id: string) {
  // ADR-009: Health & biomechanical data is private by default.
  // A resource that exists but belongs to another user returns 404 (indistinguishable from non-existent).
  const [row] = await db
    .select()
    .from(movementAssessments)
    .where(and(eq(movementAssessments.id, id), eq(movementAssessments.userId, userId)));

  if (!row) {
    throw new AuthError(404, "Not Found");
  }

  return toPublicAssessment(row);
}

export async function listAssessments(db: Db, userId: string) {
  const rows = await db
    .select()
    .from(movementAssessments)
    .where(eq(movementAssessments.userId, userId))
    .orderBy(desc(movementAssessments.createdAt));

  return rows.map(toPublicAssessment);
}
