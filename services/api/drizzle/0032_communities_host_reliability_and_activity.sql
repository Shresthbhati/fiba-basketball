CREATE TABLE IF NOT EXISTS "communities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" varchar(120) NOT NULL UNIQUE,
  "name" varchar(120) NOT NULL,
  "description" text,
  "city" varchar(100) NOT NULL,
  "primary_court_id" uuid REFERENCES "courts"("id") ON DELETE SET NULL,
  "is_private" boolean NOT NULL DEFAULT false,
  "creator_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "member_count" integer NOT NULL DEFAULT 1,
  "skill_level" varchar(32) NOT NULL DEFAULT 'OPEN',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "communities_city_idx" ON "communities" ("city");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "communities_creator_idx" ON "communities" ("creator_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "community_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "community_id" uuid NOT NULL REFERENCES "communities"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" varchar(32) NOT NULL DEFAULT 'MEMBER',
  "status" varchar(32) NOT NULL DEFAULT 'ACTIVE',
  "joined_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "community_members_comm_user_idx" ON "community_members" ("community_id", "user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "community_members_user_idx" ON "community_members" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "host_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "game_id" uuid NOT NULL REFERENCES "pickup_games"("id") ON DELETE CASCADE,
  "host_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reviewer_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "run_happened" boolean NOT NULL DEFAULT true,
  "rating" integer NOT NULL DEFAULT 5,
  "punctuality" varchar(32) NOT NULL DEFAULT 'ON_TIME',
  "competition_matched" boolean NOT NULL DEFAULT true,
  "feedback_notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "host_reviews_game_reviewer_idx" ON "host_reviews" ("game_id", "reviewer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "host_reviews_host_idx" ON "host_reviews" ("host_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "court_activity_check_ins" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "court_id" uuid NOT NULL REFERENCES "courts"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "checked_in_at" timestamp with time zone NOT NULL DEFAULT now(),
  "headcount_estimate" integer NOT NULL DEFAULT 5,
  "condition_report" varchar(32) NOT NULL DEFAULT 'GOOD',
  "notes" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "court_activity_check_ins_court_idx" ON "court_activity_check_ins" ("court_id", "checked_in_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "court_activity_check_ins_user_idx" ON "court_activity_check_ins" ("user_id");
--> statement-breakpoint
ALTER TABLE "pickup_games" ADD COLUMN IF NOT EXISTS "community_id" uuid REFERENCES "communities"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "pickup_series" ADD COLUMN IF NOT EXISTS "community_id" uuid REFERENCES "communities"("id") ON DELETE SET NULL;
