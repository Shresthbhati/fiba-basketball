import type { EventType } from "./event-type.js";

export type MinuteEvent = {
  id: string; type: EventType; side: "home" | "away" | null; period: number; clockSeconds: number | null;
  playerId: string | null; playerOutId: string | null; correctsEventId: string | null;
};

/**
 * Seconds on court per player, worked out from the countdown clock stamped on substitutions (events are in the order the scorer
 * entered them; corrected events are ignored, as in the box score).
 *
 * - The lineup carries over between periods. A period's length is the clock stamped on its PERIOD_START; without one, the highest
 *   clock seen in that period is used; a period with neither is not counted.
 * - Everyone on court at the start of a period is credited from the full length; at the end, from the PERIOD_END clock, or 0:00.
 *   (A period that really ended early with no PERIOD_END is over-counted; that is the assumption this relies on.)
 * - A substitution with no clock is applied at the last clock seen in that period.
 * - Returns null when the match has no substitutions at all. A caller must also treat a side with no SUBSTITUTION of its own as
 *   "no minutes" (see `hasLineup`), rather than showing 0 for players who simply were never tracked.
 */
export function secondsOnCourt(events: MinuteEvent[]): Map<string, number> | null {
  const voided = new Set(events.filter((e) => e.type === "CORRECTION" && e.correctsEventId).map((e) => e.correctsEventId!));
  const live = events.filter((e) => e.type !== "CORRECTION" && !voided.has(e.id));
  const subs = live.filter((e) => e.type === "SUBSTITUTION" && e.side && e.playerId);
  if (subs.length === 0) return null;

  const periods = [...new Set(live.map((e) => e.period))].sort((a, b) => a - b);
  const length = new Map<number, number>(), end = new Map<number, number>();
  for (const p of periods) {
    const inP = live.filter((e) => e.period === p);
    const start = inP.find((e) => e.type === "PERIOD_START" && e.clockSeconds !== null);
    const clocks = inP.map((e) => e.clockSeconds).filter((c): c is number => c !== null);
    const len = start?.clockSeconds ?? (clocks.length > 0 ? Math.max(...clocks) : null);
    if (len !== null) length.set(p, len);
    end.set(p, inP.find((e) => e.type === "PERIOD_END" && e.clockSeconds !== null)?.clockSeconds ?? 0);
  }

  const seconds = new Map<string, number>();
  const credit = (id: string, secs: number) => seconds.set(id, (seconds.get(id) ?? 0) + Math.max(0, secs));
  const entered = new Map<string, number>(); // player -> clock when they came on in the current period
  let period: number | null = null;
  let lastClock = 0;

  const closePeriod = () => {
    if (period === null) return;
    for (const [id, at] of entered) { if (length.has(period)) credit(id, at - (end.get(period) ?? 0)); }
  };
  const openPeriod = (p: number) => {
    period = p;
    lastClock = length.get(p) ?? 0;
    for (const id of entered.keys()) entered.set(id, lastClock);
  };

  for (const e of live) {
    if (period === null || e.period > period) { closePeriod(); openPeriod(e.period); }
    if (e.clockSeconds !== null) lastClock = e.clockSeconds;
    if (e.type !== "SUBSTITUTION" || !e.playerId) continue;
    const at = e.clockSeconds ?? lastClock;
    if (e.playerOutId && entered.has(e.playerOutId)) {
      if (length.has(e.period)) credit(e.playerOutId, entered.get(e.playerOutId)! - at);
      entered.delete(e.playerOutId);
    }
    if (!entered.has(e.playerId)) entered.set(e.playerId, at);
    if (!seconds.has(e.playerId)) seconds.set(e.playerId, 0);
  }
  closePeriod();
  return seconds;
}

/** True if the scorer recorded a lineup for this side (at least one counted substitution). */
export function hasLineup(events: MinuteEvent[], side: "home" | "away"): boolean {
  const voided = new Set(events.filter((e) => e.type === "CORRECTION" && e.correctsEventId).map((e) => e.correctsEventId!));
  return events.some((e) => e.type === "SUBSTITUTION" && e.side === side && e.playerId && !voided.has(e.id));
}
