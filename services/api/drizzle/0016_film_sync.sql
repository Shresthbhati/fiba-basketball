ALTER TABLE "film_games" ADD COLUMN "match_id" uuid;--> statement-breakpoint
ALTER TABLE "film_games" ADD COLUMN "sync_event_id" uuid;--> statement-breakpoint
ALTER TABLE "film_games" ADD COLUMN "sync_video_ms" integer;--> statement-breakpoint
ALTER TABLE "match_events" ADD COLUMN "occurred_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "film_games" ADD CONSTRAINT "film_games_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;