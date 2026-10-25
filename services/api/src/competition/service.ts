import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import { grantRole } from "../authz/service.js";
import type { Db } from "../db/index.js";
import { competitionTeams, competitions, matchResultLog, matches, roleAssignments, teams, users } from "../db/schema.js";
import { AuthError } from "../identity/service.js";
import { canTransition, type MatchState } from "../match/match-state.js";
import {
  autoScheduleTournament,
  roundRobin,
  singleElimination,
  validateScheduleConflicts,
  type AutoScheduleOptions,
  type ScheduleValidationOptions,
} from "./schedule.js";
import { standings, type Result } from "./standings.js";

type Match = typeof matches.$inferSelect;
export type Format = "ROUND_ROBIN" | "SINGLE_ELIMINATION";

const tx = <T>(db: Db, fn: (t: Db) => Promise<T>) =>
  (db as unknown as { transaction: (f: (t: unknown) => Promise<T>) => Promise<T> }).transaction((t) => fn(t as Db));

export async function createTeam(db: Db, userId: string, name: string) {
  const [t] = await db.insert(teams).values({ name, createdBy: userId }).returning();
  await grantRole(db, userId, "COACH", { type: "team", id: t!.id });
  return t!;
}

export async function getTeam(db: Db, id: string) {
  const [t] = await db.select().from(teams).where(eq(teams.id, id));
  if (!t) throw new AuthError(404, "Not Found");
  return t;
}

export async function createCompetition(db: Db, userId: string, input: { name: string; format: Format }) {
  const [c] = await db.insert(competitions).values({ name: input.name, format: input.format, organizerId: userId }).returning();
  await grantRole(db, userId, "ORGANIZER", { type: "competition", id: c!.id });
  return c!;
}

/** Published competitions are public; drafts appear only to the person who created them. */
export async function listCompetitions(db: Db, userId: string | null) {
  const visible = userId
    ? or(sql`${competitions.status} <> 'DRAFT'`, eq(competitions.organizerId, userId))
    : sql`${competitions.status} <> 'DRAFT'`;
  const rows = await db.select().from(competitions).where(visible).orderBy(desc(competitions.createdAt)).limit(100);
  return rows.map((c) => ({ id: c.id, name: c.name, format: c.format, status: c.status, mine: c.organizerId === userId }));
}

export async function getCompetition(db: Db, id: string) {
  const [c] = await db.select().from(competitions).where(eq(competitions.id, id));
  if (!c) throw new AuthError(404, "Not Found");
  return c;
}

/** Drafts are visible only to people who manage the competition; everyone else gets 404. */
export async function visibleCompetition(db: Db, id: string, canManage: boolean) {
  const c = await getCompetition(db, id);
  if (c.status === "DRAFT" && !canManage) throw new AuthError(404, "Not Found");
  return c;
}

export async function registerTeam(db: Db, competitionId: string, teamId: string, seed?: number) {
  const c = await getCompetition(db, competitionId);
  if (c.status !== "DRAFT") throw new AuthError(409, "Registration is closed");
  await getTeam(db, teamId);
  const [exists] = await db.select().from(competitionTeams)
    .where(and(eq(competitionTeams.competitionId, competitionId), eq(competitionTeams.teamId, teamId)));
  if (exists) throw new AuthError(409, "Team already registered");
  await db.insert(competitionTeams).values({ competitionId, teamId, seed: seed ?? null });
}

export async function listTeams(db: Db, competitionId: string) {
  return db
    .select({ id: teams.id, name: teams.name, seed: competitionTeams.seed })
    .from(competitionTeams)
    .innerJoin(teams, eq(teams.id, competitionTeams.teamId))
    .where(eq(competitionTeams.competitionId, competitionId))
    .orderBy(asc(competitionTeams.registeredAt));
}

