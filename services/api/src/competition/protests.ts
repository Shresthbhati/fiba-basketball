import { and, desc, eq, or } from "drizzle-orm";
import { can } from "../authz/service.js";
import { writeAudit } from "../audit/service.js";
import type { Db } from "../db/index.js";
import {
  matchProtests,
  matches,
  protestTribunalRulings,
  roleAssignments,
  teams,
  users,
} from "../db/schema.js";
import { AuthError } from "../identity/service.js";
import { recordForfeit, recordResult } from "./service.js";

export interface ProtestInput {
  filingTeamId: string;
  protestType:
    | "SCORE_DISCREPANCY"
    | "INELIGIBLE_PLAYER"
    | "REFEREE_RULE_MISAPPLICATION"
    | "CLOCK_OPERATOR_ERROR"
    | "OTHER";
  period?: number | undefined;
  gameClock?: string | undefined;
  ruleCited?: string | undefined;
  description: string;
}

export interface RulingInput {
  ruling: "UPHELD" | "DISMISSED";
  remedyAction?: "NONE" | "SCORE_ADJUSTED" | "MATCH_FORFEITED" | "PERIOD_REPLAY_ORDERED" | undefined;
  refereeTestimony?: string | undefined;
  adjustedHomeScore?: number | undefined;
  adjustedAwayScore?: number | undefined;
  forfeitWinnerTeamId?: string | undefined;
  rulingSummary: string;
}

/** Asserts that the actor is an authorized organizer for the match competition. */
export async function assertOrganizerAccess(db: Db, competitionId: string, userId: string) {
  const isOrganizer = await can(db, userId, "competition:manage", {
    type: "competition",
    id: competitionId,
  });

  if (!isOrganizer) {
    throw new AuthError(404, "Competition not found or access denied");
  }
}

/** Asserts that the user is affiliated with the filing team or is an organizer. */
export async function assertTeamAffiliation(
  db: Db,
  teamId: string,
  competitionId: string,
  userId: string,
) {
  const isOrganizer = await can(db, userId, "competition:manage", {
    type: "competition",
    id: competitionId,
  });
  if (isOrganizer) return;

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

  if (!assignment) {
    throw new AuthError(404, "Team affiliation not found or unauthorized");
  }
}

/** File a formal match protest. */
export async function fileMatchProtest(
  db: Db,
  matchId: string,
  filedById: string,
  input: ProtestInput,
) {
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!match) {
    throw new AuthError(404, "Match not found");
  }

  // Must be one of the participating teams
  if (match.homeTeamId !== input.filingTeamId && match.awayTeamId !== input.filingTeamId) {
    throw new AuthError(400, "Filing team is not a participant in this match");
  }

  await assertTeamAffiliation(db, input.filingTeamId, match.competitionId, filedById);

  // Check if active protest already filed for this team on this match
  const [existing] = await db
    .select()
    .from(matchProtests)
    .where(
      and(
        eq(matchProtests.matchId, matchId),
        eq(matchProtests.filingTeamId, input.filingTeamId),
        or(eq(matchProtests.status, "FILED"), eq(matchProtests.status, "UNDER_REVIEW")),
      ),
    );

  if (existing) {
    throw new AuthError(400, "A protest is already pending for this team on this match");
  }

  const [protest] = await db
    .insert(matchProtests)
    .values({
      matchId,
      filingTeamId: input.filingTeamId,
      filedById,
      protestType: input.protestType,
      period: input.period ?? null,
      gameClock: input.gameClock ?? null,
      ruleCited: input.ruleCited ?? null,
      description: input.description,
      status: "FILED",
      depositVerified: true,
    })
    .returning();

  await writeAudit(db, {
    actorId: filedById,
    action: "match.protest_filed",
    resourceType: "match",
    resourceId: matchId,
    metadata: { protestId: protest!.id, protestType: input.protestType },
  });

  return protest!;
}

/** List protests for a match. */
export async function listMatchProtests(db: Db, matchId: string) {
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!match) {
    throw new AuthError(404, "Match not found");
  }

  const rows = await db
    .select({
      id: matchProtests.id,
      matchId: matchProtests.matchId,
      filingTeamId: matchProtests.filingTeamId,
      filingTeamName: teams.name,
      protestType: matchProtests.protestType,
      period: matchProtests.period,
      gameClock: matchProtests.gameClock,
      ruleCited: matchProtests.ruleCited,
      description: matchProtests.description,
      status: matchProtests.status,
      depositVerified: matchProtests.depositVerified,
      filedAt: matchProtests.filedAt,
      filerName: users.displayName,
    })
    .from(matchProtests)
    .innerJoin(teams, eq(teams.id, matchProtests.filingTeamId))
    .innerJoin(users, eq(users.id, matchProtests.filedById))
    .where(eq(matchProtests.matchId, matchId))
    .orderBy(desc(matchProtests.filedAt));

  return rows;
}

