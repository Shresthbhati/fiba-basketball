CREATE TABLE IF NOT EXISTS "pickup_recruitment_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "pickup_game_id" uuid NOT NULL REFERENCES "pickup_games"("id") ON DELETE CASCADE,
  "coach_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "athlete_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "invite_type" text DEFAULT 'TRYOUT' NOT NULL,
  "message" text NOT NULL,
  "tryout_date" timestamp with time zone,
  "location" text,
  "expires_at" timestamp with time zone NOT NULL,
  "responded_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pickup_recruitment_athlete_idx" ON "pickup_recruitment_invites" ("athlete_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pickup_recruitment_coach_idx" ON "pickup_recruitment_invites" ("coach_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pickup_recruitment_game_idx" ON "pickup_recruitment_invites" ("pickup_game_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pickup_recruitment_team_idx" ON "pickup_recruitment_invites" ("team_id");
