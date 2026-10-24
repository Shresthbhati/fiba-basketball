import { and, desc, eq, inArray } from "drizzle-orm";
import { can } from "../authz/service.js";
import type { Db } from "../db/index.js";
import {
  competitions,
  matchIncidentReports,
  matchOfficialSignoffs,
  matchPregameChecklists,
  matches,
  roleAssignments,
  teams,
  users,
} from "../db/schema.js";
import { AuthError } from "../identity/service.js";
import { lockMatch } from "./service.js";

export interface PregameChecklistInput {
  courtSurfaceSafe: boolean;
  perimeterRunoffClear: boolean;
  gameBallPressureChecked: boolean;
  gameClockTested: boolean;
  shotClockTested: boolean;
  jerseyContrastVerified: boolean;
  tableCrewConfirmed: boolean;
  notes?: string | undefined;
}

export interface IncidentReportInput {
  incidentType:
    | "TECHNICAL_FOUL"
    | "UNSPORTSMANLIKE_FOUL"
    | "DISQUALIFYING_FOUL"
    | "EJECTION"
    | "PROTEST"
    | "DELAY_INCIDENT";
  teamId?: string | undefined;
  playerId?: string | undefined;
  period?: number | undefined;
  gameClockTime?: string | undefined;
  description: string;
  ruleReference?: string | undefined;
}

export interface OfficialSignoffInput {
  isCrewChief?: boolean | undefined;
  finalScoreVerified?: boolean | undefined;
  scorebookAudited?: boolean | undefined;
  refereeNotes?: string | undefined;
}

/** Verifies that the user is an assigned referee or organizer for this competition. */
async function assertRefereeAccess(db: Db, matchId: string, userId: string) {
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!match) throw new AuthError(404, "Match not found");

  const [assignment] = await db
    .select()
    .from(roleAssignments)
    .where(
      and(
        eq(roleAssignments.userId, userId),
        eq(roleAssignments.resourceType, "competition"),
        eq(roleAssignments.resourceId, match.competitionId),
        inArray(roleAssignments.role, ["REFEREE", "ORGANIZER"]),
      ),
    );

  const isOrganizer = await can(db, userId, "competition:manage", {
    type: "competition",
    id: match.competitionId,
  });

  if (!assignment && !isOrganizer) {
    throw new AuthError(404, "Match not found or access denied");
  }

  return match;
}

export async function listAssignedMatches(db: Db, refereeId: string) {
  // 1. Find all competitions where user is assigned as referee or organizer
  const assignments = await db
    .select({ compId: roleAssignments.resourceId })
    .from(roleAssignments)
    .where(
      and(
        eq(roleAssignments.userId, refereeId),
        eq(roleAssignments.resourceType, "competition"),
        inArray(roleAssignments.role, ["REFEREE", "ORGANIZER"]),
      ),
    );

  const compIds = Array.from(
    new Set(
      assignments
        .map((a) => a.compId)
        .filter((id): id is string => id !== null),
    ),
  );
  if (compIds.length === 0) return [];

  // 2. Fetch matches
  const matchRows = await db
    .select({
      id: matches.id,
      competitionId: matches.competitionId,
      round: matches.round,
      slot: matches.slot,
      homeTeamId: matches.homeTeamId,
      awayTeamId: matches.awayTeamId,
      homeScore: matches.homeScore,
      awayScore: matches.awayScore,
      state: matches.state,
      scheduledAt: matches.scheduledAt,
      isBye: matches.isBye,
      forfeit: matches.forfeit,
      compName: competitions.name,
    })
    .from(matches)
    .innerJoin(competitions, eq(competitions.id, matches.competitionId))
    .where(and(inArray(matches.competitionId, compIds), eq(matches.isBye, false)))
    .orderBy(desc(matches.scheduledAt));

  // 3. Teams map
  const teamIds = Array.from(
    new Set(
      matchRows
        .flatMap((m) => [m.homeTeamId, m.awayTeamId])
        .filter((id): id is string => id !== null),
    ),
  );

  const teamMap = new Map<string, string>();
  if (teamIds.length > 0) {
    const teamRows = await db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(inArray(teams.id, teamIds));
    teamRows.forEach((t) => teamMap.set(t.id, t.name));
  }

  // 4. Checklists & sign-offs for this referee
  const [checklists, signoffs] = await Promise.all([
    db
      .select({ matchId: matchPregameChecklists.matchId })
      .from(matchPregameChecklists)
      .where(eq(matchPregameChecklists.refereeId, refereeId)),
    db
      .select({ matchId: matchOfficialSignoffs.matchId })
      .from(matchOfficialSignoffs)
      .where(eq(matchOfficialSignoffs.refereeId, refereeId)),
  ]);

  const checkedSet = new Set(checklists.map((c) => c.matchId));
  const signedSet = new Set(signoffs.map((s) => s.matchId));

  return matchRows.map((m) => ({
    id: m.id,
    competitionId: m.competitionId,
    competitionName: m.compName,
    round: m.round,
    slot: m.slot,
    homeTeam: m.homeTeamId ? teamMap.get(m.homeTeamId) ?? "Home Team" : "TBD",
    awayTeam: m.awayTeamId ? teamMap.get(m.awayTeamId) ?? "Away Team" : "TBD",
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    state: m.state,
    scheduledAt: m.scheduledAt,
    pregameCompleted: checkedSet.has(m.id),
    signedOff: signedSet.has(m.id),
  }));
}

