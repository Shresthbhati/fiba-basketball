CREATE TABLE IF NOT EXISTS "athletic_test_protocols" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" varchar(64) NOT NULL UNIQUE,
  "name" varchar(120) NOT NULL,
  "category" varchar(32) NOT NULL,
  "description" text NOT NULL,
  "primary_metric_unit" varchar(16) NOT NULL,
  "sort_direction" varchar(8) NOT NULL DEFAULT 'DESC',
  "equipment_requirements" text NOT NULL,
  "warmup_recommendations" text NOT NULL,
  "standard_attempts" integer NOT NULL DEFAULT 3,
  "is_combine_core" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "athletic_test_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "conducted_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "team_id" uuid REFERENCES "teams"("id") ON DELETE SET NULL,
  "test_date" date NOT NULL DEFAULT CURRENT_DATE,
  "location" varchar(120),
  "surface" varchar(32) NOT NULL DEFAULT 'HARDWOOD',
  "environmental_notes" text,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "athletic_test_sessions_user_idx" ON "athletic_test_sessions" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "athletic_test_sessions_team_idx" ON "athletic_test_sessions" ("team_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "athletic_test_sessions_date_idx" ON "athletic_test_sessions" ("test_date");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "athletic_test_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" uuid NOT NULL REFERENCES "athletic_test_sessions"("id") ON DELETE CASCADE,
  "protocol_id" uuid NOT NULL REFERENCES "athletic_test_protocols"("id") ON DELETE CASCADE,
  "attempt_number" integer NOT NULL,
  "raw_value" double precision NOT NULL,
  "is_fault" boolean NOT NULL DEFAULT false,
  "fault_reason" varchar(120),
  "instrument_type" varchar(32) NOT NULL DEFAULT 'VERTEC_VANES',
  "instrument_details" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source_type" varchar(32) NOT NULL DEFAULT 'SELF_REPORTED',
  "confidence" double precision NOT NULL DEFAULT 1.0,
  "notes" varchar(255),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "athletic_test_attempts_session_idx" ON "athletic_test_attempts" ("session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "athletic_test_attempts_protocol_idx" ON "athletic_test_attempts" ("protocol_id");
--> statement-breakpoint
INSERT INTO "athletic_test_protocols" ("id", "slug", "name", "category", "description", "primary_metric_unit", "sort_direction", "equipment_requirements", "warmup_recommendations", "standard_attempts", "is_combine_core")
VALUES
  (
    '10000000-0000-4000-8000-000000000001',
    'standing-vertical-jump',
    'Standing Vertical Jump',
    'JUMP',
    'Bilateral countermovement jump with no approach step. Measures explosive vertical displacement from standing reach to peak touch height.',
    'cm',
    'DESC',
    'Calibrated Vertec vanes or dual-beam optical flight mat.',
    'Dynamic hip flexor and calf mobility, 3 submaximal countermovement jumps (50%, 75%, 90%).',
    3,
    true
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'max-vertical-jump',
    'Maximum Vertical Jump',
    'JUMP',
    'Full approach vertical jump (up to 15 feet approach run, one or two-foot plant). Measures maximal reach and approach power transfer.',
    'cm',
    'DESC',
    'Calibrated Vertec vanes positioned away from wall/obstructions.',
    'Full lower-body dynamic warmup, progressive approach jumps with controlled landings.',
    3,
    true
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'three-quarter-court-sprint',
    '3/4 Court Sprint (22.86m)',
    'SPEED',
    'Linear transition sprint from baseline to the opposite free-throw line (75 ft / 22.86 m). Measures explosive acceleration and top-end court speed.',
    'seconds',
    'ASC',
    'Dual-beam electronic timing gates at 0m and 22.86m (beam height 90cm) or certified camera timing.',
    'Sprint drills: high knees, A-skips, 2x 15m accelerations, 1x 20m build-up.',
    3,
    true
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    'lane-agility-drill',
    'Lane Agility Drill (5.8m x 4.9m)',
    'AGILITY',
    'Standard FIBA/NBA perimeter key drill: sprint forward 5.8m, defensive slide right 4.9m, backpedal 5.8m, defensive slide left 4.9m, followed immediately by opposite direction reverse loop.',
    'seconds',
    'ASC',
    'Dual-beam electronic timing gates at baseline cone, 4 cones marking the lane corners.',
    'Defensive slide progressions, cone figure-eights, decelerations, 1 half-speed walkthrough.',
    2,
    true
  ),
  (
    '10000000-0000-4000-8000-000000000005',
    'pro-agility-shuttle',
    'Pro-Agility Shuttle (5-10-5)',
    'AGILITY',
    'Lateral change-of-direction test starting in 3-point stance: sprint 5 yards right, touch line with hand, sprint 10 yards left, touch line, sprint 5 yards back through center line.',
    'seconds',
    'ASC',
    'Electronic timing gates on center start/finish line; 3 parallel taped lines spaced 5 yards (4.57m) apart.',
    'Lateral lunges, crossover steps, plant-and-cut drills at submaximal intensity.',
    3,
    true
  ),
  (
    '10000000-0000-4000-8000-000000000006',
    'yoyo-intermittent-recovery-1',
    'Yo-Yo Intermittent Recovery Level 1',
    'CONDITIONING',
    'Progressive multi-stage shuttle test: 2 x 20m shuttles at increasing speeds dictated by audio beeps, with a 10-second active recovery walk interval between shuttles until failure.',
    'level_shuttle',
    'DESC',
    'Standardized audio track, calibrated 20m running course and 5m active recovery deceleration zone.',
    'General cardiovascular warmup: 5 minutes light jog, dynamic leg swings, 2 practice shuttle intervals.',
    1,
    true
  )
ON CONFLICT ("slug") DO NOTHING;
