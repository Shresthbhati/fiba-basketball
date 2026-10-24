import { boolean, date, doublePrecision, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

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

/** Basketball Communities & Squad Hubs (WP-5.2, Master Spec §8.3). */
export const communities = pgTable(
  "communities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 120 }).notNull().unique(),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    city: varchar("city", { length: 100 }).notNull(),
    primaryCourtId: uuid("primary_court_id").references(() => courts.id, { onDelete: "set null" }),
    isPrivate: boolean("is_private").notNull().default(false),
    creatorId: uuid("creator_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    memberCount: integer("member_count").notNull().default(1),
    skillLevel: varchar("skill_level", { length: 32 }).notNull().default("OPEN"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("communities_city_idx").on(t.city),
    index("communities_creator_idx").on(t.creatorId),
  ],
);

export const communityMembers = pgTable(
  "community_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id").notNull().references(() => communities.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 32 }).notNull().default("MEMBER"), // LEADER | CO_HOST | MEMBER
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"), // ACTIVE | PENDING | BANNED
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("community_members_comm_user_idx").on(t.communityId, t.userId),
    index("community_members_user_idx").on(t.userId),
  ],
);

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
  communityId: uuid("community_id").references(() => communities.id, { onDelete: "set null" }),
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
    communityId: uuid("community_id").references(() => communities.id, { onDelete: "set null" }),
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
    // Shot coordinates (in meters relative to attacking half court) and spatial zone classification (WP-3.4)
    coordX: doublePrecision("coord_x"),
    coordY: doublePrecision("coord_y"),
    shotZone: text("shot_zone"),
    distanceMeters: doublePrecision("distance_meters"),
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

/** Evidence-linked tactical reports (WP-3.5, Master Spec §6.4, §12). Team-scoped; private to members (ADR-0010). */
export const tacticalReports = pgTable(
  "tactical_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary"),
    createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    blocks: jsonb("blocks").$type<Array<{
      id: string;
      title: string;
      claimType: "OBSERVED" | "DERIVED" | "HYPOTHESIS";
      statement: string;
      sampleSize?: number | undefined;
      confidence?: number | undefined;
      citations: Array<{
        citationType: "CLIP" | "EVENT" | "METRIC";
        targetId: string;
        gameId?: string | undefined;
        timestampMs?: number | undefined;
        note?: string | undefined;
      }>;
    }>>().notNull().default([]),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tactical_reports_team_idx").on(t.teamId),
    index("tactical_reports_created_by_idx").on(t.createdBy),
  ],
);

/** Athlete Career Passport share grants (WP-8.1, Master Spec §11, ADR-0010). Field-level granular privacy grants. */
export const athletePassportGrants = pgTable(
  "athlete_passport_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    label: text("label"),
    includeAverages: boolean("include_averages").notNull().default(true),
    includeShootingSplits: boolean("include_shooting_splits").notNull().default(true),
    includeMinutes: boolean("include_minutes").notNull().default(false),
    includeGameLog: boolean("include_game_log").notNull().default(true),
    includeBiometrics: boolean("include_biometrics").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("athlete_passport_grants_user_idx").on(t.userId),
    uniqueIndex("athlete_passport_grants_token_idx").on(t.token),
  ],
);

/** Verified athlete achievements with issuer provenance (WP-8.2, Master Spec §11). */
export const verifiedAchievements = pgTable(
  "verified_achievements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    competitionId: uuid("competition_id").references(() => competitions.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    category: text("category").notNull(), // AWARD | CHAMPIONSHIP | SELECTION
    issuer: text("issuer").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verified_achievements_user_idx").on(t.userId)],
);

/** Basketball practice drills catalog (WP-4.3, Master Spec §9.2). */
export const practiceDrills = pgTable(
  "practice_drills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: text("category").notNull(), // WARMUP | TECHNICAL | TACTICAL | SCRIMMAGE | COOLDOWN
    intensity: text("intensity").notNull().default("MEDIUM"), // LOW | MEDIUM | HIGH
    suggestedDurationMins: integer("suggested_duration_mins").notNull().default(10),
    brief: text("brief"),
    playId: uuid("play_id").references(() => tacticalPlays.id, { onDelete: "set null" }),
    clipId: uuid("clip_id").references(() => filmClips.id, { onDelete: "set null" }),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("practice_drills_team_idx").on(t.teamId)],
);

