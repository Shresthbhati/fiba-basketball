import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { competitionRosters, competitions, consentGrants, guardianRelationships, users } from "../db/schema.js";
import { writeAudit } from "../audit/service.js";
import { AuthError } from "../identity/service.js";

export const CONSENT_KINDS = ["PUBLIC_PICKUP", "PROFILE_DISCOVERY", "MEDIA_USE", "COMPETITION_PLAY"] as const;
export type ConsentKind = (typeof CONSENT_KINDS)[number];

const MAX_GUARDIANS = 4;

export async function inviteGuardian(db: Db, minor: { id: string; isMinor: boolean; email: string }, emailRaw: string) {
  if (!minor.isMinor) throw new AuthError(403, "Only under-18 accounts need a guardian");
  const guardianEmail = emailRaw.trim().toLowerCase();
  if (guardianEmail === minor.email) throw new AuthError(400, "A guardian must be a different person");
  const existing = await db.select().from(guardianRelationships).where(eq(guardianRelationships.minorId, minor.id));
  const live = existing.filter((g) => g.status !== "REVOKED");
  const dup = live.find((g) => g.guardianEmail === guardianEmail);
  if (dup) return dup;
  if (live.length >= MAX_GUARDIANS) throw new AuthError(409, "Too many guardians");
  const [row] = await db.insert(guardianRelationships).values({ minorId: minor.id, guardianEmail }).returning();
  await writeAudit(db, { actorId: minor.id, action: "guardian.invited", resourceType: "guardian_relationship", resourceId: row!.id });
  return row!;
}

/** Pending invitations addressed to this account's email, so a guardian can find them without any token. */
export async function pendingInvitesFor(db: Db, email: string) {
  return db
    .select({ id: guardianRelationships.id, minorName: users.displayName, createdAt: guardianRelationships.createdAt })
    .from(guardianRelationships)
    .innerJoin(users, eq(users.id, guardianRelationships.minorId))
    .where(and(eq(guardianRelationships.guardianEmail, email.toLowerCase()), eq(guardianRelationships.status, "PENDING")));
}

export async function acceptGuardianship(
  db: Db,
  guardian: { id: string; email: string; isMinor: boolean; emailVerified: boolean },
  relationshipId: string,
  opts: { requireVerifiedEmail: boolean },
) {
  const [rel] = await db.select().from(guardianRelationships).where(eq(guardianRelationships.id, relationshipId));
  // Not addressed to this account → indistinguishable from "does not exist".
  if (!rel || rel.status !== "PENDING" || rel.guardianEmail !== guardian.email.toLowerCase()) throw new AuthError(404, "Not Found");
  if (guardian.isMinor) throw new AuthError(403, "A guardian must be an adult");
  if (guardian.id === rel.minorId) throw new AuthError(403, "A guardian must be a different person");
  if (opts.requireVerifiedEmail && !guardian.emailVerified) throw new AuthError(403, "Verify your email before accepting guardianship");
  await db.update(guardianRelationships).set({ status: "ACTIVE", guardianId: guardian.id, verifiedAt: new Date() })
    .where(eq(guardianRelationships.id, rel.id));
  await writeAudit(db, { actorId: guardian.id, action: "guardian.accepted", resourceType: "guardian_relationship", resourceId: rel.id });
}

/** Either party may end the relationship; every consent the guardian gave stops counting at once. */
export async function revokeGuardianship(db: Db, userId: string, relationshipId: string) {
  const [rel] = await db.select().from(guardianRelationships).where(eq(guardianRelationships.id, relationshipId));
  if (!rel || rel.status === "REVOKED" || (rel.minorId !== userId && rel.guardianId !== userId)) throw new AuthError(404, "Not Found");
  await db.update(guardianRelationships).set({ status: "REVOKED", revokedAt: new Date() }).where(eq(guardianRelationships.id, rel.id));
  await writeAudit(db, { actorId: userId, action: "guardian.revoked", resourceType: "guardian_relationship", resourceId: rel.id });
}

export async function listGuardianships(db: Db, userId: string) {
  const mine = await db.select().from(guardianRelationships).where(eq(guardianRelationships.minorId, userId));
  const wards = await db
    .select({ id: guardianRelationships.id, minorId: guardianRelationships.minorId, minorName: users.displayName, status: guardianRelationships.status })
    .from(guardianRelationships)
    .innerJoin(users, eq(users.id, guardianRelationships.minorId))
    .where(eq(guardianRelationships.guardianId, userId));
  return {
    guardians: mine.filter((g) => g.status !== "REVOKED").map((g) => ({ id: g.id, guardianEmail: g.guardianEmail, status: g.status })),
    wards: wards.filter((w) => w.status === "ACTIVE"),
  };
}

