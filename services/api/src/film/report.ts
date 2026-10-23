import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { roleAssignments, tacticalReports, teams } from "../db/schema.js";
import { AuthError } from "../identity/service.js";

export type ClaimType = "OBSERVED" | "DERIVED" | "HYPOTHESIS";
export type CitationType = "CLIP" | "EVENT" | "METRIC";

export interface ReportCitationDto {
  citationType: CitationType;
  targetId: string;
  gameId?: string | undefined;
  timestampMs?: number | undefined;
  note?: string | undefined;
}

export interface ReportBlockDto {
  id: string;
  title: string;
  claimType: ClaimType;
  statement: string;
  sampleSize?: number | undefined;
  confidence?: number | undefined;
  citations: ReportCitationDto[];
}

export interface CreateReportInput {
  title: string;
  summary?: string | undefined;
  tags?: string[] | undefined;
  blocks: ReportBlockDto[];
}

export interface UpdateReportInput {
  title?: string | undefined;
  summary?: string | undefined;
  tags?: string[] | undefined;
  blocks?: ReportBlockDto[] | undefined;
}

const toPublicReport = (row: typeof tacticalReports.$inferSelect) => ({
  id: row.id,
  teamId: row.teamId,
  title: row.title,
  summary: row.summary ?? null,
  createdBy: row.createdBy,
  tags: row.tags ?? [],
  blocks: row.blocks ?? [],
  version: row.version,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/**
 * Verifies if user has membership in the team (COACH or PLAYER).
 */
async function canViewTeam(db: Db, userId: string, teamId: string): Promise<boolean> {
  const [t] = await db.select({ createdBy: teams.createdBy }).from(teams).where(eq(teams.id, teamId));
  if (!t) return false;
  if (t.createdBy === userId) return true;

  const [assignment] = await db
    .select()
    .from(roleAssignments)
    .where(
      and(
        eq(roleAssignments.userId, userId),
        eq(roleAssignments.resourceType, "team"),
        eq(roleAssignments.resourceId, teamId)
      )
    );

  return !!assignment;
}

/**
 * Verifies if user can manage/author reports for the team (team creator or COACH).
 */
async function canManageTeam(db: Db, userId: string, teamId: string): Promise<boolean> {
  const [t] = await db.select({ createdBy: teams.createdBy }).from(teams).where(eq(teams.id, teamId));
  if (!t) return false;
  if (t.createdBy === userId) return true;

  const [coach] = await db
    .select()
    .from(roleAssignments)
    .where(
      and(
        eq(roleAssignments.userId, userId),
        eq(roleAssignments.resourceType, "team"),
        eq(roleAssignments.resourceId, teamId),
        eq(roleAssignments.role, "COACH")
      )
    );

  return !!coach;
}

export async function createReport(
  db: Db,
  userId: string,
  teamId: string,
  input: CreateReportInput
) {
  const canManage = await canManageTeam(db, userId, teamId);
  if (!canManage) {
    throw new AuthError(404, "Team not found");
  }

  const [row] = await db
    .insert(tacticalReports)
    .values({
      teamId,
      title: input.title,
      summary: input.summary ?? null,
      createdBy: userId,
      tags: input.tags ?? [],
      blocks: input.blocks,
      version: 1,
    })
    .returning();

  return toPublicReport(row!);
}

export async function getReport(db: Db, userId: string, reportId: string) {
  const [row] = await db.select().from(tacticalReports).where(eq(tacticalReports.id, reportId));
  if (!row) return null;

  const hasAccess = await canViewTeam(db, userId, row.teamId);
  if (!hasAccess) {
    return null; // Return null so caller responds with 404 Not Found (ADR-0010)
  }

  return toPublicReport(row);
}

export async function listReports(db: Db, userId: string, teamId: string) {
  const hasAccess = await canViewTeam(db, userId, teamId);
  if (!hasAccess) {
    throw new AuthError(404, "Team not found");
  }

  const rows = await db
    .select()
    .from(tacticalReports)
    .where(eq(tacticalReports.teamId, teamId))
    .orderBy(desc(tacticalReports.updatedAt));

  return rows.map(toPublicReport);
}

export async function updateReport(
  db: Db,
  userId: string,
  reportId: string,
  input: UpdateReportInput
) {
  const existing = await getReport(db, userId, reportId);
  if (!existing) {
    throw new AuthError(404, "Report not found");
  }

  const canManage = await canManageTeam(db, userId, existing.teamId);
  if (!canManage) {
    throw new AuthError(404, "Report not found");
  }

  const [updated] = await db
    .update(tacticalReports)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.blocks !== undefined ? { blocks: input.blocks } : {}),
      version: existing.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(tacticalReports.id, reportId))
    .returning();

  return toPublicReport(updated!);
}

export async function deleteReport(db: Db, userId: string, reportId: string): Promise<boolean> {
  const existing = await getReport(db, userId, reportId);
  if (!existing) {
    throw new AuthError(404, "Report not found");
  }

  const canManage = await canManageTeam(db, userId, existing.teamId);
  if (!canManage) {
    throw new AuthError(404, "Report not found");
  }

  await db.delete(tacticalReports).where(eq(tacticalReports.id, reportId));
  return true;
}