export async function generateSchedule(db: Db, competitionId: string) {
  return tx(db, async (t) => {
    const [c] = await t.select().from(competitions).where(eq(competitions.id, competitionId)).for("update");
    if (!c) throw new AuthError(404, "Not Found");
    if (c.status !== "DRAFT") throw new AuthError(409, "Schedule already generated");
    const [{ n }] = (await t.select({ n: sql<number>`count(*)::int` }).from(matches).where(eq(matches.competitionId, competitionId))) as [{ n: number }];
    if (n > 0) throw new AuthError(409, "Schedule already generated");
    const reg = await t.select().from(competitionTeams).where(eq(competitionTeams.competitionId, competitionId)).orderBy(asc(competitionTeams.registeredAt));
    if (reg.length < 2) throw new AuthError(409, "Need at least 2 teams");

    if (c.format === "ROUND_ROBIN") {
      await t.insert(matches).values(
        roundRobin(reg.map((r) => r.teamId)).map((p, i) => ({ competitionId, round: p.round, slot: i + 1, homeTeamId: p.home, awayTeamId: p.away })),
      );
    } else {
      // Seeded teams first (best seed first), then unseeded in registration order.
      const ordered = [...reg].sort((a, b) => (a.seed ?? 1e9) - (b.seed ?? 1e9)).map((r) => r.teamId);
      const bracket = singleElimination(ordered);
      const rows = await t.insert(matches).values(bracket.map((m) => ({
        competitionId, round: m.round, slot: m.slot,
        homeTeamId: m.a !== null && m.a !== "BYE" ? m.a : null,
        awayTeamId: m.b !== null && m.b !== "BYE" ? m.b : null,
        isBye: m.a === "BYE" || m.b === "BYE",
      }))).returning();
      const at = (round: number, slot: number) => rows.find((r) => r.round === round && r.slot === slot);
      for (const m of rows) {
        const next = at(m.round + 1, Math.ceil(m.slot / 2));
        if (!next) continue;
        await t.update(matches).set({ nextMatchId: next.id, nextSide: m.slot % 2 === 1 ? "home" : "away" }).where(eq(matches.id, m.id));
      }
      // Byes finish immediately and push their team forward.
      for (const m of rows.filter((r) => r.isBye)) {
        const next = at(m.round + 1, Math.ceil(m.slot / 2));
        const team = m.homeTeamId ?? m.awayTeamId;
        await t.update(matches).set({ state: "FINISHED" }).where(eq(matches.id, m.id));
        if (next) {
          await t.update(matches).set(m.slot % 2 === 1 ? { homeTeamId: team } : { awayTeamId: team }).where(eq(matches.id, next.id));
        }
      }
    }
    await t.update(competitions).set({ status: "PUBLISHED" }).where(eq(competitions.id, competitionId));
    return listMatches(t, competitionId);
  });
}

export const listMatches = (db: Db, competitionId: string) =>
  db.select().from(matches).where(eq(matches.competitionId, competitionId)).orderBy(asc(matches.round), asc(matches.slot));

export async function getMatch(db: Db, id: string) {
  const [m] = await db.select().from(matches).where(eq(matches.id, id));
  if (!m) throw new AuthError(404, "Not Found");
  return m;
}

/** Public-facing match view: team names and competition name resolved. Visibility is the caller's job. */
export async function matchDetail(db: Db, id: string) {
  const m = await getMatch(db, id);
  const c = await getCompetition(db, m.competitionId);
  const ids = [m.homeTeamId, m.awayTeamId].filter((x): x is string => !!x);
  const rows = ids.length ? await db.select({ id: teams.id, name: teams.name }).from(teams).where(inArray(teams.id, ids)) : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const side = (tid: string | null) => (tid ? byId.get(tid) ?? null : null);
  return {
    id: m.id, competitionId: m.competitionId, competitionName: c.name, round: m.round, slot: m.slot, state: m.state, isBye: m.isBye,
    scheduledAt: m.scheduledAt ? m.scheduledAt.toISOString() : null,
    courtName: m.courtName ?? null,
    estimatedDurationMinutes: m.estimatedDurationMinutes ?? 60,
    home: side(m.homeTeamId), away: side(m.awayTeamId), homeScore: m.homeScore, awayScore: m.awayScore,
  };
}

