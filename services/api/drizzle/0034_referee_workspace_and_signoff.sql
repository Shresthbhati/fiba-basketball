CREATE TABLE IF NOT EXISTS "match_pregame_checklists" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "match_id" uuid NOT NULL REFERENCES "matches"("id") ON DELETE CASCADE,
  "referee_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "court_surface_safe" boolean DEFAULT false NOT NULL,
  "perimeter_runoff_clear" boolean DEFAULT false NOT NULL,
  "game_ball_pressure_checked" boolean DEFAULT false NOT NULL,
  "game_clock_tested" boolean DEFAULT false NOT NULL,
  "shot_clock_tested" boolean DEFAULT false NOT NULL,
  "jersey_contrast_verified" boolean DEFAULT false NOT NULL,
  "table_crew_confirmed" boolean DEFAULT false NOT NULL,
  "notes" text,
  "completed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_pregame_match_ref" UNIQUE ("match_id", "referee_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pregame_match" ON "match_pregame_checklists" ("match_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pregame_ref" ON "match_pregame_checklists" ("referee_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "match_incident_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "match_id" uuid NOT NULL REFERENCES "matches"("id") ON DELETE CASCADE,
  "reporter_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "incident_type" varchar(30) NOT NULL,
  "team_id" uuid REFERENCES "teams"("id") ON DELETE SET NULL,
  "player_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "period" integer,
  "game_clock_time" varchar(10),
  "description" text NOT NULL,
  "rule_reference" varchar(50),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_incidents_match" ON "match_incident_reports" ("match_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_incidents_reporter" ON "match_incident_reports" ("reporter_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "match_official_signoffs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "match_id" uuid NOT NULL REFERENCES "matches"("id") ON DELETE CASCADE,
  "referee_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "is_crew_chief" boolean DEFAULT false NOT NULL,
  "final_score_verified" boolean DEFAULT true NOT NULL,
  "scorebook_audited" boolean DEFAULT true NOT NULL,
  "referee_notes" text,
  "signed_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_signoff_match_ref" UNIQUE ("match_id", "referee_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_signoffs_match" ON "match_official_signoffs" ("match_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_signoffs_ref" ON "match_official_signoffs" ("referee_id");
