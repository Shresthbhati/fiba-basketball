CREATE TABLE IF NOT EXISTS "opportunities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" varchar(160) NOT NULL,
  "slug" varchar(180) NOT NULL,
  "type" varchar(40) NOT NULL,
  "organization_name" varchar(120) NOT NULL,
  "organization_id" uuid,
  "creator_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "description" text NOT NULL,
  "requirements" text,
  "verification_status" varchar(32) NOT NULL DEFAULT 'COMMUNITY',
  "location_name" varchar(120) NOT NULL,
  "address" varchar(255),
  "city" varchar(100) NOT NULL,
  "country" varchar(64) NOT NULL DEFAULT 'USA',
  "latitude" double precision,
  "longitude" double precision,
  "start_date" timestamp with time zone,
  "end_date" timestamp with time zone,
  "application_deadline" timestamp with time zone,
  "cost_cents" integer NOT NULL DEFAULT 0,
  "currency" varchar(3) NOT NULL DEFAULT 'USD',
  "contact_email" varchar(255) NOT NULL,
  "contact_phone" varchar(64),
  "age_group" varchar(32) NOT NULL DEFAULT 'OPEN',
  "min_age" integer,
  "max_age" integer,
  "gender" varchar(16) NOT NULL DEFAULT 'COED',
  "positions" jsonb NOT NULL DEFAULT '["ALL"]'::jsonb,
  "skill_level" varchar(32) NOT NULL DEFAULT 'OPEN',
  "capacity" integer,
  "is_public" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunities_type_idx" ON "opportunities" ("type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunities_city_idx" ON "opportunities" ("city");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunities_verification_idx" ON "opportunities" ("verification_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunities_creator_idx" ON "opportunities" ("creator_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "opportunity_applications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "opportunity_id" uuid NOT NULL REFERENCES "opportunities"("id") ON DELETE CASCADE,
  "athlete_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" varchar(32) NOT NULL DEFAULT 'SUBMITTED',
  "passport_token" varchar(100),
  "primary_position" varchar(8) NOT NULL DEFAULT 'G',
  "height_cm" integer,
  "weight_kg" integer,
  "graduation_year" integer,
  "current_team" varchar(120),
  "notes" text,
  "guardian_consent_granted" boolean NOT NULL DEFAULT false,
  "guardian_name" varchar(120),
  "guardian_email" varchar(255),
  "reviewer_notes" text,
  "reviewed_at" timestamp with time zone,
  "reviewed_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunity_applications_opp_idx" ON "opportunity_applications" ("opportunity_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opportunity_applications_athlete_idx" ON "opportunity_applications" ("athlete_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scout_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "organization" varchar(120) NOT NULL,
  "role_title" varchar(100) NOT NULL,
  "credentials_verified" boolean NOT NULL DEFAULT false,
  "verified_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "active" boolean NOT NULL DEFAULT true,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scout_profiles_user_idx" ON "scout_profiles" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scout_shortlists" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "scout_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "description" text,
  "is_shared_with_org" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scout_shortlists_scout_idx" ON "scout_shortlists" ("scout_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scout_shortlist_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "shortlist_id" uuid NOT NULL REFERENCES "scout_shortlists"("id") ON DELETE CASCADE,
  "athlete_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "evaluation_tier" varchar(32) NOT NULL DEFAULT 'WATCHLIST',
  "scout_notes" text,
  "added_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scout_shortlist_members_list_idx" ON "scout_shortlist_members" ("shortlist_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scout_shortlist_members_athlete_idx" ON "scout_shortlist_members" ("athlete_id");
