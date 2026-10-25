import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  filmGames,
  playSimilarityEmbeddings,
  roleAssignments,
  scenarioSimulations,
  tacticalCandidateEvents,
  tacticalModelRegistry,
  tacticalPlays,
  teams,
} from "../db/schema.js";
import { AuthError } from "../identity/service.js";

export type TacticalCandidateEventType =
  | "PICK_AND_ROLL"
  | "POP"
  | "SCREEN_AWAY"
  | "DRIVE_AND_KICK"
  | "CUT_TO_RIM"
  | "ISOLATION"
  | "POST_UP"
  | "TRANSITION_BREAK";

export type TacticalCandidateStatus = "CANDIDATE" | "CONFIRMED" | "REJECTED" | "ADJUSTED";

export type DefensiveCoverageType =
  | "DROP"
  | "SWITCH"
  | "BLITZ_TRAP"
  | "HEDGE_AND_RECOVER"
  | "ICE_WEAK"
  | "HELP_AND_RECOVER";

export interface CreateCandidateEventInput {
  gameId: string;
  clipId?: string | undefined;
  teamId: string;
  eventType: TacticalCandidateEventType;
  timestampSeconds: number;
  courtCoordinates: { x: number; y: number; endX?: number | undefined; endY?: number | undefined };
  involvedPlayerIds?: string[] | undefined;
  confidenceScore: number;
  modelVersion?: string | undefined;
}

export interface ReviewCandidateInput {
  status: TacticalCandidateStatus;
  reviewNotes?: string | undefined;
  adjustedEventType?: TacticalCandidateEventType | undefined;
  adjustedCoordinates?: { x: number; y: number; endX?: number | undefined; endY?: number | undefined } | undefined;
}

export interface SimulateScenarioInput {
  teamId: string;
  playId?: string | undefined;
  title: string;
  coverageType: DefensiveCoverageType;
  offensiveSetup?: Record<string, unknown> | undefined;
  defensiveResponse?: Record<string, unknown> | undefined;
}

export interface RegisterModelInput {
  modelVersion: string;
  modelType: "CV_TRACKING" | "TACTICAL_CANDIDATE" | "PLAY_EMBEDDING" | "COVERAGE_SIMULATOR";
  benchmarkDataset: string;
  metrics: {
    accuracy: number;
    f1Score: number;
    precision: number;
    recall: number;
    sampleSize: number;
  };
  status?: "CANDIDATE" | "ACTIVE" | "DEPRECATED" | "ROLLED_BACK" | undefined;
}

/**
 * Checks if a user has access to a team's tactical resources (Spec §12, §13, ADR-0010).
 */
export async function canAccessTeam(db: Db, userId: string, teamId: string): Promise<boolean> {
  const [t] = await db.select({ createdBy: teams.createdBy }).from(teams).where(eq(teams.id, teamId));
  if (t?.createdBy === userId) return true;

  const [assignment] = await db
    .select()
    .from(roleAssignments)
    .where(
      and(
        eq(roleAssignments.userId, userId),
        eq(roleAssignments.resourceType, "team"),
        eq(roleAssignments.resourceId, teamId),
      ),
    );

  return !!assignment;
}

// ---------------------------------------------------------------------------
// WP-7.1: Candidate Events & Human Review Queue
// ---------------------------------------------------------------------------

export async function createCandidateEvent(db: Db, userId: string, input: CreateCandidateEventInput) {
  const hasAccess = await canAccessTeam(db, userId, input.teamId);
  if (!hasAccess) {
    throw new AuthError(404, "Team not found");
  }

  // Verify game exists
  const [game] = await db.select().from(filmGames).where(eq(filmGames.id, input.gameId));
  if (!game) {
    throw new AuthError(404, "Film game not found");
  }

  const [row] = await db
    .insert(tacticalCandidateEvents)
    .values({
      gameId: input.gameId,
      ...(input.clipId ? { clipId: input.clipId } : {}),
      teamId: input.teamId,
      eventType: input.eventType,
      timestampSeconds: input.timestampSeconds,
      courtCoordinates: input.courtCoordinates,
      involvedPlayerIds: input.involvedPlayerIds ?? [],
      confidenceScore: input.confidenceScore,
      status: "CANDIDATE",
      modelVersion: input.modelVersion ?? "v1.0.0",
    })
    .returning();

  return row;
}

