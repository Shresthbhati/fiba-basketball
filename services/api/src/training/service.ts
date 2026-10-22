import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { exerciseSets, exercises, wellnessChecks, workoutSessions } from "../db/schema.js";
import { AuthError } from "../identity/service.js";

const tx = <T>(db: Db, fn: (t: Db) => Promise<T>) =>
  (db as unknown as { transaction: (f: (t: unknown) => Promise<T>) => Promise<T> }).transaction((t) => fn(t as Db));

const num = (v: string | null) => (v === null ? null : Number(v));
const publicSet = (s: typeof exerciseSets.$inferSelect) => ({
  id: s.id, exerciseId: s.exerciseId, setNumber: s.setNumber, reps: s.reps, loadKg: num(s.loadKg), rpe: s.rpe,
  restSeconds: s.restSeconds, clientId: s.clientId,
});
const publicSession = (s: typeof workoutSessions.$inferSelect) => ({
  id: s.id, startedAt: s.startedAt, endedAt: s.endedAt, notes: s.notes, sessionRpe: s.sessionRpe,
});

export async function listExercises(db: Db, category?: string) {
  const rows = await db.select().from(exercises).where(category ? eq(exercises.category, category) : undefined).orderBy(asc(exercises.category), asc(exercises.name));
  return rows.map((e) => ({ id: e.id, slug: e.slug, name: e.name, category: e.category, equipment: e.equipment, cues: e.cues, safetyNotes: e.safetyNotes, reviewed: e.reviewed }));
}

/** Workout data is private: a session that exists but belongs to someone else is indistinguishable from one that doesn't exist. */
async function ownedSession(db: Db, id: string, userId: string) {
  const [s] = await db.select().from(workoutSessions).where(and(eq(workoutSessions.id, id), eq(workoutSessions.userId, userId)));
  if (!s) throw new AuthError(404, "Not Found");
  return s;
}

export async function startSession(db: Db, userId: string, notes?: string) {
  const [s] = await db.insert(workoutSessions).values({ userId, notes: notes ?? null }).returning();
  return publicSession(s!);
}

export async function listSessions(db: Db, userId: string) {
  const rows = await db.select().from(workoutSessions).where(eq(workoutSessions.userId, userId)).orderBy(desc(workoutSessions.startedAt)).limit(50);
  const counts = await db
    .select({ sessionId: exerciseSets.sessionId, n: sql<number>`count(*)::int` })
    .from(exerciseSets).innerJoin(workoutSessions, eq(workoutSessions.id, exerciseSets.sessionId))
    .where(eq(workoutSessions.userId, userId)).groupBy(exerciseSets.sessionId);
  const byId = new Map(counts.map((c) => [c.sessionId, c.n]));
  return rows.map((s) => ({ ...publicSession(s), setCount: byId.get(s.id) ?? 0 }));
}

export async function getSession(db: Db, userId: string, id: string) {
  const s = await ownedSession(db, id, userId);
  const sets = await db.select().from(exerciseSets).where(eq(exerciseSets.sessionId, id)).orderBy(asc(exerciseSets.createdAt));
  return { ...publicSession(s), sets: sets.map(publicSet) };
}

export async function finishSession(db: Db, userId: string, id: string, input: { sessionRpe?: number | undefined; notes?: string | undefined }) {
  const s = await ownedSession(db, id, userId);
  if (s.endedAt) return publicSession(s); // finishing twice is harmless
  const [u] = await db.update(workoutSessions)
    .set({ endedAt: new Date(), sessionRpe: input.sessionRpe ?? null, notes: input.notes ?? s.notes })
    .where(eq(workoutSessions.id, id)).returning();
  return publicSession(u!);
}

export type SetInput = { clientId: string; exerciseId: string; reps: number; loadKg?: number | undefined; rpe?: number | undefined; restSeconds?: number | undefined };

/** Safe to retry: a set with the same clientId is returned instead of being added twice. */
export async function addSet(db: Db, userId: string, sessionId: string, input: SetInput) {
  const session = await ownedSession(db, sessionId, userId);
  if (session.endedAt) throw new AuthError(409, "This workout is finished");
  const [existing] = await db.select().from(exerciseSets).where(eq(exerciseSets.clientId, input.clientId));
  if (existing) {
    if (existing.sessionId !== sessionId) throw new AuthError(409, "That set id is already used");
    return publicSet(existing);
  }
  const [ex] = await db.select({ id: exercises.id }).from(exercises).where(eq(exercises.id, input.exerciseId));
  if (!ex) throw new AuthError(404, "Exercise not found");
  return tx(db, async (t) => {
    const [{ n }] = (await t.select({ n: sql<number>`count(*)::int` }).from(exerciseSets)
      .where(and(eq(exerciseSets.sessionId, sessionId), eq(exerciseSets.exerciseId, input.exerciseId)))) as [{ n: number }];
    const [row] = await t.insert(exerciseSets).values({
      sessionId, exerciseId: input.exerciseId, setNumber: n + 1, reps: input.reps,
      loadKg: input.loadKg === undefined ? null : String(input.loadKg), rpe: input.rpe ?? null,
      restSeconds: input.restSeconds ?? null, clientId: input.clientId,
    }).returning();
    return publicSet(row!);
  });
}

