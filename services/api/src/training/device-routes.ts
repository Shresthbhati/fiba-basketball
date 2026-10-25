import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import {
  DEVICE_MANUFACTURERS,
  SESSION_TYPES,
  getTelemetrySession,
  getTeamSensorSummary,
  ingestTelemetrySession,
  listAthleteDevices,
  listAthleteTelemetrySessions,
  registerAthleteDevice,
  retireAthleteDevice,
  type DeviceManufacturer,
  type SessionType,
} from "./device-service.js";

const idParam = z.object({ id: z.string().uuid() });
const deviceIdParam = z.object({ deviceId: z.string().uuid() });
const teamIdParam = z.object({ teamId: z.string().uuid() });

const registerDeviceBody = z.object({
  deviceManufacturer: z.enum(DEVICE_MANUFACTURERS),
  deviceModel: z.string().trim().min(1).max(100),
  deviceIdentifier: z.string().trim().max(100).optional(),
  firmwareVersion: z.string().trim().max(50).optional(),
  calibrationDate: z.string().datetime().optional(),
});

const ingestTelemetryBody = z.object({
  sessionName: z.string().trim().min(1).max(100),
  sessionType: z.enum(SESSION_TYPES),
  practiceId: z.string().uuid().optional(),
  matchId: z.string().uuid().optional(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  durationSeconds: z.number().int().min(1).optional(),
  distanceMeters: z.number().min(0).optional(),
  playerLoad: z.number().min(0).optional(),
  jumpCount: z.number().int().min(0).optional(),
  maxJumpHeightCm: z.number().min(0).optional(),
  maxAccelerationG: z.number().min(0).optional(),
  maxDecelerationG: z.number().min(0).optional(),
  avgHeartRateBpm: z.number().int().min(30).max(250).optional(),
  maxHeartRateBpm: z.number().int().min(30).max(250).optional(),
  timeInZoneSeconds: z
    .object({
      z1: z.number().int().min(0).optional(),
      z2: z.number().int().min(0).optional(),
      z3: z.number().int().min(0).optional(),
      z4: z.number().int().min(0).optional(),
      z5: z.number().int().min(0).optional(),
    })
    .optional(),
  samplesCount: z.number().int().min(0).optional(),
  rawFormat: z.enum(["JSON", "TCX", "FIT", "CSV"]).optional(),
});

const listSessionsQuery = z.object({
  sessionType: z.enum(SESSION_TYPES).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const teamSummaryQuery = z.object({
  daysBack: z.coerce.number().int().min(1).max(90).default(14),
});

export function registerDeviceRoutes(app: FastifyInstance, db: Db) {
  // Athlete: Register new wearable/sensor device
  app.post(
    "/api/v1/devices",
    { config: { access: "authenticated" } },
    async (req: FastifyRequest, reply) => {
      const body = registerDeviceBody.parse(req.body);
      const device = await registerAthleteDevice(db, req.user!.id, {
        deviceManufacturer: body.deviceManufacturer as DeviceManufacturer,
        deviceModel: body.deviceModel,
        deviceIdentifier: body.deviceIdentifier,
        firmwareVersion: body.firmwareVersion,
        calibrationDate: body.calibrationDate,
      });
      return reply.status(201).send(device);
    },
  );

  // Athlete: List registered devices
  app.get(
    "/api/v1/devices",
    { config: { access: "authenticated" } },
    async (req: FastifyRequest) => {
      const items = await listAthleteDevices(db, req.user!.id);
      return { items };
    },
  );

  // Athlete: Retire/disconnect device
  app.delete(
    "/api/v1/devices/:id",
    { config: { access: "authenticated" } },
    async (req: FastifyRequest) => {
      const { id } = idParam.parse(req.params);
      return retireAthleteDevice(db, req.user!.id, id);
    },
  );

  // Athlete: Ingest sensor telemetry session
  app.post(
    "/api/v1/devices/:deviceId/telemetry",
    { config: { access: "authenticated" } },
    async (req: FastifyRequest, reply) => {
      const { deviceId } = deviceIdParam.parse(req.params);
      const body = ingestTelemetryBody.parse(req.body);

      const session = await ingestTelemetrySession(db, req.user!.id, deviceId, {
        sessionName: body.sessionName,
        sessionType: body.sessionType as SessionType,
        practiceId: body.practiceId,
        matchId: body.matchId,
        startedAt: body.startedAt,
        endedAt: body.endedAt,
        durationSeconds: body.durationSeconds,
        distanceMeters: body.distanceMeters,
        playerLoad: body.playerLoad,
        jumpCount: body.jumpCount,
        maxJumpHeightCm: body.maxJumpHeightCm,
        maxAccelerationG: body.maxAccelerationG,
        maxDecelerationG: body.maxDecelerationG,
        avgHeartRateBpm: body.avgHeartRateBpm,
        maxHeartRateBpm: body.maxHeartRateBpm,
        timeInZoneSeconds: body.timeInZoneSeconds,
        samplesCount: body.samplesCount,
        rawFormat: body.rawFormat,
      });

      return reply.status(201).send(session);
    },
  );

  // Athlete: List my sensor telemetry sessions
  app.get(
    "/api/v1/athletes/me/sensor-sessions",
    { config: { access: "authenticated" } },
    async (req: FastifyRequest) => {
      const query = listSessionsQuery.parse(req.query ?? {});
      return listAthleteTelemetrySessions(db, req.user!.id, {
        sessionType: query.sessionType as SessionType | undefined,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
      });
    },
  );

  // Athlete or Coach: Get single telemetry session details
  app.get(
    "/api/v1/sensor-sessions/:id",
    { config: { access: "authenticated" } },
    async (req: FastifyRequest) => {
      const { id } = idParam.parse(req.params);
      return getTelemetrySession(db, req.user!.id, id);
    },
  );

  // Coach: Team aggregate sensor load summary
  app.get(
    "/api/v1/teams/:teamId/sensor-summary",
    { config: { access: "authenticated" } },
    async (req: FastifyRequest) => {
      const { teamId } = teamIdParam.parse(req.params);
      const query = teamSummaryQuery.parse(req.query ?? {});
      return getTeamSensorSummary(db, req.user!.id, teamId, query.daysBack);
    },
  );
}
