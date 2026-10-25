CREATE TABLE IF NOT EXISTS "scout_evaluations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "scout_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "athlete_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "game_context" varchar(40) DEFAULT 'LIVE_GAME' NOT NULL,
  "match_id" uuid REFERENCES "matches"("id") ON DELETE SET NULL,
  "eval_date" timestamp with time zone DEFAULT now() NOT NULL,
  "projected_role" varchar(50) DEFAULT 'VERSATILE_ROTATION' NOT NULL,
  "player_comparison" text,
  "shooting_present" integer DEFAULT 50 NOT NULL,
  "shooting_future" integer DEFAULT 50 NOT NULL,
  "finishing_present" integer DEFAULT 50 NOT NULL,
  "finishing_future" integer DEFAULT 50 NOT NULL,
  "playmaking_present" integer DEFAULT 50 NOT NULL,
  "playmaking_future" integer DEFAULT 50 NOT NULL,
  "perimeter_defense_present" integer DEFAULT 50 NOT NULL,
  "perimeter_defense_future" integer DEFAULT 50 NOT NULL,
  "interior_defense_present" integer DEFAULT 50 NOT NULL,
  "interior_defense_future" integer DEFAULT 50 NOT NULL,
  "rebounding_present" integer DEFAULT 50 NOT NULL,
  "rebounding_future" integer DEFAULT 50 NOT NULL,
  "athleticism_present" integer DEFAULT 50 NOT NULL,
  "athleticism_future" integer DEFAULT 50 NOT NULL,
  "basketball_iq_present" integer DEFAULT 50 NOT NULL,
  "basketball_iq_future" integer DEFAULT 50 NOT NULL,
  "overall_present" integer DEFAULT 50 NOT NULL,
  "overall_future" integer DEFAULT 50 NOT NULL,
  "strengths_summary" text NOT NULL,
  "weaknesses_summary" text NOT NULL,
  "swing_skills" text,
  "intangibles_notes" text,
  "is_shared_with_org" boolean DEFAULT false NOT NULL,
  "organization" varchar(120),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scout_evaluations_scout_idx" ON "scout_evaluations" ("scout_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scout_evaluations_athlete_idx" ON "scout_evaluations" ("athlete_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scout_evaluations_org_idx" ON "scout_evaluations" ("organization");
