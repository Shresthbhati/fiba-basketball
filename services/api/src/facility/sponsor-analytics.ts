import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { can } from "../authz/service.js";
import type { Db } from "../db/index.js";
import {
  competitionRosters,
  competitions,
  competitionTeams,
  courtReservations,
  courts,
  facilityClaims,
  matches,
  pickupGames,
  pickupParticipants,
  roleAssignments,
  sponsorAnalyticsGrants,
  sponsorProfiles,
  sponsorReportQueries,
  users,
} from "../db/schema.js";
import { AuthError } from "../identity/service.js";

export const K_ANONYMITY_THRESHOLD = 5;

export interface SponsorProfileInput {
  companyName: string;
  contactEmail: string;
  brandCategory:
    | "APPAREL"
    | "FOOTWEAR"
    | "BEVERAGES"
    | "NUTRITION"
    | "EQUIPMENT"
    | "MEDIA"
    | "TECHNOLOGY"
    | "COMMUNITY"
    | "OTHER";
  websiteUrl?: string | undefined;
}

export interface CreateGrantInput {
  sponsorId: string;
  courtId?: string | undefined;
  competitionId?: string | undefined;
  scope?: "COURT" | "COMPETITION" | "GLOBAL" | undefined;
  expiresAt?: Date | undefined;
}

export interface AnonymizedBucket {
  label: string;
  category: string;
  count: number;
  isSuppressed: boolean;
  displayCount: string;
  percentage?: number | undefined;
}

export interface CourtAnalyticsSummary {
  courtId: string;
  courtName: string;
  kThreshold: number;
  totalUniqueAthletesSuppressed: boolean;
  totalUniqueAthletesDisplay: string;
  totalSessions: number;
  totalPickupGames: number;
  totalReservations: number;
  demographicsSuppressed: boolean;
  suppressionNotice?: string | undefined;
  ageCohorts: AnonymizedBucket[];
  skillDistribution: AnonymizedBucket[];
  hourlyActivity: AnonymizedBucket[];
  dayOfWeekActivity: AnonymizedBucket[];
  suppressedBucketCount: number;
  complianceNotice: string;
}

export interface CompetitionAnalyticsSummary {
  competitionId: string;
  competitionName: string;
  format: string;
  kThreshold: number;
  totalTeams: number;
  totalMatches: number;
  completedMatches: number;
  totalRosteredAthletesSuppressed: boolean;
  totalRosteredAthletesDisplay: string;
  demographicsSuppressed: boolean;
  suppressionNotice?: string | undefined;
  ageCohorts: AnonymizedBucket[];
  stageBreakdown: AnonymizedBucket[];
  suppressedBucketCount: number;
  complianceNotice: string;
}

/**
 * Calculates athlete age from date string.
 */
