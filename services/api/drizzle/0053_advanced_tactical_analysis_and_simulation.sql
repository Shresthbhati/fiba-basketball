CREATE TABLE IF NOT EXISTS "tactical_candidate_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"clip_id" uuid,
	"team_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"timestamp_seconds" real NOT NULL,
	"court_coordinates" jsonb NOT NULL,
	"involved_player_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence_score" real NOT NULL,
	"status" text DEFAULT 'CANDIDATE' NOT NULL,
	"reviewed_by_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_notes" text,
	"model_version" text DEFAULT 'v1.0.0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "play_similarity_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"play_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"embedding_vector" jsonb NOT NULL,
	"spatial_features" jsonb NOT NULL,
	"model_version" text DEFAULT 'v1.0.0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scenario_simulations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"play_id" uuid,
	"title" text NOT NULL,
	"coverage_type" text NOT NULL,
	"simulation_level" integer DEFAULT 3 NOT NULL,
	"offensive_setup" jsonb NOT NULL,
	"defensive_response" jsonb NOT NULL,
	"coverage_metrics" jsonb NOT NULL,
	"tactical_analysis" text NOT NULL,
	"disclaimer" text DEFAULT 'Level 3 Rule-Based Scenario Simulation — tactical schematic illustration, not an empirical outcome prediction.' NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tactical_model_registry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_version" text NOT NULL,
	"model_type" text NOT NULL,
	"benchmark_dataset" text NOT NULL,
	"metrics" jsonb NOT NULL,
	"status" text DEFAULT 'CANDIDATE' NOT NULL,
	"active_since" timestamp with time zone,
	"rolled_back_at" timestamp with time zone,
	"rollback_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tactical_model_registry_model_version_unique" UNIQUE("model_version")
);
--> statement-breakpoint
ALTER TABLE "tactical_candidate_events" ADD CONSTRAINT "tactical_candidate_events_game_id_film_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."film_games"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tactical_candidate_events" ADD CONSTRAINT "tactical_candidate_events_clip_id_film_clips_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."film_clips"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tactical_candidate_events" ADD CONSTRAINT "tactical_candidate_events_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "tactical_candidate_events" ADD CONSTRAINT "tactical_candidate_events_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "play_similarity_embeddings" ADD CONSTRAINT "play_similarity_embeddings_play_id_tactical_plays_id_fk" FOREIGN KEY ("play_id") REFERENCES "public"."tactical_plays"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "play_similarity_embeddings" ADD CONSTRAINT "play_similarity_embeddings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scenario_simulations" ADD CONSTRAINT "scenario_simulations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scenario_simulations" ADD CONSTRAINT "scenario_simulations_play_id_tactical_plays_id_fk" FOREIGN KEY ("play_id") REFERENCES "public"."tactical_plays"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scenario_simulations" ADD CONSTRAINT "scenario_simulations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tactical_candidate_game_idx" ON "tactical_candidate_events" ("game_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tactical_candidate_team_idx" ON "tactical_candidate_events" ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tactical_candidate_status_idx" ON "tactical_candidate_events" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tactical_candidate_event_type_idx" ON "tactical_candidate_events" ("event_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "play_similarity_play_idx" ON "play_similarity_embeddings" ("play_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "play_similarity_team_idx" ON "play_similarity_embeddings" ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scenario_simulation_team_idx" ON "scenario_simulations" ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scenario_simulation_play_idx" ON "scenario_simulations" ("play_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "model_registry_version_idx" ON "tactical_model_registry" ("model_version");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "model_registry_type_idx" ON "tactical_model_registry" ("model_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "model_registry_status_idx" ON "tactical_model_registry" ("status");
