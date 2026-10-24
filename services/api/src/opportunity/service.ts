import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/index.js";
import {
  opportunities,
  opportunityApplications,
  users,
} from "../db/schema.js";
import { AuthError } from "../identity/service.js";

export type OpportunityType =
  | "TEAM_TRYOUT"
  | "OPEN_RUN"
  | "SHOWCASE_CAMP"
  | "COLLEGE_RECRUITING_COMBINE"
  | "PRO_CONTRACT_TRIAL";

export type VerificationStatus = "COMMUNITY" | "VERIFIED" | "FEATURED" | "REJECTED" | "EXPIRED";

export type ApplicationStatus =
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "INVITED"
  | "WAITLISTED"
  | "DECLINED";

export interface CreateOpportunityInput {
  title: string;
  type: OpportunityType;
  organizationName: string;
  organizationId?: string | undefined;
  description: string;
  requirements?: string | undefined;
  locationName: string;
  address?: string | undefined;
  city: string;
  country?: string | undefined;
  latitude?: number | undefined;
  longitude?: number | undefined;
  startDate?: string | undefined;
  endDate?: string | undefined;
  applicationDeadline?: string | undefined;
  costCents?: number | undefined;
  currency?: string | undefined;
  contactEmail: string;
  contactPhone?: string | undefined;
  ageGroup?: string | undefined;
  minAge?: number | undefined;
  maxAge?: number | undefined;
  gender?: "MEN" | "WOMEN" | "COED" | undefined;
  positions?: string[] | undefined;
  skillLevel?: string | undefined;
  capacity?: number | undefined;
  isPublic?: boolean | undefined;
}

export interface ListOpportunitiesFilter {
  type?: OpportunityType | undefined;
  city?: string | undefined;
  verificationStatus?: VerificationStatus | undefined;
  ageGroup?: string | undefined;
  gender?: string | undefined;
  onlyOpen?: boolean | undefined;
}

export interface ApplyOpportunityInput {
  passportToken?: string | undefined;
  primaryPosition?: string | undefined;
  heightCm?: number | undefined;
  weightKg?: number | undefined;
  graduationYear?: number | undefined;
  currentTeam?: string | undefined;
  notes?: string | undefined;
  guardianConsentGranted?: boolean | undefined;
  guardianName?: string | undefined;
  guardianEmail?: string | undefined;
}

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
  const suffix = Math.random().toString(36).substring(2, 7);
  return `${base}-${suffix}`;
}

export async function createOpportunity(
  db: Db,
  creatorId: string,
  input: CreateOpportunityInput,
) {
  const slug = slugify(input.title);
  const [created] = await db
    .insert(opportunities)
    .values({
      title: input.title,
      slug,
      type: input.type,
      organizationName: input.organizationName,
      organizationId: input.organizationId ?? null,
      creatorId,
      description: input.description,
      requirements: input.requirements ?? null,
      verificationStatus: "COMMUNITY",
      locationName: input.locationName,
      address: input.address ?? null,
      city: input.city,
      country: input.country ?? "USA",
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      startDate: input.startDate ? new Date(input.startDate) : null,
      endDate: input.endDate ? new Date(input.endDate) : null,
      applicationDeadline: input.applicationDeadline ? new Date(input.applicationDeadline) : null,
      costCents: input.costCents ?? 0,
      currency: input.currency ?? "USD",
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone ?? null,
      ageGroup: input.ageGroup ?? "OPEN",
      minAge: input.minAge ?? null,
      maxAge: input.maxAge ?? null,
      gender: input.gender ?? "COED",
      positions: input.positions ?? ["ALL"],
      skillLevel: input.skillLevel ?? "OPEN",
      capacity: input.capacity ?? null,
      isPublic: input.isPublic ?? true,
    })
    .returning();

  return created!;
}

export async function listOpportunities(
  db: Db,
  filter: ListOpportunitiesFilter = {},
) {
  const conditions = [eq(opportunities.isPublic, true)];

  if (filter.type) {
    conditions.push(eq(opportunities.type, filter.type));
  }
  if (filter.city) {
    conditions.push(sql`lower(${opportunities.city}) = lower(${filter.city})`);
  }
  if (filter.verificationStatus) {
    conditions.push(eq(opportunities.verificationStatus, filter.verificationStatus));
  }
  if (filter.ageGroup) {
    conditions.push(eq(opportunities.ageGroup, filter.ageGroup));
  }
  if (filter.gender) {
    conditions.push(eq(opportunities.gender, filter.gender));
  }
  if (filter.onlyOpen) {
    conditions.push(
      sql`(${opportunities.applicationDeadline} is null or ${opportunities.applicationDeadline} > now())`,
    );
  }

  const rows = await db
    .select()
    .from(opportunities)
    .where(and(...conditions))
    .orderBy(desc(opportunities.createdAt))
    .limit(50);

  return rows;
}

export async function getOpportunityById(
  db: Db,
  opportunityId: string,
  actorId?: string | undefined,
) {
  const [opp] = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, opportunityId));

  if (!opp) {
    throw new AuthError(404, "Opportunity not found");
  }

  if (!opp.isPublic && opp.creatorId !== actorId) {
    throw new AuthError(404, "Opportunity not found");
  }

  // Get application count
  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(opportunityApplications)
    .where(eq(opportunityApplications.opportunityId, opportunityId));

  const applicationCount = countRows[0]?.count ?? 0;

  return {
    ...opp,
    applicationCount,
  };
}

