CREATE TABLE IF NOT EXISTS "training_programs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "slug" varchar(80) NOT NULL UNIQUE,
  "name" varchar(150) NOT NULL,
  "phase" varchar(32) NOT NULL,
  "description" text NOT NULL,
  "duration_weeks" integer NOT NULL DEFAULT 4,
  "days_per_week" integer NOT NULL DEFAULT 3,
  "target_level" varchar(32) NOT NULL DEFAULT 'INTERMEDIATE',
  "primary_goal" varchar(64) NOT NULL,
  "is_template" boolean NOT NULL DEFAULT true,
  "creator_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "team_id" uuid REFERENCES "teams"("id") ON DELETE SET NULL,
  "reviewed" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_programs_phase_idx" ON "training_programs" ("phase");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_programs_team_idx" ON "training_programs" ("team_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "training_program_workouts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "program_id" uuid NOT NULL REFERENCES "training_programs"("id") ON DELETE CASCADE,
  "week_number" integer NOT NULL,
  "day_number" integer NOT NULL,
  "title" varchar(150) NOT NULL,
  "focus" varchar(64) NOT NULL,
  "estimated_duration_min" integer NOT NULL DEFAULT 45,
  "exercises_prescription" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "training_program_workouts_program_idx" ON "training_program_workouts" ("program_id", "week_number", "day_number");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "program_enrollments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "program_id" uuid NOT NULL REFERENCES "training_programs"("id") ON DELETE CASCADE,
  "athlete_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "assigned_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "start_date" date NOT NULL DEFAULT CURRENT_DATE,
  "current_week" integer NOT NULL DEFAULT 1,
  "status" varchar(32) NOT NULL DEFAULT 'ACTIVE',
  "completed_workout_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "program_enrollments_athlete_idx" ON "program_enrollments" ("athlete_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "program_enrollments_program_idx" ON "program_enrollments" ("program_id");
--> statement-breakpoint
INSERT INTO "training_programs" ("id", "slug", "name", "phase", "description", "duration_weeks", "days_per_week", "target_level", "primary_goal", "is_template", "reviewed")
VALUES
  (
    '20000000-0000-4000-8000-000000000001',
    '8-week-off-season-vertical-power',
    '8-Week Off-Season Vertical Jump & Force Foundation',
    'OFF_SEASON',
    'Comprehensive off-season periodization designed to build max lower-body force and convert structural strength into reactive vertical jump height.',
    8,
    3,
    'INTERMEDIATE',
    'VERTICAL_POWER',
    true,
    false
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    '6-week-pre-season-speed-agility',
    '6-Week Pre-Season Speed & Change-of-Direction',
    'PRE_SEASON',
    'Intensive pre-season block focusing on transition acceleration, lateral deceleration, perimeter defensive sliding, and repeat-sprint conditioning.',
    6,
    3,
    'INTERMEDIATE',
    'REPEAT_SPRINT_ABILITY',
    true,
    false
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    'in-season-maintenance-micro-dosing',
    'In-Season Maintenance & High-Intent Micro-Dosing',
    'IN_SEASON',
    'Low-volume, high-velocity micro-dosing protocol to preserve peak neural drive and lower-body power without game-day residual fatigue.',
    4,
    2,
    'ADVANCED',
    'FATIGUE_MANAGEMENT',
    true,
    false
  ),
  (
    '20000000-0000-4000-8000-000000000004',
    'tournament-week-taper-primer',
    'Tournament Week Neuromuscular Primer & Taper',
    'TOURNAMENT_PEAK',
    'Strategic taper microcycle designed to peak central nervous system readiness, optimize joint mobility, and eliminate neuromuscular fatigue before tournament play.',
    1,
    2,
    'ALL',
    'TOURNAMENT_READINESS',
    true,
    false
  )
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint
INSERT INTO "training_program_workouts" ("id", "program_id", "week_number", "day_number", "title", "focus", "estimated_duration_min", "exercises_prescription")
VALUES
  (
    '20000000-0000-4000-8000-000000000101',
    '20000000-0000-4000-8000-000000000001',
    1,
    1,
    'Day 1: Maximal Force & Vertical Launch',
    'LOWER_BODY_FORCE',
    50,
    '[
      {"exerciseSlug": "trap-bar-deadlift", "exerciseName": "Trap Bar Deadlift", "orderIndex": 1, "targetSets": 4, "targetReps": 6, "targetRpe": 8, "restSeconds": 120, "notes": "Explosive concentric drive"},
      {"exerciseSlug": "countermovement-jump", "exerciseName": "Countermovement Jump", "orderIndex": 2, "targetSets": 3, "targetReps": 5, "targetRpe": 7, "restSeconds": 90, "notes": "Maximal jump height with rapid arm swing"},
      {"exerciseSlug": "dumbbell-bench-press", "exerciseName": "Dumbbell Bench Press", "orderIndex": 3, "targetSets": 3, "targetReps": 8, "targetRpe": 8, "restSeconds": 90, "notes": "Solid shoulder retraction"},
      {"exerciseSlug": "plank", "exerciseName": "Forearm Plank", "orderIndex": 4, "targetSets": 3, "targetReps": 45, "targetRpe": 7, "restSeconds": 60, "notes": "Maintain neutral pelvic alignment"}
    ]'::jsonb
  ),
  (
    '20000000-0000-4000-8000-000000000102',
    '20000000-0000-4000-8000-000000000001',
    1,
    2,
    'Day 2: Lateral Deceleration & Elastic Power',
    'ELASTIC_POWER',
    45,
    '[
      {"exerciseSlug": "skater-bounds", "exerciseName": "Skater Bounds", "orderIndex": 1, "targetSets": 3, "targetReps": 6, "targetRpe": 7, "restSeconds": 90, "notes": "Stick the landing on outside foot"},
      {"exerciseSlug": "bulgarian-split-squat", "exerciseName": "Bulgarian Split Squat", "orderIndex": 2, "targetSets": 3, "targetReps": 8, "targetRpe": 8, "restSeconds": 90, "notes": "Drive through lead heel"},
      {"exerciseSlug": "romanian-deadlift", "exerciseName": "Romanian Deadlift", "orderIndex": 3, "targetSets": 3, "targetReps": 8, "targetRpe": 8, "restSeconds": 90, "notes": "Hinge hips back, feel hamstring stretch"}
    ]'::jsonb
  ),
  (
    '20000000-0000-4000-8000-000000000103',
    '20000000-0000-4000-8000-000000000001',
    1,
    3,
    'Day 3: Full-Court Power & Posterior Chain',
    'POSTERIOR_CHAIN_POWER',
    50,
    '[
      {"exerciseSlug": "back-squat", "exerciseName": "Back Squat", "orderIndex": 1, "targetSets": 4, "targetReps": 6, "targetRpe": 8, "restSeconds": 120, "notes": "Parallel depth with chest tall"},
      {"exerciseSlug": "box-jumps", "exerciseName": "Box Jumps", "orderIndex": 2, "targetSets": 3, "targetReps": 5, "targetRpe": 7, "restSeconds": 90, "notes": "Soft landing, step down carefully"},
      {"exerciseSlug": "pull-ups", "exerciseName": "Pull-ups", "orderIndex": 3, "targetSets": 3, "targetReps": 6, "targetRpe": 8, "restSeconds": 90, "notes": "Full extension at bottom"}
    ]'::jsonb
  ),
  (
    '20000000-0000-4000-8000-000000000201',
    '20000000-0000-4000-8000-000000000003',
    1,
    1,
    'Day 1: In-Season High-Intent Neural Primer',
    'NEURAL_PRIMING',
    35,
    '[
      {"exerciseSlug": "trap-bar-deadlift", "exerciseName": "Trap Bar Deadlift", "orderIndex": 1, "targetSets": 3, "targetReps": 3, "targetRpe": 7, "restSeconds": 120, "notes": "Speed focus - 80% 1RM moved with max acceleration"},
      {"exerciseSlug": "countermovement-jump", "exerciseName": "Countermovement Jump", "orderIndex": 2, "targetSets": 3, "targetReps": 3, "targetRpe": 6, "restSeconds": 90, "notes": "Zero fatigue buildup, maximum intent"}
    ]'::jsonb
  )
ON CONFLICT ("id") DO NOTHING;
