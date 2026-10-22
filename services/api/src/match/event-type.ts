export const EventType = [
  "GAME_START", "GAME_END", "PLAYER_FOUL", "TECHNICAL_FOUL", "TEAM_FOUL", "TIMEOUT", "PERIOD_START", "PERIOD_END",
  "REBOUND", "ASSIST", "TURNOVER", "FIELD_GOAL", "FIELD_GOAL_MISSED", "THREE_POINT", "THREE_POINT_MISSED",
  "FREE_THROW", "FREE_THROW_MISSED", "SUBSTITUTION", "JUMP_BALL", "CLOCK_ADJUST", "CORRECTION",
] as const;
export type EventType = (typeof EventType)[number];

export const POINTS: Partial<Record<EventType, number>> = { FIELD_GOAL: 2, THREE_POINT: 3, FREE_THROW: 1 };

/** Events that belong to one team; the others (clock, period, game start/end, jump ball, corrections) may omit a side. */
export const NEEDS_SIDE: ReadonlySet<EventType> = new Set<EventType>([
  "PLAYER_FOUL", "TECHNICAL_FOUL", "TEAM_FOUL", "TIMEOUT", "REBOUND", "ASSIST", "TURNOVER", "FIELD_GOAL",
  "FIELD_GOAL_MISSED", "THREE_POINT", "THREE_POINT_MISSED", "FREE_THROW", "FREE_THROW_MISSED", "SUBSTITUTION",
]);
