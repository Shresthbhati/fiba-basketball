import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  athleteDevices,
  roleAssignments,
  sensorTelemetrySessions,
  teams,
  users,
} from "../db/schema.js";
import { writeAudit } from "../audit/service.js";
import { AuthError } from "../identity/service.js";

export const DEVICE_MANUFACTURERS = [
  "GARMIN",
  "POLAR",
  "CATAPULT",
  "VERT",
  "WITTY",
  "APPLE",
  "GENERIC_IMU",
] as const;

export type DeviceManufacturer = (typeof DEVICE_MANUFACTURERS)[number];

export const SESSION_TYPES = [
  "MATCH",
  "PRACTICE",
  "WORKOUT",
  "RECOVERY",
  "COMBINE",
  "DRILL",
] as const;

export type SessionType = (typeof SESSION_TYPES)[number];

export const COMPLIANCE_NOTICE =
  "ADR-0009 COMPLIANT: Descriptive sensor telemetry only. No injury probability, fatigue forecast, or medical diagnosis.";

export interface RegisterDeviceInput {
  deviceManufacturer: DeviceManufacturer;
  deviceModel: string;
  deviceIdentifier?: string | undefined;
  firmwareVersion?: string | undefined;
  calibrationDate?: string | undefined;
}

export interface IngestTelemetryInput {
  sessionName: string;
  sessionType: SessionType;
  practiceId?: string | undefined;
  matchId?: string | undefined;
  startedAt: string;
  endedAt: string;
  durationSeconds?: number | undefined;
  distanceMeters?: number | undefined;
  playerLoad?: number | undefined;
  jumpCount?: number | undefined;
  maxJumpHeightCm?: number | undefined;
  maxAccelerationG?: number | undefined;
  maxDecelerationG?: number | undefined;
  avgHeartRateBpm?: number | undefined;
  maxHeartRateBpm?: number | undefined;
  timeInZoneSeconds?: {
    z1?: number | undefined;
    z2?: number | undefined;
    z3?: number | undefined;
    z4?: number | undefined;
    z5?: number | undefined;
  } | undefined;
  samplesCount?: number | undefined;
  rawFormat?: "JSON" | "TCX" | "FIT" | "CSV" | undefined;
}

/** Check if user can manage/coach the given team */
async function canManageTeam(db: Db, userId: string, teamId: string): Promise<boolean> {
  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) return false;
  if (team.createdBy === userId) return true;

  const [coachRole] = await db
    .select({ id: roleAssignments.id })
    .from(roleAssignments)
    .where(
      and(
        eq(roleAssignments.userId, userId),
        eq(roleAssignments.resourceType, "team"),
        eq(roleAssignments.resourceId, teamId),
        inArray(roleAssignments.role, ["COACH", "TEAM_MANAGER", "ORG_ADMIN"]),
      ),
    );
  return Boolean(coachRole);
}

/**
 * Registers an athlete's wearable sensor or timing gate device.
 */
export async function registerAthleteDevice(
  db: Db,
  userId: string,
  input: RegisterDeviceInput,
) {
  const [device] = await db
    .insert(athleteDevices)
    .values({
      userId,
      deviceManufacturer: input.deviceManufacturer,
      deviceModel: input.deviceModel.trim(),
      deviceIdentifier: input.deviceIdentifier?.trim() || null,
      firmwareVersion: input.firmwareVersion?.trim() || null,
      calibrationDate: input.calibrationDate ? new Date(input.calibrationDate) : null,
      status: "ACTIVE",
    })
    .returning();

  await writeAudit(db, {
    actorId: userId,
    action: "device.registered",
    resourceType: "athlete_device",
    resourceId: device!.id,
    metadata: {
      manufacturer: input.deviceManufacturer,
      model: input.deviceModel,
    },
  });

  return device!;
}

/**
 * Lists registered devices for the authenticated athlete.
 */
