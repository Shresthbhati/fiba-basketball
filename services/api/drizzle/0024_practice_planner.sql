CREATE TABLE IF NOT EXISTS "practice_drills" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "team_id" uuid REFERENCES "teams"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "category" text NOT NULL,
  "intensity" text NOT NULL DEFAULT 'MEDIUM',
  "suggested_duration_mins" integer NOT NULL DEFAULT 10,
  "brief" text,
  "play_id" uuid REFERENCES "tactical_plays"("id") ON DELETE SET NULL,
  "clip_id" uuid REFERENCES "film_clips"("id") ON DELETE SET NULL,
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_drills_team_idx" ON "practice_drills" ("team_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "practice_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "scheduled_at" timestamp with time zone NOT NULL,
  "location" text,
  "focus" text,
  "notes" text,
  "blocks" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "total_duration_mins" integer NOT NULL DEFAULT 0,
  "attendance" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL DEFAULT 'SCHEDULED',
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_sessions_team_idx" ON "practice_sessions" ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "practice_sessions_scheduled_idx" ON "practice_sessions" ("scheduled_at");
