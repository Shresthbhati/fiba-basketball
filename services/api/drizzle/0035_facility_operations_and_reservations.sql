CREATE TABLE IF NOT EXISTS "facility_claims" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "court_id" uuid NOT NULL REFERENCES "courts"("id") ON DELETE CASCADE,
  "operator_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "business_name" text NOT NULL,
  "contact_email" text NOT NULL,
  "contact_phone" text,
  "status" varchar(20) DEFAULT 'PENDING' NOT NULL,
  "verified_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "uq_facility_claims_court_operator" UNIQUE ("court_id", "operator_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_facility_claims_court" ON "facility_claims" ("court_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_facility_claims_operator" ON "facility_claims" ("operator_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "court_operating_hours" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "court_id" uuid NOT NULL REFERENCES "courts"("id") ON DELETE CASCADE,
  "day_of_week" integer NOT NULL,
  "open_time" varchar(5) NOT NULL,
  "close_time" varchar(5) NOT NULL,
  "slot_duration_minutes" integer DEFAULT 60 NOT NULL,
  "hourly_rate_cents" integer DEFAULT 0 NOT NULL,
  "currency" varchar(3) DEFAULT 'USD' NOT NULL,
  "is_closed" boolean DEFAULT false NOT NULL,
  CONSTRAINT "uq_operating_hours_court_day" UNIQUE ("court_id", "day_of_week")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_operating_hours_court" ON "court_operating_hours" ("court_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "court_reservations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "court_id" uuid NOT NULL REFERENCES "courts"("id") ON DELETE CASCADE,
  "booked_by_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "start_time" timestamp with time zone NOT NULL,
  "end_time" timestamp with time zone NOT NULL,
  "purpose" varchar(30) DEFAULT 'PICKUP_RUN' NOT NULL,
  "status" varchar(20) DEFAULT 'CONFIRMED' NOT NULL,
  "total_price_cents" integer DEFAULT 0 NOT NULL,
  "notes" text,
  "cancelled_at" timestamp with time zone,
  "cancellation_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reservations_court_time" ON "court_reservations" ("court_id", "start_time");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reservations_user" ON "court_reservations" ("booked_by_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "court_maintenance_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "court_id" uuid NOT NULL REFERENCES "courts"("id") ON DELETE CASCADE,
  "logged_by_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "category" varchar(40) NOT NULL,
  "description" text NOT NULL,
  "severity" varchar(30) DEFAULT 'ROUTINE' NOT NULL,
  "cost_cents" integer DEFAULT 0 NOT NULL,
  "performed_at" timestamp with time zone NOT NULL,
  "next_inspection_due" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_maintenance_court" ON "court_maintenance_logs" ("court_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_maintenance_performed" ON "court_maintenance_logs" ("court_id", "performed_at");