export async function listCandidateEvents(
  db: Db,
  userId: string,
  teamId: string,
  filter?: { gameId?: string | undefined; status?: TacticalCandidateStatus | undefined; minConfidence?: number | undefined },
) {
  const hasAccess = await canAccessTeam(db, userId, teamId);
  if (!hasAccess) {
    throw new AuthError(404, "Team not found");
  }

  const rows = await db
    .select()
    .from(tacticalCandidateEvents)
    .where(eq(tacticalCandidateEvents.teamId, teamId))
    .orderBy(desc(tacticalCandidateEvents.createdAt));

  return rows.filter((r) => {
    if (filter?.gameId && r.gameId !== filter.gameId) return false;
    if (filter?.status && r.status !== filter.status) return false;
    if (filter?.minConfidence !== undefined && r.confidenceScore < filter.minConfidence) return false;
    return true;
  });
}

export async function reviewCandidateEvent(db: Db, userId: string, id: string, input: ReviewCandidateInput) {
  const [candidate] = await db.select().from(tacticalCandidateEvents).where(eq(tacticalCandidateEvents.id, id));
  if (!candidate) {
    throw new AuthError(404, "Candidate event not found");
  }

  const hasAccess = await canAccessTeam(db, userId, candidate.teamId);
  if (!hasAccess) {
    throw new AuthError(404, "Candidate event not found");
  }

  const [updated] = await db
    .update(tacticalCandidateEvents)
    .set({
      status: input.status,
      reviewedById: userId,
      reviewedAt: new Date(),
      reviewNotes: input.reviewNotes ?? null,
      ...(input.adjustedEventType ? { eventType: input.adjustedEventType } : {}),
      ...(input.adjustedCoordinates ? { courtCoordinates: input.adjustedCoordinates } : {}),
      updatedAt: new Date(),
    })
    .where(eq(tacticalCandidateEvents.id, id))
    .returning();

  return updated;
}

// ---------------------------------------------------------------------------
// WP-7.2: Play Similarity & Vector Embedding
// ---------------------------------------------------------------------------

function computeSpatialTrajectoryFeatures(keyframes: Array<{
  step: number;
  description: string;
  tokens: Array<{ id: string; type: string; label: string; x: number; y: number }>;
  actions: Array<{ id: string; type: string; from: { x: number; y: number }; to: { x: number; y: number }; label?: string | undefined }>;
}>) {
  let passCount = 0;
  let screenCount = 0;
  let dribbleCount = 0;
  let cutCount = 0;
  let totalDist = 0;

  let firstCoord: { x: number; y: number } | null = null;
  let lastCoord: { x: number; y: number } | null = null;

  for (const kf of keyframes) {
    for (const a of kf.actions) {
      if (!firstCoord) firstCoord = { ...a.from };
      lastCoord = { ...a.to };

      const dx = a.to.x - a.from.x;
      const dy = a.to.y - a.from.y;
      totalDist += Math.sqrt(dx * dx + dy * dy);

      const type = (a.type || "").toLowerCase();
      if (type.includes("pass")) passCount++;
      else if (type.includes("screen")) screenCount++;
      else if (type.includes("dribble")) dribbleCount++;
      else cutCount++;
    }
  }

  let primaryAction = "cut";
  if (passCount >= screenCount && passCount >= dribbleCount && passCount > cutCount) primaryAction = "pass";
  else if (screenCount >= dribbleCount && screenCount > cutCount) primaryAction = "screen";
  else if (dribbleCount > cutCount) primaryAction = "dribble";

  const startX = firstCoord?.x ?? 0;
  const startY = firstCoord?.y ?? 0;
  const endX = lastCoord?.x ?? 0;
  const endY = lastCoord?.y ?? 0;

  const startQuadrant = startY > 7 ? "top_key" : startX > 0 ? "wing_right" : "wing_left";
  const endQuadrant = Math.abs(endX) < 3 && endY < 4 ? "rim" : Math.abs(endX) > 5 ? "corner" : "paint";

  // 8-dimensional normalized spatial feature embedding vector
  const vector = [
    Math.min(1, passCount / 5),
    Math.min(1, screenCount / 4),
    Math.min(1, dribbleCount / 4),
    Math.min(1, cutCount / 6),
    Math.min(1, totalDist / 40),
    (startX + 14) / 28,
    (startY + 7.5) / 15,
    (endY + 7.5) / 15,
  ];

  // L2 normalize vector
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  const embeddingVector = vector.map((v) => Number((v / norm).toFixed(6)));

  return {
    spatialFeatures: {
      primaryAction,
      startQuadrant,
      endQuadrant,
      passCount,
      screenCount,
      trajectoryLengthMeters: Number(totalDist.toFixed(2)),
    },
    embeddingVector,
  };
}

