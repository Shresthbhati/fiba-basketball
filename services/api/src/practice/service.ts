import { and, asc, desc, eq, or, isNull } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  practiceDrills,
  practiceSessions,
  roleAssignments,
  teams,
} from "../db/schema.js";
import { AuthError } from "../identity/service.js";

export type DrillCategory = "WARMUP" | "TECHNICAL" | "TACTICAL" | "SCRIMMAGE" | "COOLDOWN";
export type DrillIntensity = "LOW" | "MEDIUM" | "HIGH";
export type PracticeStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type AttendanceStatus = "PRESENT" | "ABSENT" | "EXCUSED" | "INJURED";

export interface PracticeBlockDto {
  id: string;
  order: number;
  drillId?: string | undefined;
  title: string;
  category: DrillCategory;
  durationMins: number;
  notes?: string | undefined;
  playId?: string | undefined;
  clipId?: string | undefined;
}

export interface AttendanceRecordDto {
  userId: string;
  status: AttendanceStatus;
  note?: string | undefined;
}

export interface CreatePracticeInput {
  title: string;
  scheduledAt: string;
  location?: string | undefined;
  focus?: string | undefined;
  notes?: string | undefined;
  blocks: PracticeBlockDto[];
}

export interface UpdatePracticeInput {
  title?: string | undefined;
  scheduledAt?: string | undefined;
  location?: string | undefined;
  focus?: string | undefined;
  notes?: string | undefined;
  blocks?: PracticeBlockDto[] | undefined;
  status?: PracticeStatus | undefined;
}

export interface CreateDrillInput {
  title: string;
  category: DrillCategory;
  intensity?: DrillIntensity | undefined;
  suggestedDurationMins?: number | undefined;
  brief?: string | undefined;
  playId?: string | undefined;
  clipId?: string | undefined;
  tags?: string[] | undefined;
}

const toPublicDrill = (row: typeof practiceDrills.$inferSelect) => ({
  id: row.id,
  teamId: row.teamId ?? null,
  title: row.title,
  category: row.category as DrillCategory,
  intensity: row.intensity as DrillIntensity,
  suggestedDurationMins: row.suggestedDurationMins,
  brief: row.brief ?? null,
  playId: row.playId ?? null,
  clipId: row.clipId ?? null,
  tags: row.tags ?? [],
  createdAt: row.createdAt.toISOString(),
});

