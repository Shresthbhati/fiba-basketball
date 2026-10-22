CREATE TABLE "match_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"match_id" uuid NOT NULL,
	"server_seq" integer NOT NULL,
	"local_seq" integer NOT NULL,
	"type" text NOT NULL,
	"side" text,
	"period" integer NOT NULL,
	"clock_seconds" integer,
	"corrects_event_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "match_events_match_idx" ON "match_events" USING btree ("match_id","server_seq");