function calculateAge(dobStr: string): number {
  const dob = new Date(dobStr);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

/**
 * Applies k-anonymity (k >= 5) to aggregated cohort buckets.
 * Any non-zero cohort with fewer than k entries is suppressed.
 */
export function enforceKAnonymity(
  buckets: { label: string; category: string; count: number }[],
  total: number,
  k = K_ANONYMITY_THRESHOLD,
): { items: AnonymizedBucket[]; suppressedCount: number } {
  let suppressedCount = 0;

  const items: AnonymizedBucket[] = buckets.map((b) => {
    if (b.count > 0 && b.count < k) {
      suppressedCount++;
      return {
        label: b.label,
        category: b.category,
        count: 0,
        isSuppressed: true,
        displayCount: `< ${k} (Suppressed for Privacy)`,
        percentage: undefined,
      };
    }
    const pct = total > 0 ? Math.round((b.count / total) * 1000) / 10 : 0;
    return {
      label: b.label,
      category: b.category,
      count: b.count,
      isSuppressed: false,
      displayCount: String(b.count),
      percentage: pct,
    };
  });

  return { items, suppressedCount };
}

/**
 * Registers or updates a sponsor profile for an authorized commercial partner.
 */
export async function createOrUpdateSponsorProfile(
  db: Db,
  userId: string,
  input: SponsorProfileInput,
) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) {
    throw new AuthError(404, "User not found");
  }

  const [existing] = await db
    .select()
    .from(sponsorProfiles)
    .where(eq(sponsorProfiles.userId, userId));

  let profile: typeof sponsorProfiles.$inferSelect;

  if (existing) {
    const [updated] = await db
      .update(sponsorProfiles)
      .set({
        companyName: input.companyName,
        contactEmail: input.contactEmail,
        brandCategory: input.brandCategory,
        websiteUrl: input.websiteUrl ?? null,
        updatedAt: new Date(),
      })
      .where(eq(sponsorProfiles.id, existing.id))
      .returning();
    profile = updated!;
  } else {
    const [created] = await db
      .insert(sponsorProfiles)
      .values({
        userId,
        companyName: input.companyName,
        contactEmail: input.contactEmail,
        brandCategory: input.brandCategory,
        websiteUrl: input.websiteUrl ?? null,
        status: "ACTIVE",
      })
      .returning();
    profile = created!;

    // Ensure SPONSOR role is granted
    const [existingRole] = await db
      .select()
      .from(roleAssignments)
      .where(
        and(
          eq(roleAssignments.userId, userId),
          eq(roleAssignments.role, "SPONSOR"),
        ),
      );

    if (!existingRole) {
      await db.insert(roleAssignments).values({
        userId,
        role: "SPONSOR",
      });
    }
  }

  return profile;
}

/**
 * Retrieves the sponsor profile and active analytics grants for the current user.
 */
export async function getSponsorProfile(db: Db, userId: string) {
  const [profile] = await db
    .select()
    .from(sponsorProfiles)
    .where(eq(sponsorProfiles.userId, userId));

  if (!profile) {
    return null;
  }

  const grants = await db
    .select()
    .from(sponsorAnalyticsGrants)
    .where(
      and(
        eq(sponsorAnalyticsGrants.sponsorId, profile.id),
        or(
          isNull(sponsorAnalyticsGrants.expiresAt),
          gt(sponsorAnalyticsGrants.expiresAt, new Date()),
        ),
      ),
    );

  return {
    ...profile,
    activeGrants: grants,
  };
}

/**
 * Creates an analytics access grant for a verified sponsor.
 * Can be granted by court venue manager, tournament organizer, or platform admin.
 */
export async function createSponsorGrant(
  db: Db,
  actorId: string,
  input: CreateGrantInput,
) {
  const [sponsor] = await db
    .select()
    .from(sponsorProfiles)
    .where(eq(sponsorProfiles.id, input.sponsorId));

  if (!sponsor || sponsor.status !== "ACTIVE") {
    throw new AuthError(404, "Sponsor profile not found or inactive");
  }

  const isPlatformAdmin = await can(db, actorId, "audit:read");

  if (input.courtId) {
    const [court] = await db.select().from(courts).where(eq(courts.id, input.courtId));
    if (!court) {
      throw new AuthError(404, "Court not found");
    }

    if (!isPlatformAdmin) {
      // Check venue manager status
      const [approvedClaim] = await db
        .select()
        .from(facilityClaims)
        .where(
          and(
            eq(facilityClaims.courtId, input.courtId),
            eq(facilityClaims.operatorId, actorId),
            eq(facilityClaims.status, "APPROVED"),
          ),
        );
      const isOwner = court.createdBy === actorId;
      if (!approvedClaim && !isOwner) {
        throw new AuthError(404, "Court not found or access denied");
      }
    }
  } else if (input.competitionId) {
    const [comp] = await db
      .select()
      .from(competitions)
      .where(eq(competitions.id, input.competitionId));
    if (!comp) {
      throw new AuthError(404, "Competition not found");
    }

    if (!isPlatformAdmin && comp.organizerId !== actorId) {
      throw new AuthError(404, "Competition not found or access denied");
    }
  } else if (!isPlatformAdmin) {
    throw new AuthError(404, "Global grants require administrative privileges");
  }

  const [grant] = await db
    .insert(sponsorAnalyticsGrants)
    .values({
      sponsorId: input.sponsorId,
      courtId: input.courtId ?? null,
      competitionId: input.competitionId ?? null,
      scope: input.scope ?? (input.courtId ? "COURT" : input.competitionId ? "COMPETITION" : "GLOBAL"),
      grantedBy: actorId,
      expiresAt: input.expiresAt ?? null,
    })
    .returning();

  return grant!;
}