export async function applyToOpportunity(
  db: Db,
  athleteId: string,
  opportunityId: string,
  input: ApplyOpportunityInput,
) {
  // Verify opportunity exists & is public or accessible
  const [opp] = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, opportunityId));

  if (!opp || (!opp.isPublic && opp.creatorId !== athleteId)) {
    throw new AuthError(404, "Opportunity not found");
  }

  // Check deadline
  if (opp.applicationDeadline && new Date(opp.applicationDeadline) < new Date()) {
    throw new AuthError(400, "Application deadline has passed");
  }

  // Check athlete user record for minor status
  const [athleteUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, athleteId));

  if (athleteUser?.isMinor) {
    if (!input.guardianConsentGranted || !input.guardianEmail || !input.guardianName) {
      throw new AuthError(
        400,
        "Minor Safeguard: Guardian consent, guardian name, and guardian email are required for under-18 applicants.",
      );
    }
  }

  // Check for duplicate application
  const [existing] = await db
    .select()
    .from(opportunityApplications)
    .where(
      and(
        eq(opportunityApplications.opportunityId, opportunityId),
        eq(opportunityApplications.athleteId, athleteId),
      ),
    );

  if (existing) {
    throw new AuthError(409, "You have already submitted an application for this opportunity.");
  }

  const [application] = await db
    .insert(opportunityApplications)
    .values({
      opportunityId,
      athleteId,
      status: "SUBMITTED",
      passportToken: input.passportToken ?? null,
      primaryPosition: input.primaryPosition ?? "G",
      heightCm: input.heightCm ?? null,
      weightKg: input.weightKg ?? null,
      graduationYear: input.graduationYear ?? null,
      currentTeam: input.currentTeam ?? null,
      notes: input.notes ?? null,
      guardianConsentGranted: input.guardianConsentGranted ?? false,
      guardianName: input.guardianName ?? null,
      guardianEmail: input.guardianEmail ?? null,
    })
    .returning();

  return application!;
}

export async function listOpportunityApplications(
  db: Db,
  opportunityId: string,
  actorId: string,
) {
  // Strictly enforce organizer ownership (ADR-0010: return 404 for unauthorized actors)
  const [opp] = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, opportunityId));

  if (!opp || opp.creatorId !== actorId) {
    throw new AuthError(404, "Opportunity not found");
  }

  const applications = await db
    .select({
      id: opportunityApplications.id,
      opportunityId: opportunityApplications.opportunityId,
      athleteId: opportunityApplications.athleteId,
      athleteName: users.displayName,
      athleteEmail: users.email,
      isMinor: users.isMinor,
      status: opportunityApplications.status,
      passportToken: opportunityApplications.passportToken,
      primaryPosition: opportunityApplications.primaryPosition,
      heightCm: opportunityApplications.heightCm,
      weightKg: opportunityApplications.weightKg,
      graduationYear: opportunityApplications.graduationYear,
      currentTeam: opportunityApplications.currentTeam,
      notes: opportunityApplications.notes,
      guardianConsentGranted: opportunityApplications.guardianConsentGranted,
      reviewerNotes: opportunityApplications.reviewerNotes,
      reviewedAt: opportunityApplications.reviewedAt,
      createdAt: opportunityApplications.createdAt,
    })
    .from(opportunityApplications)
    .innerJoin(users, eq(users.id, opportunityApplications.athleteId))
    .where(eq(opportunityApplications.opportunityId, opportunityId))
    .orderBy(desc(opportunityApplications.createdAt));

  return applications;
}

export async function updateApplicationStatus(
  db: Db,
  opportunityId: string,
  applicationId: string,
  actorId: string,
  status: ApplicationStatus,
  reviewerNotes?: string | undefined,
) {
  const [opp] = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, opportunityId));

  if (!opp || opp.creatorId !== actorId) {
    throw new AuthError(404, "Opportunity not found");
  }

  const [existingApp] = await db
    .select()
    .from(opportunityApplications)
    .where(
      and(
        eq(opportunityApplications.id, applicationId),
        eq(opportunityApplications.opportunityId, opportunityId),
      ),
    );

  if (!existingApp) {
    throw new AuthError(404, "Application not found");
  }

  const [updated] = await db
    .update(opportunityApplications)
    .set({
      status,
      reviewerNotes: reviewerNotes ?? existingApp.reviewerNotes,
      reviewedAt: new Date(),
      reviewedByUserId: actorId,
      updatedAt: new Date(),
    })
    .where(eq(opportunityApplications.id, applicationId))
    .returning();

  return updated!;
}

export async function getMyApplications(db: Db, athleteId: string) {
  const rows = await db
    .select({
      application: opportunityApplications,
      opportunity: {
        id: opportunities.id,
        title: opportunities.title,
        type: opportunities.type,
        organizationName: opportunities.organizationName,
        locationName: opportunities.locationName,
        city: opportunities.city,
        startDate: opportunities.startDate,
        endDate: opportunities.endDate,
        verificationStatus: opportunities.verificationStatus,
      },
    })
    .from(opportunityApplications)
    .innerJoin(opportunities, eq(opportunities.id, opportunityApplications.opportunityId))
    .where(eq(opportunityApplications.athleteId, athleteId))
    .orderBy(desc(opportunityApplications.createdAt));

  return rows.map((r) => ({
    ...r.application,
    opportunity: r.opportunity,
  }));
}
