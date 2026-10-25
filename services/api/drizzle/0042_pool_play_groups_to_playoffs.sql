ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "group_count" integer DEFAULT 2;
--> statement-breakpoint
ALTER TABLE "competitions" ADD COLUMN IF NOT EXISTS "advance_per_group" integer DEFAULT 2;
--> statement-breakpoint
ALTER TABLE "competition_teams" ADD COLUMN IF NOT EXISTS "group_name" text;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "stage" text DEFAULT 'REGULAR' NOT NULL;
--> statement-breakpoint
ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "group_name" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matches_competition_stage_idx" ON "matches" ("competition_id", "stage");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "competition_teams_group_idx" ON "competition_teams" ("competition_id", "group_name");
