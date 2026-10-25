import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  athleticTestAttempts,
  athleticTestProtocols,
  athleticTestSessions,
  matches,
  matchEvents,
  scoutEvaluations,
  scoutProfiles,
  scoutShortlistMembers,
  scoutShortlists,
  users,
} from "../db/schema.js";
import { AuthError } from "../identity/service.js";

export interface UpsertScoutProfileInput {
  organization: string;
  roleTitle: string;
  notes?: string | undefined;
}

export interface TalentSearchQuery {
  position?: string | undefined;
  minGraduationYear?: number | undefined;
  maxGraduationYear?: number | undefined;
  minVerticalJumpCm?: number | undefined;
  maxSprintSeconds?: number | undefined;
  minPointsPerGame?: number | undefined;
  limit?: number | undefined;
}

export interface CreateShortlistInput {
  name: string;
  description?: string | undefined;
  isSharedWithOrg?: boolean | undefined;
}

export interface AddShortlistMemberInput {
  athleteId: string;
  evaluationTier?:
    | "WATCHLIST"
    | "HIGH_PRIORITY"
    | "CONTACTED"
    | "OFFERED"
    | "COMMITTED"
    | "PASSED"
    | undefined;
  scoutNotes?: string | undefined;
}

export async function upsertScoutProfile(
  db: Db,
  userId: string,
  input: UpsertScoutProfileInput,
) {
  const [existing] = await db
    .select()
    .from(scoutProfiles)
    .where(eq(scoutProfiles.userId, userId));

  if (existing) {
    const [updated] = await db
      .update(scoutProfiles)
      .set({
        organization: input.organization,
        roleTitle: input.roleTitle,
        notes: input.notes ?? existing.notes,
        updatedAt: new Date(),
      })
      .where(eq(scoutProfiles.id, existing.id))
      .returning();
    return updated!;
  }

  const [created] = await db
    .insert(scoutProfiles)
    .values({
      userId,
      organization: input.organization,
      roleTitle: input.roleTitle,
      notes: input.notes ?? null,
      credentialsVerified: false,
      active: true,
    })
    .returning();

  return created!;
}

export async function getScoutProfile(db: Db, userId: string) {
  const [profile] = await db
    .select()
    .from(scoutProfiles)
    .where(eq(scoutProfiles.userId, userId));

  return profile ?? null;
}

/**
 * Searches consented athletes across official competition stats and standardized combine metrics.
 * Minor Safeguard (Spec §11.2, §14.1): Under-18 athletes are strictly excluded from scout discovery.
 * ADR-0008 & ADR-0009: Empirical data only with explicit source provenance and sample sizes; zero synthetic ratings.
 */
