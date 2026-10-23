CREATE TABLE "film_clips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "film_games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"title" text NOT NULL,
	"opponent" text,
	"played_on" date,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"video_status" text DEFAULT 'NONE' NOT NULL,
	"video_key" text,
	"video_type" text,
	"video_bytes" integer
);
--> statement-breakpoint
ALTER TABLE "film_clips" ADD CONSTRAINT "film_clips_game_id_film_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."film_games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "film_clips" ADD CONSTRAINT "film_clips_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "film_games" ADD CONSTRAINT "film_games_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "film_games" ADD CONSTRAINT "film_games_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "film_clips_game_idx" ON "film_clips" USING btree ("game_id");--> statement-breakpoint
CREATE INDEX "film_games_team_idx" ON "film_games" USING btree ("team_id");