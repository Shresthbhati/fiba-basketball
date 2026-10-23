import type { Side } from "./score-queue";

/** One change to who is on court. `outId` is null when a starter is put on court. */
export type LineupChange = { eventId: string; side: Side; inId: string; outId: string | null };
export interface LineupStore { load(key: string): LineupChange[] | null; save(key: string, v: LineupChange[]): void }

export const localLineupStore: LineupStore = {
  load: (k) => {
    try {
      const v: unknown = JSON.parse(localStorage.getItem(k) ?? "null");
      return Array.isArray(v) ? (v as LineupChange[]).filter((c) => c && typeof c.eventId === "string" && typeof c.inId === "string") : null;
    } catch { return null; }
  },
  save: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked: keep it in memory */ } },
};

export const COURT_SIZE = 5;

/**
 * Who is on court for each side, kept as the list of changes the scorer made (so undoing one change restores the lineup).
 * It lives on this device; the server gets the same facts as SUBSTITUTION events.
 */
export class Lineup {
  private log: LineupChange[];
  private listeners = new Set<() => void>();
  constructor(private key: string, private store: LineupStore = localLineupStore) { this.log = store.load(key) ?? []; }

  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { this.store.save(this.key, this.log); this.listeners.forEach((l) => l()); }

  onCourt(side: Side): string[] {
    const on: string[] = [];
    for (const c of this.log) {
      if (c.side !== side) continue;
      if (c.outId) { const i = on.indexOf(c.outId); if (i >= 0) on.splice(i, 1); }
      if (!on.includes(c.inId)) on.push(c.inId);
    }
    return on;
  }

  /** A starter goes on court (only while there is room). Returns false if refused. */
  addStarter(change: Omit<LineupChange, "outId">): boolean {
    const on = this.onCourt(change.side);
    if (on.length >= COURT_SIZE || on.includes(change.inId)) return false;
    this.log.push({ ...change, outId: null });
    this.emit();
    return true;
  }
  /** `inId` replaces `outId`. Returns false unless `outId` is on court and `inId` is not. */
  substitute(change: LineupChange & { outId: string }): boolean {
    const on = this.onCourt(change.side);
    if (!on.includes(change.outId) || on.includes(change.inId)) return false;
    this.log.push(change);
    this.emit();
    return true;
  }
  /** The scorer undid the event that made this change. */
  undo(eventId: string) {
    const n = this.log.length;
    this.log = this.log.filter((c) => c.eventId !== eventId);
    if (this.log.length !== n) this.emit();
  }
}
