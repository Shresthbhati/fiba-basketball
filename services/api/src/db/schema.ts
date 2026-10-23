import { boolean, date, doublePrecision, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  dateOfBirth: date("date_of_birth", { mode: "string" }).notNull(),
  isMinor: boolean("is_minor").notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  // Opt-out for notification emails (see notifications/email.ts). Under-18 accounts are never emailed regardless.
  emailNotifications: boolean("email_notifications").notNull().default(true),
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

/** A weekly repeating pickup game. Occurrences are real `pickup_games` rows created ahead of time (see pickup/series.ts). */
export const pickupSeries = pgTable("pickup_series", {
  id: uuid("id").primaryKey().defaultRandom(),
  hostId: uuid("host_id").notNull().references(() => users.id),
  courtId: uuid("court_id").notNull().references(() => courts.id),
  title: text("title").notNull(),
  weekday: integer("weekday").notNull(), // 0 = Sunday .. 6 = Saturday, in `timezone`
  startTime: text("start_time").notNull(), // local wall clock "HH:MM"
  durationMin: integer("duration_min").notNull(),
  timezone: text("timezone").notNull(), // IANA name, e.g. "America/New_York"
  capacity: integer("capacity").notNull(),
  skillBand: text("skill_band"),
  active: boolean("active").notNull().default(true),
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
    seriesId: uuid("series_id").references(() => pickupSeries.id),
  },
  (t) => [index("pickup_starts_idx").on(t.startsAt), uniqueIndex("pickup_series_occurrence_idx").on(t.seriesId, t.startsAt)],
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
    // Optional: the rostered player this event is credited to (validated against the team's competition roster).
    playerId: uuid("player_id").references(() => users.id),
    // SUBSTITUTION only: the rostered player leaving the court (player_id is the one coming on). Null for a starter declared on court.
    playerOutId: uuid("player_out_id").references(() => users.id),
    // When the scorer's device recorded the event (client clock). Used to line events up with game film; null if not sent or implausible.
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("match_events_match_idx").on(t.matchId, t.serverSeq)],
);

// One-time links sent by email (password reset, email verification). Only the hash of the token is stored.
export const authTokens = pgTable(
  "auth_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(), // PASSWORD_RESET | EMAIL_VERIFY
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_tokens_user_idx").on(t.userId, t.purpose)],
);

// ---- Strength & conditioning ("Train"). See docs/data-dictionary/training.md ----

// Reference data. `reviewed` stays false until a qualified human has signed the content off.
export const exercises = pgTable("exercises", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  // STRENGTH | POWER | PLYOMETRIC | SPEED_AGILITY | CONDITIONING | MOBILITY | CORE
  category: text("category").notNull(),
  equipment: jsonb("equipment").$type<string[]>().notNull().default([]),
  cues: text("cues").notNull().default(""),
  safetyNotes: text("safety_notes").notNull().default(""),
  reviewed: boolean("reviewed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// PRIVATE to the owner: anyone else gets 404.
export const workoutSessions = pgTable(
  "workout_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    notes: text("notes"),
    sessionRpe: integer("session_rpe"), // 1-10, athlete-reported
  },
  (t) => [index("workout_sessions_user_idx").on(t.userId, t.startedAt)],
);

export const exerciseSets = pgTable(
  "exercise_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull().references(() => workoutSessions.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id").notNull().references(() => exercises.id),
    setNumber: integer("set_number").notNull(),
    reps: integer("reps").notNull(),
    loadKg: numeric("load_kg", { precision: 6, scale: 2 }),
    rpe: integer("rpe"), // 1-10
    restSeconds: integer("rest_seconds"),
    clientId: uuid("client_id").notNull().unique(), // chosen by the device, so retries are idempotent
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("exercise_sets_session_idx").on(t.sessionId), index("exercise_sets_exercise_idx").on(t.exerciseId)],
);