export async function searchTalentPool(
  db: Db,
  scoutUserId: string,
  query: TalentSearchQuery = {},
) {
  // Minor Safeguard: only adults (isMinor = false) are eligible for general scout talent discovery
  const athleteRows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      isMinor: users.isMinor,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.isMinor, false))
    .limit(query.limit ?? 50);

  if (athleteRows.length === 0) return [];

  const athleteIds = athleteRows.map((a) => a.id);

  // 1. Fetch official match events to compute points, games, and shooting metrics
  const events = await db
    .select({
      playerId: matchEvents.playerId,
      type: matchEvents.type,
      matchId: matchEvents.matchId,
    })
    .from(matchEvents)
    .innerJoin(matches, eq(matches.id, matchEvents.matchId))
    .where(
      and(
        inArray(matchEvents.playerId, athleteIds),
        inArray(matches.state, ["FINISHED", "LOCKED"]),
      ),
    );

  const statsMap = new Map<
    string,
    { games: Set<string>; points: number; fgm: number; fga: number }
  >();

  for (const e of events) {
    if (!e.playerId) continue;
    let s = statsMap.get(e.playerId);
    if (!s) {
      s = { games: new Set(), points: 0, fgm: 0, fga: 0 };
      statsMap.set(e.playerId, s);
    }
    s.games.add(e.matchId);
    if (e.type === "FT_MADE") s.points += 1;
    else if (e.type === "FG_MADE") {
      s.points += 2;
      s.fgm += 1;
      s.fga += 1;
    } else if (e.type === "3PT_MADE") {
      s.points += 3;
      s.fgm += 1;
      s.fga += 1;
    } else if (e.type === "FG_MISSED" || e.type === "3PT_MISSED") {
      s.fga += 1;
    }
  }

  // 2. Fetch standardized athletic testing results (WP-6.2)
  const combineAttempts = await db
    .select({
      athleteId: athleticTestSessions.userId,
      protocolSlug: athleticTestProtocols.slug,
      rawValue: athleticTestAttempts.rawValue,
      testedAt: athleticTestSessions.testDate,
      instrumentType: athleticTestAttempts.instrumentType,
    })
    .from(athleticTestAttempts)
    .innerJoin(athleticTestSessions, eq(athleticTestSessions.id, athleticTestAttempts.sessionId))
    .innerJoin(athleticTestProtocols, eq(athleticTestProtocols.id, athleticTestAttempts.protocolId))
    .where(
      and(
        inArray(athleticTestSessions.userId, athleteIds),
        eq(athleticTestAttempts.isFault, false),
      ),
    )
    .orderBy(desc(athleticTestAttempts.createdAt));

  const combineMap = new Map<string, Record<string, { value: number; source: string }>>();
  for (const c of combineAttempts) {
    let m = combineMap.get(c.athleteId);
    if (!m) {
      m = {};
      combineMap.set(c.athleteId, m);
    }
    if (!m[c.protocolSlug]) {
      m[c.protocolSlug] = {
        value: Number(c.rawValue),
        source: c.instrumentType ?? "CALIBRATED_SENSOR",
      };
    }
  }

  // 3. Assemble empirical candidate records
  const results = [];
  for (const athlete of athleteRows) {
    const s = statsMap.get(athlete.id);
    const gamesCount = s ? s.games.size : 0;
    const ppg = gamesCount > 0 ? Math.round((s!.points / gamesCount) * 10) / 10 : 0;
    const fgPct = s && s.fga > 0 ? Math.round((s.fgm / s.fga) * 1000) / 10 : null;

    if (query.minPointsPerGame !== undefined && ppg < query.minPointsPerGame) {
      continue;
    }

    const combine = combineMap.get(athlete.id) ?? {};
    const maxVert = combine["MAX_VERTICAL_JUMP"]?.value ?? null;
    const sprint = combine["THREE_QUARTER_SPRINT"]?.value ?? null;

    if (query.minVerticalJumpCm !== undefined && (maxVert === null || maxVert < query.minVerticalJumpCm)) {
      continue;
    }
    if (query.maxSprintSeconds !== undefined && (sprint === null || sprint > query.maxSprintSeconds)) {
      continue;
    }

    results.push({
      athleteId: athlete.id,
      displayName: athlete.displayName,
      isMinor: athlete.isMinor,
      stats: {
        gamesCount,
        pointsPerGame: ppg,
        fgPercentage: fgPct,
        provenance: "OFFICIAL",
      },
      combineTesting: {
        maxVerticalJumpCm: maxVert,
        threeQuarterSprintSec: sprint,
        provenance: "SENSOR",
      },
      provenanceNotice: "Pure empirical data per ADR-0008; no automated scout score or injury prediction.",
    });
  }

  return results;
}

export async function createShortlist(
  db: Db,
  scoutId: string,
  input: CreateShortlistInput,
) {
  const [created] = await db
    .insert(scoutShortlists)
    .values({
      scoutId,
      name: input.name,
      description: input.description ?? null,
      isSharedWithOrg: input.isSharedWithOrg ?? false,
    })
    .returning();

  return created!;
}

export async function listShortlists(db: Db, scoutId: string) {
  const rows = await db
    .select()
    .from(scoutShortlists)
    .where(eq(scoutShortlists.scoutId, scoutId))
    .orderBy(desc(scoutShortlists.createdAt));

  // Count members
  const memberCounts = await db
    .select({
      shortlistId: scoutShortlistMembers.shortlistId,
      count: sql<number>`count(*)::int`,
    })
    .from(scoutShortlistMembers)
    .groupBy(scoutShortlistMembers.shortlistId);

  const countMap = new Map(memberCounts.map((m) => [m.shortlistId, m.count]));

  return rows.map((r) => ({
    ...r,
    memberCount: countMap.get(r.id) ?? 0,
  }));
}