/** Sequenced team practice plans (WP-4.3, Master Spec §9.2). Team-scoped (ADR-0010). */
export const practiceSessions = pgTable(
  "practice_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    location: text("location"),
    focus: text("focus"),
    notes: text("notes"),
    blocks: jsonb("blocks").$type<Array<{
      id: string;
      order: number;
      drillId?: string | undefined;
      title: string;
      category: "WARMUP" | "TECHNICAL" | "TACTICAL" | "SCRIMMAGE" | "COOLDOWN";
      durationMins: number;
      notes?: string | undefined;
      playId?: string | undefined;
      clipId?: string | undefined;
    }>>().notNull().default([]),
    totalDurationMins: integer("total_duration_mins").notNull().default(0),
    attendance: jsonb("attendance").$type<Array<{
      userId: string;
      status: "PRESENT" | "ABSENT" | "EXCUSED" | "INJURED";
      note?: string | undefined;
    }>>().notNull().default([]),
    status: text("status").notNull().default("SCHEDULED"), // SCHEDULED | IN_PROGRESS | COMPLETED | CANCELLED
    createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("practice_sessions_team_idx").on(t.teamId),
    index("practice_sessions_scheduled_idx").on(t.scheduledAt),
  ],
);

/** Scouting Montages & Highlight Playlists (WP-3.3, Master Spec §6.5). Team-scoped; private to members (ADR-0010). */
export const scoutingMontages = pgTable(
  "scouting_montages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    items: jsonb("items").$type<Array<{
      clipId: string;
      gameId: string;
      order: number;
      startMs: number;
      endMs: number;
      title?: string | undefined;
      note?: string | undefined;
      tags?: string[] | undefined;
    }>>().notNull().default([]),
    totalDurationMs: integer("total_duration_ms").notNull().default(0),
    createdBy: uuid("created_by").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("scouting_montages_team_idx").on(t.teamId),
    index("scouting_montages_created_by_idx").on(t.createdBy),
  ],
);

/** Film Saved Searches for tactical discovery & film library (WP-3.3). */
export const filmSavedSearches = pgTable(
  "film_saved_searches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    filters: jsonb("filters").$type<{
      q?: string | undefined;
      tag?: string | undefined;
      gameId?: string | undefined;
      minDurationMs?: number | undefined;
      maxDurationMs?: number | undefined;
    }>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("film_saved_searches_team_user_idx").on(t.teamId, t.userId),
  ],
);

/** Biomechanical assessment sharing grants (WP-2.8, Master Spec §4.5, ADR-0009). */
export const assessmentShareGrants = pgTable(
  "assessment_share_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assessmentId: uuid("assessment_id").notNull().references(() => movementAssessments.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    granteeId: uuid("grantee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("COACH"), // COACH | TRAINER | HEALTH_PRO
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("assessment_share_grants_assessment_grantee_idx").on(t.assessmentId, t.granteeId),
    index("assessment_share_grants_grantee_idx").on(t.granteeId),
  ],
);

/** Coach feedback & drill prescriptions for movement assessments (WP-2.8, Master Spec §4.6). */
export const assessmentCoachFeedback = pgTable(
  "assessment_coach_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assessmentId: uuid("assessment_id").notNull().references(() => movementAssessments.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    authorRole: text("author_role").notNull().default("COACH"),
    notes: text("notes").notNull(),
    cues: jsonb("cues").$type<string[]>().notNull().default([]),
    suggestedDrillId: uuid("suggested_drill_id").references(() => practiceDrills.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("assessment_coach_feedback_assessment_idx").on(t.assessmentId),
  ],
);/** Coach assignments for film study, drills, workouts & movement tests (WP-4.4, Master Spec §9.3). */
export const coachAssignments = pgTable(
  "coach_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    coachId: uuid("coach_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    type: text("type").notNull(), // FILM_STUDY | DRILL_PRACTICE | WORKOUT_PRESCRIPTION | MOVEMENT_ASSESSMENT
    priority: text("priority").notNull().default("NORMAL"), // LOW | NORMAL | HIGH | URGENT
    dueAt: timestamp("due_at", { withTimezone: true }),
    resourceRef: jsonb("resource_ref").$type<{
      type: "FILM_CLIP" | "SCOUTING_MONTAGE" | "TACTICAL_PLAY" | "PRACTICE_DRILL" | "ASSESSMENT" | "WORKOUT";
      id: string;
      title?: string | undefined;
    }>(),
    quizQuestions: jsonb("quiz_questions").$type<Array<{
      id: string;
      question: string;
      options: string[];
      correctOptionIndex: number;
    }>>().notNull().default([]),
    targetAthleteIds: jsonb("target_athlete_ids").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | ARCHIVED
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("coach_assignments_team_idx").on(t.teamId),
    index("coach_assignments_coach_idx").on(t.coachId),
  ],
);

