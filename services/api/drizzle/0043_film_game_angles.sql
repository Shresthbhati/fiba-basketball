CREATE TABLE IF NOT EXISTS "film_game_angles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "game_id" uuid NOT NULL REFERENCES "film_games"("id") ON DELETE CASCADE,
  "label" text NOT NULL,
  "angle_type" text NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "time_offset_ms" integer DEFAULT 0 NOT NULL,
  "video_status" text DEFAULT 'NONE' NOT NULL,
  "video_key" text,
  "video_type" text,
  "video_bytes" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "film_game_angles_game_idx" ON "film_game_angles" ("game_id");
