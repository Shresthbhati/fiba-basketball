export const EventType = [
  "GAME_START", "GAME_END", "PLAYER_FOUL", "TEAM_FOUL", "TIMEOUT", "PERIOD_START", "PERIOD_END",
  "REBOUND", "ASSIST", "TURNOVER", "FIELD_GOAL", "THREE_POINT", "FREE_THROW", "SUBSTITUTION",
] as const;
export type EventType = (typeof EventType)[number];
