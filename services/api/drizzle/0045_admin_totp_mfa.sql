ALTER TABLE "users" ADD COLUMN "totp_secret" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_recovery_codes" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "totp_verified_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "is_mfa_verified" boolean DEFAULT false NOT NULL;
