import type { Role } from "../identity/role.js";

// Deny by default: an action not listed here is allowed for nobody except PLATFORM_ADMIN.
// Add new actions here as modules land.
export const POLICY = {
  "competition:create": ["PLAYER", "COACH", "ORGANIZER", "ORG_ADMIN"],
  "competition:manage": ["ORGANIZER", "ORG_ADMIN"],
  "match:score": ["SCOREKEEPER", "REFEREE", "ORGANIZER"],
  "team:manage": ["COACH", "TEAM_MANAGER", "ORG_ADMIN"],
  "court:verify": ["MODERATOR", "VENUE_MANAGER"],
  "moderation:review": ["MODERATOR"],
  "audit:read": [], // PLATFORM_ADMIN only (always allowed by `decide`)
  "pickup:host": ["PLAYER", "COACH", "ORGANIZER"],
} as const satisfies Record<string, readonly Role[]>;

export type Action = keyof typeof POLICY;
export type ResourceRef = { type: string; id: string };