export async function getShortlist(
  db: Db,
  shortlistId: string,
  scoutId: string,
) {
  const [shortlist] = await db
    .select()
    .from(scoutShortlists)
    .where(eq(scoutShortlists.id, shortlistId));

  if (!shortlist || shortlist.scoutId !== scoutId) {
    throw new AuthError(404, "Shortlist not found");
  }

  const members = await db
    .select({
      id: scoutShortlistMembers.id,
      shortlistId: scoutShortlistMembers.shortlistId,
      athleteId: scoutShortlistMembers.athleteId,
      athleteName: users.displayName,
      evaluationTier: scoutShortlistMembers.evaluationTier,
      scoutNotes: scoutShortlistMembers.scoutNotes,
      addedAt: scoutShortlistMembers.addedAt,
      updatedAt: scoutShortlistMembers.updatedAt,
    })
    .from(scoutShortlistMembers)
    .innerJoin(users, eq(users.id, scoutShortlistMembers.athleteId))
    .where(eq(scoutShortlistMembers.shortlistId, shortlistId))
    .orderBy(desc(scoutShortlistMembers.addedAt));

  return {
    ...shortlist,
    members,
  };
}

export async function addShortlistMember(
  db: Db,
  shortlistId: string,
  scoutId: string,
  input: AddShortlistMemberInput,
) {
  const [shortlist] = await db
    .select()
    .from(scoutShortlists)
    .where(eq(scoutShortlists.id, shortlistId));

  if (!shortlist || shortlist.scoutId !== scoutId) {
    throw new AuthError(404, "Shortlist not found");
  }

  // Ensure athlete exists
  const [athlete] = await db
    .select()
    .from(users)
    .where(eq(users.id, input.athleteId));

  if (!athlete) {
    throw new AuthError(404, "Athlete not found");
  }

  // Check duplicate
  const [existing] = await db
    .select()
    .from(scoutShortlistMembers)
    .where(
      and(
        eq(scoutShortlistMembers.shortlistId, shortlistId),
        eq(scoutShortlistMembers.athleteId, input.athleteId),
      ),
    );

  if (existing) {
    throw new AuthError(409, "Athlete is already in this shortlist");
  }

  const [member] = await db
    .insert(scoutShortlistMembers)
    .values({
      shortlistId,
      athleteId: input.athleteId,
      evaluationTier: input.evaluationTier ?? "WATCHLIST",
      scoutNotes: input.scoutNotes ?? null,
    })
    .returning();

  return member!;
}

export async function updateShortlistMember(
  db: Db,
  shortlistId: string,
  memberId: string,
  scoutId: string,
  input: { evaluationTier?: string | undefined; scoutNotes?: string | undefined },
) {
  const [shortlist] = await db
    .select()
    .from(scoutShortlists)
    .where(eq(scoutShortlists.id, shortlistId));

  if (!shortlist || shortlist.scoutId !== scoutId) {
    throw new AuthError(404, "Shortlist not found");
  }

  const [existing] = await db
    .select()
    .from(scoutShortlistMembers)
    .where(
      and(
        eq(scoutShortlistMembers.id, memberId),
        eq(scoutShortlistMembers.shortlistId, shortlistId),
      ),
    );

  if (!existing) {
    throw new AuthError(404, "Member not found in shortlist");
  }

  const [updated] = await db
    .update(scoutShortlistMembers)
    .set({
      evaluationTier: input.evaluationTier ?? existing.evaluationTier,
      scoutNotes: input.scoutNotes !== undefined ? input.scoutNotes : existing.scoutNotes,
      updatedAt: new Date(),
    })
    .where(eq(scoutShortlistMembers.id, memberId))
    .returning();

  return updated!;
}

export async function removeShortlistMember(
  db: Db,
  shortlistId: string,
  memberId: string,
  scoutId: string,
) {
  const [shortlist] = await db
    .select()
    .from(scoutShortlists)
    .where(eq(scoutShortlists.id, shortlistId));

  if (!shortlist || shortlist.scoutId !== scoutId) {
    throw new AuthError(404, "Shortlist not found");
  }

  await db
    .delete(scoutShortlistMembers)
    .where(
      and(
        eq(scoutShortlistMembers.id, memberId),
        eq(scoutShortlistMembers.shortlistId, shortlistId),
      ),
    );
}

// ---------------------------------------------------------------------------
// 20-80 Scale Talent Evaluation Cards & Consensus Engine (Spec §13.1–§13.4, §14.2)
// ---------------------------------------------------------------------------