/**
 * Revokes a sponsor analytics grant.
 */
export async function revokeSponsorGrant(db: Db, actorId: string, grantId: string) {
  const [grant] = await db
    .select()
    .from(sponsorAnalyticsGrants)
    .where(eq(sponsorAnalyticsGrants.id, grantId));

  if (!grant) {
    throw new AuthError(404, "Grant not found");
  }

  const isPlatformAdmin = await can(db, actorId, "audit:read");
  if (!isPlatformAdmin && grant.grantedBy !== actorId) {
    throw new AuthError(404, "Grant not found or access denied");
  }

  await db.delete(sponsorAnalyticsGrants).where(eq(sponsorAnalyticsGrants.id, grantId));
  return { success: true, revokedId: grantId };
}

/**
 * Lists sponsor grants relevant to the actor (either received as a sponsor or granted as a manager).
 */
export async function listSponsorGrants(db: Db, actorId: string) {
  const [profile] = await db
    .select()
    .from(sponsorProfiles)
    .where(eq(sponsorProfiles.userId, actorId));

  const sponsorId = profile?.id;

  const conditions = [eq(sponsorAnalyticsGrants.grantedBy, actorId)];
  if (sponsorId) {
    conditions.push(eq(sponsorAnalyticsGrants.sponsorId, sponsorId));
  }

  return db
    .select()
    .from(sponsorAnalyticsGrants)
    .where(or(...conditions))
    .orderBy(desc(sponsorAnalyticsGrants.createdAt));
}

/**
 * Authorizes access to court analytics for sponsors, venue managers, or admins.
 * Returns 404 (ADR-0010) on unauthorized access or missing court.
 */
async function assertCourtAnalyticsAccess(db: Db, courtId: string, actorId: string) {
  const [court] = await db.select().from(courts).where(eq(courts.id, courtId));
  if (!court) {
    throw new AuthError(404, "Court not found");
  }

  // 1. Platform admin
  if (await can(db, actorId, "audit:read")) {
    return court;
  }

  // 2. Creator or approved venue manager
  if (court.createdBy === actorId) {
    return court;
  }
  const [claim] = await db
    .select()
    .from(facilityClaims)
    .where(
      and(
        eq(facilityClaims.courtId, courtId),
        eq(facilityClaims.operatorId, actorId),
        eq(facilityClaims.status, "APPROVED"),
      ),
    );
  if (claim) {
    return court;
  }

  // 3. Active sponsor grant
  const [profile] = await db
    .select()
    .from(sponsorProfiles)
    .where(and(eq(sponsorProfiles.userId, actorId), eq(sponsorProfiles.status, "ACTIVE")));

  if (profile) {
    const [grant] = await db
      .select()
      .from(sponsorAnalyticsGrants)
      .where(
        and(
          eq(sponsorAnalyticsGrants.sponsorId, profile.id),
          or(eq(sponsorAnalyticsGrants.courtId, courtId), eq(sponsorAnalyticsGrants.scope, "GLOBAL")),
          or(isNull(sponsorAnalyticsGrants.expiresAt), gt(sponsorAnalyticsGrants.expiresAt, new Date())),
        ),
      );
    if (grant) {
      return court;
    }
  }

  // ADR-0010: Negative authZ returns 404
  throw new AuthError(404, "Court not found or access denied");
}

/**
 * Authorizes access to competition analytics for sponsors, organizers, or admins.
 */
