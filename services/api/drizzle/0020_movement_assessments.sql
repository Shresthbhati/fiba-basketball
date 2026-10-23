CREATE TABLE IF NOT EXISTS "movement_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"protocol" text NOT NULL,
	"status" text NOT NULL,
	"source_type" text DEFAULT 'CV_ESTIMATE' NOT NULL,
	"confidence" numeric(4, 3),
	"model_version" text DEFAULT 'court-iq-pose-v1.0' NOT NULL,
	"protocol_version" text DEFAULT 'protocol-v1.0' NOT NULL,
	"rep_count" integer DEFAULT 0 NOT NULL,
	"metrics" jsonb,
	"criteria_unmeasurable" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"feedback" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"abstain_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "movement_assessments_user_idx" ON "movement_assessments" ("user_id", "created_at");
