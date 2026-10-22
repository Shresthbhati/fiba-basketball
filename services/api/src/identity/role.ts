export const Role = [
  "PLAYER", "COACH", "SC_COACH", "HEALTH_PRO", "TEAM_MANAGER", "ORG_ADMIN", "ORGANIZER", "REFEREE", "SCOREKEEPER",
  "VENUE_MANAGER", "SCOUT", "GUARDIAN", "MEDIA", "SPONSOR", "MODERATOR", "PLATFORM_ADMIN", "MODEL_OPERATOR",
] as const;
export type Role = (typeof Role)[number];
