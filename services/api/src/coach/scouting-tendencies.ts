import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  matches,
  matchEvents,
  tacticalReports,
  teams,
  users,
} from "../db/schema.js";
import { AuthError } from "../identity/service.js";
import { boxScore, type StatEvent } from "../match/box-score.js";
import { can } from "../authz/service.js";

export interface PlayerThreatDto {
  playerId: string;
  name: string;
  gamesPlayed: number;
  ppg: number;
  rpg: number;
  apg: number;
  threePointRate: number; // percentage of FGA from 3
  roleTag: string;
}

export interface OpponentTendencyDto {
  opponent: {
    id: string;
    name: string;
  };
  sampleSize: number; // games evaluated
  record: {
    wins: number;
    losses: number;
    winRate: number;
  };
  paceAndScoring: {
    ppg: number;
    oppPpg: number;
    netDifferential: number;
  };
  shotProfile: {
    twoPointRate: number; // percentage of FGA
    threePointRate: number;
    twoPointPct: number; // shooting efficiency %
    threePointPct: number;
    freeThrowRate: number; // FTA / FGA %
  };
  ballControl: {
    assistsPerGame: number;
    turnoversPerGame: number;
    astToRatio: number;
  };
  keyThreats: PlayerThreatDto[];
  tacticalRecommendations: string[];
}

export interface GenerateDossierInput {
  opponentTeamId: string;
  competitionId?: string | undefined;
  title?: string | undefined;
}

