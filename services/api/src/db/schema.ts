import { boolean, date, doublePrecision, index, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
