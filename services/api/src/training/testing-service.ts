import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  athleticTestAttempts,
  athleticTestProtocols,
  athleticTestSessions,
  roleAssignments,
  teams,
  users,
} from "../db/schema.js";
import { AuthError } from "../identity/service.js";
import {
  calculateAthleticSignature,
  calculatePercentile,
  NORMATIVE_BENCHMARKS,
  type Cohort,
} from "./normative-benchmarks.js";

export interface CreateSessionInput {
  targetUserId?: string | undefined;
  teamId?: string | undefined;
  testDate: string;
  location?: string | undefined;
  surface?: "HARDWOOD" | "SYNTHETIC" | "ASPHALT" | "OTHER" | undefined;
  environmentalNotes?: string | undefined;
  notes?: string | undefined;
}

export interface AddAttemptInput {
  protocolId: string;
  attemptNumber?: number | undefined;
  rawValue: number;
  isFault?: boolean | undefined;
  faultReason?: string | undefined;
  instrumentType?:
    | "VERTEC_VANES"
    | "CONTACT_MAT"
    | "OPTICAL_SYSTEM"
    | "TIMING_GATES_DUAL_BEAM"
    | "TIMING_GATES_SINGLE_BEAM"
    | "STOPWATCH_MANUAL"
    | "CV_ESTIMATE"
    | undefined;
  instrumentDetails?: {
    model?: string | undefined;
    serialNumber?: string | undefined;
    beamHeightCm?: number | undefined;
    calibrationDate?: string | undefined;
  } | undefined;
  sourceType?: "OFFICIAL" | "COACH" | "SELF_REPORTED" | "CV_ESTIMATE" | undefined;
  confidence?: number | undefined;
  notes?: string | undefined;
}

/**
 * Checks if viewer has permission to access target athlete's athletic test data.
 * Returns true if viewer is the athlete or a coach/owner of a team the athlete belongs to.
 */
export async function canAccessAthlete(db: Db, viewerId: string, athleteId: string): Promise<boolean> {
  if (viewerId === athleteId) return true;

  // Check if viewer is a coach or owner of any team where athlete is a member
  const athleteTeams = await db
    .select({ teamId: roleAssignments.resourceId })
    .from(roleAssignments)
    .where(
      and(
        eq(roleAssignments.userId, athleteId),
        eq(roleAssignments.resourceType, "team"),
      ),
    );

  if (athleteTeams.length === 0) return false;
  const teamIds = athleteTeams
    .map((t) => t.teamId)
    .filter((id): id is string => typeof id === "string");

  if (teamIds.length === 0) return false;

  // Check if viewer owns any of these teams
  const owned = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.createdBy, viewerId), inArray(teams.id, teamIds)));

  if (owned.length > 0) return true;

  // Or has COACH role in any of these teams
  const coachRoles = await db
    .select()
    .from(roleAssignments)
    .where(
      and(
        eq(roleAssignments.userId, viewerId),
        eq(roleAssignments.resourceType, "team"),
        inArray(roleAssignments.resourceId, teamIds),
        eq(roleAssignments.role, "COACH"),
      ),
    );

  return coachRoles.length > 0;
}

/**
 * Lists all standardized test protocols.
 */
export async function listProtocols(db: Db) {
  const protocols = await db
    .select()
    .from(athleticTestProtocols)
    .orderBy(asc(athleticTestProtocols.category), asc(athleticTestProtocols.name));

  return protocols;
}

/**
 * Gets normative benchmarks for all protocols or a specific cohort.
 */
export function getBenchmarks(cohort: Cohort = "COLLEGIATE_MALE") {
  return Object.values(NORMATIVE_BENCHMARKS).map((b) => ({
    slug: b.slug,
    name: b.name,
    category: b.category,
    unit: b.unit,
    higherIsBetter: b.higherIsBetter,
    anchors: b.cohorts[cohort] ?? b.cohorts.COLLEGIATE_MALE,
  }));
}

/**
 * Creates a new athletic testing session.
 */
