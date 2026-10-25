import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { computeAchievementSignature } from "./achievements.js";
import type { Db } from "../db/index.js";
import { verifiedAchievements } from "../db/schema.js";
import type { Line } from "../match/box-score.js";
import { myCareer } from "./service.js";

export interface MilestoneProgress {
  key: string;
  title: string;
  category: "SCORING" | "SHOOTING" | "PLAYMAKING" | "REBOUNDING" | "VERSATILITY" | "ENDURANCE";
  targetValue: number;
  currentValue: number;
  progressPct: number;
  unit: string;
  description: string;
  isUnlocked: boolean;
  unlockedAt: string | null;
}

export interface MilestoneDefinition {
  key: string;
  title: string;
  category: "SCORING" | "SHOOTING" | "PLAYMAKING" | "REBOUNDING" | "VERSATILITY" | "ENDURANCE";
  targetValue: number;
  unit: string;
  description: string;
  evaluator: (totals: Line, games: number, doubleDoubles: number) => number;
}

export const MILESTONE_DEFINITIONS: MilestoneDefinition[] = [
  {
    key: "CENTURY_CLUB_100_PTS",
    title: "Century Club (100 Career Points)",
    category: "SCORING",
    targetValue: 100,
    unit: "Points",
    description: "Surpassed 100 total career points in official matches.",
    evaluator: (totals) => totals.points,
  },
  {
    key: "SCORING_CLINICIAN_500_PTS",
    title: "Scoring Clinician (500 Career Points)",
    category: "SCORING",
    targetValue: 500,
    unit: "Points",
    description: "Surpassed 500 total career points in official matches.",
    evaluator: (totals) => totals.points,
  },
  {
    key: "ELITE_1K_1000_PTS",
    title: "Elite 1K (1,000 Career Points)",
    category: "SCORING",
    targetValue: 1000,
    unit: "Points",
    description: "Scored over 1,000 career points in official competition.",
    evaluator: (totals) => totals.points,
  },
  {
    key: "PERIMETER_THREAT_25_3PM",
    title: "Perimeter Threat (25 3-Pointers Made)",
    category: "SHOOTING",
    targetValue: 25,
    unit: "3PM",
    description: "Drained 25 three-pointers in official match play.",
    evaluator: (totals) => totals.tpm,
  },
  {
    key: "SHARPSHOOTER_50_3PM",
    title: "Sharpshooter (50 3-Pointers Made)",
    category: "SHOOTING",
    targetValue: 50,
    unit: "3PM",
    description: "Drained 50 three-pointers in official match play.",
    evaluator: (totals) => totals.tpm,
  },
  {
    key: "FLOOR_GENERAL_50_AST",
    title: "Floor General (50 Career Assists)",
    category: "PLAYMAKING",
    targetValue: 50,
    unit: "Assists",
    description: "Dished out 50 career assists in official matches.",
    evaluator: (totals) => totals.assists,
  },
  {
    key: "PLAYMAKING_MAESTRO_100_AST",
    title: "Playmaking Maestro (100 Career Assists)",
    category: "PLAYMAKING",
    targetValue: 100,
    unit: "Assists",
    description: "Dished out 100 career assists in official matches.",
    evaluator: (totals) => totals.assists,
  },
  {
    key: "GLASS_CLEANER_50_REB",
    title: "Glass Cleaner (50 Career Rebounds)",
    category: "REBOUNDING",
    targetValue: 50,
    unit: "Rebounds",
    description: "Grabbed 50 career rebounds off the glass in official competition.",
    evaluator: (totals) => totals.rebounds,
  },
  {
    key: "BOARD_DOMINATOR_150_REB",
    title: "Board Dominator (150 Career Rebounds)",
    category: "REBOUNDING",
    targetValue: 150,
    unit: "Rebounds",
    description: "Grabbed 150 career rebounds off the glass in official competition.",
    evaluator: (totals) => totals.rebounds,
  },
  {
    key: "DOUBLE_DOUBLE_CLUB",
    title: "Double-Double Club (3+ Double-Doubles)",
    category: "VERSATILITY",
    targetValue: 3,
    unit: "Double-Doubles",
    description: "Recorded double digits in two statistical categories in 3 or more official games.",
    evaluator: (_totals, _games, doubleDoubles) => doubleDoubles,
  },
  {
    key: "COMPETITION_REGULAR_10_GAMES",
    title: "Competition Regular (10 Matches Played)",
    category: "ENDURANCE",
    targetValue: 10,
    unit: "Games",
    description: "Competed in 10 official matches.",
    evaluator: (_totals, games) => games,
  },
  {
    key: "IRON_MAN_25_GAMES",
    title: "Iron Man (25 Matches Played)",
    category: "ENDURANCE",
    targetValue: 25,
    unit: "Games",
    description: "Competed in 25 official matches.",
    evaluator: (_totals, games) => games,
  },
];

