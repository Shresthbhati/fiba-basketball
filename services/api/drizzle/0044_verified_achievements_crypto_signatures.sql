ALTER TABLE "verified_achievements"
  ADD COLUMN IF NOT EXISTS "signature" text,
  ADD COLUMN IF NOT EXISTS "evidence_url" text,
  ADD COLUMN IF NOT EXISTS "evidence_ref" text,
  ADD COLUMN IF NOT EXISTS "is_revoked" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "revoked_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "revocation_reason" text,
  ADD COLUMN IF NOT EXISTS "revoked_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verified_achievements_user_revoked_idx" ON "verified_achievements" ("user_id", "is_revoked");
