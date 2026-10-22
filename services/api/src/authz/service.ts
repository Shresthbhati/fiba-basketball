import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { roleAssignments } from "../db/schema.js";
import type { Role } from "../identity/role.js";
import { POLICY, SCOPED_ONLY, type Action, type ResourceRef } from "./policy.js";

export type Assignment = { role: Role; resourceType: string | null; resourceId: string | null };

export async function activeAssignments(db: Db, userId: string): Promise<Assignment[]> {
  const rows = await db
    .select()
    .from(roleAssignments)
    .where(and(eq(roleAssignments.userId, userId), or(isNull(roleAssignments.expiresAt), gt(roleAssignments.expiresAt, new Date()))));
  return rows.map((r) => ({ role: r.role as Role, resourceType: r.resourceType, resourceId: r.resourceId }));
}

/** Pure decision function so policies are unit-testable without a database. */
export function decide(assignments: Assignment[], action: Action, resource?: ResourceRef): boolean {
  if (assignments.some((a) => a.role === "PLATFORM_ADMIN" && a.resourceId === null)) return true;
  const allowed = POLICY[action] as readonly Role[];
  return assignments.some((a) => {
    if (!allowed.includes(a.role)) return false;
    if (a.resourceId === null) return !SCOPED_ONLY.has(action); // global grant
    return resource !== undefined && a.resourceType === resource.type && a.resourceId === resource.id;
  });
}

export async function can(db: Db, userId: string, action: Action, resource?: ResourceRef) {
  return decide(await activeAssignments(db, userId), action, resource);
}

export async function grantRole(
  db: Db,
  userId: string,
  role: Role,
  scope?: ResourceRef,
  expiresAt?: Date,
) {
  await db.insert(roleAssignments).values({
    userId, role, resourceType: scope?.type ?? null, resourceId: scope?.id ?? null, expiresAt: expiresAt ?? null,
  });
}

export async function permissionsFor(db: Db, userId: string) {
  const assignments = await activeAssignments(db, userId);
  const actions = (Object.keys(POLICY) as Action[]).filter((a) => decide(assignments, a));
  return { roles: [...new Set(assignments.map((a) => a.role))], actions };
}