export async function generatePlayEmbedding(db: Db, userId: string, playId: string) {
  const [play] = await db.select().from(tacticalPlays).where(eq(tacticalPlays.id, playId));
  if (!play) {
    throw new AuthError(404, "Play not found");
  }

  if (play.teamId) {
    const hasAccess = await canAccessTeam(db, userId, play.teamId);
    if (!hasAccess) {
      throw new AuthError(404, "Play not found");
    }
  } else if (play.createdBy !== userId) {
    throw new AuthError(404, "Play not found");
  }

  const { spatialFeatures, embeddingVector } = computeSpatialTrajectoryFeatures(play.keyframes ?? []);

  // Upsert into play_similarity_embeddings
  const existing = await db
    .select()
    .from(playSimilarityEmbeddings)
    .where(eq(playSimilarityEmbeddings.playId, playId));

  if (existing.length > 0) {
    const [updated] = await db
      .update(playSimilarityEmbeddings)
      .set({
        embeddingVector,
        spatialFeatures,
        updatedAt: new Date(),
      })
      .where(eq(playSimilarityEmbeddings.playId, playId))
      .returning();
    return updated;
  }

  const [row] = await db
    .insert(playSimilarityEmbeddings)
    .values({
      playId,
      teamId: play.teamId ?? play.createdBy, // default to team or user namespace
      embeddingVector,
      spatialFeatures,
      modelVersion: "v1.2.0",
    })
    .returning();

  return row;
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    const a = vecA[i] ?? 0;
    const b = vecB[i] ?? 0;
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : Math.max(0, Math.min(1, dotProduct / denom));
}

export async function findSimilarPlays(
  db: Db,
  userId: string,
  playId: string,
  options?: { limit?: number | undefined; minSimilarity?: number | undefined },
) {
  const [play] = await db.select().from(tacticalPlays).where(eq(tacticalPlays.id, playId));
  if (!play) {
    throw new AuthError(404, "Play not found");
  }

  if (play.teamId) {
    const hasAccess = await canAccessTeam(db, userId, play.teamId);
    if (!hasAccess) {
      throw new AuthError(404, "Play not found");
    }
  } else if (play.createdBy !== userId) {
    throw new AuthError(404, "Play not found");
  }

  // Get or compute embedding for target play
  const [existingTarget] = await db
    .select()
    .from(playSimilarityEmbeddings)
    .where(eq(playSimilarityEmbeddings.playId, playId));

  const targetEmbedding = existingTarget ?? (await generatePlayEmbedding(db, userId, playId));
  if (!targetEmbedding) {
    throw new AuthError(500, "Failed to compute play embedding");
  }

  // Get all candidate plays for the team/user
  const teamId = play.teamId;
  const otherPlays = teamId
    ? await db.select().from(tacticalPlays).where(eq(tacticalPlays.teamId, teamId))
    : await db.select().from(tacticalPlays).where(eq(tacticalPlays.createdBy, userId));

  const otherPlayIds = otherPlays.filter((p) => p.id !== playId).map((p) => p.id);
  if (otherPlayIds.length === 0) {
    return [];
  }

  const comparisonEmbeddings = await db
    .select()
    .from(playSimilarityEmbeddings)
    .where(inArray(playSimilarityEmbeddings.playId, otherPlayIds));

  // Compute similarities
  const limit = options?.limit ?? 5;
  const minSim = options?.minSimilarity ?? 0.4;

  const results: Array<{
    play: typeof tacticalPlays.$inferSelect;
    similarityScore: number;
    similarityPercent: number;
    spatialFeatures: typeof targetEmbedding.spatialFeatures;
  }> = [];

  for (const comp of comparisonEmbeddings) {
    const matchedPlay = otherPlays.find((p) => p.id === comp.playId);
    if (!matchedPlay) continue;

    const sim = cosineSimilarity(targetEmbedding.embeddingVector, comp.embeddingVector);
    if (sim >= minSim) {
      results.push({
        play: matchedPlay,
        similarityScore: Number(sim.toFixed(4)),
        similarityPercent: Math.round(sim * 100),
        spatialFeatures: comp.spatialFeatures,
      });
    }
  }

  results.sort((a, b) => b.similarityScore - a.similarityScore);
  return results.slice(0, limit);
}

