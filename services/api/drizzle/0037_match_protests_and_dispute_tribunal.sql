CREATE TABLE IF NOT EXISTS "match_protests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "match_id" uuid NOT NULL REFERENCES "matches"("id") ON DELETE CASCADE,
  "filing_team_id" uuid NOT NULL REFERENCES "teams"("id") ON DELETE CASCADE,
  "filed_by_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "protest_type" varchar(40) NOT NULL,
  "period" integer,
  "game_clock" varchar(10),
  "rule_cited" varchar(60),
  "description" text NOT NULL,
  "status" varchar(20) DEFAULT 'FILED' NOT NULL,
  "deposit_verified" boolean DEFAULT true NOT NULL,
  "filed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_protests_match" ON "match_protests" ("match_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_protests_team" ON "match_protests" ("filing_team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_protests_status" ON "match_protests" ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "protest_tribunal_rulings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "protest_id" uuid NOT NULL REFERENCES "match_protests"("id") ON DELETE CASCADE,
  "reviewer_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "referee_testimony" text,
  "ruling" varchar(20) NOT NULL,
  "remedy_action" varchar(30) DEFAULT 'NONE' NOT NULL,
  "adjusted_home_score" integer,
  "adjusted_away_score" integer,
  "forfeit_winner_team_id" uuid REFERENCES "teams"("id") ON DELETE SET NULL,
  "ruling_summary" text NOT NULL,
  "decided_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_protest_ruling" UNIQUE ("protest_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tribunal_protest" ON "protest_tribunal_rulings" ("protest_id");
