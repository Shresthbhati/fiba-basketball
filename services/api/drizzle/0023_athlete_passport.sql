CREATE TABLE IF NOT EXISTS "athlete_passport_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token" text NOT NULL UNIQUE,
  "label" text,
  "include_averages" boolean NOT NULL DEFAULT true,
  "include_shooting_splits" boolean NOT NULL DEFAULT true,
  "include_minutes" boolean NOT NULL DEFAULT false,
  "include_game_log" boolean NOT NULL DEFAULT true,
  "include_biometrics" boolean NOT NULL DEFAULT false,
  "expires_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "athlete_passport_grants_user_idx" ON "athlete_passport_grants" ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "athlete_passport_grants_token_idx" ON "athlete_passport_grants" ("token");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verified_achievements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "competition_id" uuid REFERENCES "competitions"("id") ON DELETE SET NULL,
  "title" text NOT NULL,
  "category" text NOT NULL,
  "issuer" text NOT NULL,
  "verified_at" timestamp with time zone NOT NULL DEFAULT now(),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "verified_achievements_user_idx" ON "verified_achievements" ("user_id");
