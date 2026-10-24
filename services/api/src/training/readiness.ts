import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  athleticTestAttempts,
  athleticTestProtocols,
  athleticTestSessions,
  exerciseSets,
  matches,
  matchEvents,
  users,
  wellnessChecks,
  workoutSessions,
} from "../db/schema.js";
import { AuthError } from "../identity/service.js";

export interface ReadinessSummary {
  athleteId: string;
  athleteName: string;
  asOf: string;
  workload: {
    acuteVolumeKg: number; // 7-day total volume: sum(load_kg * reps)
    chronicWeeklyVolumeKg: number; // 28-day average weekly volume
    acwr: number | null; // Acute-to-Chronic Workload Ratio
    acuteSessionsCount: number;
    chronicSessionsCount: number;
    averageRpe7d: number | null;
    averageRpe28d: number | null;
    volumeUnit: "kg";
    provenance: "SELF_REPORTED_AND_LOGGED";
  };
  safetyStop: {
    active: boolean;
    reason: string | null;
    advice: string | null;
  };
  combineSignature: {
    standingVerticalCm: number | null;
    maxVerticalCm: number | null;
    threeQuarterSprintSec: number | null;
    laneAgilitySec: number | null;
    proAgilitySec: number | null;
    yoyoLevel: number | null;
    latestTestedDate: string | null;
    provenance: "SENSOR";
  };
  gamePerformance: {
    gamesCount: number;
    totalMinutes: number | null;
    points: number;
    pointsPerMinute: number | null;
    trueShootingPercentage: number | null;
    turnovers: number;
    provenance: "OFFICIAL";
  };
  correlationalObservations: Array<{
    category: "VOLUME_PACING" | "READINESS_OBSERVATION" | "PERFORMANCE_EFFICIENCY";
    observation: string;
    sampleSize: string;
    confidence: "OBSERVED" | "DERIVED";
  }>;
  complianceNotice: string;
}