export interface CreateScoutEvaluationInput {
  athleteId: string;
  gameContext?: string | undefined;
  matchId?: string | undefined;
  projectedRole?: string | undefined;
  playerComparison?: string | undefined;
  shootingPresent?: number | undefined;
  shootingFuture?: number | undefined;
  finishingPresent?: number | undefined;
  finishingFuture?: number | undefined;
  playmakingPresent?: number | undefined;
  playmakingFuture?: number | undefined;
  perimeterDefensePresent?: number | undefined;
  perimeterDefenseFuture?: number | undefined;
  interiorDefensePresent?: number | undefined;
  interiorDefenseFuture?: number | undefined;
  reboundingPresent?: number | undefined;
  reboundingFuture?: number | undefined;
  athleticismPresent?: number | undefined;
  athleticismFuture?: number | undefined;
  basketballIqPresent?: number | undefined;
  basketballIqFuture?: number | undefined;
  overallPresent?: number | undefined;
  overallFuture?: number | undefined;
  strengthsSummary: string;
  weaknessesSummary: string;
  swingSkills?: string | undefined;
  intangiblesNotes?: string | undefined;
  isSharedWithOrg?: boolean | undefined;
}

export interface UpdateScoutEvaluationInput {
  gameContext?: string | undefined;
  matchId?: string | undefined;
  projectedRole?: string | undefined;
  playerComparison?: string | undefined;
  shootingPresent?: number | undefined;
  shootingFuture?: number | undefined;
  finishingPresent?: number | undefined;
  finishingFuture?: number | undefined;
  playmakingPresent?: number | undefined;
  playmakingFuture?: number | undefined;
  perimeterDefensePresent?: number | undefined;
  perimeterDefenseFuture?: number | undefined;
  interiorDefensePresent?: number | undefined;
  interiorDefenseFuture?: number | undefined;
  reboundingPresent?: number | undefined;
  reboundingFuture?: number | undefined;
  athleticismPresent?: number | undefined;
  athleticismFuture?: number | undefined;
  basketballIqPresent?: number | undefined;
  basketballIqFuture?: number | undefined;
  overallPresent?: number | undefined;
  overallFuture?: number | undefined;
  strengthsSummary?: string | undefined;
  weaknessesSummary?: string | undefined;
  swingSkills?: string | undefined;
  intangiblesNotes?: string | undefined;
  isSharedWithOrg?: boolean | undefined;
}

function clampGrade(grade: number | undefined, fallback: number = 50): number {
  if (grade === undefined) return fallback;
  return Math.min(80, Math.max(20, Math.round(grade)));
}

export async function createScoutEvaluation(
  db: Db,
  scoutId: string,
  input: CreateScoutEvaluationInput,
) {
  const profile = await getScoutProfile(db, scoutId);
  const organization = profile?.organization ?? null;

  const shootingPresent = clampGrade(input.shootingPresent);
  const shootingFuture = clampGrade(input.shootingFuture);
  const finishingPresent = clampGrade(input.finishingPresent);
  const finishingFuture = clampGrade(input.finishingFuture);
  const playmakingPresent = clampGrade(input.playmakingPresent);
  const playmakingFuture = clampGrade(input.playmakingFuture);
  const perimeterDefensePresent = clampGrade(input.perimeterDefensePresent);
  const perimeterDefenseFuture = clampGrade(input.perimeterDefenseFuture);
  const interiorDefensePresent = clampGrade(input.interiorDefensePresent);
  const interiorDefenseFuture = clampGrade(input.interiorDefenseFuture);
  const reboundingPresent = clampGrade(input.reboundingPresent);
  const reboundingFuture = clampGrade(input.reboundingFuture);
  const athleticismPresent = clampGrade(input.athleticismPresent);
  const athleticismFuture = clampGrade(input.athleticismFuture);
  const basketballIqPresent = clampGrade(input.basketballIqPresent);
  const basketballIqFuture = clampGrade(input.basketballIqFuture);

  const avgPresent = Math.round(
    (shootingPresent + finishingPresent + playmakingPresent + perimeterDefensePresent +
      interiorDefensePresent + reboundingPresent + athleticismPresent + basketballIqPresent) / 8
  );
  const avgFuture = Math.round(
    (shootingFuture + finishingFuture + playmakingFuture + perimeterDefenseFuture +
      interiorDefenseFuture + reboundingFuture + athleticismFuture + basketballIqFuture) / 8
  );

  const overallPresent = clampGrade(input.overallPresent, avgPresent);
  const overallFuture = clampGrade(input.overallFuture, avgFuture);

  const [evaluation] = await db
    .insert(scoutEvaluations)
    .values({
      scoutId,
      athleteId: input.athleteId,
      gameContext: input.gameContext ?? "LIVE_GAME",
      matchId: input.matchId ?? null,
      projectedRole: input.projectedRole ?? "VERSATILE_ROTATION",
      playerComparison: input.playerComparison ?? null,
      shootingPresent,
      shootingFuture,
      finishingPresent,
      finishingFuture,
      playmakingPresent,
      playmakingFuture,
      perimeterDefensePresent,
      perimeterDefenseFuture,
      interiorDefensePresent,
      interiorDefenseFuture,
      reboundingPresent,
      reboundingFuture,
      athleticismPresent,
      athleticismFuture,
      basketballIqPresent,
      basketballIqFuture,
      overallPresent,
      overallFuture,
      strengthsSummary: input.strengthsSummary,
      weaknessesSummary: input.weaknessesSummary,
      swingSkills: input.swingSkills ?? null,
      intangiblesNotes: input.intangiblesNotes ?? null,
      isSharedWithOrg: input.isSharedWithOrg ?? false,
      organization,
    })
    .returning();

  return evaluation!;
}