export async function listAthleteDevices(db: Db, userId: string) {
  return db
    .select()
    .from(athleteDevices)
    .where(eq(athleteDevices.userId, userId))
    .orderBy(desc(athleteDevices.createdAt));
}

/**
 * Retires or disconnects an athlete's device.
 * Negative AuthZ (ADR-0010): 404 if device does not belong to caller.
 */
export async function retireAthleteDevice(db: Db, userId: string, deviceId: string) {
  const [device] = await db
    .select()
    .from(athleteDevices)
    .where(and(eq(athleteDevices.id, deviceId), eq(athleteDevices.userId, userId)));

  if (!device) throw new AuthError(404, "Not Found");

  const [updated] = await db
    .update(athleteDevices)
    .set({ status: "RETIRED", updatedAt: new Date() })
    .where(eq(athleteDevices.id, deviceId))
    .returning();

  await writeAudit(db, {
    actorId: userId,
    action: "device.retired",
    resourceType: "athlete_device",
    resourceId: deviceId,
  });

  return updated!;
}

/**
 * Ingests a wearable sensor telemetry activity session.
 * Negative AuthZ (ADR-0010): 404 if deviceId does not belong to athlete.
 */
export async function ingestTelemetrySession(
  db: Db,
  userId: string,
  deviceId: string,
  input: IngestTelemetryInput,
) {
  const [device] = await db
    .select()
    .from(athleteDevices)
    .where(and(eq(athleteDevices.id, deviceId), eq(athleteDevices.userId, userId)));

  if (!device || device.status === "RETIRED") {
    throw new AuthError(404, "Not Found");
  }

  const startedAt = new Date(input.startedAt);
  const endedAt = new Date(input.endedAt);
  const computedDuration = Math.max(
    Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
    1,
  );
  const durationSeconds = input.durationSeconds ?? computedDuration;

  const [session] = await db
    .insert(sensorTelemetrySessions)
    .values({
      userId,
      deviceId,
      practiceId: input.practiceId || null,
      matchId: input.matchId || null,
      sessionName: input.sessionName.trim(),
      sessionType: input.sessionType,
      sourceType: "SENSOR",
      startedAt,
      endedAt,
      durationSeconds,
      distanceMeters: input.distanceMeters ?? null,
      playerLoad: input.playerLoad !== undefined ? Number(input.playerLoad.toFixed(2)) : null,
      jumpCount: input.jumpCount ?? null,
      maxJumpHeightCm: input.maxJumpHeightCm !== undefined ? Number(input.maxJumpHeightCm.toFixed(1)) : null,
      maxAccelerationG: input.maxAccelerationG !== undefined ? Number(input.maxAccelerationG.toFixed(2)) : null,
      maxDecelerationG: input.maxDecelerationG !== undefined ? Number(input.maxDecelerationG.toFixed(2)) : null,
      avgHeartRateBpm: input.avgHeartRateBpm ?? null,
      maxHeartRateBpm: input.maxHeartRateBpm ?? null,
      timeInZoneSeconds: input.timeInZoneSeconds ?? null,
      samplesCount: input.samplesCount ?? 0,
      rawFormat: input.rawFormat ?? "JSON",
    })
    .returning();

  await writeAudit(db, {
    actorId: userId,
    action: "sensor_telemetry.ingested",
    resourceType: "sensor_telemetry_session",
    resourceId: session!.id,
    metadata: {
      deviceId,
      sessionType: input.sessionType,
      durationSeconds,
      playerLoad: session!.playerLoad,
    },
  });

  return {
    ...session!,
    complianceNotice: COMPLIANCE_NOTICE,
  };
}

/**
 * Lists athlete's telemetry sessions with optional date/type filtering.
 */
