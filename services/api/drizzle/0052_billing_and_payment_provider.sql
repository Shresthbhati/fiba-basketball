CREATE TABLE IF NOT EXISTS "billing_customers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "provider_customer_id" text NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "billing_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL REFERENCES "billing_customers"("id") ON DELETE CASCADE,
  "plan_id" text NOT NULL,
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "current_period_start" timestamp with time zone NOT NULL,
  "current_period_end" timestamp with time zone NOT NULL,
  "cancel_at_period_end" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_transactions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "customer_id" uuid NOT NULL REFERENCES "billing_customers"("id") ON DELETE CASCADE,
  "provider_payment_intent_id" text NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" text DEFAULT 'USD' NOT NULL,
  "purpose" text NOT NULL,
  "resource_id" uuid,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "receipt_url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_billing_customers_user" ON "billing_customers" ("user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_billing_customers_provider" ON "billing_customers" ("provider_customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_billing_subscriptions_customer" ON "billing_subscriptions" ("customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_billing_subscriptions_status" ON "billing_subscriptions" ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_payment_transactions_provider" ON "payment_transactions" ("provider_payment_intent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_transactions_customer" ON "payment_transactions" ("customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payment_transactions_resource" ON "payment_transactions" ("resource_id");
