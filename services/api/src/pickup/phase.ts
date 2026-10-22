export type StoredStatus = "OPEN" | "CANCELLED" | "COMPLETED";
export type Phase = "OPEN" | "FULL" | "IN_PROGRESS" | "UNCONFIRMED" | "COMPLETED" | "CANCELLED";

/**
 * Time alone never completes a game. After the end time with no host confirmation it becomes
 * UNCONFIRMED; only an explicit confirmation stores COMPLETED.
 */
export function phaseOf(
  g: { status: StoredStatus; startsAt: Date; endsAt: Date; capacity: number },
  confirmedCount: number,
  now: Date,
): Phase {
  if (g.status === "CANCELLED") return "CANCELLED";
  if (g.status === "COMPLETED") return "COMPLETED";
  if (now > g.endsAt) return "UNCONFIRMED";
  if (now >= g.startsAt) return "IN_PROGRESS";
  return confirmedCount >= g.capacity ? "FULL" : "OPEN";
}

export const CHECK_IN_EARLY_MS = 30 * 60 * 1000;
