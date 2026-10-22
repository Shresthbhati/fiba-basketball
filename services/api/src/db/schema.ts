import { boolean, date, doublePrecision, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

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
