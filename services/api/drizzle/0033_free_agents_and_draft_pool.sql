CREATE TABLE IF NOT EXISTS "free_agent_listings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "city" varchar(100) NOT NULL,
  "primary_position" varchar(10) NOT NULL,
  "secondary_positions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "skill_level" varchar(30) DEFAULT 'OPEN' NOT NULL,
  "experience_years" integer DEFAULT 0 NOT NULL,
  "availability" varchar(50) DEFAULT 'ANYTIME' NOT NULL,
  "bio" text,
  "status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
  "linked_community_id" uuid REFERENCES "communities"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_free_agents_city" ON "free_agent_listings" ("city");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_free_agents_position" ON "free_agent_listings" ("primary_position");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_free_agents_status" ON "free_agent_listings" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_free_agents_user" ON "free_agent_listings" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "inviter_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" varchar(20) DEFAULT 'PLAYER' NOT NULL,
  "message" text,
  "status" varchar(20) DEFAULT 'PENDING' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "responded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_team_invitations_team" ON "team_invitations" ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_team_invitations_user" ON "team_invitations" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_team_invitations_status" ON "team_invitations" ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "competition_draft_pool" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "competition_id" uuid NOT NULL REFERENCES "competitions"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "primary_position" varchar(10) NOT NULL,
  "skill_level" varchar(30) DEFAULT 'OPEN' NOT NULL,
  "draft_status" varchar(20) DEFAULT 'UNDRAFTED' NOT NULL,
  "drafted_by_team_id" uuid REFERENCES "teams"("id") ON DELETE SET NULL,
  "draft_round" integer,
  "draft_pick" integer,
  "registered_at" timestamp with time zone DEFAULT now() NOT NULL,
  "drafted_at" timestamp with time zone,
  CONSTRAINT "uq_draft_pool_comp_user" UNIQUE ("competition_id", "user_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_draft_pool_comp" ON "competition_draft_pool" ("competition_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_draft_pool_user" ON "competition_draft_pool" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_draft_pool_status" ON "competition_draft_pool" ("draft_status");