export async function savePregameChecklist(
  db: Db,
  matchId: string,
  refereeId: string,
  input: PregameChecklistInput,
) {
  await assertRefereeAccess(db, matchId, refereeId);

  const [existing] = await db
    .select()
    .from(matchPregameChecklists)
    .where(
      and(
        eq(matchPregameChecklists.matchId, matchId),
        eq(matchPregameChecklists.refereeId, refereeId),
      ),
    );

  if (existing) {
    const [updated] = await db
      .update(matchPregameChecklists)
      .set({
        courtSurfaceSafe: input.courtSurfaceSafe,
        perimeterRunoffClear: input.perimeterRunoffClear,
        gameBallPressureChecked: input.gameBallPressureChecked,
        gameClockTested: input.gameClockTested,
        shotClockTested: input.shotClockTested,
        jerseyContrastVerified: input.jerseyContrastVerified,
        tableCrewConfirmed: input.tableCrewConfirmed,
        notes: input.notes !== undefined ? input.notes : existing.notes,
        completedAt: new Date(),
      })
      .where(eq(matchPregameChecklists.id, existing.id))
      .returning();
    return updated!;
  }

  const [created] = await db
    .insert(matchPregameChecklists)
    .values({
      matchId,
      refereeId,
      courtSurfaceSafe: input.courtSurfaceSafe,
      perimeterRunoffClear: input.perimeterRunoffClear,
      gameBallPressureChecked: input.gameBallPressureChecked,
      gameClockTested: input.gameClockTested,
      shotClockTested: input.shotClockTested,
      jerseyContrastVerified: input.jerseyContrastVerified,
      tableCrewConfirmed: input.tableCrewConfirmed,
      notes: input.notes ?? null,
    })
    .returning();

  return created!;
}

export async function getPregameChecklist(db: Db, matchId: string, viewerId: string) {
  await assertRefereeAccess(db, matchId, viewerId);

  const [checklist] = await db
    .select()
    .from(matchPregameChecklists)
    .where(eq(matchPregameChecklists.matchId, matchId));

  return checklist ?? null;
}

export async function submitIncidentReport(
  db: Db,
  matchId: string,
  reporterId: string,
  input: IncidentReportInput,
) {
  await assertRefereeAccess(db, matchId, reporterId);

  const [report] = await db
    .insert(matchIncidentReports)
    .values({
      matchId,
      reporterId,
      incidentType: input.incidentType,
      teamId: input.teamId ?? null,
      playerId: input.playerId ?? null,
      period: input.period ?? null,
      gameClockTime: input.gameClockTime ?? null,
      description: input.description.trim(),
      ruleReference: input.ruleReference ?? null,
    })
    .returning();

  return report!;
}

export async function listIncidentReports(db: Db, matchId: string, viewerId: string) {
  await assertRefereeAccess(db, matchId, viewerId);

  return db
    .select({
      id: matchIncidentReports.id,
      matchId: matchIncidentReports.matchId,
      reporterId: matchIncidentReports.reporterId,
      reporterName: users.displayName,
      incidentType: matchIncidentReports.incidentType,
      teamId: matchIncidentReports.teamId,
      playerId: matchIncidentReports.playerId,
      period: matchIncidentReports.period,
      gameClockTime: matchIncidentReports.gameClockTime,
      description: matchIncidentReports.description,
      ruleReference: matchIncidentReports.ruleReference,
      createdAt: matchIncidentReports.createdAt,
    })
    .from(matchIncidentReports)
    .innerJoin(users, eq(users.id, matchIncidentReports.reporterId))
    .where(eq(matchIncidentReports.matchId, matchId))
    .orderBy(desc(matchIncidentReports.createdAt));
}

export async function signOffMatch(
  db: Db,
  matchId: string,
  refereeId: string,
  input: OfficialSignoffInput = {},
) {
  const match = await assertRefereeAccess(db, matchId, refereeId);

  if (match.state !== "FINISHED") {
    throw new AuthError(400, "Only finished matches can be officially signed off");
  }

  const [signoff] = await db
    .insert(matchOfficialSignoffs)
    .values({
      matchId,
      refereeId,
      isCrewChief: input.isCrewChief ?? false,
      finalScoreVerified: input.finalScoreVerified ?? true,
      scorebookAudited: input.scorebookAudited ?? true,
      refereeNotes: input.refereeNotes ?? null,
    })
    .returning();

  // Atomically lock match
  const lockedMatch = await lockMatch(db, matchId);

  return {
    signoff: signoff!,
    match: lockedMatch,
  };
}
