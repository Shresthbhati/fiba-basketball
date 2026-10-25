ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "court_name" text;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "estimated_duration_minutes" integer DEFAULT 60 NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_court_scheduled_idx" ON "matches" ("court_name", "scheduled_at");
