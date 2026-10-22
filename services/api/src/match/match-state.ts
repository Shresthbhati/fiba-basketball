export const MatchState = {
  SCHEDULED: "SCHEDULED",
  LIVE: "LIVE",
  FINISHED: "FINISHED",
  LOCKED: "LOCKED",
} as const;
export type MatchState = (typeof MatchState)[keyof typeof MatchState];

const next: Record<MatchState, MatchState | null> = {
  SCHEDULED: "LIVE",
  LIVE: "FINISHED",
  FINISHED: "LOCKED",
  LOCKED: null,
};

export function canTransition(from: MatchState, to: MatchState): boolean {
  return next[from] === to;
}
