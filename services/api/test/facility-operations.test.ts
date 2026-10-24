import { describe, expect, it } from "vitest";
import { grantRole } from "../src/authz/service.js";
import { testApp, user } from "./helpers.js";

type T = Awaited<ReturnType<typeof testApp>>;
type U = Awaited<ReturnType<typeof user>>;

const post = (t: T, u: U | null, url: string, body?: unknown) =>
  t.app.inject({
    method: "POST",
    url,
    payload: body ?? {},
    ...(u ? { headers: { cookie: u.cookie } } : {}),
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

describe("Facility Operations & Court Reservation OS (Spec §8.3, §23.1)", { timeout: 30000 }, () => {
  it("manages facility claims, operating hours, slot reservations, maintenance logs, and manager analytics", async () => {
    const t = await testApp();
    const admin = await user(t, "admin-facility@courtiq.test", { displayName: "Platform Admin" });
    const operator = await user(t, "operator-dave@venue.test", { displayName: "Dave Operator" });
    const player = await user(t, "player-alice@courtiq.test", { displayName: "Alice Baller" });
    const stranger = await user(t, "stranger-bob@courtiq.test", { displayName: "Bob Stranger" });

    // Grant platform admin
    await grantRole(t.db, admin.id, "PLATFORM_ADMIN");

    // 1. Create court
    const courtRes = await post(t, operator, "/api/v1/courts", {
      name: "Brooklyn Basketball Complex Court 1",
      lat: 40.6782,
      lng: -73.9442,
      indoor: true,
      surface: "WOOD",
      hoops: 2,
      lit: true,
      accessNotes: "Enter via Atlantic Avenue glass doors",
    });
    expect(courtRes.statusCode).toBe(201);
    const court = courtRes.json();
    const courtId = court.id;
    expect(court.verificationStatus).toBe("UNVERIFIED");

    // 2. Submit facility claim
    const claimRes = await post(t, operator, `/api/v1/courts/${courtId}/claims`, {
      businessName: "Brooklyn Hoops Arena LLC",
      contactEmail: "mgmt@brooklynhoops.test",
      contactPhone: "+1-718-555-0199",
    });
    expect(claimRes.statusCode).toBe(201);
    const claim = claimRes.json();
    expect(claim.status).toBe("PENDING");
    expect(claim.businessName).toBe("Brooklyn Hoops Arena LLC");

    // Duplicate claim rejected
    const dupRes = await post(t, operator, `/api/v1/courts/${courtId}/claims`, {
      businessName: "Brooklyn Hoops Arena LLC",
      contactEmail: "mgmt@brooklynhoops.test",
    });
    expect(dupRes.statusCode).toBe(400);

    // 3. Admin approves claim
    const { reviewFacilityClaim } = await import("../src/court/facility.js");
    const approvedClaim = await reviewFacilityClaim(t.db, claim.id, admin.id, "APPROVED");
    expect(approvedClaim.status).toBe("APPROVED");

    // Check facility status
    const statusRes = await get(t, operator, `/api/v1/courts/${courtId}/facility-status`);
    expect(statusRes.statusCode).toBe(200);
    const statusJson = statusRes.json();
    expect(statusJson.court.verificationStatus).toBe("FACILITY_VERIFIED");
    expect(statusJson.isManager).toBe(true);

    // 4. Configure operating hours
    // Unauthorized stranger attempting to set hours gets 404 (ADR-0010)
    const badHoursRes = await put(t, stranger, `/api/v1/courts/${courtId}/operating-hours`, {
      schedule: [
        { dayOfWeek: 1, openTime: "07:00", closeTime: "23:00", hourlyRateCents: 4500 },
      ],
    });
    expect(badHoursRes.statusCode).toBe(404);

    // Invalid open/close times rejected
    const invalidTimesRes = await put(t, operator, `/api/v1/courts/${courtId}/operating-hours`, {
      schedule: [
        { dayOfWeek: 1, openTime: "22:00", closeTime: "08:00", isClosed: false },
      ],
    });
    expect(invalidTimesRes.statusCode).toBe(400);

    // Venue manager configures operating hours (e.g. Mon-Sun 08:00 to 22:00, $50/hr)
    const setHoursRes = await put(t, operator, `/api/v1/courts/${courtId}/operating-hours`, {
      schedule: [
        { dayOfWeek: 0, openTime: "08:00", closeTime: "20:00", slotDurationMinutes: 60, hourlyRateCents: 4000 },
        { dayOfWeek: 1, openTime: "07:00", closeTime: "22:00", slotDurationMinutes: 60, hourlyRateCents: 5000 },
        { dayOfWeek: 2, openTime: "07:00", closeTime: "22:00", slotDurationMinutes: 60, hourlyRateCents: 5000 },
        { dayOfWeek: 3, openTime: "07:00", closeTime: "22:00", slotDurationMinutes: 60, hourlyRateCents: 5000 },
        { dayOfWeek: 4, openTime: "07:00", closeTime: "22:00", slotDurationMinutes: 60, hourlyRateCents: 5000 },
        { dayOfWeek: 5, openTime: "08:00", closeTime: "23:00", slotDurationMinutes: 60, hourlyRateCents: 6000 },
        { dayOfWeek: 6, openTime: "08:00", closeTime: "23:00", slotDurationMinutes: 60, hourlyRateCents: 6000 },
      ],
    });
    expect(setHoursRes.statusCode).toBe(200);
    const hours = setHoursRes.json();
    expect(hours.length).toBe(7);

    // Public reads operating hours
    const publicHours = await get(t, null, `/api/v1/courts/${courtId}/operating-hours`);
    expect(publicHours.statusCode).toBe(200);
    expect(publicHours.json()[1].hourlyRateCents).toBe(5000);

    // 5. Court slot reservations
    const now = new Date();
    // Next Monday at 14:00 to 16:00
    const startSlot = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 14, 0, 0);
    const endSlot = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 16, 0, 0);

    // Reservation end time <= start time rejected
    const badTimeRes = await post(t, player, `/api/v1/courts/${courtId}/reservations`, {
      startTime: endSlot.toISOString(),
      endTime: startSlot.toISOString(),
    });
    expect(badTimeRes.statusCode).toBe(400);

    const bookingRes = await post(t, player, `/api/v1/courts/${courtId}/reservations`, {
      startTime: startSlot.toISOString(),
      endTime: endSlot.toISOString(),
      purpose: "TEAM_PRACTICE",
      notes: "Varsity squad 5v5 scrimmage",
    });
    expect(bookingRes.statusCode).toBe(201);
    const booking = bookingRes.json();
    expect(booking.status).toBe("CONFIRMED");
    expect(booking.bookedById).toBe(player.id);
    expect(booking.totalPriceCents).toBeGreaterThan(0);

    // 6. Overlapping collision rejected
    const overlapRes = await post(t, stranger, `/api/v1/courts/${courtId}/reservations`, {
      startTime: new Date(startSlot.getTime() + 30 * 60 * 1000).toISOString(), // 30 mins later
      endTime: new Date(endSlot.getTime() + 30 * 60 * 1000).toISOString(),
      purpose: "PICKUP_RUN",
    });
    expect(overlapRes.statusCode).toBe(400);

    // 7. Privacy-preserving reservation listing
    // Public user inspecting reservations sees reserved block with NO personal notes or user id
    const publicRes = await get(t, stranger, `/api/v1/courts/${courtId}/reservations`);
    expect(publicRes.statusCode).toBe(200);
    const publicList = publicRes.json();
    expect(publicList.length).toBe(1);
    expect(publicList[0].purpose).toBe("RESERVED");
    expect(publicList[0].bookedById).toBeNull();
    expect(publicList[0].notes).toBeNull();

    // Manager inspecting reservations sees full details
    const mgrRes = await get(t, operator, `/api/v1/courts/${courtId}/reservations`);
    expect(mgrRes.statusCode).toBe(200);
    const mgrList = mgrRes.json();
    expect(mgrList[0].purpose).toBe("TEAM_PRACTICE");
    expect(mgrList[0].bookedById).toBe(player.id);
    expect(mgrList[0].notes).toBe("Varsity squad 5v5 scrimmage");

    // 8. Maintenance logging
    // Unauthorized user gets 404 (ADR-0010)
    const badMaint = await post(t, stranger, `/api/v1/courts/${courtId}/maintenance`, {
      category: "RIM_REPLACEMENT",
      description: "Replace bent breakaway rim on South basket",
      severity: "URGENT_SAFETY_HAZARD",
      costCents: 18000,
      performedAt: new Date().toISOString(),
    });
    expect(badMaint.statusCode).toBe(404);

    // Venue manager logs maintenance
    const nextInspection = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const maintRes = await post(t, operator, `/api/v1/courts/${courtId}/maintenance`, {
      category: "RIM_REPLACEMENT",
      description: "Installed heavy-duty FIBA breakaway rim and new anti-whip net",
      severity: "URGENT_SAFETY_HAZARD",
      costCents: 18500, // $185.00
      performedAt: new Date().toISOString(),
      nextInspectionDue: nextInspection.toISOString(),
    });
    expect(maintRes.statusCode).toBe(201);
    const maint = maintRes.json();
    expect(maint.category).toBe("RIM_REPLACEMENT");
    expect(maint.costCents).toBe(18500);

    // Public gets maintenance history for safety transparency
    const maintListRes = await get(t, null, `/api/v1/courts/${courtId}/maintenance`);
    expect(maintListRes.statusCode).toBe(200);
    expect(maintListRes.json().length).toBe(1);
    expect(maintListRes.json()[0].severity).toBe("URGENT_SAFETY_HAZARD");

    // 9. Venue manager analytics
    // Stranger gets 404
    const badAnalytics = await get(t, stranger, `/api/v1/courts/${courtId}/facility-analytics`);
    expect(badAnalytics.statusCode).toBe(404);

    // Operator gets full facility metrics
    const analyticsRes = await get(t, operator, `/api/v1/courts/${courtId}/facility-analytics`);
    expect(analyticsRes.statusCode).toBe(200);
    const analytics = analyticsRes.json();
    expect(analytics.courtId).toBe(courtId);
    expect(analytics.totalBookings).toBe(1);
    expect(analytics.confirmedBookings).toBe(1);
    expect(analytics.totalRevenueCents).toBeGreaterThan(0);
    expect(analytics.maintenanceCount).toBe(1);
    expect(analytics.urgentHazardsCount).toBe(1);
    expect(analytics.totalMaintenanceSpendCents).toBe(18500);
    expect(analytics.purposeBreakdown["TEAM_PRACTICE"]).toBe(1);

    // 10. Cancellation flow
    // Stranger cannot cancel someone else's reservation (returns 404)
    const badCancel = await post(t, stranger, `/api/v1/reservations/${booking.id}/cancel`, {
      reason: "Trying to hijack",
    });
    expect(badCancel.statusCode).toBe(404);

    // Player cancels their own reservation
    const cancelRes = await post(t, player, `/api/v1/reservations/${booking.id}/cancel`, {
      reason: "Coach rescheduled practice",
    });
    expect(cancelRes.statusCode).toBe(200);
    expect(cancelRes.json().status).toBe("CANCELLED");
    expect(cancelRes.json().cancellationReason).toBe("Coach rescheduled practice");

    // After cancellation, the slot becomes available again
    const rebookRes = await post(t, stranger, `/api/v1/courts/${courtId}/reservations`, {
      startTime: startSlot.toISOString(),
      endTime: endSlot.toISOString(),
      purpose: "PICKUP_RUN",
    });
    expect(rebookRes.statusCode).toBe(201);
  });
});