/** Athlete submissions and coach reviews for coach assignments (WP-4.4 / WP-4.5, Master Spec §9.3). */
export const assignmentSubmissions = pgTable(
  "assignment_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id").notNull().references(() => coachAssignments.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("SUBMITTED"), // SUBMITTED | REVIEWED | REVISION_REQUESTED
    answers: jsonb("answers").$type<{
      selectedOptions?: Record<string, number> | undefined;
      athleteNotes?: string | undefined;
      resourceId?: string | undefined;
    }>().notNull().default({}),
    score: integer("score"),
    coachNotes: text("coach_notes"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("assignment_submissions_assignment_athlete_idx").on(t.assignmentId, t.athleteId),
    index("assignment_submissions_athlete_idx").on(t.athleteId),
  ],
);

/** Standardized athletic testing protocols (WP-6.2, Master Spec §5.4). */
export const athleticTestProtocols = pgTable(
  "athletic_test_protocols",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 64 }).notNull().unique(),
    name: varchar("name", { length: 120 }).notNull(),
    category: varchar("category", { length: 32 }).notNull(), // JUMP | SPEED | AGILITY | CONDITIONING
    description: text("description").notNull(),
    primaryMetricUnit: varchar("primary_metric_unit", { length: 16 }).notNull(), // cm | seconds | level_shuttle
    sortDirection: varchar("sort_direction", { length: 8 }).notNull().default("DESC"), // DESC | ASC
    equipmentRequirements: text("equipment_requirements").notNull(),
    warmupRecommendations: text("warmup_recommendations").notNull(),
    standardAttempts: integer("standard_attempts").notNull().default(3),
    isCombineCore: boolean("is_combine_core").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

/** Athletic test sessions grouping combine tests on a given date (WP-6.2, Master Spec §5.4). */
export const athleticTestSessions = pgTable(
  "athletic_test_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    conductedByUserId: uuid("conducted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    testDate: date("test_date", { mode: "string" }).notNull(),
    location: varchar("location", { length: 120 }),
    surface: varchar("surface", { length: 32 }).notNull().default("HARDWOOD"),
    environmentalNotes: text("environmental_notes"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("athletic_test_sessions_user_idx").on(t.userId),
    index("athletic_test_sessions_team_idx").on(t.teamId),
    index("athletic_test_sessions_date_idx").on(t.testDate),
  ],
);