/** Set or clear the planned start time. Played (or bye) matches keep their time. */
export async function setMatchTime(
  db: Db,
  id: string,
  scheduledAt?: Date | null,
  courtName?: string | null,
  estimatedDurationMinutes?: number
) {
  const m = await getMatch(db, id);
  if (m.isBye) throw new AuthError(409, "Bye matches have no time");
  if (m.state === "LOCKED" || m.state === "FINISHED") throw new AuthError(409, "A finished match can't be rescheduled");
  await db
    .update(matches)
    .set({
      ...(scheduledAt !== undefined ? { scheduledAt } : {}),
      ...(courtName !== undefined ? { courtName } : {}),
      ...(estimatedDurationMinutes !== undefined ? { estimatedDurationMinutes } : {}),
    })
    .where(eq(matches.id, id));
  return matchDetail(db, id);
}

export async function getCompetitionScheduleConflicts(
  db: Db,
  competitionId: string,
  options: ScheduleValidationOptions = {}
) {
  await getCompetition(db, competitionId);
  const allMatches = await listMatches(db, competitionId);
  return validateScheduleConflicts(allMatches, options);
}

export async function applyAutoSchedule(
  db: Db,
  competitionId: string,
  options: AutoScheduleOptions
) {
  await getCompetition(db, competitionId);
  const allMatches = await listMatches(db, competitionId);
  const unplayedMatches = allMatches.filter((m) => m.state === "SCHEDULED" && !m.isBye);

  const result = autoScheduleTournament(unplayedMatches, options);

  await tx(db, async (t) => {
    for (const asgn of result.assignments) {
      await t
        .update(matches)
        .set({
          courtName: asgn.courtName,
          scheduledAt: new Date(asgn.scheduledAt),
          estimatedDurationMinutes: asgn.estimatedDurationMinutes,
        })
        .where(eq(matches.id, asgn.matchId));
    }
  });

  return result;
}

export const FORFEIT_WINNER_POINTS = 20;

/** The winner is awarded a 20-0 result flagged as a forfeit; same audit log and bracket advancement as any result. */
export async function recordForfeit(db: Db, id: string, userId: string, winner: "home" | "away") {
  await recordResult(db, id, userId, {
    homeScore: winner === "home" ? FORFEIT_WINNER_POINTS : 0, awayScore: winner === "away" ? FORFEIT_WINNER_POINTS : 0, forfeit: true,
  });
  return matchDetail(db, id);
}

export async function recordResult(
  db: Db, matchId: string, userId: string, r: { homeScore: number; awayScore: number; forfeit?: boolean | undefined },
) {
  if (r.homeScore === r.awayScore) throw new AuthError(400, "Basketball games cannot end tied");
  return tx(db, async (t) => {
    const [m] = await t.select().from(matches).where(eq(matches.id, matchId)).for("update");
    if (!m) throw new AuthError(404, "Not Found");
    if (m.isBye) throw new AuthError(409, "Bye matches have no result");
    if (m.state === "LOCKED") throw new AuthError(409, "Match is locked");
    if (!m.homeTeamId || !m.awayTeamId) throw new AuthError(409, "Both teams must be known first");

    const winner = r.homeScore > r.awayScore ? m.homeTeamId : m.awayTeamId;
    let next: Match | undefined;
    if (m.nextMatchId) {
      [next] = await t.select().from(matches).where(eq(matches.id, m.nextMatchId)).for("update");
      // Don't rewrite history underneath a game that was already played.
      if (next && (next.state === "FINISHED" || next.state === "LOCKED")) {
        throw new AuthError(409, "The next round has already been played; correct that result first");
      }
    }
    // Quick result entry covers SCHEDULED/LIVE -> FINISHED; a correction of a FINISHED match stays FINISHED.
    await t.update(matches).set({ homeScore: r.homeScore, awayScore: r.awayScore, forfeit: r.forfeit ?? false, state: "FINISHED" }).where(eq(matches.id, matchId));
    await t.insert(matchResultLog).values({ matchId, userId, homeScore: r.homeScore, awayScore: r.awayScore, forfeit: r.forfeit ?? false });
    if (next) {
      await t.update(matches).set(m.nextSide === "home" ? { homeTeamId: winner } : { awayTeamId: winner }).where(eq(matches.id, next.id));
    }
    await refreshCompetitionStatus(t, m.competitionId);
    return getMatch(t, matchId);
  });
}