/** List all protests across a competition (organizers only). */
export async function listCompetitionProtests(
  db: Db,
  competitionId: string,
  requestingUserId: string,
) {
  await assertOrganizerAccess(db, competitionId, requestingUserId);

  const competitionMatches = await db
    .select({ id: matches.id })
    .from(matches)
    .where(eq(matches.competitionId, competitionId));

  const matchIds = competitionMatches.map((m) => m.id);
  if (matchIds.length === 0) return [];

  const rows = await db
    .select({
      id: matchProtests.id,
      matchId: matchProtests.matchId,
      filingTeamId: matchProtests.filingTeamId,
      filingTeamName: teams.name,
      protestType: matchProtests.protestType,
      period: matchProtests.period,
      gameClock: matchProtests.gameClock,
      ruleCited: matchProtests.ruleCited,
      description: matchProtests.description,
      status: matchProtests.status,
      depositVerified: matchProtests.depositVerified,
      filedAt: matchProtests.filedAt,
      filerName: users.displayName,
    })
    .from(matchProtests)
    .innerJoin(teams, eq(teams.id, matchProtests.filingTeamId))
    .innerJoin(users, eq(users.id, matchProtests.filedById))
    .where(or(...matchIds.map((mId) => eq(matchProtests.matchId, mId))))
    .orderBy(desc(matchProtests.filedAt));

  return rows;
}

/** Adjudicate a protest with official tribunal ruling. */
export async function adjudicateProtest(
  db: Db,
  protestId: string,
  reviewerId: string,
  input: RulingInput,
) {
  const [protest] = await db
    .select()
    .from(matchProtests)
    .where(eq(matchProtests.id, protestId));

  if (!protest) {
    throw new AuthError(404, "Protest not found");
  }

  const [match] = await db.select().from(matches).where(eq(matches.id, protest.matchId));
  if (!match) {
    throw new AuthError(404, "Match not found");
  }

  await assertOrganizerAccess(db, match.competitionId, reviewerId);

  // Insert or update tribunal ruling
  const [existingRuling] = await db
    .select()
    .from(protestTribunalRulings)
    .where(eq(protestTribunalRulings.protestId, protestId));

  let rulingRecord;
  if (existingRuling) {
    const [updated] = await db
      .update(protestTribunalRulings)
      .set({
        reviewerId,
        ruling: input.ruling,
        remedyAction: input.remedyAction ?? "NONE",
        refereeTestimony: input.refereeTestimony ?? null,
        adjustedHomeScore: input.adjustedHomeScore ?? null,
        adjustedAwayScore: input.adjustedAwayScore ?? null,
        forfeitWinnerTeamId: input.forfeitWinnerTeamId ?? null,
        rulingSummary: input.rulingSummary,
        decidedAt: new Date(),
      })
      .where(eq(protestTribunalRulings.id, existingRuling.id))
      .returning();
    rulingRecord = updated;
  } else {
    const [inserted] = await db
      .insert(protestTribunalRulings)
      .values({
        protestId,
        reviewerId,
        ruling: input.ruling,
        remedyAction: input.remedyAction ?? "NONE",
        refereeTestimony: input.refereeTestimony ?? null,
        adjustedHomeScore: input.adjustedHomeScore ?? null,
        adjustedAwayScore: input.adjustedAwayScore ?? null,
        forfeitWinnerTeamId: input.forfeitWinnerTeamId ?? null,
        rulingSummary: input.rulingSummary,
      })
      .returning();
    rulingRecord = inserted;
  }

  // Update protest status
  await db
    .update(matchProtests)
    .set({ status: input.ruling })
    .where(eq(matchProtests.id, protestId));

  // If UPHELD, execute remedy action atomically
  if (input.ruling === "UPHELD") {
    if (
      input.remedyAction === "SCORE_ADJUSTED" &&
      input.adjustedHomeScore !== undefined &&
      input.adjustedAwayScore !== undefined
    ) {
      await recordResult(db, match.id, reviewerId, {
        homeScore: input.adjustedHomeScore,
        awayScore: input.adjustedAwayScore,
      });
    } else if (input.remedyAction === "MATCH_FORFEITED" && input.forfeitWinnerTeamId) {
      const winner = input.forfeitWinnerTeamId === match.homeTeamId ? "home" : "away";
      await recordForfeit(db, match.id, reviewerId, winner);
    }
  }

  await writeAudit(db, {
    actorId: reviewerId,
    action: "match.protest_adjudicated",
    resourceType: "protest",
    resourceId: protestId,
    metadata: { ruling: input.ruling, remedy: input.remedyAction },
  });

  return {
    protestId,
    status: input.ruling,
    ruling: rulingRecord!,
  };
}