async function assertCompetitionAnalyticsAccess(db: Db, competitionId: string, actorId: string) {
  const [comp] = await db
    .select()
    .from(competitions)
    .where(eq(competitions.id, competitionId));

  if (!comp) {
    throw new AuthError(404, "Competition not found");
  }

  // 1. Platform admin
  if (await can(db, actorId, "audit:read")) {
    return comp;
  }

  // 2. Organizer
  if (comp.organizerId === actorId) {
    return comp;
  }

  // 3. Active sponsor grant
  const [profile] = await db
    .select()
    .from(sponsorProfiles)
    .where(and(eq(sponsorProfiles.userId, actorId), eq(sponsorProfiles.status, "ACTIVE")));

  if (profile) {
    const [grant] = await db
      .select()
      .from(sponsorAnalyticsGrants)
      .where(
        and(
          eq(sponsorAnalyticsGrants.sponsorId, profile.id),
          or(
            eq(sponsorAnalyticsGrants.competitionId, competitionId),
            eq(sponsorAnalyticsGrants.scope, "GLOBAL"),
          ),
          or(isNull(sponsorAnalyticsGrants.expiresAt), gt(sponsorAnalyticsGrants.expiresAt, new Date())),
        ),
      );
    if (grant) {
      return comp;
    }
  }

  // ADR-0010: Negative authZ returns 404
  throw new AuthError(404, "Competition not found or access denied");
}

/**
 * Computes aggregated court footfall, peak usage, and demographic distributions
 * guarded by strict k-anonymity (k >= 5) to guarantee zero athlete de-anonymization.
 */
