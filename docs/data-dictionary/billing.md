# Billing, Subscriptions, and Payment Provider Integration (Spec §8.5, ADR-0010)

## Overview & Zero-Card PCI-DSS Guardrails
Court IQ processes payments exclusively via third-party hosted checkout sessions and customer portals (e.g. Stripe, Adyen).
- **Zero Cardholder Data Stored**: PAN (Primary Account Number), CVV/CVC, expiration dates, or raw bank details are NEVER transmitted to or stored on Court IQ servers or databases.
- **Provider Tokenization**: Customers, subscriptions, checkout sessions, and payment intents are tracked via cryptographically random provider identifiers (`cus_*`, `sub_*`, `cs_*`, `pi_*`).
- **Webhook Security**: Inbound webhooks require cryptographically signed headers (`stripe-signature` or `x-courtiq-signature`) verified against an environment secret `BILLING_WEBHOOK_SECRET`.
- **Negative AuthZ & RFC 9457**: Access to billing details, subscription cancellation, or payment history is strictly authorization-checked; cross-tenant queries return `404 Not Found`.

---

## Data Model

### `billing_customers`
Maps Court IQ users or organizations to external payment provider customer tokens.
- `id`: UUIDv7 PK.
- `user_id`: UUID references `users.id` (unique, indexed, cascading delete).
- `provider`: Text (`STRIPE | ADYEN | MOCK`).
- `provider_customer_id`: Text (unique customer token e.g. `cus_...`).
- `currency`: Text (`usd`, `eur`, `gbp`).
- `metadata`: JSONB metadata.
- `created_at`: Timestamp with timezone.
- `updated_at`: Timestamp with timezone.

### `billing_subscriptions`
Tracks active tier plans, renewal dates, and cancellation states.
- `id`: UUIDv7 PK.
- `user_id`: UUID references `users.id` (indexed, cascading delete).
- `customer_id`: UUID references `billing_customers.id` (cascading delete).
- `provider_subscription_id`: Text (unique token e.g. `sub_...`).
- `plan_tier`: Text (`ATHLETE_PRO | COACH_ELITE | FACILITY_ENTERPRISE`).
- `status`: Text (`ACTIVE | PAST_DUE | CANCELLED | TRIALING | INCOMPLETE`).
- `amount_cents`: Integer (subscription amount in minor currency units).
- `currency`: Text (e.g. `usd`).
- `current_period_start`: Timestamp with timezone.
- `current_period_end`: Timestamp with timezone.
- `cancel_at_period_end`: Boolean (true if set to cancel at end of billing cycle).
- `cancelled_at`: Timestamp with timezone (optional).
- `created_at`: Timestamp with timezone.
- `updated_at`: Timestamp with timezone.

### `payment_transactions`
Auditable record of successful, pending, or refunded one-time or recurring transactions.
- `id`: UUIDv7 PK.
- `user_id`: UUID references `users.id` (indexed, cascading delete).
- `customer_id`: UUID references `billing_customers.id` (optional).
- `subscription_id`: UUID references `billing_subscriptions.id` (optional).
- `provider_payment_intent_id`: Text (e.g. `pi_...`).
- `category`: Text (`SUBSCRIPTION | COURT_RESERVATION | TOURNAMENT_ENTRY | MERCHANDISE | OTHER`).
- `amount_cents`: Integer.
- `currency`: Text.
- `status`: Text (`SUCCEEDED | PENDING | FAILED | REFUNDED`).
- `description`: Text (e.g. "Court reservation deposit", "Athlete Pro Monthly").
- `metadata`: JSONB (e.g. `reservationId`, `courtId`).
- `created_at`: Timestamp with timezone.

---

## API Endpoints

- `POST /api/v1/billing/checkout`
  - Creates tokenized provider checkout session for subscriptions or court reservation payments.
  - Body: `{ planTier?: string; category?: string; reservationId?: string; courtId?: string; successUrl: string; cancelUrl: string }`
  - Returns: `{ sessionId, paymentIntentId, checkoutUrl, amountCents }`

- `GET /api/v1/billing/me`
  - Returns authenticated user's active customer profile, subscription, payment history, and available plan tiers.
  - Returns: `{ customer, subscription, transactions, availablePlans }`

- `POST /api/v1/billing/subscriptions/:id/cancel`
  - Cancels an active subscription at period end. Negative authZ returns 404 if subscription does not belong to caller.
  - Returns: Updated subscription record with `cancelAtPeriodEnd: true`.

- `POST /api/v1/billing/portal`
  - Generates secure customer portal link for self-serve payment method updates or billing address changes.
  - Returns: `{ portalUrl }`

- `POST /api/v1/billing/webhook`
  - Inbound webhook handler for asynchronous payment gateway lifecycle events (`checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.deleted`, `payment_intent.payment_failed`).
