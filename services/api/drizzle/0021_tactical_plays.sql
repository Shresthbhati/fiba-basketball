CREATE TABLE IF NOT EXISTS "tactical_plays" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" text NOT NULL,
  "description" text,
  "team_id" uuid REFERENCES "teams"("id") ON DELETE SET NULL,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "court_mode" text NOT NULL DEFAULT 'half',
  "category" text NOT NULL DEFAULT 'offense',
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "keyframes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tactical_plays_team_idx" ON "tactical_plays" ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tactical_plays_created_by_idx" ON "tactical_plays" ("created_by");
