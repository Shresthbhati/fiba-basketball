import { boolean, date, doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  dateOfBirth: date("date_of_birth", { mode: "string" }).notNull(),
  isMinor: boolean("is_minor").notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const roleAssignments = pgTable(
  "role_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    // Both null = global role. Otherwise the role only applies to that one resource.
    resourceType: text("resource_type"),
    resourceId: uuid("resource_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("role_assignments_user_idx").on(t.userId)],
);

export const courts = pgTable(
  "courts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    indoor: boolean("indoor").notNull().default(false),
    surface: text("surface"),
    hoops: integer("hoops"),
    lit: boolean("lit"),
    accessNotes: text("access_notes"),
    // UNVERIFIED | COMMUNITY_CONFIRMED | FACILITY_VERIFIED | MODERATOR_VERIFIED
    verificationStatus: text("verification_status").notNull().default("UNVERIFIED"),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("courts_lat_idx").on(t.lat)],
);

export const courtReports = pgTable("court_reports", {
  id: uuid("id").primaryKey().defaultRandom(),
  courtId: uuid("court_id").notNull().references(() => courts.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  kind: text("kind").notNull(), // CLOSED | UNSAFE | WRONG_INFO | OTHER
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pickupGames = pgTable(
  "pickup_games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hostId: uuid("host_id").notNull().references(() => users.id),
    courtId: uuid("court_id").notNull().references(() => courts.id),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    capacity: integer("capacity").notNull(),
    skillBand: text("skill_band"), // self-declared: CASUAL | INTERMEDIATE | COMPETITIVE
    status: text("status").notNull().default("OPEN"), // OPEN | CANCELLED | COMPLETED
    hostConfirmedAt: timestamp("host_confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("pickup_starts_idx").on(t.startsAt)],
);

export const pickupParticipants = pgTable(
  "pickup_participants",
  {
    gameId: uuid("game_id").notNull().references(() => pickupGames.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id),
    status: text("status").notNull(), // CONFIRMED | WAITLIST | CANCELLED
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.userId] })],
);

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const competitions = pgTable("competitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  organizerId: uuid("organizer_id").notNull().references(() => users.id),
  format: text("format").notNull(), // ROUND_ROBIN | SINGLE_ELIMINATION
  status: text("status").notNull().default("DRAFT"), // DRAFT | PUBLISHED | COMPLETED
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const competitionTeams = pgTable(
  "competition_teams",
  {
    competitionId: uuid("competition_id").notNull().references(() => competitions.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").notNull().references(() => teams.id),
    seed: integer("seed"),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.competitionId, t.teamId] })],
);

export const matches = pgTable(
  "matches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitionId: uuid("competition_id").notNull().references(() => competitions.id, { onDelete: "cascade" }),
    round: integer("round").notNull(),
    slot: integer("slot").notNull(),
    homeTeamId: uuid("home_team_id").references(() => teams.id),
    awayTeamId: uuid("away_team_id").references(() => teams.id),
    state: text("state").notNull().default("SCHEDULED"), // SCHEDULED | LIVE | FINISHED | LOCKED
    isBye: boolean("is_bye").notNull().default(false),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    forfeit: boolean("forfeit").notNull().default(false),
    nextMatchId: uuid("next_match_id"),
    nextSide: text("next_side"), // home | away
  },
  (t) => [index("matches_competition_idx").on(t.competitionId)],
);

// Append-only: every entered or corrected result is kept.
export const matchResultLog = pgTable("match_result_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  homeScore: integer("home_score").notNull(),
  awayScore: integer("away_score").notNull(),
  forfeit: boolean("forfeit").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

// The scorebook: an append-only log. The id is chosen by the client so retries are idempotent.
export const matchEvents = pgTable(
  "match_events",
  {
    id: uuid("id").primaryKey(),
    matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    serverSeq: integer("server_seq").notNull(),
    localSeq: integer("local_seq").notNull(),
    type: text("type").notNull(),
    side: text("side"), // home | away
    period: integer("period").notNull(),
    clockSeconds: integer("clock_seconds"),
    correctsEventId: uuid("corrects_event_id"),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("match_events_match_idx").on(t.matchId, t.serverSeq)],
);

// Append-only (a database trigger rejects UPDATE and DELETE). Never store secrets or free-text health data here.
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id),
    action: text("action").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    reason: text("reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_resource_idx").on(t.resourceType, t.resourceId), index("audit_log_actor_idx").on(t.actorId)],
);

export const guardianRelationships = pgTable(
  "guardian_relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    minorId: uuid("minor_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    guardianEmail: text("guardian_email").notNull(),
    guardianId: uuid("guardian_id").references(() => users.id, { onDelete: "cascade" }), // set on acceptance
    status: text("status").notNull().default("PENDING"), // PENDING | ACTIVE | REVOKED
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("guardian_minor_idx").on(t.minorId), index("guardian_email_idx").on(t.guardianEmail)],
);

// A minor's consent only counts while `grantedBy` is an ACTIVE guardian of that minor (checked at read time).
export const consentGrants = pgTable(
  "consent_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subjectId: uuid("subject_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    grantedBy: uuid("granted_by").notNull().references(() => users.id),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("consent_subject_idx").on(t.subjectId, t.kind)],
);

// BLOCK hides both ways; MUTE only hides the muted user from the muter.
export const userBlocks = pgTable(
  "user_blocks",
  {
    blockerId: uuid("blocker_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // BLOCK | MUTE
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })],
);

export const moderationCases = pgTable(
  "moderation_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetType: text("target_type").notNull(), // USER | PICKUP_GAME | COURT
    targetId: uuid("target_id").notNull(),
    status: text("status").notNull().default("OPEN"), // OPEN | RESOLVED | DISMISSED
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolutionNote: text("resolution_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("moderation_status_idx").on(t.status, t.createdAt)],
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseId: uuid("case_id").notNull().references(() => moderationCases.id, { onDelete: "cascade" }),
    reporterId: uuid("reporter_id").notNull().references(() => users.id),
    reason: text("reason").notNull(), // HARASSMENT | UNSAFE | SPAM | IMPERSONATION | INAPPROPRIATE | OTHER
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("reports_one_per_case_idx").on(t.caseId, t.reporterId)],
);