export async function listAthleteTelemetrySessions(
  db: Db,
  userId: string,
  filter?: {
    sessionType?: SessionType | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
  },
) {
  const conditions = [eq(sensorTelemetrySessions.userId, userId)];

  if (filter?.sessionType) {
    conditions.push(eq(sensorTelemetrySessions.sessionType, filter.sessionType));
  }
  if (filter?.from) {
    conditions.push(sql`${sensorTelemetrySessions.startedAt} >= ${filter.from}`);
  }
  if (filter?.to) {
    conditions.push(sql`${sensorTelemetrySessions.startedAt} <= ${filter.to}`);
  }

  const items = await db
    .select({
      id: sensorTelemetrySessions.id,
      sessionName: sensorTelemetrySessions.sessionName,
      sessionType: sensorTelemetrySessions.sessionType,
      sourceType: sensorTelemetrySessions.sourceType,
      startedAt: sensorTelemetrySessions.startedAt,
      endedAt: sensorTelemetrySessions.endedAt,
      durationSeconds: sensorTelemetrySessions.durationSeconds,
      distanceMeters: sensorTelemetrySessions.distanceMeters,
      playerLoad: sensorTelemetrySessions.playerLoad,
      jumpCount: sensorTelemetrySessions.jumpCount,
      maxJumpHeightCm: sensorTelemetrySessions.maxJumpHeightCm,
      avgHeartRateBpm: sensorTelemetrySessions.avgHeartRateBpm,
      maxHeartRateBpm: sensorTelemetrySessions.maxHeartRateBpm,
      timeInZoneSeconds: sensorTelemetrySessions.timeInZoneSeconds,
      deviceManufacturer: athleteDevices.deviceManufacturer,
      deviceModel: athleteDevices.deviceModel,
      createdAt: sensorTelemetrySessions.createdAt,
    })
    .from(sensorTelemetrySessions)
    .innerJoin(athleteDevices, eq(athleteDevices.id, sensorTelemetrySessions.deviceId))
    .where(and(...conditions))
    .orderBy(desc(sensorTelemetrySessions.startedAt));

  return {
    items,
    complianceNotice: COMPLIANCE_NOTICE,
  };
}

/**
 * Retrieves single telemetry session.
 * Negative AuthZ: If caller is neither the athlete nor authorized coach, returns 404.
 */
export async function getTelemetrySession(
  db: Db,
  userId: string,
  sessionId: string,
) {
  const [session] = await db
    .select({
      id: sensorTelemetrySessions.id,
      userId: sensorTelemetrySessions.userId,
      deviceId: sensorTelemetrySessions.deviceId,
      practiceId: sensorTelemetrySessions.practiceId,
      matchId: sensorTelemetrySessions.matchId,
      sessionName: sensorTelemetrySessions.sessionName,
      sessionType: sensorTelemetrySessions.sessionType,
      sourceType: sensorTelemetrySessions.sourceType,
      startedAt: sensorTelemetrySessions.startedAt,
      endedAt: sensorTelemetrySessions.endedAt,
      durationSeconds: sensorTelemetrySessions.durationSeconds,
      distanceMeters: sensorTelemetrySessions.distanceMeters,
      playerLoad: sensorTelemetrySessions.playerLoad,
      jumpCount: sensorTelemetrySessions.jumpCount,
      maxJumpHeightCm: sensorTelemetrySessions.maxJumpHeightCm,
      maxAccelerationG: sensorTelemetrySessions.maxAccelerationG,
      maxDecelerationG: sensorTelemetrySessions.maxDecelerationG,
      avgHeartRateBpm: sensorTelemetrySessions.avgHeartRateBpm,
      maxHeartRateBpm: sensorTelemetrySessions.maxHeartRateBpm,
      timeInZoneSeconds: sensorTelemetrySessions.timeInZoneSeconds,
      samplesCount: sensorTelemetrySessions.samplesCount,
      rawFormat: sensorTelemetrySessions.rawFormat,
      deviceManufacturer: athleteDevices.deviceManufacturer,
      deviceModel: athleteDevices.deviceModel,
      createdAt: sensorTelemetrySessions.createdAt,
    })
    .from(sensorTelemetrySessions)
    .innerJoin(athleteDevices, eq(athleteDevices.id, sensorTelemetrySessions.deviceId))
    .where(eq(sensorTelemetrySessions.id, sessionId));

  if (!session) throw new AuthError(404, "Not Found");

  if (session.userId !== userId) {
    // If user is a coach of a team the athlete belongs to, check permission
    const [athleteTeam] = await db
      .select({ teamId: roleAssignments.resourceId })
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.userId, session.userId),
          eq(roleAssignments.resourceType, "team"),
          eq(roleAssignments.role, "PLAYER"),
        ),
      );

    if (athleteTeam?.teamId) {
      const isCoach = await canManageTeam(db, userId, athleteTeam.teamId);
      if (!isCoach) throw new AuthError(404, "Not Found");
    } else {
      throw new AuthError(404, "Not Found");
    }
  }

  return {
    ...session,
    complianceNotice: COMPLIANCE_NOTICE,
  };
}

