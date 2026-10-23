CREATE TABLE IF NOT EXISTS "assessment_share_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "assessment_id" uuid NOT NULL REFERENCES "movement_assessments"("id") ON DELETE CASCADE,
  "athlete_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "grantee_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text NOT NULL DEFAULT 'COACH',
  "revoked_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessment_share_grants_assessment_grantee_idx" ON "assessment_share_grants" ("assessment_id", "grantee_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessment_share_grants_grantee_idx" ON "assessment_share_grants" ("grantee_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "assessment_coach_feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "assessment_id" uuid NOT NULL REFERENCES "movement_assessments"("id") ON DELETE CASCADE,
  "author_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "author_role" text NOT NULL DEFAULT 'COACH',
  "notes" text NOT NULL,
  "cues" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "suggested_drill_id" uuid REFERENCES "practice_drills"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessment_coach_feedback_assessment_idx" ON "assessment_coach_feedback" ("assessment_id");