/** Individual test attempts with instrument metadata and source provenance (WP-6.2, ADR-0008). */
export const athleticTestAttempts = pgTable(
  "athletic_test_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull().references(() => athleticTestSessions.id, { onDelete: "cascade" }),
    protocolId: uuid("protocol_id").notNull().references(() => athleticTestProtocols.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    rawValue: doublePrecision("raw_value").notNull(),
    isFault: boolean("is_fault").notNull().default(false),
    faultReason: varchar("fault_reason", { length: 120 }),
    instrumentType: varchar("instrument_type", { length: 32 }).notNull().default("VERTEC_VANES"),
    instrumentDetails: jsonb("instrument_details").$type<{
      model?: string | undefined;
      serialNumber?: string | undefined;
      beamHeightCm?: number | undefined;
      calibrationDate?: string | undefined;
    }>().notNull().default({}),
    sourceType: varchar("source_type", { length: 32 }).notNull().default("SELF_REPORTED"),
    confidence: doublePrecision("confidence").notNull().default(1.0),
    notes: varchar("notes", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("athletic_test_attempts_session_idx").on(t.sessionId),
    index("athletic_test_attempts_protocol_idx").on(t.protocolId),
  ],
);

export interface PrescribedExerciseItem {
  exerciseId?: string | undefined;
  exerciseSlug: string;
  exerciseName: string;
  orderIndex: number;
  targetSets: number;
  targetReps: number;
  targetRpe?: number | undefined;
  restSeconds?: number | undefined;
  notes?: string | undefined;
}

/** Basketball-specific periodized training programs (WP-6.1, Master Spec §5). */
export const trainingPrograms = pgTable(
  "training_programs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 80 }).notNull().unique(),
    name: varchar("name", { length: 150 }).notNull(),
    phase: varchar("phase", { length: 32 }).notNull(), // OFF_SEASON | PRE_SEASON | IN_SEASON | TOURNAMENT_PEAK
    description: text("description").notNull(),
    durationWeeks: integer("duration_weeks").notNull().default(4),
    daysPerWeek: integer("days_per_week").notNull().default(3),
    targetLevel: varchar("target_level", { length: 32 }).notNull().default("INTERMEDIATE"), // BEGINNER | INTERMEDIATE | ADVANCED | ELITE
    primaryGoal: varchar("primary_goal", { length: 64 }).notNull(), // VERTICAL_POWER | HYPERTROPHY_BASE | REPEAT_SPRINT_ABILITY | FATIGUE_MANAGEMENT | TOURNAMENT_READINESS
    isTemplate: boolean("is_template").notNull().default(true),
    creatorId: uuid("creator_id").references(() => users.id, { onDelete: "set null" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    reviewed: boolean("reviewed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("training_programs_phase_idx").on(t.phase),
    index("training_programs_team_idx").on(t.teamId),
  ],
);

/** Prescribed workout days within a periodized training program (WP-6.1). */
export const trainingProgramWorkouts = pgTable(
  "training_program_workouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id").notNull().references(() => trainingPrograms.id, { onDelete: "cascade" }),
    weekNumber: integer("week_number").notNull(),
    dayNumber: integer("day_number").notNull(),
    title: varchar("title", { length: 150 }).notNull(),
    focus: varchar("focus", { length: 64 }).notNull(),
    estimatedDurationMin: integer("estimated_duration_min").notNull().default(45),
    exercisesPrescription: jsonb("exercises_prescription").$type<PrescribedExerciseItem[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("training_program_workouts_program_idx").on(t.programId, t.weekNumber, t.dayNumber),
  ],
);

/** Athlete enrollments and adherence tracking for training programs (WP-6.1). */
export const programEnrollments = pgTable(
  "program_enrollments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    programId: uuid("program_id").notNull().references(() => trainingPrograms.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    assignedByUserId: uuid("assigned_by_user_id").references(() => users.id, { onDelete: "set null" }),
    startDate: date("start_date", { mode: "string" }).notNull(),
    currentWeek: integer("current_week").notNull().default(1),
    status: varchar("status", { length: 32 }).notNull().default("ACTIVE"), // ACTIVE | PAUSED | COMPLETED | CANCELLED
    completedWorkoutIds: jsonb("completed_workout_ids").$type<string[]>().notNull().default([]),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("program_enrollments_athlete_idx").on(t.athleteId, t.status),
    index("program_enrollments_program_idx").on(t.programId),
  ],
);






/** Basketball Opportunities & Tryout Board (WP-8.3, Master Spec §11.2). */
export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 180 }).notNull(),
    type: varchar("type", { length: 40 }).notNull(), // TEAM_TRYOUT | OPEN_RUN | SHOWCASE_CAMP | COLLEGE_RECRUITING_COMBINE | PRO_CONTRACT_TRIAL
    organizationName: varchar("organization_name", { length: 120 }).notNull(),
    organizationId: uuid("organization_id"),
    creatorId: uuid("creator_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    requirements: text("requirements"),
    verificationStatus: varchar("verification_status", { length: 32 }).notNull().default("COMMUNITY"), // COMMUNITY | VERIFIED | FEATURED | REJECTED | EXPIRED
    locationName: varchar("location_name", { length: 120 }).notNull(),
    address: varchar("address", { length: 255 }),
    city: varchar("city", { length: 100 }).notNull(),
    country: varchar("country", { length: 64 }).notNull().default("USA"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    applicationDeadline: timestamp("application_deadline", { withTimezone: true }),
    costCents: integer("cost_cents").notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    contactEmail: varchar("contact_email", { length: 255 }).notNull(),
    contactPhone: varchar("contact_phone", { length: 64 }),
    ageGroup: varchar("age_group", { length: 32 }).notNull().default("OPEN"), // U14 | U16 | U18 | U20 | SENIOR | OPEN
    minAge: integer("min_age"),
    maxAge: integer("max_age"),
    gender: varchar("gender", { length: 16 }).notNull().default("COED"), // MEN | WOMEN | COED
    positions: jsonb("positions").$type<string[]>().notNull().default(["ALL"]),
    skillLevel: varchar("skill_level", { length: 32 }).notNull().default("OPEN"), // RECREATIONAL | INTERMEDIATE | ADVANCED | ELITE | COLLEGIATE_PRO
    capacity: integer("capacity"),
    isPublic: boolean("is_public").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("opportunities_type_idx").on(t.type),
    index("opportunities_city_idx").on(t.city),
    index("opportunities_verification_idx").on(t.verificationStatus),
    index("opportunities_creator_idx").on(t.creatorId),
  ],
);