/**
 * Team aggregate sensor summary for coaches.
 * Returns descriptive mechanical load and active duration metrics.
 * Negative AuthZ: Caller must have coach/manager permission for teamId.
 */
export async function getTeamSensorSummary(
  db: Db,
  coachUserId: string,
  teamId: string,
  daysBack = 14,
) {
  const authorized = await canManageTeam(db, coachUserId, teamId);
  if (!authorized) {
    throw new AuthError(404, "Not Found");
  }

  const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
  if (!team) throw new AuthError(404, "Not Found");

  // Roster members of this team
  const members = await db
    .select({
      userId: users.id,
      displayName: users.displayName,
    })
    .from(roleAssignments)
    .innerJoin(users, eq(users.id, roleAssignments.userId))
    .where(
      and(
        eq(roleAssignments.resourceType, "team"),
        eq(roleAssignments.resourceId, teamId),
        eq(roleAssignments.role, "PLAYER"),
      ),
    );

  const memberIds = members.map((m) => m.userId);
  if (memberIds.length === 0) {
    return {
      teamId,
      teamName: team.name,
      periodDays: daysBack,
      athleteSummaries: [],
      complianceNotice: COMPLIANCE_NOTICE,
    };
  }

  const cutoff = new Date(Date.now() - daysBack * 86_400_000);

  const sessions = await db
    .select()
    .from(sensorTelemetrySessions)
    .where(
      and(
        inArray(sensorTelemetrySessions.userId, memberIds),
        sql`${sensorTelemetrySessions.startedAt} >= ${cutoff}`,
      ),
    );

  const summaries = members.map((m) => {
    const userSessions = sessions.filter((s) => s.userId === m.userId);
    const totalMinutes = Math.round(
      userSessions.reduce((acc, s) => acc + s.durationSeconds, 0) / 60,
    );
    const totalPlayerLoad = Number(
      userSessions
        .reduce((acc, s) => acc + (s.playerLoad ?? 0), 0)
        .toFixed(1),
    );
    const totalJumps = userSessions.reduce((acc, s) => acc + (s.jumpCount ?? 0), 0);
    const avgBpm =
      userSessions.filter((s) => s.avgHeartRateBpm !== null).length > 0
        ? Math.round(
            userSessions
              .filter((s) => s.avgHeartRateBpm !== null)
              .reduce((acc, s) => acc + s.avgHeartRateBpm!, 0) /
              userSessions.filter((s) => s.avgHeartRateBpm !== null).length,
          )
        : null;

    return {
      athleteId: m.userId,
      athleteName: m.displayName,
      sessionsCount: userSessions.length,
      totalActiveMinutes: totalMinutes,
      totalPlayerLoad,
      totalJumps,
      avgHeartRateBpm: avgBpm,
    };
  });

  return {
    teamId,
    teamName: team.name,
    periodDays: daysBack,
    athleteSummaries: summaries,
    complianceNotice: COMPLIANCE_NOTICE,
  };
}