export async function lockMatch(db: Db, matchId: string) {
  const m = await getMatch(db, matchId);
  if (!canTransition(m.state as MatchState, "LOCKED")) throw new AuthError(409, "Only finished matches can be locked");
  await db.update(matches).set({ state: "LOCKED" }).where(eq(matches.id, matchId));
  return getMatch(db, matchId);
}

async function refreshCompetitionStatus(db: Db, competitionId: string) {
  const all = await listMatches(db, competitionId);
  const done = all.length > 0 && all.every((m) => m.state === "FINISHED" || m.state === "LOCKED");
  await db.update(competitions).set({ status: done ? "COMPLETED" : "PUBLISHED" }).where(eq(competitions.id, competitionId));
}

export async function competitionStandings(db: Db, competitionId: string) {
  const c = await getCompetition(db, competitionId);
  if (c.format !== "ROUND_ROBIN") throw new AuthError(409, "Standings apply to round-robin competitions");
  const reg = await listTeams(db, competitionId);
  const played = (await listMatches(db, competitionId)).filter((m) => (m.state === "FINISHED" || m.state === "LOCKED") && !m.isBye);
  const results: Result[] = played.map((m) => ({
    home: m.homeTeamId!, away: m.awayTeamId!, homeScore: m.homeScore!, awayScore: m.awayScore!, forfeit: m.forfeit,
  }));
  const names = new Map(reg.map((t) => [t.id, t.name]));
  return standings(reg.map((t) => t.id), results).map((row, i) => ({ rank: i + 1, name: names.get(row.team)!, ...row }));
}

/** Lists all assigned officials (scorekeepers & referees) for a competition. */
export async function getCompetitionOfficials(db: Db, competitionId: string) {
  return db
    .select({
      id: roleAssignments.id,
      userId: roleAssignments.userId,
      role: roleAssignments.role,
      email: users.email,
      displayName: users.displayName,
      createdAt: roleAssignments.createdAt,
    })
    .from(roleAssignments)
    .innerJoin(users, eq(roleAssignments.userId, users.id))
    .where(
      and(
        eq(roleAssignments.resourceType, "competition"),
        eq(roleAssignments.resourceId, competitionId),
        inArray(roleAssignments.role, ["SCOREKEEPER", "REFEREE"]),
      ),
    );
}