export async function createSession(
  db: Db,
  viewerId: string,
  input: CreateSessionInput,
) {
  const athleteId = input.targetUserId ?? viewerId;

  const allowed = await canAccessAthlete(db, viewerId, athleteId);
  if (!allowed) {
    throw new AuthError(404, "Not Found");
  }

  const conductedByUserId = viewerId !== athleteId ? viewerId : null;

  const [session] = await db
    .insert(athleticTestSessions)
    .values({
      userId: athleteId,
      conductedByUserId,
      teamId: input.teamId ?? null,
      testDate: input.testDate,
      location: input.location ?? null,
      surface: input.surface ?? "HARDWOOD",
      environmentalNotes: input.environmentalNotes ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  return {
    ...session!,
    attempts: [],
    bestScores: {},
  };
}

/**
 * Lists test sessions for an athlete. Negative authZ (404) if unauthorized.
 */
export async function listSessions(
  db: Db,
  viewerId: string,
  targetUserId?: string,
) {
  const athleteId = targetUserId ?? viewerId;

  const allowed = await canAccessAthlete(db, viewerId, athleteId);
  if (!allowed) {
    throw new AuthError(404, "Not Found");
  }

  const sessions = await db
    .select({
      id: athleticTestSessions.id,
      userId: athleticTestSessions.userId,
      conductedByUserId: athleticTestSessions.conductedByUserId,
      teamId: athleticTestSessions.teamId,
      testDate: athleticTestSessions.testDate,
      location: athleticTestSessions.location,
      surface: athleticTestSessions.surface,
      notes: athleticTestSessions.notes,
      createdAt: athleticTestSessions.createdAt,
    })
    .from(athleticTestSessions)
    .where(eq(athleticTestSessions.userId, athleteId))
    .orderBy(desc(athleticTestSessions.testDate), desc(athleticTestSessions.createdAt));

  // Count attempts per session
  const counts = await db
    .select({
      sessionId: athleticTestAttempts.sessionId,
      count: sql<number>`count(*)::int`,
    })
    .from(athleticTestAttempts)
    .innerJoin(athleticTestSessions, eq(athleticTestSessions.id, athleticTestAttempts.sessionId))
    .where(eq(athleticTestSessions.userId, athleteId))
    .groupBy(athleticTestAttempts.sessionId);

  const countMap = new Map(counts.map((c) => [c.sessionId, c.count]));

  return sessions.map((s) => ({
    ...s,
    attemptCount: countMap.get(s.id) ?? 0,
  }));
}

/**
 * Gets a single session with attempts and best scores calculated.
 */
export async function getSession(
  db: Db,
  viewerId: string,
  sessionId: string,
  cohort: Cohort = "COLLEGIATE_MALE",
) {
  const [session] = await db
    .select()
    .from(athleticTestSessions)
    .where(eq(athleticTestSessions.id, sessionId));

  if (!session) {
    throw new AuthError(404, "Not Found");
  }

  const allowed = await canAccessAthlete(db, viewerId, session.userId);
  if (!allowed) {
    throw new AuthError(404, "Not Found");
  }

  // Load attempts with protocol info
  const attempts = await db
    .select({
      id: athleticTestAttempts.id,
      sessionId: athleticTestAttempts.sessionId,
      protocolId: athleticTestAttempts.protocolId,
      protocolSlug: athleticTestProtocols.slug,
      protocolName: athleticTestProtocols.name,
      protocolCategory: athleticTestProtocols.category,
      primaryMetricUnit: athleticTestProtocols.primaryMetricUnit,
      sortDirection: athleticTestProtocols.sortDirection,
      attemptNumber: athleticTestAttempts.attemptNumber,
      rawValue: athleticTestAttempts.rawValue,
      isFault: athleticTestAttempts.isFault,
      faultReason: athleticTestAttempts.faultReason,
      instrumentType: athleticTestAttempts.instrumentType,
      instrumentDetails: athleticTestAttempts.instrumentDetails,
      sourceType: athleticTestAttempts.sourceType,
      confidence: athleticTestAttempts.confidence,
      notes: athleticTestAttempts.notes,
      createdAt: athleticTestAttempts.createdAt,
    })
    .from(athleticTestAttempts)
    .innerJoin(athleticTestProtocols, eq(athleticTestProtocols.id, athleticTestAttempts.protocolId))
    .where(eq(athleticTestAttempts.sessionId, sessionId))
    .orderBy(asc(athleticTestAttempts.protocolId), asc(athleticTestAttempts.attemptNumber));

  // Compute best score per protocol for non-fault attempts
  const bestScores: Record<
    string,
    {
      rawValue: number;
      unit: string;
      percentile: number;
      attemptId: string;
      instrumentType: string;
      sourceType: string;
    }
  > = {};

  for (const att of attempts) {
    if (att.isFault) continue;
    const current = bestScores[att.protocolSlug];
    const isHigherBetter = att.sortDirection === "DESC";

    const isNewBest =
      !current ||
      (isHigherBetter ? att.rawValue > current.rawValue : att.rawValue < current.rawValue);

    if (isNewBest) {
      bestScores[att.protocolSlug] = {
        rawValue: att.rawValue,
        unit: att.primaryMetricUnit,
        percentile: calculatePercentile(att.rawValue, att.protocolSlug, cohort),
        attemptId: att.id,
        instrumentType: att.instrumentType,
        sourceType: att.sourceType,
      };
    }
  }

  return {
    ...session,
    attempts,
    bestScores,
  };
}

/**
 * Adds an attempt to an athletic test session.
 */
export async function addAttempt(
  db: Db,
  viewerId: string,
  sessionId: string,
  input: AddAttemptInput,
) {
  const [session] = await db
    .select()
    .from(athleticTestSessions)
    .where(eq(athleticTestSessions.id, sessionId));

  if (!session) {
    throw new AuthError(404, "Not Found");
  }

  const allowed = await canAccessAthlete(db, viewerId, session.userId);
  if (!allowed) {
    throw new AuthError(404, "Not Found");
  }

  const [protocol] = await db
    .select()
    .from(athleticTestProtocols)
    .where(eq(athleticTestProtocols.id, input.protocolId));

  if (!protocol) {
    throw new AuthError(404, "Protocol not found");
  }

  // Calculate attempt number if not supplied
  let attemptNumber = input.attemptNumber;
  if (!attemptNumber) {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(athleticTestAttempts)
      .where(
        and(
          eq(athleticTestAttempts.sessionId, sessionId),
          eq(athleticTestAttempts.protocolId, input.protocolId),
        ),
      );
    attemptNumber = (row?.count ?? 0) + 1;
  }

  // Determine provenance sourceType if not supplied
  let sourceType = input.sourceType;
  if (!sourceType) {
    if (input.instrumentType === "CV_ESTIMATE") {
      sourceType = "CV_ESTIMATE";
    } else if (viewerId !== session.userId) {
      sourceType = "COACH";
    } else {
      sourceType = "SELF_REPORTED";
    }
  }

  const [attempt] = await db
    .insert(athleticTestAttempts)
    .values({
      sessionId,
      protocolId: input.protocolId,
      attemptNumber: attemptNumber ?? 1,
      rawValue: input.rawValue,
      isFault: input.isFault ?? false,
      faultReason: input.faultReason ?? null,
      instrumentType: input.instrumentType ?? "VERTEC_VANES",
      instrumentDetails: input.instrumentDetails ?? {},
      sourceType,
      confidence: input.confidence ?? 1.0,
      notes: input.notes ?? null,
    })
    .returning();

  return {
    ...attempt!,
    protocolSlug: protocol.slug,
    protocolName: protocol.name,
    primaryMetricUnit: protocol.primaryMetricUnit,
  };
}

/**
 * Deletes an attempt from a session.
 */
export async function deleteAttempt(db: Db, viewerId: string, attemptId: string) {
  const [attempt] = await db
    .select({
      id: athleticTestAttempts.id,
      sessionId: athleticTestAttempts.sessionId,
      userId: athleticTestSessions.userId,
    })
    .from(athleticTestAttempts)
    .innerJoin(athleticTestSessions, eq(athleticTestSessions.id, athleticTestAttempts.sessionId))
    .where(eq(athleticTestAttempts.id, attemptId));

  if (!attempt) {
    throw new AuthError(404, "Not Found");
  }

  const allowed = await canAccessAthlete(db, viewerId, attempt.userId);
  if (!allowed) {
    throw new AuthError(404, "Not Found");
  }

  await db.delete(athleticTestAttempts).where(eq(athleticTestAttempts.id, attemptId));
  return { deleted: true };
}

/**
 * Aggregates all-time personal bests and athletic signature for an athlete profile.
 */
export async function getAthleteCombineProfile(
  db: Db,
  viewerId: string,
  targetUserId: string,
  cohort: Cohort = "COLLEGIATE_MALE",
) {
  const allowed = await canAccessAthlete(db, viewerId, targetUserId);
  if (!allowed) {
    throw new AuthError(404, "Not Found");
  }

  const [user] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      dateOfBirth: users.dateOfBirth,
    })
    .from(users)
    .where(eq(users.id, targetUserId));

  if (!user) {
    throw new AuthError(404, "Not Found");
  }

  // Fetch all non-fault attempts for this athlete
  const attempts = await db
    .select({
      protocolSlug: athleticTestProtocols.slug,
      protocolName: athleticTestProtocols.name,
      protocolCategory: athleticTestProtocols.category,
      primaryMetricUnit: athleticTestProtocols.primaryMetricUnit,
      sortDirection: athleticTestProtocols.sortDirection,
      rawValue: athleticTestAttempts.rawValue,
      instrumentType: athleticTestAttempts.instrumentType,
      sourceType: athleticTestAttempts.sourceType,
      testDate: athleticTestSessions.testDate,
      sessionId: athleticTestSessions.id,
    })
    .from(athleticTestAttempts)
    .innerJoin(athleticTestSessions, eq(athleticTestSessions.id, athleticTestAttempts.sessionId))
    .innerJoin(athleticTestProtocols, eq(athleticTestProtocols.id, athleticTestAttempts.protocolId))
    .where(
      and(
        eq(athleticTestSessions.userId, targetUserId),
        eq(athleticTestAttempts.isFault, false),
      ),
    )
    .orderBy(desc(athleticTestSessions.testDate));

  // Determine personal bests per protocol
  const personalBests: Record<
    string,
    {
      slug: string;
      name: string;
      category: string;
      unit: string;
      bestValue: number;
      percentile: number;
      instrumentType: string;
      sourceType: string;
      achievedDate: string;
      sessionId: string;
    }
  > = {};

  const bestValuesForSignature: Record<string, number> = {};

  for (const att of attempts) {
    const isHigherBetter = att.sortDirection === "DESC";
    const current = personalBests[att.protocolSlug];

    const isBetter =
      !current ||
      (isHigherBetter ? att.rawValue > current.bestValue : att.rawValue < current.bestValue);

    if (isBetter) {
      personalBests[att.protocolSlug] = {
        slug: att.protocolSlug,
        name: att.protocolName,
        category: att.protocolCategory,
        unit: att.primaryMetricUnit,
        bestValue: att.rawValue,
        percentile: calculatePercentile(att.rawValue, att.protocolSlug, cohort),
        instrumentType: att.instrumentType,
        sourceType: att.sourceType,
        achievedDate: att.testDate,
        sessionId: att.sessionId,
      };
      bestValuesForSignature[att.protocolSlug] = att.rawValue;
    }
  }

  const athleticSignature = calculateAthleticSignature(bestValuesForSignature, cohort);

  return {
    athlete: {
      id: user.id,
      displayName: user.displayName,
      dateOfBirth: user.dateOfBirth,
    },
    cohort,
    signature: athleticSignature,
    personalBests: Object.values(personalBests),
  };
}
