CREATE TABLE IF NOT EXISTS "assessment_camera_streams" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "assessment_id" uuid NOT NULL REFERENCES "movement_assessments"("id") ON DELETE CASCADE,
  "camera_label" varchar(40) NOT NULL,
  "video_url" text NOT NULL,
  "sync_offset_ms" integer DEFAULT 0 NOT NULL,
  "resolution" varchar(20) DEFAULT '1080p',
  "fps" integer DEFAULT 60,
  "is_primary" boolean DEFAULT false NOT NULL,
  "calibrated_distance_m" numeric(4, 2),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assessment_camera_streams_assessment_idx" ON "assessment_camera_streams" ("assessment_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shooting_mechanics_benchmarks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tier" varchar(30) NOT NULL,
  "min_release_angle_deg" numeric(4, 1) NOT NULL,
  "max_release_angle_deg" numeric(4, 1) NOT NULL,
  "min_release_time_s" numeric(4, 2) NOT NULL,
  "max_release_time_s" numeric(4, 2) NOT NULL,
  "max_elbow_flare_deg" numeric(4, 1) NOT NULL,
  "target_entry_angle_deg" numeric(4, 1) DEFAULT 45.0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "shooting_mechanics_benchmarks" ("tier", "min_release_angle_deg", "max_release_angle_deg", "min_release_time_s", "max_release_time_s", "max_elbow_flare_deg", "target_entry_angle_deg")
VALUES 
  ('PRO', 48.0, 54.0, 0.35, 0.48, 10.0, 46.5),
  ('COLLEGIATE', 46.0, 55.0, 0.38, 0.52, 12.0, 45.0),
  ('VARSITY', 45.0, 56.0, 0.40, 0.58, 14.0, 44.0),
  ('YOUTH', 42.0, 58.0, 0.45, 0.68, 18.0, 43.0)
ON CONFLICT DO NOTHING;
