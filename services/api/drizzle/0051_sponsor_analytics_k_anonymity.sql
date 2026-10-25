CREATE TABLE IF NOT EXISTS "sponsor_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "company_name" text NOT NULL,
  "contact_email" text NOT NULL,
  "brand_category" text NOT NULL,
  "website_url" text,
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sponsor_analytics_grants" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sponsor_id" uuid NOT NULL REFERENCES "sponsor_profiles"("id") ON DELETE CASCADE,
  "court_id" uuid REFERENCES "courts"("id") ON DELETE CASCADE,
  "competition_id" uuid REFERENCES "competitions"("id") ON DELETE CASCADE,
  "scope" text DEFAULT 'COURT' NOT NULL,
  "granted_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sponsor_report_queries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "sponsor_id" uuid REFERENCES "sponsor_profiles"("id") ON DELETE SET NULL,
  "queried_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "query_type" text NOT NULL,
  "resource_id" uuid NOT NULL,
  "k_threshold" integer DEFAULT 5 NOT NULL,
  "suppressed_buckets" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_sponsor_profiles_user" ON "sponsor_profiles" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sponsor_profiles_status" ON "sponsor_profiles" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sponsor_profiles_category" ON "sponsor_profiles" ("brand_category");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sponsor_grants_sponsor" ON "sponsor_analytics_grants" ("sponsor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sponsor_grants_court" ON "sponsor_analytics_grants" ("court_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sponsor_grants_competition" ON "sponsor_analytics_grants" ("competition_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sponsor_queries_user" ON "sponsor_report_queries" ("queried_by", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sponsor_queries_resource" ON "sponsor_report_queries" ("resource_id", "query_type");