async function ownedSet(db: Db, userId: string, setId: string) {
  const [row] = await db
    .select({ set: exerciseSets, ended: workoutSessions.endedAt })
    .from(exerciseSets).innerJoin(workoutSessions, eq(workoutSessions.id, exerciseSets.sessionId))
    .where(and(eq(exerciseSets.id, setId), eq(workoutSessions.userId, userId)));
  if (!row) throw new AuthError(404, "Not Found");
  return row;
}

export async function updateSet(db: Db, userId: string, setId: string, patch: { reps?: number | undefined; loadKg?: number | null | undefined; rpe?: number | null | undefined }) {
  const { set } = await ownedSet(db, userId, setId);
  const [u] = await db.update(exerciseSets).set({
    ...(patch.reps !== undefined ? { reps: patch.reps } : {}),
    ...(patch.loadKg !== undefined ? { loadKg: patch.loadKg === null ? null : String(patch.loadKg) } : {}),
    ...(patch.rpe !== undefined ? { rpe: patch.rpe } : {}),
  }).where(eq(exerciseSets.id, set.id)).returning();
  return publicSet(u!);
}

export async function deleteSet(db: Db, userId: string, setId: string) {
  const { set } = await ownedSet(db, userId, setId);
  await db.delete(exerciseSets).where(eq(exerciseSets.id, set.id));
}

/** Per-session summary for one exercise, newest first, plus how many sessions it is based on (sample size). */
export async function exerciseHistory(db: Db, userId: string, exerciseId: string) {
  const rows = await db
    .select({ set: exerciseSets, startedAt: workoutSessions.startedAt, sessionId: workoutSessions.id })
    .from(exerciseSets).innerJoin(workoutSessions, eq(workoutSessions.id, exerciseSets.sessionId))
    .where(and(eq(workoutSessions.userId, userId), eq(exerciseSets.exerciseId, exerciseId)))
    .orderBy(desc(workoutSessions.startedAt), asc(exerciseSets.setNumber));
  const sessions = new Map<string, { sessionId: string; startedAt: Date; sets: { reps: number; loadKg: number | null; rpe: number | null }[] }>();
  for (const r of rows) {
    const e = sessions.get(r.sessionId) ?? { sessionId: r.sessionId, startedAt: r.startedAt, sets: [] };
    e.sets.push({ reps: r.set.reps, loadKg: num(r.set.loadKg), rpe: r.set.rpe });
    sessions.set(r.sessionId, e);
  }
  return [...sessions.values()];
}

export async function overview(db: Db, userId: string) {
  const rows = await db
    .select({ exerciseId: exerciseSets.exerciseId, sessions: sql<number>`count(distinct ${exerciseSets.sessionId})::int`, sets: sql<number>`count(*)::int` })
    .from(exerciseSets).innerJoin(workoutSessions, eq(workoutSessions.id, exerciseSets.sessionId))
    .where(eq(workoutSessions.userId, userId)).groupBy(exerciseSets.exerciseId);
  return rows;
}

// ---- wellness (sensitive, optional, private) ----

const today = () => new Date().toISOString().slice(0, 10);

export type WellnessInput = { date?: string | undefined; fatigue?: number | undefined; soreness?: number | undefined; sleepHours?: number | undefined; painReported: boolean; painNote?: string | undefined };

export async function saveWellness(db: Db, userId: string, input: WellnessInput) {
  const date = input.date ?? today();
  const values = {
    userId, date, fatigue: input.fatigue ?? null, soreness: input.soreness ?? null,
    sleepHours: input.sleepHours === undefined ? null : String(input.sleepHours),
    painReported: input.painReported, painNote: input.painReported ? input.painNote ?? null : null,
  };
  await db.insert(wellnessChecks).values(values).onConflictDoUpdate({ target: [wellnessChecks.userId, wellnessChecks.date], set: values });
  return wellnessStatus(db, userId);
}

export const PAUSE_DAYS = 7;
export const PAIN_MESSAGE = "You reported pain. Training suggestions are paused. Please consider speaking to a qualified professional before continuing.";

export async function painReportedRecently(db: Db, userId: string, now = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - (PAUSE_DAYS - 1) * 86_400_000).toISOString().slice(0, 10);
  const rows = await db.select({ id: wellnessChecks.id }).from(wellnessChecks)
    .where(and(eq(wellnessChecks.userId, userId), eq(wellnessChecks.painReported, true), gte(wellnessChecks.date, since))).limit(1);
  return rows.length > 0;
}

export async function wellnessStatus(db: Db, userId: string) {
  const [latest] = await db.select().from(wellnessChecks).where(eq(wellnessChecks.userId, userId)).orderBy(desc(wellnessChecks.date)).limit(1);
  const paused = await painReportedRecently(db, userId);
  return {
    latest: latest ? { date: latest.date, fatigue: latest.fatigue, soreness: latest.soreness, sleepHours: num(latest.sleepHours), painReported: latest.painReported, painNote: latest.painNote } : null,
    trainingPaused: paused,
    message: paused ? PAIN_MESSAGE : null,
  };
}
