export type Exercise = { id: string; slug: string; name: string; category: string; equipment: string[]; cues: string; safetyNotes: string; reviewed: boolean };
export type SetRow = { id: string; exerciseId: string; setNumber: number; reps: number; loadKg: number | null; rpe: number | null; clientId: string };
export type SessionSummary = { id: string; startedAt: string; endedAt: string | null; notes: string | null; sessionRpe: number | null; setCount: number };
export type SessionDetail = Omit<SessionSummary, "setCount"> & { sets: SetRow[] };
export type Suggestion = { action: "HOLD" | "INCREASE" | "DECREASE" | "INSUFFICIENT_DATA"; suggestedLoadKg?: number; explanation: string; basedOnSessions: number };
export type Wellness = {
  latest: { date: string; fatigue: number | null; soreness: number | null; sleepHours: number | null; painReported: boolean; painNote: string | null } | null;
  trainingPaused: boolean; message: string | null;
};
export type HistoryItem = { sessionId: string; date: string; sets: number; topLoadKg: number | null; repsAtTopLoad: number[] };
export const categoryLabel: Record<string, string> = {
  STRENGTH: "Strength", POWER: "Power", PLYOMETRIC: "Plyometrics", SPEED_AGILITY: "Speed & agility", CONDITIONING: "Conditioning", MOBILITY: "Mobility", CORE: "Core",
};