const toPublicPractice = (row: typeof practiceSessions.$inferSelect) => ({
  id: row.id,
  teamId: row.teamId,
  title: row.title,
  scheduledAt: row.scheduledAt.toISOString(),
  location: row.location ?? null,
  focus: row.focus ?? null,
  notes: row.notes ?? null,
  blocks: row.blocks ?? [],
  totalDurationMins: row.totalDurationMins,
  attendance: row.attendance ?? [],
  status: row.status as PracticeStatus,
  createdBy: row.createdBy,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

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

// Standard FIBA basketball drills
export const STANDARD_BASKETBALL_DRILLS: CreateDrillInput[] = [
  {
    title: "Shell Drill: 4-on-4 Help & Recover",
    category: "TACTICAL",
    intensity: "HIGH",
    suggestedDurationMins: 15,
    brief: "Four perimeter defenders rotate on air passes, jump to the ball, help on baseline drives, and execute weakside stunt & recover.",
    tags: ["defense", "rotations", "shell"],
  },
  {
    title: "Continuous 3-on-2 to 2-on-1 Transition",
    category: "TACTICAL",
    intensity: "HIGH",
    suggestedDurationMins: 12,
    brief: "Offense attacks 3-on-2; the shooter or turnover player hustles back on defense while the two defensive rebounders outlet into a 2-on-1 break.",
    tags: ["transition", "fastbreak", "advantage"],
  },
  {
    title: "Dynamic Full-Court Activation & Finishing",
    category: "WARMUP",
    intensity: "MEDIUM",
    suggestedDurationMins: 10,
    brief: "Full-court ball handling series into change-of-direction layups (Euro-step, reverse, floater).",
    tags: ["warmup", "finishing", "activation"],
  },
  {
    title: "Closeout 1-on-1 with Stunt Recovery",
    category: "TECHNICAL",
    intensity: "HIGH",
    suggestedDurationMins: 10,
    brief: "Defender chops feet on closeout with high contest hand; live 1-on-1 with 3-dribble maximum.",
    tags: ["closeout", "1-on-1", "individual-defense"],
  },
  {
    title: "Horns Half-Court Execution 5-on-0 to 5-on-5",
    category: "TACTICAL",
    intensity: "MEDIUM",
    suggestedDurationMins: 15,
    brief: "Run offensive Horns Pick & Pop and Spanish Stack sets against token defense, then progress to live 24-second shot-clock possessions.",
    tags: ["playbook", "horns", "half-court"],
  },
  {
    title: "Free Throw Pressure & Mental Focus",
    category: "COOLDOWN",
    intensity: "LOW",
    suggestedDurationMins: 5,
    brief: "Each player shoots 1-and-1 free throws; team running sprint penalty for misses to simulate late-game fatigue.",
    tags: ["free-throws", "cooldown", "pressure"],
  },
];

export async function createDrill(
  db: Db,
  userId: string,
  teamId: string,
  input: CreateDrillInput
) {
  const canManage = await canManageTeam(db, userId, teamId);
  if (!canManage) {
    throw new AuthError(404, "Team not found");
  }

  const [drill] = await db
    .insert(practiceDrills)
    .values({
      teamId,
      title: input.title,
      category: input.category,
      intensity: input.intensity ?? "MEDIUM",
      suggestedDurationMins: input.suggestedDurationMins ?? 10,
      brief: input.brief ?? null,
      playId: input.playId ?? null,
      clipId: input.clipId ?? null,
      tags: input.tags ?? [],
      createdBy: userId,
    })
    .returning();

  return toPublicDrill(drill!);
}

export async function listDrills(
  db: Db,
  userId: string,
  teamId: string,
  filter?: { category?: string | undefined }
) {
  const hasAccess = await canViewTeam(db, userId, teamId);
  if (!hasAccess) {
    throw new AuthError(404, "Team not found");
  }

  // Auto-seed standard drills if catalog is currently empty
  const existingCount = await db.select().from(practiceDrills);
  if (existingCount.length === 0) {
    for (const d of STANDARD_BASKETBALL_DRILLS) {
      await db.insert(practiceDrills).values({
        teamId: null, // Global template drill
        title: d.title,
        category: d.category,
        intensity: d.intensity ?? "MEDIUM",
        suggestedDurationMins: d.suggestedDurationMins ?? 10,
        brief: d.brief ?? null,
        tags: d.tags ?? [],
        createdBy: null,
      });
    }
  }

  const rows = await db
    .select()
    .from(practiceDrills)
    .where(or(isNull(practiceDrills.teamId), eq(practiceDrills.teamId, teamId)))
    .orderBy(asc(practiceDrills.title));

  let items = rows.map(toPublicDrill);
  if (filter?.category) {
    items = items.filter((d) => d.category === filter.category);
  }
  return items;
}

export async function createPractice(
  db: Db,
  userId: string,
  teamId: string,
  input: CreatePracticeInput
) {
  const canManage = await canManageTeam(db, userId, teamId);
  if (!canManage) {
    throw new AuthError(404, "Team not found");
  }

  const totalDurationMins = input.blocks.reduce((sum, b) => sum + (b.durationMins || 0), 0);

  const [row] = await db
    .insert(practiceSessions)
    .values({
      teamId,
      title: input.title,
      scheduledAt: new Date(input.scheduledAt),
      location: input.location ?? null,
      focus: input.focus ?? null,
      notes: input.notes ?? null,
      blocks: input.blocks,
      totalDurationMins,
      attendance: [],
      status: "SCHEDULED",
      createdBy: userId,
    })
    .returning();

  return toPublicPractice(row!);
}

export async function getPractice(db: Db, userId: string, practiceId: string) {
  const [row] = await db.select().from(practiceSessions).where(eq(practiceSessions.id, practiceId));
  if (!row) return null;

  const hasAccess = await canViewTeam(db, userId, row.teamId);
  if (!hasAccess) {
    return null; // 404 per ADR-0010
  }

  return toPublicPractice(row);
}

export async function listPractices(db: Db, userId: string, teamId: string) {
  const hasAccess = await canViewTeam(db, userId, teamId);
  if (!hasAccess) {
    throw new AuthError(404, "Team not found");
  }

  const rows = await db
    .select()
    .from(practiceSessions)
    .where(eq(practiceSessions.teamId, teamId))
    .orderBy(desc(practiceSessions.scheduledAt));

  return rows.map(toPublicPractice);
}

export async function updatePractice(
  db: Db,
  userId: string,
  practiceId: string,
  input: UpdatePracticeInput
) {
  const existing = await getPractice(db, userId, practiceId);
  if (!existing) {
    throw new AuthError(404, "Practice not found");
  }

  const canManage = await canManageTeam(db, userId, existing.teamId);
  if (!canManage) {
    throw new AuthError(404, "Practice not found");
  }

  const totalDurationMins = input.blocks
    ? input.blocks.reduce((sum, b) => sum + (b.durationMins || 0), 0)
    : undefined;

  const [updated] = await db
    .update(practiceSessions)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.scheduledAt !== undefined ? { scheduledAt: new Date(input.scheduledAt) } : {}),
      ...(input.location !== undefined ? { location: input.location } : {}),
      ...(input.focus !== undefined ? { focus: input.focus } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.blocks !== undefined ? { blocks: input.blocks } : {}),
      ...(totalDurationMins !== undefined ? { totalDurationMins } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      updatedAt: new Date(),
    })
    .where(eq(practiceSessions.id, practiceId))
    .returning();

  return toPublicPractice(updated!);
}

export async function recordPracticeAttendance(
  db: Db,
  userId: string,
  practiceId: string,
  records: AttendanceRecordDto[]
) {
  const existing = await getPractice(db, userId, practiceId);
  if (!existing) {
    throw new AuthError(404, "Practice not found");
  }

  const canManage = await canManageTeam(db, userId, existing.teamId);
  if (!canManage) {
    throw new AuthError(404, "Practice not found");
  }

  const [updated] = await db
    .update(practiceSessions)
    .set({
      attendance: records,
      updatedAt: new Date(),
    })
    .where(eq(practiceSessions.id, practiceId))
    .returning();

  return toPublicPractice(updated!);
}

export async function deletePractice(db: Db, userId: string, practiceId: string): Promise<boolean> {
  const existing = await getPractice(db, userId, practiceId);
  if (!existing) {
    throw new AuthError(404, "Practice not found");
  }

  const canManage = await canManageTeam(db, userId, existing.teamId);
  if (!canManage) {
    throw new AuthError(404, "Practice not found");
  }

  await db.delete(practiceSessions).where(eq(practiceSessions.id, practiceId));
  return true;
}
