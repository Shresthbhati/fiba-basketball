CREATE TABLE "pickup_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host_id" uuid NOT NULL,
	"court_id" uuid NOT NULL,
	"title" text NOT NULL,
	"weekday" integer NOT NULL,
	"start_time" text NOT NULL,
	"duration_min" integer NOT NULL,
	"timezone" text NOT NULL,
	"capacity" integer NOT NULL,
	"skill_band" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pickup_games" ADD COLUMN "series_id" uuid;--> statement-breakpoint
ALTER TABLE "pickup_series" ADD CONSTRAINT "pickup_series_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_series" ADD CONSTRAINT "pickup_series_court_id_courts_id_fk" FOREIGN KEY ("court_id") REFERENCES "public"."courts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_games" ADD CONSTRAINT "pickup_games_series_id_pickup_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."pickup_series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pickup_series_occurrence_idx" ON "pickup_games" USING btree ("series_id","starts_at");