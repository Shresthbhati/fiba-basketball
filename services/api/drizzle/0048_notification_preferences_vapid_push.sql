CREATE TABLE IF NOT EXISTS "notification_preferences" (
  "user_id" uuid PRIMARY KEY NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "web_push_enabled" boolean DEFAULT true NOT NULL,
  "email_enabled" boolean DEFAULT true NOT NULL,
  "game_invites" boolean DEFAULT true NOT NULL,
  "court_alerts" boolean DEFAULT true NOT NULL,
  "team_announcements" boolean DEFAULT true NOT NULL,
  "quiet_hours_enabled" boolean DEFAULT true NOT NULL,
  "quiet_hours_start" varchar(5) DEFAULT '22:00' NOT NULL,
  "quiet_hours_end" varchar(5) DEFAULT '08:00' NOT NULL,
  "quiet_hours_timezone" varchar(50) DEFAULT 'UTC' NOT NULL,
  "daily_cap" integer DEFAULT 10 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "push_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "endpoint" text NOT NULL UNIQUE,
  "p256dh" text NOT NULL,
  "auth" text NOT NULL,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_delivery_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "channel" text NOT NULL,
  "status" text NOT NULL,
  "suppression_reason" text,
  "sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_push_sub_user" ON "push_subscriptions" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_notif_delivery_user_sent" ON "notification_delivery_logs" ("user_id", "sent_at");