/** Athlete Applications for Opportunities & Tryouts (WP-8.3, Master Spec §11.2, §14.1). */
export const opportunityApplications = pgTable(
  "opportunity_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 32 }).notNull().default("SUBMITTED"), // SUBMITTED | UNDER_REVIEW | INVITED | WAITLISTED | DECLINED
    passportToken: varchar("passport_token", { length: 100 }), // Optional link to career passport grant (WP-8.1)
    primaryPosition: varchar("primary_position", { length: 8 }).notNull().default("G"),
    heightCm: integer("height_cm"),
    weightKg: integer("weight_kg"),
    graduationYear: integer("graduation_year"),
    currentTeam: varchar("current_team", { length: 120 }),
    notes: text("notes"),
    guardianConsentGranted: boolean("guardian_consent_granted").notNull().default(false), // Required for minors <18
    guardianName: varchar("guardian_name", { length: 120 }),
    guardianEmail: varchar("guardian_email", { length: 255 }),
    reviewerNotes: text("reviewer_notes"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("opportunity_applications_opp_idx").on(t.opportunityId, t.status),
    index("opportunity_applications_athlete_idx").on(t.athleteId),
  ],
);

/** Scout / Recruiter Profiles (WP-8.4, Master Spec §11.3). */
export const scoutProfiles = pgTable(
  "scout_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
    organization: varchar("organization", { length: 120 }).notNull(),
    roleTitle: varchar("role_title", { length: 100 }).notNull(),
    credentialsVerified: boolean("credentials_verified").notNull().default(false),
    verifiedByUserId: uuid("verified_by_user_id").references(() => users.id, { onDelete: "set null" }),
    active: boolean("active").notNull().default(true),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("scout_profiles_user_idx").on(t.userId)],
);

/** Scout Talent Shortlists (WP-8.4, Master Spec §11.4). Private to the scout (ADR-0010). */
export const scoutShortlists = pgTable(
  "scout_shortlists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scoutId: uuid("scout_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    isSharedWithOrg: boolean("is_shared_with_org").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("scout_shortlists_scout_idx").on(t.scoutId)],
);

/** Athletes added to a Scout Shortlist (WP-8.4). */
export const scoutShortlistMembers = pgTable(
  "scout_shortlist_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shortlistId: uuid("shortlist_id").notNull().references(() => scoutShortlists.id, { onDelete: "cascade" }),
    athleteId: uuid("athlete_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    evaluationTier: varchar("evaluation_tier", { length: 32 }).notNull().default("WATCHLIST"), // WATCHLIST | HIGH_PRIORITY | CONTACTED | OFFERED | COMMITTED | PASSED
    scoutNotes: text("scout_notes"),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("scout_shortlist_members_list_idx").on(t.shortlistId),
    index("scout_shortlist_members_athlete_idx").on(t.athleteId),
  ],
);