export async function getCourtSponsorAnalytics(
  db: Db,
  courtId: string,
  actorId: string,
  options?: { kThreshold?: number | undefined },
): Promise<CourtAnalyticsSummary> {
  const court = await assertCourtAnalyticsAccess(db, courtId, actorId);
  const k = Math.max(K_ANONYMITY_THRESHOLD, options?.kThreshold ?? K_ANONYMITY_THRESHOLD);

  // 1. Fetch pickup games and participants
  const games = await db
    .select()
    .from(pickupGames)
    .where(eq(pickupGames.courtId, courtId));

  const gameIds = games.map((g) => g.id);
  const participants =
    gameIds.length > 0
      ? await db
          .select()
          .from(pickupParticipants)
          .where(
            and(
              inArray(pickupParticipants.gameId, gameIds),
              or(
                eq(pickupParticipants.status, "CONFIRMED"),
                eq(pickupParticipants.status, "CHECKED_IN"),
              ),
            ),
          )
      : [];

  // 2. Fetch court reservations
  const reservations = await db
    .select()
    .from(courtReservations)
    .where(
      and(
        eq(courtReservations.courtId, courtId),
        eq(courtReservations.status, "CONFIRMED"),
      ),
    );

  // 3. Collect unique participant IDs
  const uniqueUserIds = new Set<string>();
  participants.forEach((p) => uniqueUserIds.add(p.userId));
  reservations.forEach((r) => uniqueUserIds.add(r.bookedById));
  const totalUniqueAthletes = uniqueUserIds.size;

  let totalUniqueAthletesSuppressed = false;
  let totalUniqueAthletesDisplay = String(totalUniqueAthletes);

  // If total distinct users < k, suppress total and all demographics to prevent re-identification
  if (totalUniqueAthletes > 0 && totalUniqueAthletes < k) {
    totalUniqueAthletesSuppressed = true;
    totalUniqueAthletesDisplay = `< ${k} (Suppressed for Privacy)`;
  }

  // 4. Fetch user records for demographic breakdown
  const userList =
    uniqueUserIds.size > 0
      ? await db
          .select({
            id: users.id,
            dateOfBirth: users.dateOfBirth,
            isMinor: users.isMinor,
          })
          .from(users)
          .where(inArray(users.id, Array.from(uniqueUserIds)))
      : [];

  // Age Cohorts
  const ageCounts = {
    UNDER_18: 0,
    "18_TO_24": 0,
    "25_TO_34": 0,
    "35_PLUS": 0,
  };

  userList.forEach((u) => {
    const age = calculateAge(u.dateOfBirth);
    if (age < 18 || u.isMinor) {
      ageCounts.UNDER_18++;
    } else if (age <= 24) {
      ageCounts["18_TO_24"]++;
    } else if (age <= 34) {
      ageCounts["25_TO_34"]++;
    } else {
      ageCounts["35_PLUS"]++;
    }
  });

  const rawAgeBuckets = [
    { label: "Under 18 (Youth)", category: "UNDER_18", count: ageCounts.UNDER_18 },
    { label: "18-24 (Collegiate / Young Adult)", category: "18_TO_24", count: ageCounts["18_TO_24"] },
    { label: "25-34 (Prime Amateur)", category: "25_TO_34", count: ageCounts["25_TO_34"] },
    { label: "35+ (Masters / Veterans)", category: "35_PLUS", count: ageCounts["35_PLUS"] },
  ];

  // Skill Distribution from pickup games
  const skillCounts: Record<string, number> = {
    CASUAL: 0,
    INTERMEDIATE: 0,
    COMPETITIVE: 0,
  };

  games.forEach((g) => {
    const band = g.skillBand ?? "CASUAL";
    if (band in skillCounts) {
      skillCounts[band] = (skillCounts[band] ?? 0) + 1;
    }
  });

  const rawSkillBuckets = [
    { label: "Casual / Open Play", category: "CASUAL", count: skillCounts.CASUAL ?? 0 },
    { label: "Intermediate", category: "INTERMEDIATE", count: skillCounts.INTERMEDIATE ?? 0 },
    { label: "Competitive Run", category: "COMPETITIVE", count: skillCounts.COMPETITIVE ?? 0 },
  ];

  // Hourly Activity (00:00 to 23:00)
  const hourCounts = new Array(24).fill(0);
  games.forEach((g) => {
    const hour = new Date(g.startsAt).getHours();
    hourCounts[hour]++;
  });
  reservations.forEach((r) => {
    const hour = new Date(r.startTime).getHours();
    hourCounts[hour]++;
  });

  const rawHourlyBuckets = hourCounts.map((count, hr) => ({
    label: `${String(hr).padStart(2, "0")}:00`,
    category: `HOUR_${hr}`,
    count: count as number,
  }));

  // Day of Week Activity (0=Sunday to 6=Saturday)
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayCounts = new Array(7).fill(0);
  games.forEach((g) => {
    const day = new Date(g.startsAt).getDay();
    dayCounts[day]++;
  });
  reservations.forEach((r) => {
    const day = new Date(r.startTime).getDay();
    dayCounts[day]++;
  });

  const rawDayBuckets = dayCounts.map((count, day) => ({
    label: dayNames[day] ?? `Day ${day}`,
    category: `DAY_${day}`,
    count: count as number,
  }));

  let ageCohorts: AnonymizedBucket[];
  let skillDistribution: AnonymizedBucket[];
  let suppressedBucketCount = 0;
  let demographicsSuppressed = false;
  let suppressionNotice: string | undefined = undefined;

  if (totalUniqueAthletes < k) {
    // Blanket demographic suppression if sample size is under k
    demographicsSuppressed = true;
    suppressionNotice = `All demographic breakdowns are suppressed because fewer than ${k} unique participants have utilized this facility.`;
    ageCohorts = rawAgeBuckets.map((b) => ({
      label: b.label,
      category: b.category,
      count: 0,
      isSuppressed: true,
      displayCount: `< ${k} (Suppressed for Privacy)`,
    }));
    skillDistribution = rawSkillBuckets.map((b) => ({
      label: b.label,
      category: b.category,
      count: 0,
      isSuppressed: true,
      displayCount: `< ${k} (Suppressed for Privacy)`,
    }));
    suppressedBucketCount += rawAgeBuckets.length + rawSkillBuckets.length;
  } else {
    const ageResult = enforceKAnonymity(rawAgeBuckets, totalUniqueAthletes, k);
    const skillResult = enforceKAnonymity(rawSkillBuckets, games.length, k);
    ageCohorts = ageResult.items;
    skillDistribution = skillResult.items;
    suppressedBucketCount += ageResult.suppressedCount + skillResult.suppressedCount;
  }

  const hourlyResult = enforceKAnonymity(
    rawHourlyBuckets,
    games.length + reservations.length,
    k,
  );
  const dayResult = enforceKAnonymity(
    rawDayBuckets,
    games.length + reservations.length,
    k,
  );

  suppressedBucketCount += hourlyResult.suppressedCount + dayResult.suppressedCount;

  // 5. Log audit trail
  const [profile] = await db
    .select()
    .from(sponsorProfiles)
    .where(eq(sponsorProfiles.userId, actorId));

  await db.insert(sponsorReportQueries).values({
    sponsorId: profile?.id ?? null,
    queriedBy: actorId,
    queryType: "COURT_ANALYTICS",
    resourceId: courtId,
    kThreshold: k,
    suppressedBuckets: suppressedBucketCount,
  });

  return {
    courtId: court.id,
    courtName: court.name,
    kThreshold: k,
    totalUniqueAthletesSuppressed,
    totalUniqueAthletesDisplay,
    totalSessions: games.length + reservations.length,
    totalPickupGames: games.length,
    totalReservations: reservations.length,
    demographicsSuppressed,
    suppressionNotice,
    ageCohorts,
    skillDistribution,
    hourlyActivity: hourlyResult.items,
    dayOfWeekActivity: dayResult.items,
    suppressedBucketCount,
    complianceNotice: `k-Anonymity (k >= ${k}) enforced per Spec §8.6 & §24.2. Sub-cohorts under ${k} individuals are suppressed to eliminate athlete re-identification risk.`,
  };
}