export async function getOpponentTendencyAnalysis(
  db: Db,
  userId: string,
  teamId: string,
  opponentTeamId: string,
  options?: { competitionId?: string | undefined }
): Promise<OpponentTendencyDto> {
  const allowed = await can(db, userId, "team:view", { type: "team", id: teamId });
  if (!allowed) throw new AuthError(404, "Not Found");

  const [oppTeam] = await db.select().from(teams).where(eq(teams.id, opponentTeamId));
  if (!oppTeam) throw new AuthError(404, "Opponent team not found");

  const conditions = [
    or(eq(matches.homeTeamId, opponentTeamId), eq(matches.awayTeamId, opponentTeamId)),
    inArray(matches.state, ["FINISHED", "LOCKED"]),
  ];

  if (options?.competitionId) {
    conditions.push(eq(matches.competitionId, options.competitionId));
  }

  const matchRows = await db
    .select()
    .from(matches)
    .where(and(...conditions))
    .orderBy(desc(matches.scheduledAt));

  const sampleSize = matchRows.length;
  if (sampleSize === 0) {
    return {
      opponent: { id: oppTeam.id, name: oppTeam.name },
      sampleSize: 0,
      record: { wins: 0, losses: 0, winRate: 0 },
      paceAndScoring: { ppg: 0, oppPpg: 0, netDifferential: 0 },
      shotProfile: { twoPointRate: 0, threePointRate: 0, twoPointPct: 0, threePointPct: 0, freeThrowRate: 0 },
      ballControl: { assistsPerGame: 0, turnoversPerGame: 0, astToRatio: 0 },
      keyThreats: [],
      tacticalRecommendations: ["Insufficient match history available to model defensive scheme."],
    };
  }

  let totalPts = 0;
  let totalAllowed = 0;
  let wins = 0;
  let totalFgm = 0;
  let totalFga = 0;
  let totalTpm = 0;
  let totalTpa = 0;
  let totalFta = 0;
  let totalAssists = 0;
  let totalTurnovers = 0;

  const playerStatsMap = new Map<
    string,
    { points: number; fga: number; tpa: number; assists: number; rebounds: number; games: number }
  >();

  for (const m of matchRows) {
    const isHome = m.homeTeamId === opponentTeamId;
    const oppSide = isHome ? "home" : "away";
    const pts = isHome ? (m.homeScore ?? 0) : (m.awayScore ?? 0);
    const oppPts = isHome ? (m.awayScore ?? 0) : (m.homeScore ?? 0);

    totalPts += pts;
    totalAllowed += oppPts;
    if (pts > oppPts) wins++;

    const events = await db
      .select()
      .from(matchEvents)
      .where(eq(matchEvents.matchId, m.id))
      .orderBy(asc(matchEvents.serverSeq));

    const stats = boxScore(
      events.map((e): StatEvent => ({
        id: e.id,
        type: e.type as never,
        side: e.side as never,
        playerId: e.playerId,
        correctsEventId: e.correctsEventId,
      }))
    );

    const totals = stats.totals[oppSide];
    totalFgm += totals.fgm;
    totalFga += totals.fga;
    totalTpm += totals.tpm;
    totalTpa += totals.tpa;
    totalFta += totals.fta;
    totalAssists += totals.assists;
    totalTurnovers += totals.turnovers;

    for (const [pid, pData] of stats.players.entries()) {
      if (pData.side === oppSide) {
        const cur = playerStatsMap.get(pid) ?? { points: 0, fga: 0, tpa: 0, assists: 0, rebounds: 0, games: 0 };
        cur.points += pData.line.points;
        cur.fga += pData.line.fga;
        cur.tpa += pData.line.tpa;
        cur.assists += pData.line.assists;
        cur.rebounds += pData.line.rebounds;
        cur.games += 1;
        playerStatsMap.set(pid, cur);
      }
    }
  }

  const ppg = Math.round((totalPts / sampleSize) * 10) / 10;
  const oppPpg = Math.round((totalAllowed / sampleSize) * 10) / 10;
  const netDifferential = Math.round((ppg - oppPpg) * 10) / 10;
  const winRate = Math.round((wins / sampleSize) * 100);

  const twoPointFga = Math.max(0, totalFga - totalTpa);
  const twoPointFgm = Math.max(0, totalFgm - totalTpm);
  const threePointRate = totalFga > 0 ? Math.round((totalTpa / totalFga) * 100) : 0;
  const twoPointRate = totalFga > 0 ? Math.round((twoPointFga / totalFga) * 100) : 0;
  const threePointPct = totalTpa > 0 ? Math.round((totalTpm / totalTpa) * 100) : 0;
  const twoPointPct = twoPointFga > 0 ? Math.round((twoPointFgm / twoPointFga) * 100) : 0;
  const freeThrowRate = totalFga > 0 ? Math.round((totalFta / totalFga) * 100) : 0;

  const assistsPerGame = Math.round((totalAssists / sampleSize) * 10) / 10;
  const turnoversPerGame = Math.round((totalTurnovers / sampleSize) * 10) / 10;
  const astToRatio = totalTurnovers > 0 ? Math.round((totalAssists / totalTurnovers) * 10) / 10 : totalAssists;

  // Resolve top player names
  const topPlayerIds = [...playerStatsMap.entries()]
    .sort((a, b) => b[1].points - a[1].points)
    .slice(0, 4)
    .map(([pid]) => pid);

  const playerUsers = topPlayerIds.length > 0
    ? await db.select({ id: users.id, name: users.displayName }).from(users).where(inArray(users.id, topPlayerIds))
    : [];
  const userNameMap = new Map(playerUsers.map((u) => [u.id, u.name]));

  const keyThreats: PlayerThreatDto[] = topPlayerIds.map((pid) => {
    const s = playerStatsMap.get(pid)!;
    const g = Math.max(1, s.games);
    const ppgVal = Math.round((s.points / g) * 10) / 10;
    const rpgVal = Math.round((s.rebounds / g) * 10) / 10;
    const apgVal = Math.round((s.assists / g) * 10) / 10;
    const threeRate = s.fga > 0 ? Math.round((s.tpa / s.fga) * 100) : 0;

    let roleTag = "Versatile Scoring Threat";
    if (threeRate >= 45) {
      roleTag = "Perimeter Sharpshooter";
    } else if (apgVal >= 3.5) {
      roleTag = "Primary Playmaker / Floor General";
    } else if (rpgVal >= 6.0) {
      roleTag = "Interior Glass Cleaner / Paint Finisher";
    }

    return {
      playerId: pid,
      name: userNameMap.get(pid) ?? "Rotational Player",
      gamesPlayed: s.games,
      ppg: ppgVal,
      rpg: rpgVal,
      apg: apgVal,
      threePointRate: threeRate,
      roleTag,
    };
  });

  // Generate Tactical Recommendations
  const recommendations: string[] = [];
  if (threePointRate >= 38) {
    recommendations.push(
      `Heavy perimeter orientation (${threePointRate}% of shots from 3PT). Execute over-the-screen PnR coverage and contest above-the-break looks without over-helping.`
    );
  } else {
    recommendations.push(
      `Paint-dominant offense (${twoPointRate}% inside the arc). Pack the key on drives, stunt off non-shooters, and prioritize defensive rebounding.`
    );
  }

  if (turnoversPerGame >= 13) {
    recommendations.push(
      `Ball security vulnerability detected (${turnoversPerGame} TO/game, ${astToRatio} AST/TO). Apply full-court 2-2-1 token pressure and trap sideline ball screens.`
    );
  } else {
    recommendations.push(
      `Disciplined ball control (${turnoversPerGame} TO/game, ${astToRatio} AST/TO). Avoid gambles for steals; force late-clock contested isolation attempts.`
    );
  }

  if (freeThrowRate >= 30) {
    recommendations.push(
      `High free-throw generation rate (${freeThrowRate}% FT/FGA). Practice verticality in the paint and keep hands high to avoid drawing whistle fouls.`
    );
  }

  return {
    opponent: { id: oppTeam.id, name: oppTeam.name },
    sampleSize,
    record: { wins, losses: sampleSize - wins, winRate },
    paceAndScoring: { ppg, oppPpg, netDifferential },
    shotProfile: { twoPointRate, threePointRate, twoPointPct, threePointPct, freeThrowRate },
    ballControl: { assistsPerGame, turnoversPerGame, astToRatio },
    keyThreats,
    tacticalRecommendations: recommendations,
  };
}

