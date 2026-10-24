import { and, desc, eq } from "drizzle-orm";
import { writeAudit } from "../audit/service.js";
import type { Db } from "../db/index.js";
import {
  courts,
  guardianRelationships,
  guardianSafetySettings,
  minorActivityCheckins,
  minorEmergencyContacts,
  pickupGames,
  pickupParticipants,
  users,
} from "../db/schema.js";
import { AuthError } from "../identity/service.js";
import { consentsFor, revokeConsent } from "./service.js";

export interface EmergencyContactInput {
  primaryContactName: string;
  primaryContactPhone: string;
  primaryContactRelationship?: string | undefined;
  secondaryContactName?: string | undefined;
  secondaryContactPhone?: string | undefined;
  secondaryContactRelationship?: string | undefined;
  medicalNotes?: string | undefined;
}

export interface SafetySettingsInput {
  notifyOnPickupJoin?: boolean | undefined;
  notifyOnTournamentRoster?: boolean | undefined;
  notifyOnCheckin?: boolean | undefined;
  safetyLockActive?: boolean | undefined;
}

/** Asserts that the actor is an active guardian of the given minor (or the minor themself). */
export async function assertGuardianOrSelf(
  db: Db,
  actorId: string,
  minorId: string,
) {
  if (actorId === minorId) return;

  const [rel] = await db
    .select()
    .from(guardianRelationships)
    .where(
      and(
        eq(guardianRelationships.guardianId, actorId),
        eq(guardianRelationships.minorId, minorId),
        eq(guardianRelationships.status, "ACTIVE"),
      ),
    );

  if (!rel) {
    throw new AuthError(404, "Minor relationship not found or unauthorized");
  }
}

/** Asserts that the actor is an active guardian of the given minor. */
export async function assertActiveGuardian(
  db: Db,
  guardianId: string,
  minorId: string,
) {
  const [rel] = await db
    .select()
    .from(guardianRelationships)
    .where(
      and(
        eq(guardianRelationships.guardianId, guardianId),
        eq(guardianRelationships.minorId, minorId),
        eq(guardianRelationships.status, "ACTIVE"),
      ),
    );

  if (!rel) {
    throw new AuthError(404, "Guardian relationship not found or unauthorized");
  }
}

/** Get full guardian dashboard overview with all linked wards. */
export async function getGuardianDashboard(db: Db, guardianId: string) {
  // Find all active wards
  const wardsRels = await db
    .select({
      id: guardianRelationships.id,
      minorId: guardianRelationships.minorId,
      status: guardianRelationships.status,
      verifiedAt: guardianRelationships.verifiedAt,
      minorName: users.displayName,
      minorEmail: users.email,
      minorDob: users.dateOfBirth,
    })
    .from(guardianRelationships)
    .innerJoin(users, eq(users.id, guardianRelationships.minorId))
    .where(
      and(
        eq(guardianRelationships.guardianId, guardianId),
        eq(guardianRelationships.status, "ACTIVE"),
      ),
    );

  const wardSummaries = await Promise.all(
    wardsRels.map(async (w) => {
      // Consents
      const consents = await consentsFor(db, { id: w.minorId, isMinor: true });

      // Emergency Contacts
      const [emergency] = await db
        .select()
        .from(minorEmergencyContacts)
        .where(eq(minorEmergencyContacts.minorId, w.minorId));

      // Safety Settings
      const [settings] = await db
        .select()
        .from(guardianSafetySettings)
        .where(
          and(
            eq(guardianSafetySettings.guardianId, guardianId),
            eq(guardianSafetySettings.minorId, w.minorId),
          ),
        );

      // Upcoming pickup games
      const upcomingPickups = await db
        .select({
          gameId: pickupGames.id,
          title: pickupGames.title,
          startsAt: pickupGames.startsAt,
          endsAt: pickupGames.endsAt,
          courtName: courts.name,
          hostName: users.displayName,
        })
        .from(pickupParticipants)
        .innerJoin(pickupGames, eq(pickupGames.id, pickupParticipants.gameId))
        .innerJoin(courts, eq(courts.id, pickupGames.courtId))
        .leftJoin(users, eq(users.id, pickupGames.hostId))
        .where(
          and(
            eq(pickupParticipants.userId, w.minorId),
            eq(pickupParticipants.status, "CONFIRMED"),
          ),
        )
        .limit(5);

      // Recent check-ins
      const recentCheckins = await db
        .select()
        .from(minorActivityCheckins)
        .where(eq(minorActivityCheckins.minorId, w.minorId))
        .orderBy(desc(minorActivityCheckins.checkedInAt))
        .limit(5);

      return {
        relationshipId: w.id,
        minor: {
          id: w.minorId,
          displayName: w.minorName,
          email: w.minorEmail,
          dateOfBirth: w.minorDob,
        },
        consents,
        emergencyContacts: emergency ?? null,
        safetySettings: settings ?? {
          notifyOnPickupJoin: true,
          notifyOnTournamentRoster: true,
          notifyOnCheckin: true,
          safetyLockActive: false,
        },
        upcomingActivities: upcomingPickups.map((p) => ({
          type: "PICKUP_GAME",
          id: p.gameId,
          title: p.title,
          startsAt: p.startsAt,
          courtName: p.courtName,
          hostName: p.hostName ?? "Community Host",
        })),
        recentCheckins,
      };
    }),
  );

  return {
    guardianId,
    wards: wardSummaries,
  };
}