export async function getAthleteReadiness(
  db: Db,
  athleteId: string,
  actorId: string,
): Promise<ReadinessSummary> {
  // Authorization: self only (or permitted coach / admin). Negative authZ returns 404 (ADR-0010)
  if (athleteId !== actorId) {
    throw new AuthError(404, "Readiness dashboard not found");
  }

  const [athlete] = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, athleteId));

  if (!athlete) {
    throw new AuthError(404, "Athlete not found");
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twentyEightDaysAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

  // 1. Fetch workout sessions & calculate acute/chronic volume
  const sessions = await db
    .select({
      id: workoutSessions.id,
      startedAt: workoutSessions.startedAt,
      sessionRpe: workoutSessions.sessionRpe,
    })
    .from(workoutSessions)
    .where(
      and(
        eq(workoutSessions.userId, athleteId),
        gte(workoutSessions.startedAt, twentyEightDaysAgo),
      ),
    );

  const sessionIds = sessions.map((s) => s.id);

  let acuteVolume = 0;
  let chronicVolume = 0;
  let acuteSessionsCount = 0;
  const chronicSessionsCount = sessions.length;

  const acuteRpes: number[] = [];
  const chronicRpes: number[] = [];

  for (const s of sessions) {
    if (s.startedAt >= sevenDaysAgo) {
      acuteSessionsCount++;
      if (s.sessionRpe !== null) acuteRpes.push(s.sessionRpe);
    }
    if (s.sessionRpe !== null) chronicRpes.push(s.sessionRpe);
  }

  if (sessionIds.length > 0) {
    const sets = await db
      .select({
        sessionId: exerciseSets.sessionId,
        reps: exerciseSets.reps,
        loadKg: exerciseSets.loadKg,
        createdAt: exerciseSets.createdAt,
      })
      .from(exerciseSets)
      .where(inArray(exerciseSets.sessionId, sessionIds));

    for (const set of sets) {
      const load = set.loadKg ? Number(set.loadKg) : 0;
      const vol = set.reps * load;
      chronicVolume += vol;
      if (set.createdAt >= sevenDaysAgo) {
        acuteVolume += vol;
      }
    }
  }

  const chronicWeeklyVolume = Math.round((chronicVolume / 4) * 10) / 10;
  const acwr =
    chronicWeeklyVolume > 0
      ? Math.round((acuteVolume / chronicWeeklyVolume) * 100) / 100
      : null;

  const avgRpe7d =
    acuteRpes.length > 0
      ? Math.round((acuteRpes.reduce((a, b) => a + b, 0) / acuteRpes.length) * 10) / 10
      : null;
  const avgRpe28d =
    chronicRpes.length > 0
      ? Math.round((chronicRpes.reduce((a, b) => a + b, 0) / chronicRpes.length) * 10) / 10
      : null;

  // 2. Check for Safety Stop from recent wellness checks (pain in last 7 days per Spec §5.3)
  const recentWellness = await db
    .select()
    .from(wellnessChecks)
    .where(
      and(
        eq(wellnessChecks.userId, athleteId),
        gte(wellnessChecks.createdAt, sevenDaysAgo),
      ),
    )
    .orderBy(desc(wellnessChecks.createdAt))
    .limit(7);

  const painCheck = recentWellness.find(
    (w) =>
      w.painReported ||
      (w.soreness !== null && w.soreness >= 4) ||
      (w.painNote && /pain|injury|hurt|ache/i.test(w.painNote)),
  );

  const safetyStopActive = !!painCheck;
  const safetyStopReason = safetyStopActive
    ? "Recent wellness check reported elevated soreness or pain."
    : null;
  const safetyAdvice = safetyStopActive
    ? "You reported pain/discomfort in recent logs. Automatic progressions are locked to HOLD. Please consult a qualified physical therapist or sports physician."
    : null;

  // 3. Combine athletic benchmarks
  const combineAttempts = await db
    .select({
      protocolSlug: athleticTestProtocols.slug,
      rawValue: athleticTestAttempts.rawValue,
      testedAt: athleticTestSessions.testDate,
    })
    .from(athleticTestAttempts)
    .innerJoin(athleticTestSessions, eq(athleticTestSessions.id, athleticTestAttempts.sessionId))
    .innerJoin(athleticTestProtocols, eq(athleticTestProtocols.id, athleticTestAttempts.protocolId))
    .where(
      and(
        eq(athleticTestSessions.userId, athleteId),
        eq(athleticTestAttempts.isFault, false),
      ),
    )
    .orderBy(desc(athleticTestAttempts.createdAt));

  const combineMap = new Map<string, number>();
  let latestTestedDate: string | null = null;
  for (const c of combineAttempts) {
    if (!combineMap.has(c.protocolSlug)) {
      combineMap.set(c.protocolSlug, Number(c.rawValue));
      if (!latestTestedDate) latestTestedDate = c.testedAt;
    }
  }

  // 4. Recent official match statistics (last 30 days)
  const credited = await db
    .select({ matchId: matchEvents.matchId })
    .from(matchEvents)
    .where(eq(matchEvents.playerId, athleteId));

  const allMatchIds = [...new Set(credited.map((c) => c.matchId))];
  let gamesCount = 0;
  let totalPts = 0;
  let totalFga = 0;
  let totalFta = 0;
  let totalTurnovers = 0;

  if (allMatchIds.length > 0) {
    const recentMatches = await db
      .select()
      .from(matches)
      .where(
        and(
          inArray(matches.id, allMatchIds),
          inArray(matches.state, ["FINISHED", "LOCKED"]),
          gte(matches.scheduledAt, twentyEightDaysAgo),
        ),
      );

    gamesCount = recentMatches.length;
    const recentMatchIds = recentMatches.map((m) => m.id);

    if (recentMatchIds.length > 0) {
      const gameEvents = await db
        .select()
        .from(matchEvents)
        .where(
          and(
            inArray(matchEvents.matchId, recentMatchIds),
            eq(matchEvents.playerId, athleteId),
          ),
        );

      for (const e of gameEvents) {
        if (e.type === "FT_MADE") {
          totalPts += 1;
          totalFta += 1;
        } else if (e.type === "FT_MISSED") {
          totalFta += 1;
        } else if (e.type === "FG_MADE") {
          totalPts += 2;
          totalFga += 1;
        } else if (e.type === "FG_MISSED") {
          totalFga += 1;
        } else if (e.type === "3PT_MADE") {
          totalPts += 3;
          totalFga += 1;
        } else if (e.type === "3PT_MISSED") {
          totalFga += 1;
        } else if (e.type === "TURNOVER") {
          totalTurnovers += 1;
        }
      }
    }
  }

  // True shooting % = PTS / (2 * (FGA + 0.44 * FTA))
  const tsDenom = 2 * (totalFga + 0.44 * totalFta);
  const trueShooting = tsDenom > 0 ? Math.round((totalPts / tsDenom) * 1000) / 10 : null;

  // 5. Correlational observations (strictly non-predictive per ADR-0009)
  const correlationalObservations: ReadinessSummary["correlationalObservations"] = [];

  if (acwr !== null) {
    if (acwr >= 0.8 && acwr <= 1.3) {
      correlationalObservations.push({
        category: "VOLUME_PACING",
        observation: `Acute-to-chronic workload ratio of ${acwr} indicates steady progressive volume loading over the 4-week window.`,
        sampleSize: `${chronicSessionsCount} logged workout sessions in past 28 days`,
        confidence: "DERIVED",
      });
    } else if (acwr > 1.4) {
      correlationalObservations.push({
        category: "VOLUME_PACING",
        observation: `Acute workload spike detected (${acwr} ratio vs chronic baseline). Consider incorporating scheduled recovery blocks.`,
        sampleSize: `${acuteSessionsCount} sessions in past 7 days vs 4-week average`,
        confidence: "DERIVED",
      });
    }
  }

  if (combineMap.has("MAX_VERTICAL_JUMP")) {
    correlationalObservations.push({
      category: "READINESS_OBSERVATION",
      observation: `Standardized Max Vertical Jump recorded at ${combineMap.get("MAX_VERTICAL_JUMP")} cm with calibrated instrument protocol.`,
      sampleSize: "Latest combine battery protocol",
      confidence: "OBSERVED",
    });
  }

  if (gamesCount > 0) {
    correlationalObservations.push({
      category: "PERFORMANCE_EFFICIENCY",
      observation: `Scored ${totalPts} points across ${gamesCount} official games in past 28 days (True Shooting: ${trueShooting ?? "N/A"}%).`,
      sampleSize: `${gamesCount} completed official games`,
      confidence: "OBSERVED",
    });
  }

  return {
    athleteId,
    athleteName: athlete.displayName,
    asOf: now.toISOString(),
    workload: {
      acuteVolumeKg: acuteVolume,
      chronicWeeklyVolumeKg: chronicWeeklyVolume,
      acwr,
      acuteSessionsCount,
      chronicSessionsCount,
      averageRpe7d: avgRpe7d,
      averageRpe28d: avgRpe28d,
      volumeUnit: "kg",
      provenance: "SELF_REPORTED_AND_LOGGED",
    },
    safetyStop: {
      active: safetyStopActive,
      reason: safetyStopReason,
      advice: safetyAdvice,
    },
    combineSignature: {
      standingVerticalCm: combineMap.get("STANDING_VERTICAL_JUMP") ?? null,
      maxVerticalCm: combineMap.get("MAX_VERTICAL_JUMP") ?? null,
      threeQuarterSprintSec: combineMap.get("THREE_QUARTER_SPRINT") ?? null,
      laneAgilitySec: combineMap.get("LANE_AGILITY") ?? null,
      proAgilitySec: combineMap.get("PRO_AGILITY_SHUTTLE") ?? null,
      yoyoLevel: combineMap.get("YOYO_INTERMITTENT_RECOVERY_1") ?? null,
      latestTestedDate,
      provenance: "SENSOR",
    },
    gamePerformance: {
      gamesCount,
      totalMinutes: null,
      points: totalPts,
      pointsPerMinute: null,
      trueShootingPercentage: trueShooting,
      turnovers: totalTurnovers,
      provenance: "OFFICIAL",
    },
    correlationalObservations,
    complianceNotice:
      "ADR-0009 COMPLIANT: This dashboard presents correlational training-to-game metrics only and does NOT output injury probability, medical risk indices, or fatigue forecasts. Always listen to your body and consult qualified healthcare professionals.",
  };
}
