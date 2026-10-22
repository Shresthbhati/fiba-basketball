import { and, between, eq } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { courtReports, courts } from "../db/schema.js";
import { MAX_RESULTS, boundingBox, haversineMeters, roundDistance } from "../geo/distance.js";

export type CourtInput = {
  name: string; lat: number; lng: number; indoor?: boolean | undefined; surface?: string | undefined;
  hoops?: number | undefined; lit?: boolean | undefined; accessNotes?: string | undefined;
};

export const toPublicCourt = (c: typeof courts.$inferSelect) => ({
  id: c.id, name: c.name, lat: c.lat, lng: c.lng, indoor: c.indoor, surface: c.surface, hoops: c.hoops,
  lit: c.lit, accessNotes: c.accessNotes, verificationStatus: c.verificationStatus,
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