/** Host Reliability Ratings & Post-Run Feedback (WP-5.3, Master Spec §8.2, §11.4). */
export const hostReviews = pgTable(
  "host_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gameId: uuid("game_id").notNull().references(() => pickupGames.id, { onDelete: "cascade" }),
    hostId: uuid("host_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    reviewerId: uuid("reviewer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    runHappened: boolean("run_happened").notNull().default(true),
    rating: integer("rating").notNull().default(5),
    punctuality: varchar("punctuality", { length: 32 }).notNull().default("ON_TIME"), // ON_TIME | SLIGHTLY_LATE | NO_SHOW
    competitionMatched: boolean("competition_matched").notNull().default(true),
    feedbackNotes: text("feedback_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("host_reviews_game_reviewer_idx").on(t.gameId, t.reviewerId),
    index("host_reviews_host_idx").on(t.hostId),
  ],
);

/** Privacy-Preserving Court Activity Logs & Headcount Tracking (WP-5.4, Master Spec §8.1). */
export const courtActivityCheckIns = pgTable(
  "court_activity_check_ins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courtId: uuid("court_id").notNull().references(() => courts.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }).notNull().defaultNow(),
    headcountEstimate: integer("headcount_estimate").notNull().default(5),
    conditionReport: varchar("condition_report", { length: 32 }).notNull().default("GOOD"), // EXCELLENT | GOOD | FAIR | WET_SLIPPERY | DAMAGED_HOOP
    notes: text("notes"),
  },
  (t) => [
    index("court_activity_check_ins_court_idx").on(t.courtId, t.checkedInAt),
    index("court_activity_check_ins_user_idx").on(t.userId),
  ],
);

/** Free Agent Listings for Pickup-to-Team Pathway (WP-5.5, Master Spec §8.4, §11.4). */
export const freeAgentListings = pgTable(
  "free_agent_listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    city: varchar("city", { length: 100 }).notNull(),
    primaryPosition: varchar("primary_position", { length: 10 }).notNull(),
    secondaryPositions: jsonb("secondary_positions").$type<string[]>().notNull().default([]),
    skillLevel: varchar("skill_level", { length: 30 }).notNull().default("OPEN"),
    experienceYears: integer("experience_years").notNull().default(0),
    availability: varchar("availability", { length: 50 }).notNull().default("ANYTIME"),
    bio: text("bio"),
    status: varchar("status", { length: 20 }).notNull().default("ACTIVE"), // ACTIVE | MATCHED | INACTIVE
    linkedCommunityId: uuid("linked_community_id").references(() => communities.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_free_agents_city").on(t.city),
    index("idx_free_agents_position").on(t.primaryPosition),
    index("idx_free_agents_status").on(t.status),
    index("idx_free_agents_user").on(t.userId),
  ],
);

/** Team Invitations for Free Agents & Pickup Ballers (WP-5.5, Master Spec §8.4). */
export const teamInvitations = pgTable(
  "team_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    inviterId: uuid("inviter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull().default("PLAYER"),
    message: text("message"),
    status: varchar("status", { length: 20 }).notNull().default("PENDING"), // PENDING | ACCEPTED | DECLINED | CANCELLED
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (t) => [
    index("idx_team_invitations_team").on(t.teamId),
    index("idx_team_invitations_user").on(t.userId),
    index("idx_team_invitations_status").on(t.status),
  ],
);

/** Competition Draft Pool for Unsigned Players (WP-5.5, Master Spec §8.4, §11.4). */
export const competitionDraftPool = pgTable(
  "competition_draft_pool",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitionId: uuid("competition_id").notNull().references(() => competitions.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    primaryPosition: varchar("primary_position", { length: 10 }).notNull(),
    skillLevel: varchar("skill_level", { length: 30 }).notNull().default("OPEN"),
    draftStatus: varchar("draft_status", { length: 20 }).notNull().default("UNDRAFTED"), // UNDRAFTED | DRAFTED | WITHDRAWN
    draftedByTeamId: uuid("drafted_by_team_id").references(() => teams.id, { onDelete: "set null" }),
    draftRound: integer("draft_round"),
    draftPick: integer("draft_pick"),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
    draftedAt: timestamp("drafted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("uq_draft_pool_comp_user").on(t.competitionId, t.userId),
    index("idx_draft_pool_comp").on(t.competitionId),
    index("idx_draft_pool_user").on(t.userId),
    index("idx_draft_pool_status").on(t.draftStatus),
  ],
);


/** Match Pre-game Safety & Protocol Checklists (Spec §23.2, §16.4). */
export const matchPregameChecklists = pgTable(
  "match_pregame_checklists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    refereeId: uuid("referee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    courtSurfaceSafe: boolean("court_surface_safe").notNull().default(false),
    perimeterRunoffClear: boolean("perimeter_runoff_clear").notNull().default(false),
    gameBallPressureChecked: boolean("game_ball_pressure_checked").notNull().default(false),
    gameClockTested: boolean("game_clock_tested").notNull().default(false),
    shotClockTested: boolean("shot_clock_tested").notNull().default(false),
    jerseyContrastVerified: boolean("jersey_contrast_verified").notNull().default(false),
    tableCrewConfirmed: boolean("table_crew_confirmed").notNull().default(false),
    notes: text("notes"),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_pregame_match_ref").on(t.matchId, t.refereeId),
    index("idx_pregame_match").on(t.matchId),
    index("idx_pregame_ref").on(t.refereeId),
  ],
);

