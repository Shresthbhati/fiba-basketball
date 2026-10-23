/** Where a clock keeps its state between page loads. */
export interface ClockStore { load(key: string): ClockSaved | null; save(key: string, v: ClockSaved): void }
export type ClockSaved = { period: number; lengthSeconds: number; remainingMs: number; runningSince: number | null };

const ok = (v: unknown): v is ClockSaved => {
  const c = v as ClockSaved | null;
  return !!c && Number.isFinite(c.period) && Number.isFinite(c.lengthSeconds) && Number.isFinite(c.remainingMs)
    && (c.runningSince === null || Number.isFinite(c.runningSince));
};

export const localClockStore: ClockStore = {
  load: (k) => { try { const v: unknown = JSON.parse(localStorage.getItem(k) ?? "null"); return ok(v) ? v : null; } catch { return null; } },
  save: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked: the clock still works in memory */ } },
};

export const DEFAULT_PERIOD_SECONDS = 600;
export const OVERTIME_SECONDS = 300;

/**
 * A countdown game clock the scorer starts and stops by hand. Time is measured from timestamps, so a throttled or
 * reloaded tab loses nothing; it stops itself at 0:00. The remaining seconds are stamped on each scorebook event
 * (that is what later lets us work out who was on court and for how long).
 */
export class GameClock {
  private s: ClockSaved;
  private listeners = new Set<() => void>();

  constructor(private key: string, private store: ClockStore = localClockStore, private now: () => number = Date.now) {
    this.s = store.load(key) ?? { period: 1, lengthSeconds: DEFAULT_PERIOD_SECONDS, remainingMs: DEFAULT_PERIOD_SECONDS * 1000, runningSince: null };
  }

  private emit() { this.store.save(this.key, this.s); this.listeners.forEach((l) => l()); }
  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }

  private remainingMs(): number {
    const elapsed = this.s.runningSince === null ? 0 : Math.max(0, this.now() - this.s.runningSince);
    return Math.max(0, this.s.remainingMs - elapsed);
  }
  /** Whole seconds left, rounded up so the clock shows 0:00 only when time has really run out. */
  get seconds(): number { return Math.ceil(this.remainingMs() / 1000); }
  get running(): boolean { return this.s.runningSince !== null && this.remainingMs() > 0; }
  get period(): number { return this.s.period; }
  get lengthSeconds(): number { return this.s.lengthSeconds; }

  start() {
    if (this.s.runningSince !== null || this.remainingMs() === 0) return;
    this.s.runningSince = this.now();
    this.emit();
  }
  stop() {
    if (this.s.runningSince === null) return;
    this.s.remainingMs = this.remainingMs();
    this.s.runningSince = null;
    this.emit();
  }
  /** Called each tick: stops the clock once it reaches zero. */
  tick() { if (this.s.runningSince !== null && this.remainingMs() === 0) this.stop(); }
  /** Correct the clock (e.g. after a stoppage the scorer missed). */
  set(seconds: number) {
    const clamped = Math.min(Math.max(0, Math.round(seconds)), 3600);
    this.s.remainingMs = clamped * 1000;
    if (this.s.runningSince !== null) this.s.runningSince = this.now();
    this.emit();
  }
  /** New period: stopped, full length. */
  startPeriod(period: number, lengthSeconds?: number) {
    this.s = {
      period, lengthSeconds: lengthSeconds ?? (period > 4 ? OVERTIME_SECONDS : this.s.lengthSeconds),
      remainingMs: 0, runningSince: null,
    };
    this.s.remainingMs = this.s.lengthSeconds * 1000;
    this.emit();
  }
  setLength(lengthSeconds: number) { this.startPeriod(this.s.period, lengthSeconds); }
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "9:30" or "570" → seconds; null if it isn't a time. */
export function parseClock(text: string): number | null {
  const m = /^\s*(?:(\d{1,3}):([0-5]?\d)|(\d{1,4}))\s*$/.exec(text);
  if (!m) return null;
  const v = m[3] !== undefined ? Number(m[3]) : Number(m[1]) * 60 + Number(m[2]);
  return v <= 3600 ? v : null;
}