/** Get emergency contact details for a ward. */
export async function getWardEmergencyContacts(
  db: Db,
  actorId: string,
  minorId: string,
) {
  await assertGuardianOrSelf(db, actorId, minorId);

  const [row] = await db
    .select()
    .from(minorEmergencyContacts)
    .where(eq(minorEmergencyContacts.minorId, minorId));

  return row ?? null;
}

/** Save or update emergency contacts for a minor ward. */
export async function saveWardEmergencyContacts(
  db: Db,
  guardianId: string,
  minorId: string,
  input: EmergencyContactInput,
) {
  await assertActiveGuardian(db, guardianId, minorId);

  const [existing] = await db
    .select()
    .from(minorEmergencyContacts)
    .where(eq(minorEmergencyContacts.minorId, minorId));

  if (existing) {
    const [updated] = await db
      .update(minorEmergencyContacts)
      .set({
        primaryContactName: input.primaryContactName,
        primaryContactPhone: input.primaryContactPhone,
        primaryContactRelationship: input.primaryContactRelationship ?? "PARENT",
        secondaryContactName: input.secondaryContactName ?? null,
        secondaryContactPhone: input.secondaryContactPhone ?? null,
        secondaryContactRelationship: input.secondaryContactRelationship ?? null,
        medicalNotes: input.medicalNotes ?? null,
        updatedById: guardianId,
        updatedAt: new Date(),
      })
      .where(eq(minorEmergencyContacts.id, existing.id))
      .returning();

    await writeAudit(db, {
      actorId: guardianId,
      action: "guardian.emergency_contacts_updated",
      resourceType: "user",
      resourceId: minorId,
    });

    return updated!;
  }

  const [inserted] = await db
    .insert(minorEmergencyContacts)
    .values({
      minorId,
      primaryContactName: input.primaryContactName,
      primaryContactPhone: input.primaryContactPhone,
      primaryContactRelationship: input.primaryContactRelationship ?? "PARENT",
      secondaryContactName: input.secondaryContactName ?? null,
      secondaryContactPhone: input.secondaryContactPhone ?? null,
      secondaryContactRelationship: input.secondaryContactRelationship ?? null,
      medicalNotes: input.medicalNotes ?? null,
      updatedById: guardianId,
    })
    .returning();

  await writeAudit(db, {
    actorId: guardianId,
    action: "guardian.emergency_contacts_created",
    resourceType: "user",
    resourceId: minorId,
  });

  return inserted!;
}

/** Update safety notifications and emergency freeze / safety lock. */
export async function updateWardSafetySettings(
  db: Db,
  guardianId: string,
  minorId: string,
  input: SafetySettingsInput,
) {
  await assertActiveGuardian(db, guardianId, minorId);

  const [existing] = await db
    .select()
    .from(guardianSafetySettings)
    .where(
      and(
        eq(guardianSafetySettings.guardianId, guardianId),
        eq(guardianSafetySettings.minorId, minorId),
      ),
    );

  let updatedRow;
  if (existing) {
    const [row] = await db
      .update(guardianSafetySettings)
      .set({
        notifyOnPickupJoin: input.notifyOnPickupJoin ?? existing.notifyOnPickupJoin,
        notifyOnTournamentRoster: input.notifyOnTournamentRoster ?? existing.notifyOnTournamentRoster,
        notifyOnCheckin: input.notifyOnCheckin ?? existing.notifyOnCheckin,
        safetyLockActive: input.safetyLockActive ?? existing.safetyLockActive,
        updatedAt: new Date(),
      })
      .where(eq(guardianSafetySettings.id, existing.id))
      .returning();
    updatedRow = row;
  } else {
    const [row] = await db
      .insert(guardianSafetySettings)
      .values({
        guardianId,
        minorId,
        notifyOnPickupJoin: input.notifyOnPickupJoin ?? true,
        notifyOnTournamentRoster: input.notifyOnTournamentRoster ?? true,
        notifyOnCheckin: input.notifyOnCheckin ?? true,
        safetyLockActive: input.safetyLockActive ?? false,
      })
      .returning();
    updatedRow = row;
  }

  // If safety lock was activated, trigger immediate emergency pause:
  // Revoke active public pickup and competition play consent grants immediately (Spec §14.1)
  if (input.safetyLockActive === true) {
    await revokeConsent(db, guardianId, minorId, "PUBLIC_PICKUP");
    await revokeConsent(db, guardianId, minorId, "COMPETITION_PLAY");
    await writeAudit(db, {
      actorId: guardianId,
      action: "guardian.safety_lock_engaged",
      resourceType: "user",
      resourceId: minorId,
    });
  }

  return updatedRow!;
}

/** Acknowledge youth safety checkin. */
export async function acknowledgeCheckin(
  db: Db,
  guardianId: string,
  checkinId: string,
) {
  const [checkin] = await db
    .select()
    .from(minorActivityCheckins)
    .where(eq(minorActivityCheckins.id, checkinId));

  if (!checkin) {
    throw new AuthError(404, "Check-in record not found");
  }

  await assertActiveGuardian(db, guardianId, checkin.minorId);

  const [updated] = await db
    .update(minorActivityCheckins)
    .set({
      parentAcknowledgedAt: new Date(),
      parentAcknowledgedBy: guardianId,
    })
    .where(eq(minorActivityCheckins.id, checkinId))
    .returning();

  return updated!;
}

/** Record a minor's arrival/check-in at court activity. */
export async function recordMinorCheckin(
  db: Db,
  minorId: string,
  input: { activityType: string; activityId: string; courtName: string },
) {
  const [inserted] = await db
    .insert(minorActivityCheckins)
    .values({
      minorId,
      activityType: input.activityType,
      activityId: input.activityId,
      courtName: input.courtName,
    })
    .returning();

  return inserted!;
}