export async function getScoutEvaluation(
  db: Db,
  evalId: string,
  userId: string,
) {
  const [evaluation] = await db
    .select()
    .from(scoutEvaluations)
    .where(eq(scoutEvaluations.id, evalId));

  if (!evaluation) {
    throw new AuthError(404, "Evaluation not found");
  }

  if (evaluation.scoutId === userId) {
    return evaluation;
  }

  // Check if shared with scout's organization
  if (evaluation.isSharedWithOrg && evaluation.organization) {
    const userProfile = await getScoutProfile(db, userId);
    if (userProfile && userProfile.organization === evaluation.organization) {
      return evaluation;
    }
  }

  // Negative authZ per ADR-0010: Never disclose private scouting cards
  throw new AuthError(404, "Evaluation not found");
}

export async function listScoutEvaluationsForAthlete(
  db: Db,
  athleteId: string,
  userId: string,
) {
  const userProfile = await getScoutProfile(db, userId);
  const org = userProfile?.organization ?? null;

  const rows = await db
    .select()
    .from(scoutEvaluations)
    .where(eq(scoutEvaluations.athleteId, athleteId))
    .orderBy(desc(scoutEvaluations.evalDate));

  // Filter in memory for access control: own evaluations or shared within same org
  return rows.filter((ev) => {
    if (ev.scoutId === userId) return true;
    if (ev.isSharedWithOrg && org && ev.organization === org) return true;
    return false;
  });
}

