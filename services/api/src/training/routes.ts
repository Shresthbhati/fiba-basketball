import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import { suggestProgression } from "./progression.js";
import {
  addSet, deleteSet, exerciseHistory, finishSession, getSession, listExercises, listSessions, overview, painReportedRecently,
  saveWellness, startSession, updateSet, wellnessStatus,
} from "./service.js";
import { registerDeviceRoutes } from "./device-routes.js";

const idParam = z.object({ id: z.uuid() });
const idOf = (req: FastifyRequest) => idParam.parse(req.params).id;
const me = (req: FastifyRequest) => req.user!.id;
const authed = { config: { access: "authenticated" as const } };

const setBody = z.object({
  clientId: z.uuid(), exerciseId: z.uuid(), reps: z.number().int().min(1).max(200),
  loadKg: z.number().min(0).max(1000).optional(), rpe: z.number().int().min(1).max(10).optional(), restSeconds: z.number().int().min(0).max(3600).optional(),
});
const patchBody = z.object({
  reps: z.number().int().min(1).max(200).optional(), loadKg: z.number().min(0).max(1000).nullable().optional(), rpe: z.number().int().min(1).max(10).nullable().optional(),
});
const wellnessBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), fatigue: z.number().int().min(1).max(5).optional(), soreness: z.number().int().min(1).max(5).optional(),
  sleepHours: z.number().min(0).max(24).optional(), painReported: z.boolean(), painNote: z.string().trim().max(500).optional(),
});

export function registerTraining(app: FastifyInstance, db: Db) {
  app.get("/api/v1/exercises", { config: { access: "public" } }, async (req) => {
    const { category } = z.object({ category: z.enum(["STRENGTH", "POWER", "PLYOMETRIC", "SPEED_AGILITY", "CONDITIONING", "MOBILITY", "CORE"]).optional() }).parse(req.query);
    return { items: await listExercises(db, category) };
  });

  app.post("/api/v1/training/sessions", authed, async (req, reply) => {
    const body = z.object({ notes: z.string().trim().max(1000).optional() }).parse(req.body ?? {});
    return reply.status(201).send(await startSession(db, me(req), body.notes));
  });
  app.get("/api/v1/training/sessions", authed, async (req) => ({ items: await listSessions(db, me(req)) }));
  app.get("/api/v1/training/sessions/:id", authed, async (req) => getSession(db, me(req), idOf(req)));
  app.post("/api/v1/training/sessions/:id/finish", authed, async (req) => {
    const body = z.object({ sessionRpe: z.number().int().min(1).max(10).optional(), notes: z.string().trim().max(1000).optional() }).parse(req.body ?? {});
    return finishSession(db, me(req), idOf(req), body);
  });
  app.post("/api/v1/training/sessions/:id/sets", authed, async (req, reply) => reply.status(201).send(await addSet(db, me(req), idOf(req), setBody.parse(req.body))));
  app.patch("/api/v1/training/sets/:id", authed, async (req) => updateSet(db, me(req), idOf(req), patchBody.parse(req.body)));
  app.delete("/api/v1/training/sets/:id", authed, async (req, reply) => {
    await deleteSet(db, me(req), idOf(req));
    return reply.status(204).send();
  });

  app.get("/api/v1/training/overview", authed, async (req) => ({ items: await overview(db, me(req)) }));

  /** Per-session summary for one exercise, with the number of workouts it is based on (sample size). */
  app.get("/api/v1/training/history/:id", authed, async (req) => {
    const sessions = await exerciseHistory(db, me(req), idOf(req));
    return {
      sampleSize: sessions.length,
      items: sessions.map((s) => {
        const top = Math.max(...s.sets.map((x) => x.loadKg ?? 0));
        return {
          sessionId: s.sessionId, date: s.startedAt, sets: s.sets.length, topLoadKg: top > 0 ? top : null,
          repsAtTopLoad: s.sets.filter((x) => (x.loadKg ?? 0) === top).map((x) => x.reps),
        };
      }),
    };
  });

  /** A suggestion, never an instruction: it explains itself and pauses when pain was reported. */
  app.get("/api/v1/training/progression/:id", authed, async (req) => {
    const q = z.object({ targetReps: z.coerce.number().int().min(1).max(50).optional() }).parse(req.query);
    const sessions = await exerciseHistory(db, me(req), idOf(req));
    const suggestion = suggestProgression({
      sessions: sessions.slice(0, 5).map((s) => ({ date: s.startedAt.toISOString(), sets: s.sets })),
      ...(q.targetReps ? { targetReps: q.targetReps } : {}),
      painReportedRecently: await painReportedRecently(db, me(req)),
    });
    return { ...suggestion, basedOnSessions: Math.min(sessions.length, 5) };
  });

  app.post("/api/v1/training/wellness", authed, async (req) => saveWellness(db, me(req), wellnessBody.parse(req.body)));
  app.get("/api/v1/training/wellness", authed, async (req) => wellnessStatus(db, me(req)));

  registerDeviceRoutes(app, db);
}