export async function generateOpponentScoutingDossier(
  db: Db,
  userId: string,
  teamId: string,
  input: GenerateDossierInput
) {
  const allowed = await can(db, userId, "team:manage", { type: "team", id: teamId });
  if (!allowed) throw new AuthError(404, "Not Found");

  const analysis = await getOpponentTendencyAnalysis(
    db,
    userId,
    teamId,
    input.opponentTeamId,
    input.competitionId ? { competitionId: input.competitionId } : undefined
  );

  const title = input.title ?? `Scouting Dossier: ${analysis.opponent.name}`;
  const summary = `Tactical opposition analysis and scouting breakdown for ${analysis.opponent.name} based on ${analysis.sampleSize} evaluated matches (${analysis.record.wins}W-${analysis.record.losses}L).`;

  const blocks = [
    {
      id: "b1",
      title: "1. Offensive Pace & Scoring Efficiency",
      claimType: "DERIVED" as const,
      statement: `${analysis.opponent.name} averages ${analysis.paceAndScoring.ppg} PPG while allowing ${analysis.paceAndScoring.oppPpg} PPG (Net Differential: ${analysis.paceAndScoring.netDifferential > 0 ? "+" : ""}${analysis.paceAndScoring.netDifferential}). Current sample win rate is ${analysis.record.winRate}%.`,
      sampleSize: analysis.sampleSize,
      confidence: analysis.sampleSize >= 3 ? 0.92 : 0.72,
      citations: [
        {
          citationType: "METRIC" as const,
          targetId: "scoring-pace",
          note: `PPG: ${analysis.paceAndScoring.ppg}`,
        },
      ],
    },
    {
      id: "b2",
      title: "2. Shot Selection & Spacing Tendencies",
      claimType: "DERIVED" as const,
      statement: `Shot profile displays ${analysis.shotProfile.threePointRate}% 3-point attempt rate (${analysis.shotProfile.threePointPct}% 3P accuracy) and ${analysis.shotProfile.twoPointRate}% two-point attempt rate (${analysis.shotProfile.twoPointPct}% 2P accuracy). Free throw attempt rate is ${analysis.shotProfile.freeThrowRate}% FT/FGA.`,
      sampleSize: analysis.sampleSize,
      confidence: 0.9,
      citations: [
        {
          citationType: "METRIC" as const,
          targetId: "shot-distribution",
          note: `3P%: ${analysis.shotProfile.threePointPct}%, 2P%: ${analysis.shotProfile.twoPointPct}%`,
        },
      ],
    },
    {
      id: "b3",
      title: "3. Ball Security & Turnover Triggers",
      claimType: "OBSERVED" as const,
      statement: `Opponent averages ${analysis.ballControl.assistsPerGame} assists against ${analysis.ballControl.turnoversPerGame} turnovers per game (${analysis.ballControl.astToRatio} AST/TO ratio).`,
      sampleSize: analysis.sampleSize,
      confidence: 0.88,
      citations: [
        {
          citationType: "METRIC" as const,
          targetId: "turnovers",
          note: `TO/G: ${analysis.ballControl.turnoversPerGame}`,
        },
      ],
    },
    {
      id: "b4",
      title: "4. Key Personnel Matchup Threats",
      claimType: "OBSERVED" as const,
      statement:
        analysis.keyThreats.length > 0
          ? analysis.keyThreats
              .map((p) => `${p.name} (${p.roleTag}): ${p.ppg} PPG, ${p.rpg} RPG, ${p.apg} APG [3PT Rate: ${p.threePointRate}%]`)
              .join("; ")
          : "No individual player data available.",
      sampleSize: analysis.sampleSize,
      confidence: 0.85,
      citations: [],
    },
    {
      id: "b5",
      title: "5. Recommended Tactical Counters & Gameplan",
      claimType: "HYPOTHESIS" as const,
      statement: analysis.tacticalRecommendations.join(" "),
      sampleSize: analysis.sampleSize,
      confidence: 0.82,
      citations: [],
    },
  ];

  const [savedReport] = await db
    .insert(tacticalReports)
    .values({
      teamId,
      title,
      summary,
      tags: ["scouting", "opponent-dossier", analysis.opponent.name.toLowerCase()],
      blocks,
      createdBy: userId,
    })
    .returning();

  return {
    report: {
      id: savedReport!.id,
      teamId: savedReport!.teamId,
      title: savedReport!.title,
      summary: savedReport!.summary ?? null,
      createdBy: savedReport!.createdBy,
      tags: savedReport!.tags,
      blocks: savedReport!.blocks,
      version: savedReport!.version,
      createdAt: savedReport!.createdAt.toISOString(),
      updatedAt: savedReport!.updatedAt.toISOString(),
    },
    analysis,
  };
}
