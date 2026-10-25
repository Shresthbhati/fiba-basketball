import { and, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { can } from "../authz/service.js";
import type { Db } from "../db/index.js";
import {
  courtMaintenanceLogs,
  courtOperatingHours,
  courtReservations,
  courts,
  facilityClaims,
  roleAssignments,
  users,
} from "../db/schema.js";
import { AuthError } from "../identity/service.js";

export interface FacilityClaimInput {
  businessName: string;
  contactEmail: string;
  contactPhone?: string | undefined;
}

export interface OperatingDayInput {
  dayOfWeek: number; // 0-6
  openTime: string; // "08:00"
  closeTime: string; // "22:00"
  slotDurationMinutes?: number | undefined;
  hourlyRateCents?: number | undefined;
  currency?: string | undefined;
  isClosed?: boolean | undefined;
}

export interface ReservationInput {
  startTime: Date;
  endTime: Date;
  purpose?: "LEAGUE_MATCH" | "TEAM_PRACTICE" | "PICKUP_RUN" | "TRAINING" | "COMMUNITY_EVENT" | "OTHER" | undefined;
  notes?: string | undefined;
}

export interface MaintenanceInput {
  category:
    | "SURFACE_RESURFACING"
    | "RIM_REPLACEMENT"
    | "NET_REPLACEMENT"
    | "BACKBOARD_INSPECTION"
    | "LIGHTING_REPAIR"
    | "COURT_STRIPING"
    | "GENERAL_CLEANING"
    | "SAFETY_AUDIT";
  description: string;
  severity?: "ROUTINE" | "RECOMMENDED" | "URGENT_SAFETY_HAZARD" | undefined;
  costCents?: number | undefined;
  performedAt: Date;
  nextInspectionDue?: Date | undefined;
}

/** Verifies that the user is an authorized venue operator/manager for this court. */
export async function assertVenueManagerAccess(
  db: Db,
  courtId: string,
  userId: string,
): Promise<typeof courts.$inferSelect> {
  const [court] = await db.select().from(courts).where(eq(courts.id, courtId));
  if (!court) {
    throw new AuthError(404, "Court not found");
  }

  if (court.createdBy === userId) {
    return court;
  }

  const [approvedClaim] = await db
    .select()
    .from(facilityClaims)
    .where(
      and(
        eq(facilityClaims.courtId, courtId),
        eq(facilityClaims.operatorId, userId),
        eq(facilityClaims.status, "APPROVED"),
      ),
    );
  if (approvedClaim) {
    return court;
  }

  const [assignment] = await db
    .select()
    .from(roleAssignments)
    .where(
      and(
        eq(roleAssignments.userId, userId),
        eq(roleAssignments.role, "VENUE_MANAGER"),
        or(eq(roleAssignments.resourceId, courtId), isNull(roleAssignments.resourceId)),
      ),
    );
  if (assignment) {
    return court;
  }

  const isPlatformAdmin = await can(db, userId, "court:verify");
  if (isPlatformAdmin) {
    return court;
  }

  throw new AuthError(404, "Court not found or access denied");
}

/** Submit a claim to operate a court facility. */
export async function submitFacilityClaim(
  db: Db,
  courtId: string,
  operatorId: string,
  input: FacilityClaimInput,
) {
  const [court] = await db.select().from(courts).where(eq(courts.id, courtId));
  if (!court) {
    throw new AuthError(404, "Court not found");
  }

  const [existing] = await db
    .select()
    .from(facilityClaims)
    .where(and(eq(facilityClaims.courtId, courtId), eq(facilityClaims.operatorId, operatorId)));

  if (existing) {
    if (existing.status === "APPROVED") {
      throw new AuthError(400, "Facility claim already approved for this operator");
    }
    if (existing.status === "PENDING") {
      throw new AuthError(400, "Facility claim is already pending verification");
    }
  }

  const [claim] = await db
    .insert(facilityClaims)
    .values({
      courtId,
      operatorId,
      businessName: input.businessName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone ?? null,
      status: "PENDING",
    })
    .returning();

  return claim;
}

/** Approve or reject a facility claim. */
export async function reviewFacilityClaim(
  db: Db,
  claimId: string,
  reviewerId: string,
  status: "APPROVED" | "REJECTED",
) {
  const isPlatformAdmin = await can(db, reviewerId, "court:verify");
  if (!isPlatformAdmin) {
    throw new AuthError(404, "Claim not found or access denied");
  }

  const [claim] = await db.select().from(facilityClaims).where(eq(facilityClaims.id, claimId));
  if (!claim) {
    throw new AuthError(404, "Claim not found");
  }

  const now = new Date();
  const [updated] = await db
    .update(facilityClaims)
    .set({
      status,
      verifiedAt: status === "APPROVED" ? now : null,
    })
    .where(eq(facilityClaims.id, claimId))
    .returning();

  if (status === "APPROVED") {
    await db
      .update(courts)
      .set({ verificationStatus: "FACILITY_VERIFIED" })
      .where(eq(courts.id, claim.courtId));

    await db
      .insert(roleAssignments)
      .values({
        userId: claim.operatorId,
        role: "VENUE_MANAGER",
        resourceType: "court",
        resourceId: claim.courtId,
      })
      .onConflictDoNothing?.();
  }

  if (!updated) {
    throw new AuthError(500, "Failed to update claim");
  }

  return updated;
}

/** Get facility status and claims for a court. */
export async function getCourtFacilityStatus(db: Db, courtId: string, userId?: string) {
  const [court] = await db.select().from(courts).where(eq(courts.id, courtId));
  if (!court) {
    throw new AuthError(404, "Court not found");
  }

  let userClaim = null;
  let isManager = false;

  if (userId) {
    const [claim] = await db
      .select()
      .from(facilityClaims)
      .where(and(eq(facilityClaims.courtId, courtId), eq(facilityClaims.operatorId, userId)));
    userClaim = claim ?? null;

    try {
      await assertVenueManagerAccess(db, courtId, userId);
      isManager = true;
    } catch {
      isManager = false;
    }
  }

  return {
    court: {
      id: court.id,
      name: court.name,
      surface: court.surface,
      indoor: court.indoor,
      hoops: court.hoops,
      lit: court.lit,
      verificationStatus: court.verificationStatus,
    },
    userClaim,
    isManager,
  };
}

/** List operating hours for a court (0 = Sunday .. 6 = Saturday). */
export async function listCourtOperatingHours(db: Db, courtId: string) {
  const [court] = await db.select().from(courts).where(eq(courts.id, courtId));
  if (!court) {
    throw new AuthError(404, "Court not found");
  }

  const rows = await db
    .select()
    .from(courtOperatingHours)
    .where(eq(courtOperatingHours.courtId, courtId))
    .orderBy(courtOperatingHours.dayOfWeek);

  if (rows.length === 0) {
    // Return standard default schedule
    return Array.from({ length: 7 }, (_, dayOfWeek) => ({
      id: `default-${dayOfWeek}`,
      courtId,
      dayOfWeek,
      openTime: "08:00",
      closeTime: "22:00",
      slotDurationMinutes: 60,
      hourlyRateCents: 0,
      currency: "USD",
      isClosed: false,
    }));
  }

  return rows;
}

/** Set or update weekly operating hours for a court. */
export async function updateCourtOperatingHours(
  db: Db,
  courtId: string,
  operatorId: string,
  schedule: OperatingDayInput[],
) {
  await assertVenueManagerAccess(db, courtId, operatorId);

  for (const day of schedule) {
    if (day.dayOfWeek < 0 || day.dayOfWeek > 6) {
      throw new AuthError(400, "Invalid day of week (must be 0-6)");
    }
    if (day.openTime >= day.closeTime && !day.isClosed) {
      throw new AuthError(400, `Close time must be after open time for day ${day.dayOfWeek}`);
    }

    const [existing] = await db
      .select()
      .from(courtOperatingHours)
      .where(
        and(
          eq(courtOperatingHours.courtId, courtId),
          eq(courtOperatingHours.dayOfWeek, day.dayOfWeek),
        ),
      );

    if (existing) {
      await db
        .update(courtOperatingHours)
        .set({
          openTime: day.openTime,
          closeTime: day.closeTime,
          slotDurationMinutes: day.slotDurationMinutes ?? 60,
          hourlyRateCents: day.hourlyRateCents ?? 0,
          currency: day.currency ?? "USD",
          isClosed: day.isClosed ?? false,
        })
        .where(eq(courtOperatingHours.id, existing.id));
    } else {
      await db.insert(courtOperatingHours).values({
        courtId,
        dayOfWeek: day.dayOfWeek,
        openTime: day.openTime,
        closeTime: day.closeTime,
        slotDurationMinutes: day.slotDurationMinutes ?? 60,
        hourlyRateCents: day.hourlyRateCents ?? 0,
        currency: day.currency ?? "USD",
        isClosed: day.isClosed ?? false,
      });
    }
  }

  return listCourtOperatingHours(db, courtId);
}

/** List reservations for a court with privacy filters. */
export async function listCourtReservations(
  db: Db,
  courtId: string,
  requestingUserId?: string,
  fromDate?: Date,
  toDate?: Date,
) {
  const [court] = await db.select().from(courts).where(eq(courts.id, courtId));
  if (!court) {
    throw new AuthError(404, "Court not found");
  }

  let isManager = false;
  if (requestingUserId) {
    try {
      await assertVenueManagerAccess(db, courtId, requestingUserId);
      isManager = true;
    } catch {
      isManager = false;
    }
  }

  const startBound = fromDate ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
  const endBound = toDate ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select()
    .from(courtReservations)
    .where(
      and(
        eq(courtReservations.courtId, courtId),
        gte(courtReservations.startTime, startBound),
        lte(courtReservations.startTime, endBound),
      ),
    )
    .orderBy(courtReservations.startTime);

  // Return full details to venue manager or booker; privacy-strip for others
  return rows.map((r) => {
    const isOwner = requestingUserId && r.bookedById === requestingUserId;
    if (isManager || isOwner) {
      return r;
    }
    return {
      id: r.id,
      courtId: r.courtId,
      startTime: r.startTime,
      endTime: r.endTime,
      purpose: "RESERVED",
      status: r.status,
      totalPriceCents: 0,
      notes: null,
      bookedById: null,
      createdAt: r.createdAt,
    };
  });
}

/** Create a court reservation with collision prevention. */
export async function createCourtReservation(
  db: Db,
  courtId: string,
  bookedById: string,
  input: ReservationInput,
) {
  const [court] = await db.select().from(courts).where(eq(courts.id, courtId));
  if (!court) {
    throw new AuthError(404, "Court not found");
  }

  const start = new Date(input.startTime);
  const end = new Date(input.endTime);

  if (end <= start) {
    throw new AuthError(400, "Reservation end time must be after start time");
  }

  // Check collision with existing confirmed reservations
  const overlapping = await db
    .select()
    .from(courtReservations)
    .where(
      and(
        eq(courtReservations.courtId, courtId),
        eq(courtReservations.status, "CONFIRMED"),
        lte(courtReservations.startTime, end),
        gte(courtReservations.endTime, start),
      ),
    );

  // Filter actual overlapping interval (start < existing.end && end > existing.start)
  const hasConflict = overlapping.some(
    (existing) => start < existing.endTime && end > existing.startTime,
  );

  if (hasConflict) {
    throw new AuthError(400, "Court slot is already booked for this timeframe");
  }

  // Calculate pricing based on operating hours
  const dayOfWeek = start.getDay();
  const [hours] = await db
    .select()
    .from(courtOperatingHours)
    .where(
      and(
        eq(courtOperatingHours.courtId, courtId),
        eq(courtOperatingHours.dayOfWeek, dayOfWeek),
      ),
    );

  if (hours && hours.isClosed) {
    throw new AuthError(400, "Court is closed on this day of the week");
  }

  const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  const hourlyRate = hours?.hourlyRateCents ?? 0;
  const totalPriceCents = Math.round(durationHours * hourlyRate);

  const [reservation] = await db
    .insert(courtReservations)
    .values({
      courtId,
      bookedById,
      startTime: start,
      endTime: end,
      purpose: input.purpose ?? "PICKUP_RUN",
      status: "CONFIRMED",
      totalPriceCents,
      notes: input.notes ?? null,
    })
    .returning();

  return reservation;
}

/** Cancel a reservation. */
export async function cancelCourtReservation(
  db: Db,
  reservationId: string,
  userId: string,
  reason?: string,
) {
  const [reservation] = await db
    .select()
    .from(courtReservations)
    .where(eq(courtReservations.id, reservationId));

  if (!reservation) {
    throw new AuthError(404, "Reservation not found");
  }

  let isManager = false;
  try {
    await assertVenueManagerAccess(db, reservation.courtId, userId);
    isManager = true;
  } catch {
    isManager = false;
  }

  if (reservation.bookedById !== userId && !isManager) {
    throw new AuthError(404, "Reservation not found or access denied");
  }

  const [updated] = await db
    .update(courtReservations)
    .set({
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancellationReason: reason ?? null,
    })
    .where(eq(courtReservations.id, reservationId))
    .returning();

  if (!updated) {
    throw new AuthError(500, "Failed to update claim");
  }

  return updated;
}

/** Log a maintenance event for a court. */
export async function logCourtMaintenance(
  db: Db,
  courtId: string,
  loggedById: string,
  input: MaintenanceInput,
) {
  await assertVenueManagerAccess(db, courtId, loggedById);

  const [log] = await db
    .insert(courtMaintenanceLogs)
    .values({
      courtId,
      loggedById,
      category: input.category,
      description: input.description,
      severity: input.severity ?? "ROUTINE",
      costCents: input.costCents ?? 0,
      performedAt: new Date(input.performedAt),
      nextInspectionDue: input.nextInspectionDue ? new Date(input.nextInspectionDue) : null,
    })
    .returning();

  return log;
}

/** List maintenance history for a court. */
export async function listCourtMaintenanceLogs(db: Db, courtId: string) {
  const [court] = await db.select().from(courts).where(eq(courts.id, courtId));
  if (!court) {
    throw new AuthError(404, "Court not found");
  }

  return db
    .select({
      id: courtMaintenanceLogs.id,
      courtId: courtMaintenanceLogs.courtId,
      category: courtMaintenanceLogs.category,
      description: courtMaintenanceLogs.description,
      severity: courtMaintenanceLogs.severity,
      costCents: courtMaintenanceLogs.costCents,
      performedAt: courtMaintenanceLogs.performedAt,
      nextInspectionDue: courtMaintenanceLogs.nextInspectionDue,
      createdAt: courtMaintenanceLogs.createdAt,
      loggerName: users.displayName,
    })
    .from(courtMaintenanceLogs)
    .leftJoin(users, eq(courtMaintenanceLogs.loggedById, users.id))
    .where(eq(courtMaintenanceLogs.courtId, courtId))
    .orderBy(desc(courtMaintenanceLogs.performedAt));
}

/** Get venue manager utilization analytics. */
export async function getFacilityAnalytics(db: Db, courtId: string, operatorId: string) {
  await assertVenueManagerAccess(db, courtId, operatorId);

  const allReservations = await db
    .select()
    .from(courtReservations)
    .where(eq(courtReservations.courtId, courtId));

  const confirmedReservations = allReservations.filter((r) => r.status === "CONFIRMED");
  const cancelledReservations = allReservations.filter((r) => r.status === "CANCELLED");

  const totalRevenueCents = confirmedReservations.reduce((sum, r) => sum + r.totalPriceCents, 0);

  // Purpose breakdown
  const purposeCounts: Record<string, number> = {};
  for (const r of confirmedReservations) {
    purposeCounts[r.purpose] = (purposeCounts[r.purpose] ?? 0) + 1;
  }

  // Maintenance statistics
  const maintenance = await db
    .select()
    .from(courtMaintenanceLogs)
    .where(eq(courtMaintenanceLogs.courtId, courtId));

  const urgentHazardsCount = maintenance.filter(
    (m) => m.severity === "URGENT_SAFETY_HAZARD",
  ).length;
  const totalMaintenanceSpendCents = maintenance.reduce((sum, m) => sum + m.costCents, 0);

  const futureInspections = maintenance
    .map((m) => m.nextInspectionDue)
    .filter((d): d is Date => d !== null && d.getTime() > Date.now())
    .sort((a, b) => a.getTime() - b.getTime());

  const nextInspectionDue = futureInspections[0] ?? null;

  // Compute 14-day utilization percentage
  const totalBookedHours = confirmedReservations.reduce((sum, r) => {
    return sum + (r.endTime.getTime() - r.startTime.getTime()) / (1000 * 60 * 60);
  }, 0);

  // Approximate available hours: 14 days * 14 hours/day = 196 hours
  const approximateAvailableHours = 14 * 14;
  const utilizationRate = Math.min(
    100,
    Math.round((totalBookedHours / approximateAvailableHours) * 100),
  );

  return {
    courtId,
    totalBookings: allReservations.length,
    confirmedBookings: confirmedReservations.length,
    cancelledBookings: cancelledReservations.length,
    totalRevenueCents,
    utilizationRate,
    maintenanceCount: maintenance.length,
    urgentHazardsCount,
    totalMaintenanceSpendCents,
    nextInspectionDue,
    purposeBreakdown: purposeCounts,
  };
}
