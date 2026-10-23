CREATE TABLE IF NOT EXISTS "scouting_montages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text,
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "items" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "total_duration_ms" integer NOT NULL DEFAULT 0,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scouting_montages_team_idx" ON "scouting_montages" ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scouting_montages_created_by_idx" ON "scouting_montages" ("created_by");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "film_saved_searches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "filters" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "film_saved_searches_team_user_idx" ON "film_saved_searches" ("team_id", "user_id");
