ALTER TABLE "match_events" ADD COLUMN IF NOT EXISTS "coord_x" double precision;
--> statement-breakpoint
ALTER TABLE "match_events" ADD COLUMN IF NOT EXISTS "coord_y" double precision;
--> statement-breakpoint
ALTER TABLE "match_events" ADD COLUMN IF NOT EXISTS "shot_zone" text;
--> statement-breakpoint
ALTER TABLE "match_events" ADD COLUMN IF NOT EXISTS "distance_meters" double precision;
