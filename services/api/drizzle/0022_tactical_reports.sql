CREATE TABLE IF NOT EXISTS "tactical_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "summary" text,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "tags" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "blocks" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tactical_reports_team_idx" ON "tactical_reports" ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tactical_reports_created_by_idx" ON "tactical_reports" ("created_by");
