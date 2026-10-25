import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Db } from "../db/index.js";
import {
  cancelSubscription,
  createCheckoutSession,
  createCustomerPortalSession,
  getCurrentUserBilling,
  processPaymentWebhook,
  verifyWebhookSignature,
  type PlanId,
} from "./billing-service.js";

const authed = { config: { access: "authenticated" as const } };
const publicAccess = { config: { access: "public" as const } };

const checkoutBody = z.object({
  purpose: z.enum(["SUBSCRIPTION", "COURT_RESERVATION", "COMPETITION_ENTRY", "OTHER"]),
  planId: z.enum(["PRO_ATHLETE", "COACH_PLUS", "VENUE_ENTERPRISE"]).optional(),
  resourceId: z.string().uuid().optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

const cancelParam = z.object({
  id: z.string().uuid(),
});

const webhookBody = z.object({
  id: z.string(),
  type: z.string(),
  data: z.object({
    paymentIntentId: z.string().optional(),
    customerId: z.string().optional(),
    amountCents: z.number().int().optional(),
    planId: z.string().optional(),
    receiptUrl: z.string().optional(),
    resourceId: z.string().optional(),
  }),
});

export function registerBillingRoutes(app: FastifyInstance, db: Db) {
  // Initiate tokenized checkout session for subscription, reservation, or tournament
  app.post("/api/v1/billing/checkout", authed, async (req: FastifyRequest, reply) => {
    const body = checkoutBody.parse(req.body);
    const session = await createCheckoutSession(db, req.user!.id, {
      purpose: body.purpose,
      planId: body.planId as PlanId | undefined,
      resourceId: body.resourceId,
      successUrl: body.successUrl,
      cancelUrl: body.cancelUrl,
    });
    return reply.status(200).send(session);
  });

  // Get current user's billing status, customer profile, and active subscriptions
  app.get("/api/v1/billing/me", authed, async (req: FastifyRequest) => {
    return getCurrentUserBilling(db, req.user!.id);
  });

  // Cancel subscription at period end
  app.post("/api/v1/billing/subscriptions/:id/cancel", authed, async (req: FastifyRequest) => {
    const { id } = cancelParam.parse(req.params);
    return cancelSubscription(db, req.user!.id, id);
  });

  // Create customer portal session URL
  app.post("/api/v1/billing/portal", authed, async (req: FastifyRequest) => {
    return createCustomerPortalSession(db, req.user!.id);
  });

  // Ingest webhook events from payment provider
  app.post("/api/v1/billing/webhook", publicAccess, async (req: FastifyRequest, reply) => {
    const signature = (req.headers["x-webhook-signature"] || req.headers["stripe-signature"]) as string | undefined;
    const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET || "courtiq-test-webhook-secret";

    if (signature) {
      const rawPayload = JSON.stringify(req.body);
      const isValid = verifyWebhookSignature(rawPayload, signature, webhookSecret);
      if (!isValid) {
        return reply.status(400).send({ error: "Invalid webhook signature" });
      }
    }

    const event = webhookBody.parse(req.body);
    const result = await processPaymentWebhook(db, event);
    return reply.status(200).send(result);
  });
}
