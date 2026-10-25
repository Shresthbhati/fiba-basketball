ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_erased" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "erased_at" timestamp with time zone;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "data_export_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" text DEFAULT 'READY' NOT NULL,
  "payload" text NOT NULL,
  "checksum_sha256" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account_erasure_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "original_email_hash" text NOT NULL,
  "status" text DEFAULT 'COMPLETED' NOT NULL,
  "reason" text,
  "erased_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_data_export_requests_user" ON "data_export_requests" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_account_erasure_user" ON "account_erasure_requests" ("user_id");
