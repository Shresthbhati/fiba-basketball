CREATE TABLE IF NOT EXISTS "athlete_devices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "device_manufacturer" text NOT NULL,
  "device_model" text NOT NULL,
  "device_identifier" text,
  "firmware_version" text,
  "calibration_date" timestamp with time zone,
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sensor_telemetry_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "device_id" uuid NOT NULL REFERENCES "athlete_devices"("id") ON DELETE CASCADE,
  "practice_id" uuid REFERENCES "practice_sessions"("id") ON DELETE SET NULL,
  "match_id" uuid REFERENCES "matches"("id") ON DELETE SET NULL,
  "session_name" text NOT NULL,
  "session_type" text NOT NULL,
  "source_type" text DEFAULT 'SENSOR' NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "ended_at" timestamp with time zone NOT NULL,
  "duration_seconds" integer NOT NULL,
  "distance_meters" double precision,
  "player_load" double precision,
  "jump_count" integer,
  "max_jump_height_cm" double precision,
  "max_acceleration_g" double precision,
  "max_deceleration_g" double precision,
  "avg_heart_rate_bpm" integer,
  "max_heart_rate_bpm" integer,
  "time_in_zone_seconds" jsonb,
  "samples_count" integer DEFAULT 0 NOT NULL,
  "raw_format" text DEFAULT 'JSON' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_athlete_devices_user_status" ON "athlete_devices" ("user_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sensor_sessions_user_started" ON "sensor_telemetry_sessions" ("user_id", "started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sensor_sessions_practice" ON "sensor_telemetry_sessions" ("practice_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sensor_sessions_match" ON "sensor_telemetry_sessions" ("match_id");
