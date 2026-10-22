export type LoggedSet = { reps: number; loadKg: number | null; rpe: number | null };
export type SessionSets = { date: string; sets: LoggedSet[] };

export type Suggestion = {
  action: "HOLD" | "INCREASE" | "DECREASE" | "INSUFFICIENT_DATA";
  suggestedLoadKg?: number;
  explanation: string;
};

export type ProgressionInput = {
  /** Newest session first. Only sessions that contain this exercise. */
  sessions: SessionSets[];
  /** Reps the athlete is aiming for on every working set. */
  targetReps?: number;
  /** Any reported pain or instability in the last 7 days pauses suggestions. */
  painReportedRecently?: boolean;
};

export const RULES = {
  minSessions: 2,
  maxRpeToIncrease: 8,
  /** +2.5%, rounded to the nearest 1.25 kg plate step, never less than one step and never more than 5 kg. */
  increaseFraction: 0.025,
  maxIncreaseKg: 5,
  /** -5% after two sessions in a row that missed the target. */
  decreaseFraction: 0.05,
  step: 1.25,
} as const;

const roundToStep = (kg: number) => Math.round(kg / RULES.step) * RULES.step;
const topLoad = (s: SessionSets) => Math.max(...s.sets.map((x) => x.loadKg ?? 0));
/** Working sets are the ones done at the session's heaviest load. */
const working = (s: SessionSets) => s.sets.filter((x) => (x.loadKg ?? 0) === topLoad(s));

/**
 * Deterministic, explainable load suggestions. It only ever suggests; it never changes a plan by itself.
 * Conservative on purpose: when data is thin, missing, or pain was reported, it holds.
 */
export function suggestProgression({ sessions, targetReps = 8, painReportedRecently = false }: ProgressionInput): Suggestion {
  if (painReportedRecently) {
    return { action: "HOLD", explanation: "You reported pain recently, so load suggestions are paused. Please consider speaking to a qualified professional before continuing." };
  }
  const usable = sessions.filter((s) => s.sets.length > 0);
  if (usable.length < RULES.minSessions) {
    return { action: "INSUFFICIENT_DATA", explanation: `Log at least ${RULES.minSessions} workouts with this exercise before getting a suggestion (you have ${usable.length}).` };
  }
  const [latest, previous] = usable as [SessionSets, SessionSets];
  if (topLoad(latest) <= 0 || topLoad(previous) <= 0) {
    return { action: "INSUFFICIENT_DATA", explanation: "Suggestions need a logged load. Add the weight you used." };
  }
  const load = topLoad(latest);
  const metTarget = (s: SessionSets) => working(s).every((x) => x.reps >= targetReps);
  const missedTarget = (s: SessionSets) => working(s).some((x) => x.reps < targetReps);

  if (missedTarget(latest) && missedTarget(previous)) {
    const lower = roundToStep(load * (1 - RULES.decreaseFraction));
    return {
      action: "DECREASE",
      suggestedLoadKg: Math.max(0, Math.min(lower, load - RULES.step)),
      explanation: `You missed ${targetReps} reps in your last two workouts at around ${load} kg. A small drop lets you rebuild good reps.`,
    };
  }

  if (metTarget(latest) && metTarget(previous)) {
    const rpes = [...working(latest), ...working(previous)].map((x) => x.rpe);
    if (rpes.some((r) => r === null)) {
      return { action: "HOLD", explanation: "You hit your reps twice. Log how hard each set felt (RPE) so we can tell whether it's time to add weight." };
    }
    if (rpes.some((r) => (r as number) > RULES.maxRpeToIncrease)) {
      return { action: "HOLD", explanation: `You hit your reps, but sets felt harder than RPE ${RULES.maxRpeToIncrease}. Stay at ${load} kg until they feel easier.` };
    }
    const raw = Math.min(Math.max(roundToStep(load * RULES.increaseFraction), RULES.step), RULES.maxIncreaseKg);
    return {
      action: "INCREASE",
      suggestedLoadKg: load + raw,
      explanation: `You hit ${targetReps}+ reps at ${load} kg in your last two workouts at RPE ${RULES.maxRpeToIncrease} or easier. Try ${load + raw} kg.`,
    };
  }

  return { action: "HOLD", explanation: `Keep working at ${load} kg until you hit ${targetReps}+ reps on every set in two workouts in a row.` };
}