// SENSITIVE, optional, private to the owner. One check-in per user per day.
export const wellnessChecks = pgTable(
  "wellness_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    fatigue: integer("fatigue"), // 1-5
    soreness: integer("soreness"), // 1-5
    sleepHours: numeric("sleep_hours", { precision: 4, scale: 1 }),
    painReported: boolean("pain_reported").notNull().default(false),
    painNote: text("pain_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("wellness_user_date_uq").on(t.userId, t.date)],
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

/** A game's film belongs to one team. Visible only to that team's members (see authz `team:view`). */
export const filmGames = pgTable(
  "film_games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").notNull().references(() => teams.id),
    title: text("title").notNull(),
    opponent: text("opponent"),
    playedOn: date("played_on", { mode: "string" }),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Video is stored outside the database (storage key only). NONE -> READY once the bytes are fully received.
    videoStatus: text("video_status").notNull().default("NONE"),
    videoKey: text("video_key"),
    videoType: text("video_type"),
    videoBytes: integer("video_bytes"),
    // Optional link to the official match. Sync points (event ↔ video position) live in `film_sync_points`.
    matchId: uuid("match_id").references(() => matches.id),
  },
  (t) => [index("film_games_team_idx").on(t.teamId)],
);

export const filmClips = pgTable(
  "film_clips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id").notNull().references(() => filmGames.id, { onDelete: "cascade" }),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    tags: text("tags").array().notNull().default([]),
    note: text("note"),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("film_clips_game_idx").on(t.gameId)],
);

/** In-app notifications. Private to `user_id`; they never name or reveal other users. */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // GAME_CANCELLED | WAITLIST_PROMOTED | ADDED_TO_TEAM
    title: text("title").notNull(),
    link: text("link"), // in-app path, e.g. /pickup/<id>
    data: jsonb("data").$type<Record<string, string>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readAt: timestamp("read_at", { withTimezone: true }),
    // Email delivery: null = not yet handled, SENDING = claimed, SENT, SKIPPED (read/opted out/minor/too old), FAILED (gave up).
    emailState: text("email_state"),
    emailAttempts: integer("email_attempts").notNull().default(0),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

/** A team's players for one competition. A player is on at most one team per competition; jersey numbers are unique within a team. */
export const competitionRosters = pgTable(
  "competition_rosters",
  {
    competitionId: uuid("competition_id").notNull().references(() => competitions.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").notNull().references(() => teams.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    jersey: integer("jersey").notNull(),
    addedBy: uuid("added_by").notNull().references(() => users.id),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.competitionId, t.userId] }),
    uniqueIndex("competition_roster_jersey_idx").on(t.competitionId, t.teamId, t.jersey),
  ],
);

/** "Match event X happened at this position in the video." Each event of the film's match is placed using the nearest point in time. */
export const filmSyncPoints = pgTable(
  "film_sync_points",
  {
    gameId: uuid("game_id").notNull().references(() => filmGames.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull(),
    videoMs: integer("video_ms").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.eventId] })],
);

/** Biomechanical movement assessments (Pillar 1, Master Spec §4, ADR-0006). Private to owner (ADR-0009). */
export const movementAssessments = pgTable(
  "movement_assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    protocol: text("protocol").notNull(), // BODYWEIGHT_SQUAT | COUNTERMOVEMENT_JUMP
    status: text("status").notNull(), // ACCEPTED | NEEDS_REVIEW | ABSTAINED
    sourceType: text("source_type").notNull().default("CV_ESTIMATE"),
    confidence: numeric("confidence", { precision: 4, scale: 3 }),
    modelVersion: text("model_version").notNull().default("court-iq-pose-v1.0"),
    protocolVersion: text("protocol_version").notNull().default("protocol-v1.0"),
    repCount: integer("rep_count").notNull().default(0),
    metrics: jsonb("metrics").$type<Record<string, unknown>>(),
    criteriaUnmeasurable: jsonb("criteria_unmeasurable").$type<string[]>().notNull().default([]),
    feedback: jsonb("feedback").$type<string[]>().notNull().default([]),
    abstainReason: text("abstain_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("movement_assessments_user_idx").on(t.userId, t.createdAt)],
);

/** Tactical Plays & Diagrams (Pillar 4, Master Spec §7, ADR-0007). */
export const tacticalPlays = pgTable(
  "tactical_plays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description"),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
    courtMode: text("court_mode").notNull().default("half"),
    category: text("category").notNull().default("offense"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    keyframes: jsonb("keyframes").$type<Array<{
      step: number;
      description: string;
      tokens: Array<{ id: string; type: string; label: string; x: number; y: number }>;
      actions: Array<{ id: string; type: string; from: { x: number; y: number }; to: { x: number; y: number }; label?: string | undefined }>;
    }>>().notNull().default([]),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tactical_plays_team_idx").on(t.teamId),
    index("tactical_plays_created_by_idx").on(t.createdBy),
  ],
);