// ---------------------------------------------------------------------------
// WP-7.3: Level 3 Rule-Based Scenario Simulator
// ---------------------------------------------------------------------------

const DEFENSIVE_COVERAGE_RULES: Record<
  DefensiveCoverageType,
  {
    spaceAdvantageScore: number;
    contestedShotRisk: number;
    openLaneCount: number;
    secondaryHelpDelaySec: number;
    tacticalAnalysis: string;
    defensivePositions: Array<{ role: string; x: number; y: number }>;
  }
> = {
  DROP: {
    spaceAdvantageScore: 74,
    contestedShotRisk: 26,
    openLaneCount: 1,
    secondaryHelpDelaySec: 1.2,
    tacticalAnalysis:
      "Drop coverage keeps the rim protector in the paint to prevent layups. The ball-handler has open pull-up or floater space in the mid-range pocket. Screener short roll creates an immediate 4-on-3 advantage.",
    defensivePositions: [
      { role: "ON_BALL", x: 0, y: 7.2 },
      { role: "DROP_BIG", x: 0, y: 3.5 },
      { role: "CORNER_HELP", x: -6.0, y: 1.5 },
      { role: "WING_HELP", x: 5.5, y: 4.5 },
      { role: "WEAK_LOW", x: -2.5, y: 2.0 },
    ],
  },
  SWITCH: {
    spaceAdvantageScore: 46,
    contestedShotRisk: 68,
    openLaneCount: 0,
    secondaryHelpDelaySec: 1.8,
    tacticalAnalysis:
      "Switch coverage immediately neutralizes open perimeter shots by trading assignments on contact. Offensive strategy: exploit the resulting big-on-guard perimeter mismatch or feed the roll-man posting up inside.",
    defensivePositions: [
      { role: "SWITCH_BIG", x: 0.2, y: 6.8 },
      { role: "SWITCH_GUARD", x: 0.5, y: 5.5 },
      { role: "CORNER_LOCK", x: -6.2, y: 1.5 },
      { role: "WING_LOCK", x: 5.8, y: 4.8 },
      { role: "WEAK_LOW", x: -2.0, y: 2.0 },
    ],
  },
  BLITZ_TRAP: {
    spaceAdvantageScore: 86,
    contestedShotRisk: 84,
    openLaneCount: 2,
    secondaryHelpDelaySec: 0.6,
    tacticalAnalysis:
      "Blitz trap aggressively doubles the ball-handler with both defenders. Extreme on-ball pressure forces a quick release. If the ball-handler hits the popping or rolling screener, the offense has an open downhill numbers advantage.",
    defensivePositions: [
      { role: "TRAP_1", x: -0.4, y: 7.2 },
      { role: "TRAP_2", x: 0.6, y: 7.0 },
      { role: "ROTATE_TOP", x: 1.5, y: 4.5 },
      { role: "ROTATE_LOW", x: -1.0, y: 2.0 },
      { role: "CORNER_ZONED", x: 5.0, y: 2.0 },
    ],
  },
  HEDGE_AND_RECOVER: {
    spaceAdvantageScore: 58,
    contestedShotRisk: 52,
    openLaneCount: 1,
    secondaryHelpDelaySec: 1.0,
    tacticalAnalysis:
      "The screener defender hedges hard to redirect the ball-handler's drive, then scrambles to recover. Ball-handler can snake the screen or throw a weak-side skip pass to punish the delayed recovery.",
    defensivePositions: [
      { role: "RECOVERING_GUARD", x: -0.8, y: 6.5 },
      { role: "HEDGE_BIG", x: 1.2, y: 7.2 },
      { role: "TAG_HELPER", x: -1.5, y: 3.5 },
      { role: "WING_HELP", x: 5.5, y: 4.5 },
      { role: "CORNER_LOCK", x: -6.0, y: 1.5 },
    ],
  },
  ICE_WEAK: {
    spaceAdvantageScore: 52,
    contestedShotRisk: 62,
    openLaneCount: 1,
    secondaryHelpDelaySec: 1.1,
    tacticalAnalysis:
      "Ice coverage angles the on-ball defender to deny the middle of the court, forcing the drive toward the baseline. Recommended counter: pick-and-pop to the top of the key for a catch-and-shoot three-pointer.",
    defensivePositions: [
      { role: "DENY_MIDDLE", x: 0.5, y: 7.0 },
      { role: "DROP_BASELINE", x: 2.2, y: 4.0 },
      { role: "LOW_TAG", x: -0.5, y: 2.5 },
      { role: "WEAK_WING", x: -5.0, y: 4.5 },
      { role: "CORNER_LOCK", x: -6.0, y: 1.5 },
    ],
  },
  HELP_AND_RECOVER: {
    spaceAdvantageScore: 65,
    contestedShotRisk: 48,
    openLaneCount: 1,
    secondaryHelpDelaySec: 0.9,
    tacticalAnalysis:
      "Weak-side defender sags to tag the paint roller, then closes out hard on the skip pass. The extra swing pass along the perimeter will find an uncontested catch-and-shoot opportunity before the closeout arrives.",
    defensivePositions: [
      { role: "ON_BALL", x: 0, y: 6.5 },
      { role: "ROLLER_CHASER", x: 0.5, y: 4.0 },
      { role: "TAG_CORNER", x: -2.5, y: 3.0 },
      { role: "TOP_HELP", x: 2.0, y: 5.0 },
      { role: "RIM_PROTECT", x: 0, y: 1.8 },
    ],
  },
};

