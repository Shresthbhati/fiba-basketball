import { and, between, desc, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { courtPhotos, courtReports, courtVerifications, courts, users } from "../db/schema.js";
import { MAX_RESULTS, boundingBox, haversineMeters, roundDistance } from "../geo/distance.js";
import { AuthError } from "../identity/service.js";

export type CourtInput = {
  name: string; lat: number; lng: number; indoor?: boolean | undefined; surface?: string | undefined;
  hoops?: number | undefined; lit?: boolean | undefined; accessNotes?: string | undefined;
};

export const toPublicCourt = (c: typeof courts.$inferSelect) => ({
  id: c.id, name: c.name, lat: c.lat, lng: c.lng, indoor: c.indoor, surface: c.surface, hoops: c.hoops,
  lit: c.lit, accessNotes: c.accessNotes, verificationStatus: c.verificationStatus,
});

export const toPublicPhoto = (p: typeof courtPhotos.$inferSelect, userDisplayName?: string) => ({
  id: p.id,
  courtId: p.courtId,
  userId: p.userId,
  userDisplayName: userDisplayName ?? "Community Member",
  url: p.url,
  caption: p.caption,
  isPrimary: p.isPrimary,
  status: p.status,
  createdAt: p.createdAt.toISOString(),
});

export async function createCourt(db: Db, userId: string, input: CourtInput) {
  const [row] = await db.insert(courts).values({
    name: input.name, lat: input.lat, lng: input.lng, indoor: input.indoor ?? false, surface: input.surface ?? null,
    hoops: input.hoops ?? null, lit: input.lit ?? null, accessNotes: input.accessNotes ?? null, createdBy: userId,
  }).returning();
  return toPublicCourt(row!);
}

export async function getCourt(db: Db, id: string) {
  const [row] = await db.select().from(courts).where(eq(courts.id, id));
  return row ? toPublicCourt(row) : null;
}

export async function nearbyCourts(
  db: Db,
  q: { lat: number; lng: number; radiusM: number; indoor?: boolean | undefined },
) {
  const box = boundingBox(q, q.radiusM);
  const rows = await db
    .select()
    .from(courts)
    .where(and(
      between(courts.lat, box.minLat, box.maxLat),
      between(courts.lng, box.minLng, box.maxLng),
      q.indoor === undefined ? undefined : eq(courts.indoor, q.indoor),
    ));
  return rows
    .map((c) => ({ c, d: haversineMeters(q, c) }))
    .filter((x) => x.d <= q.radiusM)
    .sort((a, b) => a.d - b.d)
    .slice(0, MAX_RESULTS)
    .map(({ c, d }) => ({ ...toPublicCourt(c), distanceM: roundDistance(d) }));
}

export async function reportCourt(db: Db, userId: string, courtId: string, kind: string, note?: string) {
  await db.insert(courtReports).values({ courtId, userId, kind, note: note ?? null });
}

export async function setVerification(db: Db, courtId: string, status: string) {
  const [row] = await db.update(courts).set({ verificationStatus: status }).where(eq(courts.id, courtId)).returning();
  return row ? toPublicCourt(row) : null;
}

export async function listCourtPhotos(db: Db, courtId: string) {
  const court = await getCourt(db, courtId);
  if (!court) throw new AuthError(404, "Court not found");

  const rows = await db
    .select({ photo: courtPhotos, user: users })
    .from(courtPhotos)
    .innerJoin(users, eq(users.id, courtPhotos.userId))
    .where(and(eq(courtPhotos.courtId, courtId), eq(courtPhotos.status, "APPROVED")))
    .orderBy(desc(courtPhotos.isPrimary), desc(courtPhotos.createdAt));

  return rows.map((r) => toPublicPhoto(r.photo, r.user.displayName));
}

export async function addCourtPhoto(
  db: Db,
  userId: string,
  courtId: string,
  input: { url: string; caption?: string | undefined; isPrimary?: boolean | undefined }
) {
  const court = await getCourt(db, courtId);
  if (!court) throw new AuthError(404, "Court not found");

  const existing = await db
    .select({ id: courtPhotos.id })
    .from(courtPhotos)
    .where(eq(courtPhotos.courtId, courtId));

  const shouldBePrimary = Boolean(input.isPrimary || existing.length === 0);

  if (shouldBePrimary && existing.length > 0) {
    await db
      .update(courtPhotos)
      .set({ isPrimary: false })
      .where(eq(courtPhotos.courtId, courtId));
  }

  const [row] = await db
    .insert(courtPhotos)
    .values({
      courtId,
      userId,
      url: input.url,
      caption: input.caption ?? null,
      isPrimary: shouldBePrimary,
      status: "APPROVED",
    })
    .returning();

  const [user] = await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, userId));
  return toPublicPhoto(row!, user?.displayName);
}