/** Match Disciplinary & Incident Reports (Spec §23.2, §16.4). */
export const matchIncidentReports = pgTable(
  "match_incident_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    reporterId: uuid("reporter_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    incidentType: varchar("incident_type", { length: 30 }).notNull(), // TECHNICAL_FOUL | UNSPORTSMANLIKE_FOUL | DISQUALIFYING_FOUL | EJECTION | PROTEST | DELAY_INCIDENT
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    playerId: uuid("player_id").references(() => users.id, { onDelete: "set null" }),
    period: integer("period"),
    gameClockTime: varchar("game_clock_time", { length: 10 }),
    description: text("description").notNull(),
    ruleReference: varchar("rule_reference", { length: 50 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_incidents_match").on(t.matchId),
    index("idx_incidents_reporter").on(t.reporterId),
  ],
);

/** Match Official Sign-offs & Lock Authorization (Spec §23.2, §16.4). */
export const matchOfficialSignoffs = pgTable(
  "match_official_signoffs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matchId: uuid("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    refereeId: uuid("referee_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    isCrewChief: boolean("is_crew_chief").notNull().default(false),
    finalScoreVerified: boolean("final_score_verified").notNull().default(true),
    scorebookAudited: boolean("scorebook_audited").notNull().default(true),
    refereeNotes: text("referee_notes"),
    signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_signoff_match_ref").on(t.matchId, t.refereeId),
    index("idx_signoffs_match").on(t.matchId),
    index("idx_signoffs_ref").on(t.refereeId),
  ],
);


/** Facility Operator Claims (Spec §8.3, §23.1). */
export const facilityClaims = pgTable(
  "facility_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courtId: uuid("court_id").notNull().references(() => courts.id, { onDelete: "cascade" }),
    operatorId: uuid("operator_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    businessName: text("business_name").notNull(),
    contactEmail: text("contact_email").notNull(),
    contactPhone: text("contact_phone"),
    status: varchar("status", { length: 20 }).notNull().default("PENDING"), // PENDING | APPROVED | REJECTED
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_facility_claims_court_operator").on(t.courtId, t.operatorId),
    index("idx_facility_claims_court").on(t.courtId),
    index("idx_facility_claims_operator").on(t.operatorId),
  ],
);

/** Court Operating Hours & Slot Pricing (Spec §8.3, §23.1). */
export const courtOperatingHours = pgTable(
  "court_operating_hours",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courtId: uuid("court_id").notNull().references(() => courts.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(), // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    openTime: varchar("open_time", { length: 5 }).notNull(), // "08:00"
    closeTime: varchar("close_time", { length: 5 }).notNull(), // "22:00"
    slotDurationMinutes: integer("slot_duration_minutes").notNull().default(60),
    hourlyRateCents: integer("hourly_rate_cents").notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    isClosed: boolean("is_closed").notNull().default(false),
  },
  (t) => [
    uniqueIndex("uq_operating_hours_court_day").on(t.courtId, t.dayOfWeek),
    index("idx_operating_hours_court").on(t.courtId),
  ],
);

/** Court Slot Reservations (Spec §8.3, §23.1). */
export const courtReservations = pgTable(
  "court_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courtId: uuid("court_id").notNull().references(() => courts.id, { onDelete: "cascade" }),
    bookedById: uuid("booked_by_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    endTime: timestamp("end_time", { withTimezone: true }).notNull(),
    purpose: varchar("purpose", { length: 30 }).notNull().default("PICKUP_RUN"), // LEAGUE_MATCH | TEAM_PRACTICE | PICKUP_RUN | TRAINING | COMMUNITY_EVENT | OTHER
    status: varchar("status", { length: 20 }).notNull().default("CONFIRMED"), // PENDING | CONFIRMED | CANCELLED | COMPLETED
    totalPriceCents: integer("total_price_cents").notNull().default(0),
    notes: text("notes"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancellationReason: text("cancellation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_reservations_court_time").on(t.courtId, t.startTime),
    index("idx_reservations_user").on(t.bookedById),
  ],
);

/** Court Maintenance Logs (Spec §8.3, §23.1). */
export const courtMaintenanceLogs = pgTable(
  "court_maintenance_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courtId: uuid("court_id").notNull().references(() => courts.id, { onDelete: "cascade" }),
    loggedById: uuid("logged_by_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    category: varchar("category", { length: 40 }).notNull(), // SURFACE_RESURFACING | RIM_REPLACEMENT | NET_REPLACEMENT | BACKBOARD_INSPECTION | LIGHTING_REPAIR | COURT_STRIPING | GENERAL_CLEANING | SAFETY_AUDIT
    description: text("description").notNull(),
    severity: varchar("severity", { length: 30 }).notNull().default("ROUTINE"), // ROUTINE | RECOMMENDED | URGENT_SAFETY_HAZARD
    costCents: integer("cost_cents").notNull().default(0),
    performedAt: timestamp("performed_at", { withTimezone: true }).notNull(),
    nextInspectionDue: timestamp("next_inspection_due", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_maintenance_court").on(t.courtId),
    index("idx_maintenance_performed").on(t.courtId, t.performedAt),
  ],
);


/** Minor Emergency Contacts & Medical Info (Spec §14.1, §23.4). */
export const minorEmergencyContacts = pgTable(
  "minor_emergency_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    minorId: uuid("minor_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    primaryContactName: text("primary_contact_name").notNull(),
    primaryContactPhone: text("primary_contact_phone").notNull(),
    primaryContactRelationship: varchar("primary_contact_relationship", { length: 40 }).notNull().default("PARENT"),
    secondaryContactName: text("secondary_contact_name"),
    secondaryContactPhone: text("secondary_contact_phone"),
    secondaryContactRelationship: varchar("secondary_contact_relationship", { length: 40 }),
    medicalNotes: text("medical_notes"),
    updatedById: uuid("updated_by_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_emergency_minor").on(t.minorId),
    index("idx_emergency_minor").on(t.minorId),
  ],
);

/** Guardian Safety Settings & Lock Status (Spec §14.1, §23.4). */
export const guardianSafetySettings = pgTable(
  "guardian_safety_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    guardianId: uuid("guardian_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    minorId: uuid("minor_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    notifyOnPickupJoin: boolean("notify_on_pickup_join").notNull().default(true),
    notifyOnTournamentRoster: boolean("notify_on_tournament_roster").notNull().default(true),
    notifyOnCheckin: boolean("notify_on_checkin").notNull().default(true),
    safetyLockActive: boolean("safety_lock_active").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_safety_guardian_minor").on(t.guardianId, t.minorId),
    index("idx_safety_guardian").on(t.guardianId),
    index("idx_safety_minor").on(t.minorId),
  ],
);

/** Minor Activity Check-Ins & Parent Acknowledgements (Spec §14.1, §23.4). */
export const minorActivityCheckins = pgTable(
  "minor_activity_checkins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    minorId: uuid("minor_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    activityType: varchar("activity_type", { length: 30 }).notNull(), // PICKUP_GAME | TOURNAMENT_MATCH | TEAM_PRACTICE
    activityId: text("activity_id").notNull(),
    courtName: text("court_name").notNull(),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }).notNull().defaultNow(),
    parentAcknowledgedAt: timestamp("parent_acknowledged_at", { withTimezone: true }),
    parentAcknowledgedBy: uuid("parent_acknowledged_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    index("idx_minor_checkins").on(t.minorId),
  ],
);
