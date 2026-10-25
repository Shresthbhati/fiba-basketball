CREATE TABLE IF NOT EXISTS "minor_emergency_contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "minor_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "primary_contact_name" text NOT NULL,
  "primary_contact_phone" text NOT NULL,
  "primary_contact_relationship" varchar(40) DEFAULT 'PARENT' NOT NULL,
  "secondary_contact_name" text,
  "secondary_contact_phone" text,
  "secondary_contact_relationship" varchar(40),
  "medical_notes" text,
  "updated_by_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_emergency_minor" UNIQUE ("minor_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_emergency_minor" ON "minor_emergency_contacts" ("minor_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "guardian_safety_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "guardian_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "minor_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "notify_on_pickup_join" boolean DEFAULT true NOT NULL,
  "notify_on_tournament_roster" boolean DEFAULT true NOT NULL,
  "notify_on_checkin" boolean DEFAULT true NOT NULL,
  "safety_lock_active" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_safety_guardian_minor" UNIQUE ("guardian_id", "minor_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_safety_guardian" ON "guardian_safety_settings" ("guardian_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_safety_minor" ON "guardian_safety_settings" ("minor_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "minor_activity_checkins" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "minor_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "activity_type" varchar(30) NOT NULL,
  "activity_id" text NOT NULL,
  "court_name" text NOT NULL,
  "checked_in_at" timestamp with time zone DEFAULT now() NOT NULL,
  "parent_acknowledged_at" timestamp with time zone,
  "parent_acknowledged_by" uuid REFERENCES "users"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_minor_checkins" ON "minor_activity_checkins" ("minor_id");