async function activeGuardianIds(db: Db, minorId: string): Promise<string[]> {
  const rows = await db.select({ g: guardianRelationships.guardianId }).from(guardianRelationships)
    .where(and(eq(guardianRelationships.minorId, minorId), eq(guardianRelationships.status, "ACTIVE")));
  return rows.flatMap((r) => (r.g ? [r.g] : []));
}

/** Adults consent for themselves; a minor's consent only counts while the person who granted it is still an active guardian. */
export async function hasConsent(db: Db, user: { id: string; isMinor: boolean }, kind: ConsentKind): Promise<boolean> {
  const grants = await db.select().from(consentGrants)
    .where(and(eq(consentGrants.subjectId, user.id), eq(consentGrants.kind, kind), isNull(consentGrants.revokedAt)));
  if (!user.isMinor) return grants.some((g) => g.grantedBy === user.id);
  const guardians = await activeGuardianIds(db, user.id);
  return grants.some((g) => guardians.includes(g.grantedBy));
}

export async function grantConsent(db: Db, actorId: string, subjectId: string, kind: ConsentKind) {
  const [subject] = await db.select().from(users).where(eq(users.id, subjectId));
  if (!subject) throw new AuthError(404, "Not Found");
  if (subject.isMinor) {
    // Only an active guardian can consent for a minor; the minor cannot consent for themselves.
    if (!(await activeGuardianIds(db, subjectId)).includes(actorId)) throw new AuthError(404, "Not Found");
  } else if (actorId !== subjectId) {
    throw new AuthError(404, "Not Found");
  }
  if (await hasConsent(db, subject, kind)) return;
  await db.insert(consentGrants).values({ subjectId, kind, grantedBy: actorId });
  await writeAudit(db, { actorId, action: "consent.granted", resourceType: "user", resourceId: subjectId, metadata: { kind } });
}

/** The subject, or a guardian of a minor subject, may withdraw consent. */
export async function revokeConsent(db: Db, actorId: string, subjectId: string, kind: ConsentKind) {
  const [subject] = await db.select().from(users).where(eq(users.id, subjectId));
  const allowed = subject && (actorId === subjectId || (subject.isMinor && (await activeGuardianIds(db, subjectId)).includes(actorId)));
  if (!allowed) throw new AuthError(404, "Not Found");
  await db.update(consentGrants).set({ revokedAt: new Date() })
    .where(and(eq(consentGrants.subjectId, subjectId), eq(consentGrants.kind, kind), isNull(consentGrants.revokedAt)));
  await writeAudit(db, { actorId, action: "consent.revoked", resourceType: "user", resourceId: subjectId, metadata: { kind } });
  // Without consent to play, a minor cannot stay on the rosters of competitions that are still going. Finished competitions keep their history.
  if (kind === "COMPETITION_PLAY" && subject?.isMinor) {
    const open = (await db.select({ id: competitions.id }).from(competitions).where(ne(competitions.status, "COMPLETED"))).map((c) => c.id);
    if (open.length > 0) {
      const gone = await db.delete(competitionRosters).where(and(eq(competitionRosters.userId, subjectId), inArray(competitionRosters.competitionId, open))).returning({ c: competitionRosters.competitionId });
      if (gone.length > 0) await writeAudit(db, { actorId, action: "roster.removed_consent_withdrawn", resourceType: "user", resourceId: subjectId, metadata: { competitions: gone.map((g) => g.c) } });
    }
  }
}

export async function consentsFor(db: Db, user: { id: string; isMinor: boolean }) {
  const out: Record<ConsentKind, boolean> = { PUBLIC_PICKUP: false, PROFILE_DISCOVERY: false, MEDIA_USE: false, COMPETITION_PLAY: false };
  for (const k of CONSENT_KINDS) out[k] = await hasConsent(db, user, k);
  return out;
}

/** Consent state for `subjectId`, visible only to that person or an active guardian of a minor. */
export async function consentsForSubject(db: Db, actorId: string, subjectId: string) {
  const [subject] = await db.select().from(users).where(eq(users.id, subjectId));
  const allowed = subject && (actorId === subjectId || (subject.isMinor && (await activeGuardianIds(db, subjectId)).includes(actorId)));
  if (!allowed) throw new AuthError(404, "Not Found");
  return consentsFor(db, subject);
}
