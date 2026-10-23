CREATE TABLE IF NOT EXISTS "coach_assignments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "coach_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "title" text NOT NULL,
  "description" text,
  "type" text NOT NULL,
  "priority" text NOT NULL DEFAULT 'NORMAL',
  "due_at" timestamp with time zone,
  "resource_ref" jsonb,
  "quiz_questions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "target_athlete_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coach_assignments_team_idx" ON "coach_assignments" ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "coach_assignments_coach_idx" ON "coach_assignments" ("coach_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assignment_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "assignment_id" uuid NOT NULL REFERENCES "coach_assignments"("id") ON DELETE CASCADE,
  "athlete_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'SUBMITTED',
  "answers" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "score" integer,
  "coach_notes" text,
  "reviewed_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewed_at" timestamp with time zone,
  "submitted_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_submissions_assignment_athlete_idx" ON "assignment_submissions" ("assignment_id", "athlete_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_submissions_athlete_idx" ON "assignment_submissions" ("athlete_id");