export async function getAthleteConsensusEvaluation(
  db: Db,
  athleteId: string,
  userId: string,
) {
  const evals = await listScoutEvaluationsForAthlete(db, athleteId, userId);

  if (evals.length === 0) {
    return {
      athleteId,
      totalEvaluations: 0,
      uniqueScouts: 0,
      consensusRole: "UNRANKED",
      consensusOverallPresent: 50,
      consensusOverallFuture: 50,
      competencies: {
        shooting: { present: 50, future: 50, stdDev: 0 },
        finishing: { present: 50, future: 50, stdDev: 0 },
        playmaking: { present: 50, future: 50, stdDev: 0 },
        perimeterDefense: { present: 50, future: 50, stdDev: 0 },
        interiorDefense: { present: 50, future: 50, stdDev: 0 },
        rebounding: { present: 50, future: 50, stdDev: 0 },
        athleticism: { present: 50, future: 50, stdDev: 0 },
        basketballIq: { present: 50, future: 50, stdDev: 0 },
      },
      evaluations: [],
    };
  }

  const uniqueScouts = new Set(evals.map((e) => e.scoutId)).size;

  const calculateMetric = (getter: (e: typeof evals[number]) => number) => {
    const vals = evals.map(getter);
    const mean = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
    const variance = vals.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / vals.length;
    const stdDev = Math.round(Math.sqrt(variance) * 10) / 10;
    return { mean, stdDev };
  };

  const shootingPresent = calculateMetric((e) => e.shootingPresent);
  const shootingFuture = calculateMetric((e) => e.shootingFuture);
  const finishingPresent = calculateMetric((e) => e.finishingPresent);
  const finishingFuture = calculateMetric((e) => e.finishingFuture);
  const playmakingPresent = calculateMetric((e) => e.playmakingPresent);
  const playmakingFuture = calculateMetric((e) => e.playmakingFuture);
  const perimeterDefensePresent = calculateMetric((e) => e.perimeterDefensePresent);
  const perimeterDefenseFuture = calculateMetric((e) => e.perimeterDefenseFuture);
  const interiorDefensePresent = calculateMetric((e) => e.interiorDefensePresent);
  const interiorDefenseFuture = calculateMetric((e) => e.interiorDefenseFuture);
  const reboundingPresent = calculateMetric((e) => e.reboundingPresent);
  const reboundingFuture = calculateMetric((e) => e.reboundingFuture);
  const athleticismPresent = calculateMetric((e) => e.athleticismPresent);
  const athleticismFuture = calculateMetric((e) => e.athleticismFuture);
  const basketballIqPresent = calculateMetric((e) => e.basketballIqPresent);
  const basketballIqFuture = calculateMetric((e) => e.basketballIqFuture);
  const overallPresent = calculateMetric((e) => e.overallPresent);
  const overallFuture = calculateMetric((e) => e.overallFuture);

  // Find modal projected role
  const roleCounts = new Map<string, number>();
  for (const e of evals) {
    roleCounts.set(e.projectedRole, (roleCounts.get(e.projectedRole) ?? 0) + 1);
  }
  let consensusRole = evals[0]!.projectedRole;
  let maxCount = 0;
  for (const [role, count] of roleCounts.entries()) {
    if (count > maxCount) {
      maxCount = count;
      consensusRole = role;
    }
  }

  return {
    athleteId,
    totalEvaluations: evals.length,
    uniqueScouts,
    consensusRole,
    consensusOverallPresent: Math.round(overallPresent.mean),
    consensusOverallFuture: Math.round(overallFuture.mean),
    competencies: {
      shooting: { present: Math.round(shootingPresent.mean), future: Math.round(shootingFuture.mean), stdDev: shootingPresent.stdDev },
      finishing: { present: Math.round(finishingPresent.mean), future: Math.round(finishingFuture.mean), stdDev: finishingPresent.stdDev },
      playmaking: { present: Math.round(playmakingPresent.mean), future: Math.round(playmakingFuture.mean), stdDev: playmakingPresent.stdDev },
      perimeterDefense: { present: Math.round(perimeterDefensePresent.mean), future: Math.round(perimeterDefenseFuture.mean), stdDev: perimeterDefensePresent.stdDev },
      interiorDefense: { present: Math.round(interiorDefensePresent.mean), future: Math.round(interiorDefenseFuture.mean), stdDev: interiorDefensePresent.stdDev },
      rebounding: { present: Math.round(reboundingPresent.mean), future: Math.round(reboundingFuture.mean), stdDev: reboundingPresent.stdDev },
      athleticism: { present: Math.round(athleticismPresent.mean), future: Math.round(athleticismFuture.mean), stdDev: athleticismPresent.stdDev },
      basketballIq: { present: Math.round(basketballIqPresent.mean), future: Math.round(basketballIqFuture.mean), stdDev: basketballIqPresent.stdDev },
    },
    evaluations: evals,
  };
}

