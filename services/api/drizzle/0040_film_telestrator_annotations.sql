CREATE TABLE IF NOT EXISTS "film_annotations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "game_id" uuid NOT NULL REFERENCES "film_games"("id") ON DELETE CASCADE,
  "clip_id" uuid REFERENCES "film_clips"("id") ON DELETE SET NULL,
  "timestamp_ms" integer NOT NULL,
  "duration_ms" integer DEFAULT 3000 NOT NULL,
  "title" text DEFAULT 'Annotation' NOT NULL,
  "category" varchar(30) DEFAULT 'TACTICAL' NOT NULL,
  "shapes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "notes" text,
  "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "film_annotations_game_idx" ON "film_annotations" ("game_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "film_annotations_clip_idx" ON "film_annotations" ("clip_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "film_annotations_created_by_idx" ON "film_annotations" ("created_by");
