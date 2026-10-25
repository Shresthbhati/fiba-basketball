import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { testApp, user } from "./helpers.js";

type T = Awaited<ReturnType<typeof testApp>>;
type U = Awaited<ReturnType<typeof user>>;

const post = (t: T, u: U | null, url: string, body?: unknown, headers?: Record<string, string>) =>
  t.app.inject({
    method: "POST",
    url,
    payload: body ?? {},
    headers: {
      ...(u ? { cookie: u.cookie } : {}),
      ...(headers ?? {}),
    },
  });

const put = (t: T, u: U | null, url: string, body?: unknown) =>
  t.app.inject({
    method: "PUT",
    url,
    payload: body ?? {},
    ...(u ? { headers: { cookie: u.cookie } } : {}),
  });

const get = (t: T, u: U | null, url: string) =>
  t.app.inject({
    method: "GET",
    url,
    ...(u ? { headers: { cookie: u.cookie } } : {}),
  });

describe("Billing & Payment Provider Integration (WP-8.5, Spec §8.5, ADR-0010)", { timeout: 30000 }, () => {
  it("manages tokenized checkout, subscriptions, court reservation payments, and webhook lifecycle", async () => {
    const t = await testApp({ rateLimitScale: 10 });

    const athlete = await user(t, "athlete-billing@courtiq.test", { displayName: "Athlete Baller" });
    const stranger = await user(t, "stranger-billing@courtiq.test", { displayName: "Stranger Baller" });
    const manager = await user(t, "manager-billing@courtiq.test", { displayName: "Facility Operator" });

    // 1. Initial billing state: user has no customer record yet
    const initialMeRes = await get(t, athlete, "/api/v1/billing/me");
    expect(initialMeRes.statusCode).toBe(200);
    const initialData = initialMeRes.json();
    expect(initialData.hasCustomer).toBe(false);
    expect(initialData.subscription).toBeNull();
    expect(initialData.availablePlans.length).toBe(3);

    // 2. Initiate Subscription Checkout
    const checkoutRes = await post(t, athlete, "/api/v1/billing/checkout", {
      purpose: "SUBSCRIPTION",
      planId: "PRO_ATHLETE",
      successUrl: "https://courtiq.test/billing/success",
      cancelUrl: "https://courtiq.test/billing/cancel",
    });
    expect(checkoutRes.statusCode).toBe(200);
    const checkoutData = checkoutRes.json();
    expect(checkoutData.sessionId).toMatch(/^cs_/);
    expect(checkoutData.paymentIntentId).toMatch(/^pi_/);
    expect(checkoutData.checkoutUrl).toContain("https://checkout.courtiq.test/pay/");
    expect(checkoutData.amountCents).toBe(1499);
    expect(checkoutData.currency).toBe("USD");

    // 3. Process Webhook from payment provider for subscription
    const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET || "courtiq-test-webhook-secret";
    const subEvent = {
      id: "evt_123456",
      type: "payment_intent.succeeded",
      data: {
        paymentIntentId: checkoutData.paymentIntentId,
        planId: "PRO_ATHLETE",
        receiptUrl: `https://receipts.courtiq.test/${checkoutData.paymentIntentId}`,
      },
    };

    const rawSubPayload = JSON.stringify(subEvent);
    const signature = createHmac("sha256", webhookSecret).update(rawSubPayload).digest("hex");

    const webhookRes = await post(t, null, "/api/v1/billing/webhook", subEvent, {
      "x-webhook-signature": signature,
    });
    expect(webhookRes.statusCode).toBe(200);
    expect(webhookRes.json().status).toBe("SUCCEEDED");

    // Idempotent retry of same webhook event
    const retryWebhookRes = await post(t, null, "/api/v1/billing/webhook", subEvent, {
      "x-webhook-signature": signature,
    });
    expect(retryWebhookRes.statusCode).toBe(200);
    expect(retryWebhookRes.json().alreadySucceeded).toBe(true);

    // 4. Verify Active Subscription on athlete profile
    const authedMeRes = await get(t, athlete, "/api/v1/billing/me");
    expect(authedMeRes.statusCode).toBe(200);
    const authedData = authedMeRes.json();
    expect(authedData.hasCustomer).toBe(true);
    expect(authedData.customer.providerCustomerId).toMatch(/^cus_/);
    expect(authedData.subscription).toBeDefined();
    expect(authedData.subscription.planId).toBe("PRO_ATHLETE");
    expect(authedData.subscription.status).toBe("ACTIVE");
    expect(authedData.subscription.cancelAtPeriodEnd).toBe(false);
    expect(authedData.recentTransactions.length).toBe(1);
    expect(authedData.recentTransactions[0].status).toBe("SUCCEEDED");
    expect(authedData.recentTransactions[0].receiptUrl).toBeDefined();

    // 5. Test Court Reservation checkout & payment
    const courtRes = await post(t, manager, "/api/v1/courts", {
      name: "Court IQ Premier Training Center",
      lat: 40.7128,
      lng: -74.006,
      indoor: true,
      surface: "WOOD",
      hoops: 2,
      lit: true,
    });
    expect(courtRes.statusCode).toBe(201);
    const courtId = courtRes.json().id;

    // Set operating hours with hourly rate
    const hRes = await put(t, manager, `/api/v1/courts/${courtId}/operating-hours`, {
      schedule: [
        {
          dayOfWeek: 1,
          openTime: "08:00",
          closeTime: "22:00",
          slotDurationMinutes: 60,
          hourlyRateCents: 4500, // $45.00/hr
        },
      ],
    });
    expect(hRes.statusCode).toBe(200);

    // Create reservation for athlete on Monday
    const nextMonday = new Date();
    nextMonday.setDate(nextMonday.getDate() + ((1 + 7 - nextMonday.getDay()) % 7 || 7));
    nextMonday.setHours(10, 0, 0, 0);
    const endMonday = new Date(nextMonday.getTime() + 3600000);

    const reservationRes = await post(t, athlete, `/api/v1/courts/${courtId}/reservations`, {
      startTime: nextMonday.toISOString(),
      endTime: endMonday.toISOString(),
      purpose: "TEAM_PRACTICE",
    });
    expect(reservationRes.statusCode).toBe(201);
    const reservationId = reservationRes.json().id;

    // Negative AuthZ (ADR-0010): Stranger cannot checkout athlete's reservation -> 404
    const strangerCheckoutRes = await post(t, stranger, "/api/v1/billing/checkout", {
      purpose: "COURT_RESERVATION",
      resourceId: reservationId,
    });
    expect(strangerCheckoutRes.statusCode).toBe(404);

    // Athlete initiates checkout for their reservation
    const resCheckoutRes = await post(t, athlete, "/api/v1/billing/checkout", {
      purpose: "COURT_RESERVATION",
      resourceId: reservationId,
    });
    expect(resCheckoutRes.statusCode).toBe(200);
    const resCheckoutData = resCheckoutRes.json();
    expect(resCheckoutData.amountCents).toBe(4500);

    // Webhook completes payment for reservation
    const resEvent = {
      id: "evt_res_123",
      type: "payment_intent.succeeded",
      data: {
        paymentIntentId: resCheckoutData.paymentIntentId,
      },
    };
    const resSignature = createHmac("sha256", webhookSecret).update(JSON.stringify(resEvent)).digest("hex");
    const resWebhookRes = await post(t, null, "/api/v1/billing/webhook", resEvent, {
      "x-webhook-signature": resSignature,
    });
    expect(resWebhookRes.statusCode).toBe(200);

    // 6. Test Customer Billing Portal
    const portalRes = await post(t, athlete, "/api/v1/billing/portal");
    expect(portalRes.statusCode).toBe(200);
    expect(portalRes.json().portalUrl).toContain("https://billing.courtiq.test/session/");

    // 7. Test Subscription Cancellation
    const subId = authedData.subscription.id;

    // Stranger cannot cancel athlete's subscription (ADR-0010: 404)
    const strangerCancelRes = await post(t, stranger, `/api/v1/billing/subscriptions/${subId}/cancel`);
    expect(strangerCancelRes.statusCode).toBe(404);

    // Athlete cancels subscription
    const cancelRes = await post(t, athlete, `/api/v1/billing/subscriptions/${subId}/cancel`);
    expect(cancelRes.statusCode).toBe(200);
    expect(cancelRes.json().cancelAtPeriodEnd).toBe(true);
  });
});
