import { desc } from "drizzle-orm";
import type { Db } from "../db/index.js";
import { auditLog } from "../db/schema.js";

export type AuditEntry = {
  actorId: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
};

/** Append one audit row. Pass the transaction handle so the row commits with the change it describes. */
export async function writeAudit(db: Db, e: AuditEntry) {
  await db.insert(auditLog).values({
    actorId: e.actorId, action: e.action, resourceType: e.resourceType ?? null, resourceId: e.resourceId ?? null,
    reason: e.reason ?? null, metadata: e.metadata ?? null,
  });
}

export async function listAudit(db: Db, limit: number) {
  return db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit);
}
