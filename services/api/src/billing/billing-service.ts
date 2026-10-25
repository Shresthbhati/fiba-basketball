import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  billingCustomers,
  billingSubscriptions,
  competitions,
  courtReservations,
  paymentTransactions,
  users,
} from "../db/schema.js";
import { AuthError } from "../identity/service.js";

export const BILLING_PLANS = {
  PRO_ATHLETE: {
    planId: "PRO_ATHLETE",
    name: "Pro Athlete Pass",
    amountCents: 1499,
    currency: "USD",
    interval: "month",
    description: "Advanced kinematic overlays, priority scout directory placement, and unlimited video sync.",
  },
  COACH_PLUS: {
    planId: "COACH_PLUS",
    name: "Coach Plus Suite",
    amountCents: 3999,
    currency: "USD",
    interval: "month",
    description: "Vector playbook exports, automated opponent scouting dossiers, and team review queues.",
  },
  VENUE_ENTERPRISE: {
    planId: "VENUE_ENTERPRISE",
    name: "Venue & Facility Enterprise",
    amountCents: 9999,
    currency: "USD",
    interval: "month",
    description: "Online court reservations, dynamic surge pricing, and commercial sponsor analytics.",
  },
} as const;

export type PlanId = keyof typeof BILLING_PLANS;

export interface CheckoutInput {
  purpose: "SUBSCRIPTION" | "COURT_RESERVATION" | "COMPETITION_ENTRY" | "OTHER";
  planId?: PlanId | undefined;
  resourceId?: string | undefined;
  successUrl?: string | undefined;
  cancelUrl?: string | undefined;
}

export interface WebhookEventPayload {
  id: string;
  type: string;
  data: {
    paymentIntentId?: string | undefined;
    customerId?: string | undefined;
    amountCents?: number | undefined;
    planId?: string | undefined;
    receiptUrl?: string | undefined;
    resourceId?: string | undefined;
  };
}

/**
 * Gets or creates a tokenized billing customer record for a user.
 * ZERO raw credit card details or PAN/CVV data are stored on Court IQ servers.
 */
export async function getOrCreateBillingCustomer(db: Db, userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) {
    throw new AuthError(404, "User not found");
  }

  const [existing] = await db
    .select()
    .from(billingCustomers)
    .where(eq(billingCustomers.userId, userId));

  if (existing) {
    return existing;
  }

  const providerCustomerId = `cus_${randomBytes(12).toString("hex")}`;
  const [created] = await db
    .insert(billingCustomers)
    .values({
      userId,
      providerCustomerId,
      currency: "USD",
    })
    .returning();

  return created!;
}

/**
 * Creates a hosted checkout session with the payment provider.
 */
export async function createCheckoutSession(
  db: Db,
  userId: string,
  input: CheckoutInput,
) {
  const customer = await getOrCreateBillingCustomer(db, userId);

  let amountCents = 0;
  let currency = "USD";
  let targetResourceId: string | null = null;

  if (input.purpose === "SUBSCRIPTION") {
    if (!input.planId || !(input.planId in BILLING_PLANS)) {
      throw new AuthError(400, "Valid subscription planId is required");
    }
    const plan = BILLING_PLANS[input.planId];
    amountCents = plan.amountCents;
    currency = plan.currency;
  } else if (input.purpose === "COURT_RESERVATION") {
    if (!input.resourceId) {
      throw new AuthError(400, "Court reservation resourceId is required");
    }
    const [reservation] = await db
      .select()
      .from(courtReservations)
      .where(eq(courtReservations.id, input.resourceId));

    if (!reservation || reservation.bookedById !== userId) {
      // Negative AuthZ (ADR-0010)
      throw new AuthError(404, "Reservation not found or access denied");
    }
    amountCents = reservation.totalPriceCents;
    targetResourceId = reservation.id;
  } else if (input.purpose === "COMPETITION_ENTRY") {
    if (!input.resourceId) {
      throw new AuthError(400, "Competition resourceId is required");
    }
    const [comp] = await db
      .select()
      .from(competitions)
      .where(eq(competitions.id, input.resourceId));

    if (!comp) {
      throw new AuthError(404, "Competition not found");
    }
    amountCents = 5000; // Standard $50.00 tournament entry fee
    targetResourceId = comp.id;
  } else {
    amountCents = 1000;
  }

  const sessionId = `cs_${randomBytes(16).toString("hex")}`;
  const paymentIntentId = `pi_${randomBytes(16).toString("hex")}`;

  // Record pending transaction
  const [transaction] = await db
    .insert(paymentTransactions)
    .values({
      customerId: customer.id,
      providerPaymentIntentId: paymentIntentId,
      amountCents,
      currency,
      purpose: input.purpose,
      resourceId: targetResourceId,
      status: "PENDING",
    })
    .returning();

  const checkoutUrl = `https://checkout.courtiq.test/pay/${sessionId}?success_url=${encodeURIComponent(
    input.successUrl ?? "https://courtiq.test/billing?status=success",
  )}&cancel_url=${encodeURIComponent(
    input.cancelUrl ?? "https://courtiq.test/billing?status=cancelled",
  )}`;

  return {
    sessionId,
    paymentIntentId,
    checkoutUrl,
    amountCents,
    currency,
    purpose: input.purpose,
    transactionId: transaction!.id,
  };
}

/**
 * Computes and validates cryptographic HMAC-SHA256 webhook signatures from payment provider.
 */
export function verifyWebhookSignature(
  rawPayload: string,
  signatureHeader: string,
  secret: string,
): boolean {
  try {
    const computed = createHmac("sha256", secret).update(rawPayload).digest("hex");
    const signatureBuffer = Buffer.from(signatureHeader, "hex");
    const computedBuffer = Buffer.from(computed, "hex");

    if (signatureBuffer.length !== computedBuffer.length) {
      return false;
    }
    return timingSafeEqual(signatureBuffer, computedBuffer);
  } catch {
    return false;
  }
}

