import { describe, it, expect } from "vitest";
import { adultBody, cookieOf, testApp } from "./helpers.js";

describe("Web Push VAPID, Quiet Hours & Volume Caps Engine (Spec §11.4, WP-5.1)", () => {
  it("exposes public VAPID key anonymously and enforces authentication on preference endpoints", async () => {
    const { app } = await testApp();

    // VAPID public key should be publicly available for service worker registration
    const vapidRes = await app.inject({
      method: "GET",
      url: "/api/v1/notifications/vapid-public-key",
    });
    expect(vapidRes.statusCode).toBe(200);
    const vapidData = vapidRes.json();
    expect(typeof vapidData.publicKey).toBe("string");
    expect(vapidData.publicKey.length).toBeGreaterThan(40);

    // Unauthenticated access rejected
    const getPrefs = await app.inject({
      method: "GET",
      url: "/api/v1/notifications/preferences",
    });
    expect(getPrefs.statusCode).toBe(401);

    const putPrefs = await app.inject({
      method: "PUT",
      url: "/api/v1/notifications/preferences",
      payload: { dailyCap: 5 },
    });
    expect(putPrefs.statusCode).toBe(401);

    const postSub = await app.inject({
      method: "POST",
      url: "/api/v1/notifications/push-subscriptions",
      payload: {
        endpoint: "https://example.com/push/sub-1",
        p256dh: "mock_p256dh_key_testing_1",
        auth: "mock_auth_key_testing_1",
      },
    });
    expect(postSub.statusCode).toBe(401);
  });

  it("manages user preferences and browser push subscriptions lifecycle", async () => {
    const { app } = await testApp();
    const signupRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: adultBody({ email: "push-user@example.com", displayName: "Jalen Brunson" }),
    });
    const cookie = cookieOf(signupRes);

    // 1. Fetch initial preferences (defaults initialized)
    const initialPrefsRes = await app.inject({
      method: "GET",
      url: "/api/v1/notifications/preferences",
      headers: { cookie },
    });
    expect(initialPrefsRes.statusCode).toBe(200);
    const prefs = initialPrefsRes.json();
    expect(prefs.webPushEnabled).toBe(true);
    expect(prefs.emailEnabled).toBe(true);
    expect(prefs.quietHoursEnabled).toBe(true);
    expect(prefs.quietHoursStart).toBe("22:00");
    expect(prefs.quietHoursEnd).toBe("08:00");
    expect(prefs.dailyCap).toBe(10);
    expect(prefs.deliveredPast24h).toBe(0);

    // 2. Update preferences
    const updateRes = await app.inject({
      method: "PUT",
      url: "/api/v1/notifications/preferences",
      headers: { cookie },
      payload: {
        quietHoursStart: "23:00",
        quietHoursEnd: "07:00",
        dailyCap: 5,
        courtAlerts: false,
      },
    });
    expect(updateRes.statusCode).toBe(200);
    const updated = updateRes.json();
    expect(updated.quietHoursStart).toBe("23:00");
    expect(updated.quietHoursEnd).toBe("07:00");
    expect(updated.dailyCap).toBe(5);
    expect(updated.courtAlerts).toBe(false);

    // 3. Register push subscription
    const subRes = await app.inject({
      method: "POST",
      url: "/api/v1/notifications/push-subscriptions",
      headers: { cookie },
      payload: {
        endpoint: "https://example.com/push/sub-2",
        p256dh: "mock_p256dh_key_testing_2",
        auth: "mock_auth_key_testing_2",
        userAgent: "Mozilla/5.0 Firefox/130.0",
      },
    });
    expect(subRes.statusCode).toBe(201);
    const subData = subRes.json();
    expect(subData.endpoint).toBe("https://example.com/push/sub-2");

    // 4. List push subscriptions
    const listSubRes = await app.inject({
      method: "GET",
      url: "/api/v1/notifications/push-subscriptions",
      headers: { cookie },
    });
    expect(listSubRes.statusCode).toBe(200);
    expect(listSubRes.json().items.length).toBe(1);

    // 5. Delete push subscription
    const deleteSubRes = await app.inject({
      method: "DELETE",
      url: "/api/v1/notifications/push-subscriptions",
      headers: { cookie },
      payload: { endpoint: "https://example.com/push/sub-2" },
    });
    expect(deleteSubRes.statusCode).toBe(200);
    expect(deleteSubRes.json().ok).toBe(true);

    // Verify deletion
    const verifyListRes = await app.inject({
      method: "GET",
      url: "/api/v1/notifications/push-subscriptions",
      headers: { cookie },
    });
    expect(verifyListRes.json().items.length).toBe(0);
  });

  it("evaluates and enforces overnight quiet hours (22:00 - 08:00 UTC)", async () => {
    const { app } = await testApp();
    const signupRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: adultBody({ email: "quiethours@example.com", displayName: "Josh Hart" }),
    });
    const cookie = cookieOf(signupRes);

    // Ensure quiet hours are 22:00 to 08:00 UTC
    await app.inject({
      method: "PUT",
      url: "/api/v1/notifications/preferences",
      headers: { cookie },
      payload: {
        quietHoursEnabled: true,
        quietHoursStart: "22:00",
        quietHoursEnd: "08:00",
        quietHoursTimezone: "UTC",
      },
    });

    // Case A: 23:30 UTC -> inside quiet hours -> SUPPRESSED with QUIET_HOURS
    const nightDispatch = await app.inject({
      method: "POST",
      url: "/api/v1/notifications/test-dispatch",
      headers: { cookie },
      payload: {
        kind: "GAME_INVITE",
        channel: "PUSH",
        simulatedTimeIso: "2026-10-25T23:30:00.000Z",
      },
    });
    expect(nightDispatch.statusCode).toBe(200);
    const nightData = nightDispatch.json();
    expect(nightData.delivered).toBe(false);
    expect(nightData.suppressionReason).toBe("QUIET_HOURS");

    // Case B: 04:15 UTC -> early morning inside quiet hours -> SUPPRESSED with QUIET_HOURS
    const earlyMorningDispatch = await app.inject({
      method: "POST",
      url: "/api/v1/notifications/test-dispatch",
      headers: { cookie },
      payload: {
        kind: "GAME_INVITE",
        channel: "PUSH",
        simulatedTimeIso: "2026-10-25T04:15:00.000Z",
      },
    });
    expect(earlyMorningDispatch.statusCode).toBe(200);
    expect(earlyMorningDispatch.json().delivered).toBe(false);
    expect(earlyMorningDispatch.json().suppressionReason).toBe("QUIET_HOURS");

    // Case C: 14:00 UTC -> afternoon outside quiet hours -> DELIVERED
    const afternoonDispatch = await app.inject({
      method: "POST",
      url: "/api/v1/notifications/test-dispatch",
      headers: { cookie },
      payload: {
        kind: "GAME_INVITE",
        channel: "PUSH",
        simulatedTimeIso: "2026-10-25T14:00:00.000Z",
      },
    });
    expect(afternoonDispatch.statusCode).toBe(200);
    const afternoonData = afternoonDispatch.json();
    expect(afternoonData.delivered).toBe(true);
    expect(afternoonData.suppressionReason).toBeNull();
  });

  it("enforces rolling 24-hour daily volume caps and category opt-outs", async () => {
    const { app } = await testApp();
    const signupRes = await app.inject({
      method: "POST",
      url: "/api/v1/auth/signup",
      payload: adultBody({ email: "ratecapped@example.com", displayName: "OG Anunoby" }),
    });
    const cookie = cookieOf(signupRes);

    // Set dailyCap to 2 and disable quiet hours for this test
    await app.inject({
      method: "PUT",
      url: "/api/v1/notifications/preferences",
      headers: { cookie },
      payload: {
        dailyCap: 2,
        quietHoursEnabled: false,
        courtAlerts: false, // Category opt-out
      },
    });

    const afternoonBase = "2026-10-25T14:00:00.000Z";

    // 1. Dispatch #1 -> Delivered
    const d1 = await app.inject({
      method: "POST",
      url: "/api/v1/notifications/test-dispatch",
      headers: { cookie },
      payload: { kind: "GAME_INVITE", channel: "PUSH", simulatedTimeIso: afternoonBase },
    });
    expect(d1.json().delivered).toBe(true);

    // 2. Dispatch #2 -> Delivered (reaches cap of 2)
    const d2 = await app.inject({
      method: "POST",
      url: "/api/v1/notifications/test-dispatch",
      headers: { cookie },
      payload: { kind: "GAME_INVITE", channel: "PUSH", simulatedTimeIso: "2026-10-25T14:15:00.000Z" },
    });
    expect(d2.json().delivered).toBe(true);

    // 3. Dispatch #3 -> Suppressed with DAILY_CAP_EXCEEDED
    const d3 = await app.inject({
      method: "POST",
      url: "/api/v1/notifications/test-dispatch",
      headers: { cookie },
      payload: { kind: "GAME_INVITE", channel: "PUSH", simulatedTimeIso: "2026-10-25T14:30:00.000Z" },
    });
    expect(d3.json().delivered).toBe(false);
    expect(d3.json().suppressionReason).toBe("DAILY_CAP_EXCEEDED");

    // 4. Test Category Opt-Out: COURT_ALERT should be OPTED_OUT
    const dOptOut = await app.inject({
      method: "POST",
      url: "/api/v1/notifications/test-dispatch",
      headers: { cookie },
      payload: { kind: "COURT_ALERT", channel: "PUSH", simulatedTimeIso: "2026-10-25T14:45:00.000Z" },
    });
    expect(dOptOut.json().delivered).toBe(false);
    expect(dOptOut.json().suppressionReason).toBe("OPTED_OUT");
  });
});
