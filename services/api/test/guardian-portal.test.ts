import { describe, expect, it } from "vitest";
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

const del = (t: T, u: U | null, url: string) =>
  t.app.inject({
    method: "DELETE",
    url,
    ...(u ? { headers: { cookie: u.cookie } } : {}),
  });

const get = (t: T, u: U | null, url: string) =>
  t.app.inject({
    method: "GET",
    url,
    ...(u ? { headers: { cookie: u.cookie } } : {}),
  });

describe("Parent & Guardian Portal & Youth Safety Monitoring (Spec §14.1, §23.4)", { timeout: 30000 }, () => {
  it("manages minor guardianship, emergency contacts, activity oversight, safety checkins, and safety lock", async () => {
    const t = await testApp();

    // 1. Create a parent (adult) and a minor athlete (15 years old)
    const parent = await user(t, "mom-sarah@courtiq.test", {
      displayName: "Sarah Guardian",
      dateOfBirth: "1985-04-12",
      emailVerified: true,
    });

    const minor = await user(t, "leo-teen@courtiq.test", {
      displayName: "Leo Young",
      dateOfBirth: "2011-06-15",
      emailVerified: true,
    });

    const stranger = await user(t, "stranger-sam@courtiq.test", {
      displayName: "Sam Stranger",
      dateOfBirth: "1992-01-01",
    });

    // 2. Minor invites guardian
    const inviteRes = await post(t, minor, "/api/v1/guardians", {
      guardianEmail: "mom-sarah@courtiq.test",
    });
    expect(inviteRes.statusCode).toBe(201);
    const relationshipId = inviteRes.json().id;

    // 3. Parent accepts guardianship
    const acceptRes = await post(t, parent, `/api/v1/guardians/${relationshipId}/accept`);
    expect(acceptRes.statusCode).toBe(204);

    // 4. Guardian views family dashboard
    const dashRes = await get(t, parent, "/api/v1/guardian/dashboard");
    expect(dashRes.statusCode).toBe(200);
    const dashboard = dashRes.json();
    expect(dashboard.wards.length).toBe(1);
    expect(dashboard.wards[0].minor.id).toBe(minor.id);
    expect(dashboard.wards[0].minor.displayName).toBe("Leo Young");
    expect(dashboard.wards[0].consents.PUBLIC_PICKUP).toBe(false);

    // 5. Guardian configures emergency contacts
    // Stranger attempting to view/edit gets 404 (ADR-0010)
    const badEmergencyGet = await get(t, stranger, `/api/v1/guardian/wards/${minor.id}/emergency`);
    expect(badEmergencyGet.statusCode).toBe(404);

    const saveEmergencyRes = await put(t, parent, `/api/v1/guardian/wards/${minor.id}/emergency`, {
      primaryContactName: "Sarah Guardian",
      primaryContactPhone: "+1-555-019-2834",
      primaryContactRelationship: "MOTHER",
      secondaryContactName: "David Young",
      secondaryContactPhone: "+1-555-019-2835",
      secondaryContactRelationship: "FATHER",
      medicalNotes: "Peanut allergy; carries EpiPen in gym bag",
    });
    expect(saveEmergencyRes.statusCode).toBe(200);
    const emergency = saveEmergencyRes.json();
    expect(emergency.primaryContactName).toBe("Sarah Guardian");
    expect(emergency.medicalNotes).toContain("Peanut allergy");

    // 6. Guardian grants consents for minor
    const grantRes = await post(t, parent, `/api/v1/guardian/wards/${minor.id}/consents`, {
      kind: "PUBLIC_PICKUP",
    });
    expect(grantRes.statusCode).toBe(201);

    const grantCompRes = await post(t, parent, `/api/v1/guardian/wards/${minor.id}/consents`, {
      kind: "COMPETITION_PLAY",
    });
    expect(grantCompRes.statusCode).toBe(201);

    // Verify consents active on dashboard
    const dashAfterConsents = await get(t, parent, "/api/v1/guardian/dashboard");
    expect(dashAfterConsents.json().wards[0].consents.PUBLIC_PICKUP).toBe(true);
    expect(dashAfterConsents.json().wards[0].consents.COMPETITION_PLAY).toBe(true);

    // Revoke one consent specifically
    const revokeRes = await del(t, parent, `/api/v1/guardian/wards/${minor.id}/consents/PUBLIC_PICKUP`);
    expect(revokeRes.statusCode).toBe(200);

    // Re-grant for safety lock test
    await post(t, parent, `/api/v1/guardian/wards/${minor.id}/consents`, {
      kind: "PUBLIC_PICKUP",
    });

    // 7. Record minor activity checkin & guardian acknowledgement
    const { recordMinorCheckin } = await import("../src/consent/guardian-portal.js");
    const checkin = await recordMinorCheckin(t.db, minor.id, {
      activityType: "PICKUP_GAME",
      activityId: "pickup-brooklyn-run-1",
      courtName: "Brooklyn Bridge Park Pier 2",
    });
    expect(checkin.parentAcknowledgedAt).toBeNull();

    // Stranger cannot acknowledge checkin (returns 404)
    const badAckRes = await post(t, stranger, `/api/v1/guardian/checkins/${checkin.id}/acknowledge`);
    expect(badAckRes.statusCode).toBe(404);

    // Parent acknowledges arrival
    const ackRes = await post(t, parent, `/api/v1/guardian/checkins/${checkin.id}/acknowledge`);
    expect(ackRes.statusCode).toBe(200);
    expect(ackRes.json().parentAcknowledgedBy).toBe(parent.id);
    expect(ackRes.json().parentAcknowledgedAt).not.toBeNull();

    // 8. Emergency Safety Lock Trigger (Spec §14.1, §23.4)
    // Parent engages safety lock to immediately freeze minor's active tournament and pickup activities
    const lockRes = await put(t, parent, `/api/v1/guardian/wards/${minor.id}/safety-settings`, {
      safetyLockActive: true,
      notifyOnPickupJoin: true,
      notifyOnCheckin: true,
    });
    expect(lockRes.statusCode).toBe(200);
    expect(lockRes.json().safetyLockActive).toBe(true);

    // Safety lock engagement automatically revokes PUBLIC_PICKUP and COMPETITION_PLAY consents
    const dashAfterLock = await get(t, parent, "/api/v1/guardian/dashboard");
    expect(dashAfterLock.json().wards[0].consents.PUBLIC_PICKUP).toBe(false);
    expect(dashAfterLock.json().wards[0].consents.COMPETITION_PLAY).toBe(false);
    expect(dashAfterLock.json().wards[0].safetySettings.safetyLockActive).toBe(true);
  });
});