/** Complete tournament command center view with live operations alerts, delays, and officials status. */
export async function getCommandCenter(db: Db, competitionId: string) {
  const c = await getCompetition(db, competitionId);
  const allMatches = await listMatches(db, competitionId);
  const teamList = await listTeams(db, competitionId);
  const teamMap = new Map(teamList.map((t) => [t.id, t.name]));
  const officials = await getCompetitionOfficials(db, competitionId);
  const scheduleValidation = validateScheduleConflicts(allMatches);
  const now = new Date();

  const formattedMatches = allMatches.map((m) => {
    const isDelayed = !m.isBye && m.state === "SCHEDULED" && m.scheduledAt !== null && new Date(m.scheduledAt) < now;
    const isUnresolved = m.state === "LIVE" || (m.state === "FINISHED" && m.homeScore === null);
    const missingOfficials = !m.isBye && m.state !== "LOCKED" && officials.length === 0;

    return {
      id: m.id,
      round: m.round,
      slot: m.slot,
      homeTeamId: m.homeTeamId,
      awayTeamId: m.awayTeamId,
      homeName: m.homeTeamId ? teamMap.get(m.homeTeamId) ?? "?" : "TBD",
      awayName: m.awayTeamId ? teamMap.get(m.awayTeamId) ?? "?" : "TBD",
      state: m.state,
      isBye: m.isBye,
      scheduledAt: m.scheduledAt ? m.scheduledAt.toISOString() : null,
    courtName: m.courtName ?? null,
    estimatedDurationMinutes: m.estimatedDurationMinutes ?? 60,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      forfeit: m.forfeit,
      alerts: {
        delayed: isDelayed,
        unresolved: isUnresolved,
        missingOfficials,
        hasConflict: scheduleValidation.conflicts.some((cf) => cf.matchIds.includes(m.id)),
        conflicts: scheduleValidation.conflicts.filter((cf) => cf.matchIds.includes(m.id)),
      },
    };
  });

  const delayedCount = formattedMatches.filter((m) => m.alerts.delayed).length;
  const unresolvedCount = formattedMatches.filter((m) => m.alerts.unresolved).length;
  const liveCount = formattedMatches.filter((m) => m.state === "LIVE").length;
  const finishedCount = formattedMatches.filter((m) => m.state === "FINISHED" || m.state === "LOCKED").length;

  return {
    competition: { id: c.id, name: c.name, format: c.format, status: c.status },
    summary: {
      totalMatches: allMatches.length,
      scheduled: allMatches.filter((m) => m.state === "SCHEDULED").length,
      live: liveCount,
      finished: finishedCount,
      delayed: delayedCount,
      unresolved: unresolvedCount,
      conflictCount: scheduleValidation.conflictCount,
      officialsCount: officials.length,
    },
    conflicts: scheduleValidation.conflicts,
    officials,
    matches: formattedMatches,
  };
}

/** Previews downstream schedule delay without mutating database records. */
export async function previewDelayImpact(db: Db, competitionId: string, input: { matchId: string; delayMinutes: number }) {
  const target = await getMatch(db, input.matchId);
  if (target.competitionId !== competitionId) throw new AuthError(404, "Not Found");
  if (target.isBye || target.state === "FINISHED" || target.state === "LOCKED") {
    throw new AuthError(409, "Cannot delay a finished, locked or bye match");
  }
  const allMatches = await listMatches(db, competitionId);
  const teamList = await listTeams(db, competitionId);
  const teamMap = new Map(teamList.map((t) => [t.id, t.name]));

  const delayMs = input.delayMinutes * 60 * 1000;
  const targetTime = target.scheduledAt ? new Date(target.scheduledAt) : new Date();

  // Downstream matches: target match plus any match scheduled at or after targetTime that is not finished/locked
  const affected = allMatches.filter((m) => {
    if (m.isBye || m.state === "FINISHED" || m.state === "LOCKED") return false;
    if (m.id === target.id) return true;
    if (!m.scheduledAt) return false;
    return new Date(m.scheduledAt) >= targetTime;
  });

  const simulations = affected.map((m) => {
    const origTime = m.scheduledAt ? new Date(m.scheduledAt) : targetTime;
    const proposed = new Date(origTime.getTime() + delayMs);
    return {
      matchId: m.id,
      round: m.round,
      slot: m.slot,
      homeName: m.homeTeamId ? teamMap.get(m.homeTeamId) ?? "?" : "TBD",
      awayName: m.awayTeamId ? teamMap.get(m.awayTeamId) ?? "?" : "TBD",
      state: m.state,
      currentScheduledAt: m.scheduledAt ? m.scheduledAt.toISOString() : null,
      proposedScheduledAt: proposed.toISOString(),
      delayMinutes: input.delayMinutes,
    };
  });

  return {
    matchId: input.matchId,
    delayMinutes: input.delayMinutes,
    affectedCount: simulations.length,
    simulations,
  };
}

/** Atomically commits the delay to the target and all downstream matches. */
export async function applyDelay(db: Db, competitionId: string, input: { matchId: string; delayMinutes: number }) {
  const impact = await previewDelayImpact(db, competitionId, input);
  return tx(db, async (t) => {
    for (const sim of impact.simulations) {
      await t.update(matches).set({ scheduledAt: new Date(sim.proposedScheduledAt) }).where(eq(matches.id, sim.matchId));
    }
    return impact;
  });
}