/**
 * Evaluates career metrics and awards milestone badges for unlocked criteria.
 * Idempotent: previously awarded achievements are preserved and never duplicated.
 */
export async function evaluateAndAwardMilestones(db: Db, userId: string) {
  const career = await myCareer(db, userId);

  // Calculate double-doubles from all game lines across competitions
  let doubleDoubles = 0;
  for (const comp of career.competitions) {
    for (const g of comp.recent) {
      let dblCount = 0;
      if (g.line.points >= 10) dblCount++;
      if (g.line.rebounds >= 10) dblCount++;
      if (g.line.assists >= 10) dblCount++;
      if (dblCount >= 2) doubleDoubles++;
    }
  }

  // Fetch already awarded achievements
  const existingAwards = await db
    .select()
    .from(verifiedAchievements)
    .where(eq(verifiedAchievements.userId, userId));

  const existingMap = new Map(existingAwards.map((a) => [a.title, a]));
  const newlyAwarded: string[] = [];

  for (const def of MILESTONE_DEFINITIONS) {
    const val = def.evaluator(career.totals, career.games, doubleDoubles);
    const isUnlocked = val >= def.targetValue;

    if (isUnlocked && !existingMap.has(def.title)) {
      const id = randomUUID();
      const verifiedAt = new Date();
      const signature = computeAchievementSignature({
        id,
        userId,
        title: def.title,
        category: def.category,
        issuer: "COURT IQ Official OS",
        verifiedAt: verifiedAt.toISOString(),
        evidenceRef: `career:${userId}`,
      });

      const [awarded] = await db
        .insert(verifiedAchievements)
        .values({
          id,
          userId,
          title: def.title,
          category: def.category,
          issuer: "COURT IQ Official OS",
          signature,
          evidenceRef: `career:${userId}`,
          verifiedAt,
        })
        .returning();

      existingMap.set(def.title, awarded!);
      newlyAwarded.push(def.title);
    }
  }

  return { newlyAwarded };
}

/**
 * Returns comprehensive milestone progression for an athlete:
 * unlocked verified achievements alongside progress percentage for upcoming targets.
 */
export async function getMilestoneProgress(db: Db, userId: string): Promise<{
  achievements: Array<{
    id: string;
    title: string;
    category: string;
    issuer: string;
    verifiedAt: string;
  }>;
  milestones: MilestoneProgress[];
}> {
  // First ensure any eligible milestones are evaluated and awarded
  await evaluateAndAwardMilestones(db, userId);

  const career = await myCareer(db, userId);

  let doubleDoubles = 0;
  for (const comp of career.competitions) {
    for (const g of comp.recent) {
      let dblCount = 0;
      if (g.line.points >= 10) dblCount++;
      if (g.line.rebounds >= 10) dblCount++;
      if (g.line.assists >= 10) dblCount++;
      if (dblCount >= 2) doubleDoubles++;
    }
  }

  const existingAwards = await db
    .select()
    .from(verifiedAchievements)
    .where(eq(verifiedAchievements.userId, userId))
    .orderBy(desc(verifiedAchievements.verifiedAt));

  const existingMap = new Map(existingAwards.map((a) => [a.title, a]));

  const milestones: MilestoneProgress[] = MILESTONE_DEFINITIONS.map((def) => {
    const currentValue = def.evaluator(career.totals, career.games, doubleDoubles);
    const existing = existingMap.get(def.title);
    const isUnlocked = !!existing || currentValue >= def.targetValue;
    const progressPct = Math.min(100, Math.round((currentValue / def.targetValue) * 100));

    return {
      key: def.key,
      title: def.title,
      category: def.category,
      targetValue: def.targetValue,
      currentValue,
      progressPct,
      unit: def.unit,
      description: def.description,
      isUnlocked,
      unlockedAt: existing ? existing.verifiedAt.toISOString() : null,
    };
  });

  return {
    achievements: existingAwards.map((a) => ({
      id: a.id,
      title: a.title,
      category: a.category,
      issuer: a.issuer,
      verifiedAt: a.verifiedAt.toISOString(),
    })),
    milestones,
  };
}
