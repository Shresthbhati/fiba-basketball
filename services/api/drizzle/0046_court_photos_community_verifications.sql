CREATE TABLE IF NOT EXISTS "court_photos" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "court_id" uuid NOT NULL REFERENCES "courts"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "caption" text,
  "is_primary" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'APPROVED' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "court_photos_court_idx" ON "court_photos" ("court_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "court_photos_user_idx" ON "court_photos" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "court_verifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "court_id" uuid NOT NULL REFERENCES "courts"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "confirmed_surface" text,
  "confirmed_hoops" integer,
  "confirmed_lit" boolean,
  "confirmed_indoor" boolean,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_court_verifications_user_court" ON "court_verifications" ("court_id", "user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_court_verifications_court" ON "court_verifications" ("court_id");
