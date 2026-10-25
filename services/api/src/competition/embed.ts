import { asc, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { competitions, matches } from "../db/schema.js";
import { AuthError } from "../identity/service.js";
import { competitionStandings, listTeams } from "./service.js";

export interface EmbedTeamDto {
  id: string;
  name: string;
  seed: number | null;
}

export interface EmbedMatchDto {
  id: string;
  round: number;
  slot: number;
  homeTeam: EmbedTeamDto | null;
  awayTeam: EmbedTeamDto | null;
  homeScore: number | null;
  awayScore: number | null;
  state: "SCHEDULED" | "LIVE" | "FINISHED" | "LOCKED" | string;
  isBye: boolean;
  scheduledAt: string | null;
  winnerTeamId: string | null;
}

export interface EmbedBracketRoundDto {
  round: number;
  name: string;
  matches: EmbedMatchDto[];
}

export interface EmbedScheduleItemDto {
  id: string;
  round: number;
  roundName: string;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  state: string;
  scheduledAt: string | null;
  isBye: boolean;
  winner: string | null;
}

export interface EmbedSummaryDto {
  competition: {
    id: string;
    name: string;
    format: "ROUND_ROBIN" | "SINGLE_ELIMINATION" | string;
    status: "PUBLISHED" | "COMPLETED" | string;
    createdAt: string;
  };
  stats: {
    teamCount: number;
    totalMatches: number;
    completedMatches: number;
    liveMatches: number;
    upcomingMatches: number;
  };
  standings: Array<{
    rank: number;
    team: string;
    name: string;
    played: number;
    wins: number;
    losses: number;
    points: number;
    pointsFor: number;
    pointsAgainst: number;
    diff: number;
  }> | null;
  bracket: EmbedBracketRoundDto[] | null;
  schedule: EmbedScheduleItemDto[];
}

function resolveRoundName(round: number, totalRounds: number, format: string): string {
  if (format === "ROUND_ROBIN") {
    return `Round ${round}`;
  }
  const roundsFromFinal = totalRounds - round;
  if (roundsFromFinal === 0) return "Final";
  if (roundsFromFinal === 1) return "Semifinals";
  if (roundsFromFinal === 2) return "Quarterfinals";
  if (roundsFromFinal === 3) return "Round of 16";
  return `Round ${round}`;
}

export async function getCompetitionEmbedSummary(db: Db, competitionId: string): Promise<EmbedSummaryDto> {
  const [comp] = await db.select().from(competitions).where(eq(competitions.id, competitionId));
  if (!comp || comp.status === "DRAFT") {
    // Negative authZ per ADR-0010: drafts and unknown IDs return 404
    throw new AuthError(404, "Not Found");
  }

  const teamList = await listTeams(db, competitionId);
  const teamMap = new Map<string, EmbedTeamDto>(
    teamList.map((t) => [t.id, { id: t.id, name: t.name, seed: t.seed }])
  );

  const matchRows = await db
    .select()
    .from(matches)
    .where(eq(matches.competitionId, competitionId))
    .orderBy(asc(matches.round), asc(matches.slot));

  const maxRound = matchRows.length > 0 ? Math.max(...matchRows.map((m) => m.round)) : 1;

  // 1. Calculate Standings if Round Robin
  let standingsData: EmbedSummaryDto["standings"] = null;
  if (comp.format === "ROUND_ROBIN") {
    try {
      standingsData = await competitionStandings(db, competitionId);
    } catch {
      standingsData = [];
    }
  }

  // 2. Build Bracket if Single Elimination
  let bracketData: EmbedBracketRoundDto[] | null = null;
  if (comp.format === "SINGLE_ELIMINATION" && matchRows.length > 0) {
    const roundsMap = new Map<number, EmbedMatchDto[]>();
    for (const m of matchRows) {
      const homeTeam = m.homeTeamId ? teamMap.get(m.homeTeamId) ?? { id: m.homeTeamId, name: "TBD", seed: null } : null;
      const awayTeam = m.awayTeamId ? teamMap.get(m.awayTeamId) ?? { id: m.awayTeamId, name: "TBD", seed: null } : null;

      let winnerTeamId: string | null = null;
      if (m.state === "FINISHED" || m.state === "LOCKED") {
        if (m.homeScore !== null && m.awayScore !== null) {
          winnerTeamId = m.homeScore > m.awayScore ? m.homeTeamId : m.awayTeamId;
        }
      }

      const dto: EmbedMatchDto = {
        id: m.id,
        round: m.round,
        slot: m.slot,
        homeTeam,
        awayTeam,
        homeScore: m.homeScore,
        awayScore: m.awayScore,
        state: m.state,
        isBye: m.isBye,
        scheduledAt: m.scheduledAt ? m.scheduledAt.toISOString() : null,
        winnerTeamId,
      };

      const existing = roundsMap.get(m.round) ?? [];
      existing.push(dto);
      roundsMap.set(m.round, existing);
    }

    bracketData = [...roundsMap.entries()].map(([round, list]) => ({
      round,
      name: resolveRoundName(round, maxRound, comp.format),
      matches: list,
    }));
  }

  // 3. Build Schedule
  const scheduleData: EmbedScheduleItemDto[] = matchRows.map((m) => {
    const homeName = m.homeTeamId ? teamMap.get(m.homeTeamId)?.name ?? "TBD" : "TBD";
    const awayName = m.isBye ? "BYE" : m.awayTeamId ? teamMap.get(m.awayTeamId)?.name ?? "TBD" : "TBD";

    let winner: string | null = null;
    if ((m.state === "FINISHED" || m.state === "LOCKED") && m.homeScore !== null && m.awayScore !== null) {
      winner = m.homeScore > m.awayScore ? homeName : awayName;
    }

    return {
      id: m.id,
      round: m.round,
      roundName: resolveRoundName(m.round, maxRound, comp.format),
      home: homeName,
      away: awayName,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      state: m.state,
      scheduledAt: m.scheduledAt ? m.scheduledAt.toISOString() : null,
      isBye: m.isBye,
      winner,
    };
  });

  const completedMatches = matchRows.filter((m) => m.state === "FINISHED" || m.state === "LOCKED").length;
  const liveMatches = matchRows.filter((m) => m.state === "LIVE").length;
  const upcomingMatches = matchRows.filter((m) => m.state === "SCHEDULED").length;

  return {
    competition: {
      id: comp.id,
      name: comp.name,
      format: comp.format,
      status: comp.status,
      createdAt: comp.createdAt.toISOString(),
    },
    stats: {
      teamCount: teamList.length,
      totalMatches: matchRows.length,
      completedMatches,
      liveMatches,
      upcomingMatches,
    },
    standings: standingsData,
    bracket: bracketData,
    schedule: scheduleData,
  };
}