export async function deleteCourtPhoto(db: Db, userId: string, courtId: string, photoId: string) {
  const court = await getCourt(db, courtId);
  if (!court) throw new AuthError(404, "Court not found");

  const [photo] = await db
    .select()
    .from(courtPhotos)
    .where(and(eq(courtPhotos.id, photoId), eq(courtPhotos.courtId, courtId)));

  if (!photo) throw new AuthError(404, "Photo not found");

  // Only photo uploader can delete
  if (photo.userId !== userId) {
    throw new AuthError(404, "Not Found");
  }

  await db.delete(courtPhotos).where(eq(courtPhotos.id, photoId));
  return { ok: true };
}

export async function setPrimaryCourtPhoto(db: Db, _userId: string, courtId: string, photoId: string) {
  const court = await getCourt(db, courtId);
  if (!court) throw new AuthError(404, "Court not found");

  const [photo] = await db
    .select()
    .from(courtPhotos)
    .where(and(eq(courtPhotos.id, photoId), eq(courtPhotos.courtId, courtId)));

  if (!photo) throw new AuthError(404, "Photo not found");

  await db
    .update(courtPhotos)
    .set({ isPrimary: false })
    .where(eq(courtPhotos.courtId, courtId));

  const [updated] = await db
    .update(courtPhotos)
    .set({ isPrimary: true })
    .where(eq(courtPhotos.id, photoId))
    .returning();

  return toPublicPhoto(updated!);
}

export async function getCourtVerifications(db: Db, courtId: string) {
  const court = await getCourt(db, courtId);
  if (!court) throw new AuthError(404, "Court not found");

  const rows = await db
    .select({ v: courtVerifications, user: users })
    .from(courtVerifications)
    .innerJoin(users, eq(users.id, courtVerifications.userId))
    .where(eq(courtVerifications.courtId, courtId))
    .orderBy(desc(courtVerifications.createdAt));

  const surfaces: Record<string, number> = {};
  const hoops: Record<number, number> = {};
  let litYes = 0;
  let litNo = 0;
  let indoorYes = 0;
  let indoorNo = 0;

  for (const { v } of rows) {
    if (v.confirmedSurface) {
      surfaces[v.confirmedSurface] = (surfaces[v.confirmedSurface] ?? 0) + 1;
    }
    if (v.confirmedHoops !== null && v.confirmedHoops !== undefined) {
      hoops[v.confirmedHoops] = (hoops[v.confirmedHoops] ?? 0) + 1;
    }
    if (v.confirmedLit !== null && v.confirmedLit !== undefined) {
      if (v.confirmedLit) litYes++; else litNo++;
    }
    if (v.confirmedIndoor !== null && v.confirmedIndoor !== undefined) {
      if (v.confirmedIndoor) indoorYes++; else indoorNo++;
    }
  }

  return {
    courtId,
    totalConfirmations: rows.length,
    verificationStatus: court.verificationStatus,
    consensus: {
      surfaces,
      hoops,
      lit: { yes: litYes, no: litNo },
      indoor: { yes: indoorYes, no: indoorNo },
    },
    recentConfirmations: rows.slice(0, 10).map(({ v, user }) => ({
      userId: v.userId,
      userDisplayName: user.displayName,
      confirmedSurface: v.confirmedSurface,
      confirmedHoops: v.confirmedHoops,
      confirmedLit: v.confirmedLit,
      confirmedIndoor: v.confirmedIndoor,
      notes: v.notes,
      createdAt: v.createdAt.toISOString(),
    })),
  };
}

export async function confirmCourtAttributes(
  db: Db,
  userId: string,
  courtId: string,
  input: {
    confirmedSurface?: string | undefined;
    confirmedHoops?: number | undefined;
    confirmedLit?: boolean | undefined;
    confirmedIndoor?: boolean | undefined;
    notes?: string | undefined;
  }
) {
  const court = await getCourt(db, courtId);
  if (!court) throw new AuthError(404, "Court not found");

  await db
    .insert(courtVerifications)
    .values({
      courtId,
      userId,
      confirmedSurface: input.confirmedSurface ?? null,
      confirmedHoops: input.confirmedHoops ?? null,
      confirmedLit: input.confirmedLit ?? null,
      confirmedIndoor: input.confirmedIndoor ?? null,
      notes: input.notes ?? null,
    })
    .onConflictDoUpdate({
      target: [courtVerifications.courtId, courtVerifications.userId],
      set: {
        confirmedSurface: input.confirmedSurface ?? null,
        confirmedHoops: input.confirmedHoops ?? null,
        confirmedLit: input.confirmedLit ?? null,
        confirmedIndoor: input.confirmedIndoor ?? null,
        notes: input.notes ?? null,
      },
    });

  const allVerifications = await db
    .select({ id: courtVerifications.id })
    .from(courtVerifications)
    .where(eq(courtVerifications.courtId, courtId));

  let updatedStatus = court.verificationStatus;

  if (allVerifications.length >= 3 && court.verificationStatus === "UNVERIFIED") {
    updatedStatus = "COMMUNITY_CONFIRMED";
    await db
      .update(courts)
      .set({ verificationStatus: "COMMUNITY_CONFIRMED" })
      .where(eq(courts.id, courtId));
  }

  return {
    ok: true,
    totalConfirmations: allVerifications.length,
    verificationStatus: updatedStatus,
  };
}