/**
 * Processes incoming payment provider webhooks idempotently.
 */
export async function processPaymentWebhook(
  db: Db,
  event: WebhookEventPayload,
) {
  if (event.type === "payment_intent.succeeded" || event.type === "checkout.session.completed") {
    const paymentIntentId = event.data.paymentIntentId;
    if (!paymentIntentId) return { processed: false, reason: "Missing paymentIntentId" };

    const [tx] = await db
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.providerPaymentIntentId, paymentIntentId));

    if (!tx) {
      return { processed: false, reason: "Transaction not found" };
    }

    if (tx.status === "SUCCEEDED") {
      return { processed: true, alreadySucceeded: true };
    }

    const receiptUrl = event.data.receiptUrl ?? `https://receipts.courtiq.test/${paymentIntentId}`;

    await db
      .update(paymentTransactions)
      .set({
        status: "SUCCEEDED",
        receiptUrl,
      })
      .where(eq(paymentTransactions.id, tx.id));

    // If court reservation, confirm the reservation status
    if (tx.purpose === "COURT_RESERVATION" && tx.resourceId) {
      await db
        .update(courtReservations)
        .set({ status: "CONFIRMED" })
        .where(eq(courtReservations.id, tx.resourceId));
    }

    // If subscription, activate or renew subscription
    if (tx.purpose === "SUBSCRIPTION" && event.data.planId) {
      const now = new Date();
      const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days

      const [existingSub] = await db
        .select()
        .from(billingSubscriptions)
        .where(eq(billingSubscriptions.customerId, tx.customerId));

      if (existingSub) {
        await db
          .update(billingSubscriptions)
          .set({
            planId: event.data.planId,
            status: "ACTIVE",
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: false,
            updatedAt: now,
          })
          .where(eq(billingSubscriptions.id, existingSub.id));
      } else {
        await db.insert(billingSubscriptions).values({
          customerId: tx.customerId,
          planId: event.data.planId,
          status: "ACTIVE",
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
        });
      }
    }

    return { processed: true, status: "SUCCEEDED" };
  }

  if (event.type === "payment_intent.payment_failed") {
    const paymentIntentId = event.data.paymentIntentId;
    if (paymentIntentId) {
      await db
        .update(paymentTransactions)
        .set({ status: "FAILED" })
        .where(eq(paymentTransactions.providerPaymentIntentId, paymentIntentId));
    }
    return { processed: true, status: "FAILED" };
  }

  if (event.type === "customer.subscription.deleted") {
    const customerId = event.data.customerId;
    if (customerId) {
      const [customer] = await db
        .select()
        .from(billingCustomers)
        .where(eq(billingCustomers.providerCustomerId, customerId));

      if (customer) {
        await db
          .update(billingSubscriptions)
          .set({ status: "CANCELED", updatedAt: new Date() })
          .where(eq(billingSubscriptions.customerId, customer.id));
      }
    }
    return { processed: true, status: "CANCELED" };
  }

  return { processed: true, status: "IGNORED" };
}

/**
 * Retrieves the billing profile, active subscription, and recent transactions for the current user.
 */
export async function getCurrentUserBilling(db: Db, userId: string) {
  const [customer] = await db
    .select()
    .from(billingCustomers)
    .where(eq(billingCustomers.userId, userId));

  if (!customer) {
    return {
      hasCustomer: false,
      subscription: null,
      recentTransactions: [],
      availablePlans: Object.values(BILLING_PLANS),
    };
  }

  const [activeSub] = await db
    .select()
    .from(billingSubscriptions)
    .where(
      and(
        eq(billingSubscriptions.customerId, customer.id),
        eq(billingSubscriptions.status, "ACTIVE"),
      ),
    );

  const transactions = await db
    .select()
    .from(paymentTransactions)
    .where(eq(paymentTransactions.customerId, customer.id))
    .orderBy(desc(paymentTransactions.createdAt))
    .limit(20);

  return {
    hasCustomer: true,
    customer: {
      id: customer.id,
      providerCustomerId: customer.providerCustomerId,
      currency: customer.currency,
    },
    subscription: activeSub ?? null,
    recentTransactions: transactions,
    availablePlans: Object.values(BILLING_PLANS),
  };
}

/**
 * Cancels a subscription at the end of the billing period.
 */
export async function cancelSubscription(
  db: Db,
  userId: string,
  subscriptionId: string,
) {
  const [customer] = await db
    .select()
    .from(billingCustomers)
    .where(eq(billingCustomers.userId, userId));

  if (!customer) {
    throw new AuthError(404, "Subscription not found");
  }

  const [sub] = await db
    .select()
    .from(billingSubscriptions)
    .where(
      and(
        eq(billingSubscriptions.id, subscriptionId),
        eq(billingSubscriptions.customerId, customer.id),
      ),
    );

  if (!sub) {
    throw new AuthError(404, "Subscription not found");
  }

  const [updated] = await db
    .update(billingSubscriptions)
    .set({
      cancelAtPeriodEnd: true,
      updatedAt: new Date(),
    })
    .where(eq(billingSubscriptions.id, sub.id))
    .returning();

  return updated!;
}

/**
 * Generates a customer billing portal URL for managing payment methods and invoices.
 */
export async function createCustomerPortalSession(db: Db, userId: string) {
  const customer = await getOrCreateBillingCustomer(db, userId);
  return {
    portalUrl: `https://billing.courtiq.test/session/${customer.providerCustomerId}`,
  };
}
