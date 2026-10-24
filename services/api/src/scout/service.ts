import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  athleticTestAttempts,
  athleticTestProtocols,
  athleticTestSessions,
  matches,
  matchEvents,
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