export async function simulateScenario(db: Db, userId: string, input: SimulateScenarioInput) {
  const hasAccess = await canAccessTeam(db, userId, input.teamId);
  if (!hasAccess) {
    throw new AuthError(404, "Team not found");
  }

  if (input.playId) {
    const [play] = await db.select().from(tacticalPlays).where(eq(tacticalPlays.id, input.playId));
    if (!play) {
      throw new AuthError(404, "Play not found");
    }
  }

  const rule = DEFENSIVE_COVERAGE_RULES[input.coverageType] ?? DEFENSIVE_COVERAGE_RULES.DROP;

  const coverageMetrics = {
    spaceAdvantageScore: rule.spaceAdvantageScore,
    contestedShotRisk: rule.contestedShotRisk,
    openLaneCount: rule.openLaneCount,
    secondaryHelpDelaySec: rule.secondaryHelpDelaySec,
  };

  const defensiveResponse = {
    coverageType: input.coverageType,
    positions: rule.defensivePositions,
    tacticalAdjustments: [
      "Force secondary rotation",
      "Contain penetration beyond restricted arc",
      "Protect rim priority",
    ],
    ...(input.defensiveResponse ?? {}),
  };

  const [row] = await db
    .insert(scenarioSimulations)
    .values({
      teamId: input.teamId,
      ...(input.playId ? { playId: input.playId } : {}),
      title: input.title,
      coverageType: input.coverageType,
      simulationLevel: 3,
      offensiveSetup: input.offensiveSetup ?? { action: "SPREAD_PICK_AND_ROLL", spacing: "FIVE_OUT" },
      defensiveResponse,
      coverageMetrics,
      tacticalAnalysis: rule.tacticalAnalysis,
      disclaimer: "Level 3 Rule-Based Scenario Simulation — tactical schematic illustration, not an empirical outcome prediction.",
      createdById: userId,
    })
    .returning();

  return row;
}

export async function getScenarioSimulation(db: Db, userId: string, id: string) {
  const [row] = await db.select().from(scenarioSimulations).where(eq(scenarioSimulations.id, id));
  if (!row) {
    throw new AuthError(404, "Simulation not found");
  }

  const hasAccess = await canAccessTeam(db, userId, row.teamId);
  if (!hasAccess) {
    throw new AuthError(404, "Simulation not found");
  }

  return row;
}

