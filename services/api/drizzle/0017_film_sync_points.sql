CREATE TABLE "film_sync_points" (
	"game_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"video_ms" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "film_sync_points_game_id_event_id_pk" PRIMARY KEY("game_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "film_sync_points" ADD CONSTRAINT "film_sync_points_game_id_film_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."film_games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Keep the single sync point existing films already have.
INSERT INTO "film_sync_points" ("game_id", "event_id", "video_ms") SELECT "id", "sync_event_id", "sync_video_ms" FROM "film_games" WHERE "sync_event_id" IS NOT NULL AND "sync_video_ms" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "film_games" DROP COLUMN "sync_event_id";--> statement-breakpoint
ALTER TABLE "film_games" DROP COLUMN "sync_video_ms";