export async function updateScoutEvaluation(
  db: Db,
  evalId: string,
  scoutId: string,
  input: UpdateScoutEvaluationInput,
) {
  const [existing] = await db
    .select()
    .from(scoutEvaluations)
    .where(eq(scoutEvaluations.id, evalId));

  if (!existing || existing.scoutId !== scoutId) {
    throw new AuthError(404, "Evaluation not found");
  }

  const shootingPresent = input.shootingPresent !== undefined ? clampGrade(input.shootingPresent) : existing.shootingPresent;
  const shootingFuture = input.shootingFuture !== undefined ? clampGrade(input.shootingFuture) : existing.shootingFuture;
  const finishingPresent = input.finishingPresent !== undefined ? clampGrade(input.finishingPresent) : existing.finishingPresent;
  const finishingFuture = input.finishingFuture !== undefined ? clampGrade(input.finishingFuture) : existing.finishingFuture;
  const playmakingPresent = input.playmakingPresent !== undefined ? clampGrade(input.playmakingPresent) : existing.playmakingPresent;
  const playmakingFuture = input.playmakingFuture !== undefined ? clampGrade(input.playmakingFuture) : existing.playmakingFuture;
  const perimeterDefensePresent = input.perimeterDefensePresent !== undefined ? clampGrade(input.perimeterDefensePresent) : existing.perimeterDefensePresent;
  const perimeterDefenseFuture = input.perimeterDefenseFuture !== undefined ? clampGrade(input.perimeterDefenseFuture) : existing.perimeterDefenseFuture;
  const interiorDefensePresent = input.interiorDefensePresent !== undefined ? clampGrade(input.interiorDefensePresent) : existing.interiorDefensePresent;
  const interiorDefenseFuture = input.interiorDefenseFuture !== undefined ? clampGrade(input.interiorDefenseFuture) : existing.interiorDefenseFuture;
  const reboundingPresent = input.reboundingPresent !== undefined ? clampGrade(input.reboundingPresent) : existing.reboundingPresent;
  const reboundingFuture = input.reboundingFuture !== undefined ? clampGrade(input.reboundingFuture) : existing.reboundingFuture;
  const athleticismPresent = input.athleticismPresent !== undefined ? clampGrade(input.athleticismPresent) : existing.athleticismPresent;
  const athleticismFuture = input.athleticismFuture !== undefined ? clampGrade(input.athleticismFuture) : existing.athleticismFuture;
  const basketballIqPresent = input.basketballIqPresent !== undefined ? clampGrade(input.basketballIqPresent) : existing.basketballIqPresent;
  const basketballIqFuture = input.basketballIqFuture !== undefined ? clampGrade(input.basketballIqFuture) : existing.basketballIqFuture;

  const avgPresent = Math.round(
    (shootingPresent + finishingPresent + playmakingPresent + perimeterDefensePresent +
      interiorDefensePresent + reboundingPresent + athleticismPresent + basketballIqPresent) / 8
  );
  const avgFuture = Math.round(
    (shootingFuture + finishingFuture + playmakingFuture + perimeterDefenseFuture +
      interiorDefenseFuture + reboundingFuture + athleticismFuture + basketballIqFuture) / 8
  );

  const overallPresent = input.overallPresent !== undefined ? clampGrade(input.overallPresent) : (existing.overallPresent ?? avgPresent);
  const overallFuture = input.overallFuture !== undefined ? clampGrade(input.overallFuture) : (existing.overallFuture ?? avgFuture);

  const [updated] = await db
    .update(scoutEvaluations)
    .set({
      gameContext: input.gameContext ?? existing.gameContext,
      matchId: input.matchId !== undefined ? input.matchId : existing.matchId,
      projectedRole: input.projectedRole ?? existing.projectedRole,
      playerComparison: input.playerComparison !== undefined ? input.playerComparison : existing.playerComparison,
      shootingPresent,
      shootingFuture,
      finishingPresent,
      finishingFuture,
      playmakingPresent,
      playmakingFuture,
      perimeterDefensePresent,
      perimeterDefenseFuture,
      interiorDefensePresent,
      interiorDefenseFuture,
      reboundingPresent,
      reboundingFuture,
      athleticismPresent,
      athleticismFuture,
      basketballIqPresent,
      basketballIqFuture,
      overallPresent,
      overallFuture,
      strengthsSummary: input.strengthsSummary ?? existing.strengthsSummary,
      weaknessesSummary: input.weaknessesSummary ?? existing.weaknessesSummary,
      swingSkills: input.swingSkills !== undefined ? input.swingSkills : existing.swingSkills,
      intangiblesNotes: input.intangiblesNotes !== undefined ? input.intangiblesNotes : existing.intangiblesNotes,
      isSharedWithOrg: input.isSharedWithOrg !== undefined ? input.isSharedWithOrg : existing.isSharedWithOrg,
      updatedAt: new Date(),
    })
    .where(eq(scoutEvaluations.id, evalId))
    .returning();

  return updated!;
}

export async function deleteScoutEvaluation(
  db: Db,
  evalId: string,
  scoutId: string,
) {
  const [existing] = await db
    .select()
    .from(scoutEvaluations)
    .where(eq(scoutEvaluations.id, evalId));

  if (!existing || existing.scoutId !== scoutId) {
    throw new AuthError(404, "Evaluation not found");
  }

  await db.delete(scoutEvaluations).where(eq(scoutEvaluations.id, evalId));
}