export async function listTeamSimulations(db: Db, userId: string, teamId: string) {
  const hasAccess = await canAccessTeam(db, userId, teamId);
  if (!hasAccess) {
    throw new AuthError(404, "Team not found");
  }

  return db
    .select()
    .from(scenarioSimulations)
    .where(eq(scenarioSimulations.teamId, teamId))
    .orderBy(desc(scenarioSimulations.createdAt));
}

// ---------------------------------------------------------------------------
// WP-7.4: Model Registry & Evaluation Dashboard
// ---------------------------------------------------------------------------

export async function registerModel(db: Db, userId: string, input: RegisterModelInput) {
  const existing = await db
    .select()
    .from(tacticalModelRegistry)
    .where(eq(tacticalModelRegistry.modelVersion, input.modelVersion));

  if (existing.length > 0) {
    const [updated] = await db
      .update(tacticalModelRegistry)
      .set({
        modelType: input.modelType,
        benchmarkDataset: input.benchmarkDataset,
        metrics: input.metrics,
        status: input.status ?? "CANDIDATE",
        updatedAt: new Date(),
      })
      .where(eq(tacticalModelRegistry.modelVersion, input.modelVersion))
      .returning();
    return updated;
  }

  const [row] = await db
    .insert(tacticalModelRegistry)
    .values({
      modelVersion: input.modelVersion,
      modelType: input.modelType,
      benchmarkDataset: input.benchmarkDataset,
      metrics: input.metrics,
      status: input.status ?? "CANDIDATE",
    })
    .returning();

  return row;
}

export async function listModels(db: Db, filter?: { modelType?: string | undefined; status?: string | undefined }) {
  const rows = await db
    .select()
    .from(tacticalModelRegistry)
    .orderBy(desc(tacticalModelRegistry.createdAt));

  return rows.filter((r) => {
    if (filter?.modelType && r.modelType !== filter.modelType) return false;
    if (filter?.status && r.status !== filter.status) return false;
    return true;
  });
}

export async function promoteModel(db: Db, userId: string, modelVersion: string) {
  const [model] = await db
    .select()
    .from(tacticalModelRegistry)
    .where(eq(tacticalModelRegistry.modelVersion, modelVersion));

  if (!model) {
    throw new AuthError(404, "Model not found");
  }

  // Demote any current active model of the same type
  await db
    .update(tacticalModelRegistry)
    .set({ status: "DEPRECATED", updatedAt: new Date() })
    .where(
      and(
        eq(tacticalModelRegistry.modelType, model.modelType),
        eq(tacticalModelRegistry.status, "ACTIVE"),
      ),
    );

  const [promoted] = await db
    .update(tacticalModelRegistry)
    .set({
      status: "ACTIVE",
      activeSince: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tacticalModelRegistry.modelVersion, modelVersion))
    .returning();

  return promoted;
}

export async function rollbackModel(db: Db, userId: string, modelVersion: string, reason: string) {
  const [model] = await db
    .select()
    .from(tacticalModelRegistry)
    .where(eq(tacticalModelRegistry.modelVersion, modelVersion));

  if (!model) {
    throw new AuthError(404, "Model not found");
  }

  // Roll back the target model
  const [rolledBack] = await db
    .update(tacticalModelRegistry)
    .set({
      status: "ROLLED_BACK",
      rolledBackAt: new Date(),
      rollbackReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(tacticalModelRegistry.modelVersion, modelVersion))
    .returning();

  // Find previous candidate or deprecated model to restore
  const previousModels = await db
    .select()
    .from(tacticalModelRegistry)
    .where(
      and(
        eq(tacticalModelRegistry.modelType, model.modelType),
        sql`${tacticalModelRegistry.modelVersion} != ${modelVersion}`,
      ),
    )
    .orderBy(desc(tacticalModelRegistry.createdAt));

  if (previousModels.length > 0 && previousModels[0]) {
    await db
      .update(tacticalModelRegistry)
      .set({
        status: "ACTIVE",
        activeSince: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tacticalModelRegistry.id, previousModels[0].id));
  }

  return rolledBack;
}
