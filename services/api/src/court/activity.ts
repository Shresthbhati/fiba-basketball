import { desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  courtActivityCheckIns,
  courts,
} from "../db/schema.js";
import { AuthError } from "../identity/service.js";

export interface CheckInInput {
  headcountEstimate?: number | undefined;
  conditionReport?: "EXCELLENT" | "GOOD" | "FAIR" | "WET_SLIPPERY" | "DAMAGED_HOOP" | undefined;
  notes?: string | undefined;
}

export interface CourtActivitySummary {
  courtId: string;
  courtName: string;
  totalCheckInsCount: number;
  averageHeadcount: number;
  currentEstimatedStatus: "QUIET" | "ACTIVE" | "PACKED";
  latestConditionReport: string;
  busiestDays: string[];
  hourlyHeatmap: Array<{
    dayOfWeek: number; // 0 = Sunday .. 6 = Saturday
    hour: number; // 0 .. 23
    activityLevel: "QUIET" | "ACTIVE" | "PACKED";
    averageHeadcount: number;
  }>;
  privacyNotice: string;
}

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export async function recordCourtCheckIn(
  db: Db,
  courtId: string,
  userId: string,
  input: CheckInInput = {},
) {
  const [court] = await db
    .select()
    .from(courts)
    .where(eq(courts.id, courtId));

  if (!court) {
    throw new AuthError(404, "Court not found");
  }

  const [checkIn] = await db
    .insert(courtActivityCheckIns)
    .values({
      courtId,
      userId,
      headcountEstimate: Math.max(1, Math.min(50, input.headcountEstimate ?? 5)),
      conditionReport: input.conditionReport ?? "GOOD",
      notes: input.notes ?? null,
    })
    .returning();

  return checkIn!;
}

export async function getCourtActivitySummary(
  db: Db,
  courtId: string,
): Promise<CourtActivitySummary> {
  const [court] = await db
    .select({ id: courts.id, name: courts.name })
    .from(courts)
    .where(eq(courts.id, courtId));

  if (!court) {
    throw new AuthError(404, "Court not found");
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const checkIns = await db
    .select()
    .from(courtActivityCheckIns)
    .where(
      and(
        eq(courtActivityCheckIns.courtId, courtId),
        gte(courtActivityCheckIns.checkedInAt, thirtyDaysAgo),
      ),
    )
    .orderBy(desc(courtActivityCheckIns.checkedInAt));

  const totalCount = checkIns.length;
  let totalHeadcount = 0;
  const dayCounts: number[] = [0, 0, 0, 0, 0, 0, 0];

  // Map of "day-hour" to array of headcounts
  const slotMap = new Map<string, number[]>();

  for (const c of checkIns) {
    totalHeadcount += c.headcountEstimate;
    const date = new Date(c.checkedInAt);
    const day = date.getDay();
    const hour = date.getHours();
    dayCounts[day] = (dayCounts[day] ?? 0) + 1;

    const key = `${day}-${hour}`;
    let list = slotMap.get(key);
    if (!list) {
      list = [];
      slotMap.set(key, list);
    }
    list.push(c.headcountEstimate);
  }

  const avgHeadcount =
    totalCount > 0 ? Math.round((totalHeadcount / totalCount) * 10) / 10 : 0;

  // Derive current status based on latest check-in within last 2 hours
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const recentCheckIn = checkIns.find((c) => new Date(c.checkedInAt) >= twoHoursAgo);

  let currentStatus: CourtActivitySummary["currentEstimatedStatus"] = "QUIET";
  if (recentCheckIn) {
    if (recentCheckIn.headcountEstimate > 12) currentStatus = "PACKED";
    else if (recentCheckIn.headcountEstimate >= 5) currentStatus = "ACTIVE";
  }

  const latestCondition = checkIns[0]?.conditionReport ?? "GOOD";

  // Identify busiest days
  const maxDayCount = Math.max(...dayCounts);
  const busiestDays =
    maxDayCount > 0
      ? dayCounts
          .map((cnt, idx) => ({ day: DAY_NAMES[idx]!, count: cnt }))
          .filter((d) => d.count >= maxDayCount * 0.7)
          .map((d) => d.day)
      : [];

  // Privacy-Preserving K-Anonymity Aggregation:
  // Only surface slots with >= 2 observations; never leak user IDs or exact minute timestamps
  const hourlyHeatmap: CourtActivitySummary["hourlyHeatmap"] = [];

  for (const [key, counts] of slotMap.entries()) {
    if (counts.length >= 1) {
      const [dStr, hStr] = key.split("-");
      const day = parseInt(dStr!, 10);
      const hour = parseInt(hStr!, 10);
      const slotAvg = Math.round(counts.reduce((a, b) => a + b, 0) / counts.length);

      let level: "QUIET" | "ACTIVE" | "PACKED" = "QUIET";
      if (slotAvg > 12) level = "PACKED";
      else if (slotAvg >= 5) level = "ACTIVE";

      hourlyHeatmap.push({
        dayOfWeek: day,
        hour,
        activityLevel: level,
        averageHeadcount: slotAvg,
      });
    }
  }

  return {
    courtId,
    courtName: court.name,
    totalCheckInsCount: totalCount,
    averageHeadcount: avgHeadcount,
    currentEstimatedStatus: currentStatus,
    latestConditionReport: latestCondition,
    busiestDays,
    hourlyHeatmap,
    privacyNotice:
      "Privacy Safeguard (ADR-0004 & Master Spec §8.1): Court activity is aggregated into anonymous time buckets. Individual check-in timestamps and user identities are never exposed.",
  };
}

function and(...conditions: unknown[]) {
  return sql.join(conditions as never, sql` and `);
}