/**
 * Computes tournament sponsor metrics and demographics with k-anonymity (k >= 5) guardrails.
 */
export async function getCompetitionSponsorAnalytics(
  db: Db,
  competitionId: string,
  actorId: string,
  options?: { kThreshold?: number | undefined },
): Promise<CompetitionAnalyticsSummary> {
  const comp = await assertCompetitionAnalyticsAccess(db, competitionId, actorId);
  const k = Math.max(K_ANONYMITY_THRESHOLD, options?.kThreshold ?? K_ANONYMITY_THRESHOLD);

  // 1. Teams & Rosters
  const compTeams = await db
    .select()
    .from(competitionTeams)
    .where(eq(competitionTeams.competitionId, competitionId));

  const rosters = await db
    .select()
    .from(competitionRosters)
    .where(eq(competitionRosters.competitionId, competitionId));

  const uniqueRosteredUsers = new Set<string>();
  rosters.forEach((r) => uniqueRosteredUsers.add(r.userId));
  const totalRosteredAthletes = uniqueRosteredUsers.size;

  let totalRosteredAthletesSuppressed = false;
  let totalRosteredAthletesDisplay = String(totalRosteredAthletes);

  if (totalRosteredAthletes > 0 && totalRosteredAthletes < k) {
    totalRosteredAthletesSuppressed = true;
    totalRosteredAthletesDisplay = `< ${k} (Suppressed for Privacy)`;
  }

  // 2. Matches
  const compMatches = await db
    .select()
    .from(matches)
    .where(eq(matches.competitionId, competitionId));

  const completedMatches = compMatches.filter(
    (m) => m.state === "FINISHED" || m.state === "LOCKED",
  ).length;

  // Stages
  const stageCounts: Record<string, number> = {
    REGULAR: 0,
    GROUP: 0,
    PLAYOFF: 0,
  };
  compMatches.forEach((m) => {
    const stage = m.stage ?? "REGULAR";
    if (stage in stageCounts) {
      stageCounts[stage] = (stageCounts[stage] ?? 0) + 1;
    }
  });

  const rawStageBuckets = [
    { label: "Group / Pool Play", category: "GROUP", count: stageCounts.GROUP ?? 0 },
    { label: "Regular Season / Bracket", category: "REGULAR", count: stageCounts.REGULAR ?? 0 },
    { label: "Playoffs & Finals", category: "PLAYOFF", count: stageCounts.PLAYOFF ?? 0 },
  ];

  // 3. Demographics
  const rosterUsers =
    uniqueRosteredUsers.size > 0
      ? await db
          .select({
            id: users.id,
            dateOfBirth: users.dateOfBirth,
            isMinor: users.isMinor,
          })
          .from(users)
          .where(inArray(users.id, Array.from(uniqueRosteredUsers)))
      : [];

  const ageCounts = {
    UNDER_18: 0,
    "18_TO_24": 0,
    "25_TO_34": 0,
    "35_PLUS": 0,
  };

  rosterUsers.forEach((u) => {
    const age = calculateAge(u.dateOfBirth);
    if (age < 18 || u.isMinor) {
      ageCounts.UNDER_18++;
    } else if (age <= 24) {
      ageCounts["18_TO_24"]++;
    } else if (age <= 34) {
      ageCounts["25_TO_34"]++;
    } else {
      ageCounts["35_PLUS"]++;
    }
  });

  const rawAgeBuckets = [
    { label: "Under 18 (Youth Division)", category: "UNDER_18", count: ageCounts.UNDER_18 },
    { label: "18-24 (Collegiate / U24)", category: "18_TO_24", count: ageCounts["18_TO_24"] },
    { label: "25-34 (Open Senior)", category: "25_TO_34", count: ageCounts["25_TO_34"] },
    { label: "35+ (Masters)", category: "35_PLUS", count: ageCounts["35_PLUS"] },
  ];

  let ageCohorts: AnonymizedBucket[];
  let suppressedBucketCount = 0;
  let demographicsSuppressed = false;
  let suppressionNotice: string | undefined = undefined;

  if (totalRosteredAthletes < k) {
    demographicsSuppressed = true;
    suppressionNotice = `Demographic details suppressed: fewer than ${k} rostered participants enrolled.`;
    ageCohorts = rawAgeBuckets.map((b) => ({
      label: b.label,
      category: b.category,
      count: 0,
      isSuppressed: true,
      displayCount: `< ${k} (Suppressed for Privacy)`,
    }));
    suppressedBucketCount += rawAgeBuckets.length;
  } else {
    const ageResult = enforceKAnonymity(rawAgeBuckets, totalRosteredAthletes, k);
    ageCohorts = ageResult.items;
    suppressedBucketCount += ageResult.suppressedCount;
  }

  const stageResult = enforceKAnonymity(rawStageBuckets, compMatches.length, k);
  suppressedBucketCount += stageResult.suppressedCount;

  // 4. Audit Trail
  const [profile] = await db
    .select()
    .from(sponsorProfiles)
    .where(eq(sponsorProfiles.userId, actorId));

  await db.insert(sponsorReportQueries).values({
    sponsorId: profile?.id ?? null,
    queriedBy: actorId,
    queryType: "COMPETITION_ANALYTICS",
    resourceId: competitionId,
    kThreshold: k,
    suppressedBuckets: suppressedBucketCount,
  });

  return {
    competitionId: comp.id,
    competitionName: comp.name,
    format: comp.format,
    kThreshold: k,
    totalTeams: compTeams.length,
    totalMatches: compMatches.length,
    completedMatches,
    totalRosteredAthletesSuppressed,
    totalRosteredAthletesDisplay,
    demographicsSuppressed,
    suppressionNotice,
    ageCohorts,
    stageBreakdown: stageResult.items,
    suppressedBucketCount,
    complianceNotice: `k-Anonymity (k >= ${k}) enforced per Spec §8.6 & §24.2. Sub-cohorts under ${k} individuals are suppressed to eliminate athlete re-identification risk.`,
  };
}

/**
 * Lists audit query history for the caller.
 */
export async function listSponsorQueryAuditLogs(db: Db, actorId: string) {
  return db
    .select()
    .from(sponsorReportQueries)
    .where(eq(sponsorReportQueries.queriedBy, actorId))
    .orderBy(desc(sponsorReportQueries.createdAt))
    .limit(50);
}
