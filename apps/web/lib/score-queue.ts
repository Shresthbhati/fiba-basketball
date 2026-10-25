import { ApiError, NetworkError } from "./api";

export type Side = "home" | "away";
export type PendingEvent = {
  id: string; localSeq: number; type: string; side?: Side; period: number; clockSeconds?: number; correctsEventId?: string;
  playerId?: string; // optional: the rostered player this event is credited to (for a SUBSTITUTION: the player coming on)
  playerOutId?: string; // SUBSTITUTION only: the player leaving the court (absent for a starter)
  occurredAt?: string; // when the tap happened on this device (lines the event up with game film)
};
export type ServerEvent = PendingEvent & { serverSeq: number };
export type ServerState = { version: number; homeScore: number; awayScore: number; period: number };
export type Conflict = { currentVersion: number; state: ServerState; newerEvents: ServerEvent[] };
export type SyncStatus = "idle" | "syncing" | "offline" | "conflict" | "error";

export type Saved = { matchId: string; pending: PendingEvent[]; baseVersion: number; nextLocalSeq: number; server: ServerState };
export interface Store { load(key: string): Saved | null; save(key: string, v: Saved): void }
export type Post = (path: string, body: unknown) => Promise<{ version: number; accepted: number; duplicates: number; state: ServerState }>;

const POINTS: Record<string, number> = { FIELD_GOAL: 2, THREE_POINT: 3, FREE_THROW: 1 };
const uuid = () => crypto.randomUUID();

export const localStore: Store = {
  load: (k) => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as Saved) : null; } catch { return null; } },
  save: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked: keep working in memory */ } },
};

/**
 * Holds scorebook events locally until the server confirms them. Events keep their client id, so resending
 * after a lost response is harmless. The shown score = last server score + the points in unsent events.
 */
export class ScoreQueue {
  private s: Saved;
  status: SyncStatus = "idle";
  conflict: Conflict | null = null;
  private listeners = new Set<() => void>();

  constructor(private matchId: string, private post: Post, private store: Store = localStore) {
    this.s = store.load(this.key) ?? {
      matchId, pending: [], baseVersion: 0, nextLocalSeq: 1, server: { version: 0, homeScore: 0, awayScore: 0, period: 1 },
    };
  }

  private get key() { return `ciq.score.${this.matchId}`; }
  private emit() {
    this.store.save(this.key, this.s);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ciq:queue-updated"));
    }
    this.listeners.forEach((l) => l());
  }
  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }

  get id() { return this.matchId; }
  get pendingCount() { return this.s.pending.length; }
  get pending() { return this.s.pending; }
  get serverState() { return this.s.server; }

  /** Score as the scorer sees it: confirmed plus unsent. Corrections cancel unsent events they point at. */
  get score() {
    const voided = new Set(this.s.pending.filter((e) => e.type === "CORRECTION" && e.correctsEventId).map((e) => e.correctsEventId!));
    let home = this.s.server.homeScore, away = this.s.server.awayScore;
    for (const e of this.s.pending) {
      if (e.type === "CORRECTION" || voided.has(e.id)) continue;
      const p = POINTS[e.type] ?? 0;
      if (e.side === "home") home += p;
      if (e.side === "away") away += p;
    }
    return { home, away };
  }

  add(type: string, opts: { side?: Side; period: number; clockSeconds?: number; correctsEventId?: string; playerId?: string; playerOutId?: string }) {
    const e: PendingEvent = { id: uuid(), localSeq: this.s.nextLocalSeq++, type, period: opts.period };
    if (opts.side) e.side = opts.side;
    if (opts.clockSeconds !== undefined) e.clockSeconds = opts.clockSeconds;
    if (opts.correctsEventId) e.correctsEventId = opts.correctsEventId;
    if (opts.playerId) e.playerId = opts.playerId;
    if (opts.playerOutId) e.playerOutId = opts.playerOutId;
    e.occurredAt = new Date().toISOString();
    this.s.pending.push(e);
    this.emit();
    return e;
  }

  /** Undo the most recent unsent event by cancelling it. Only events not already corrected. */
  undoLast(period: number) {
    const corrected = new Set(this.s.pending.filter((e) => e.type === "CORRECTION").map((e) => e.correctsEventId));
    const target = [...this.s.pending].reverse().find((e) => e.type !== "CORRECTION" && !corrected.has(e.id));
    if (!target) return null;
    return this.add("CORRECTION", { period, correctsEventId: target.id });
  }

  private setStatus(st: SyncStatus) { this.status = st; this.emit(); }

  async sync(): Promise<SyncStatus> {
    if (this.s.pending.length === 0 || this.status === "conflict") return this.status;
    this.setStatus("syncing");
    const batch = [...this.s.pending];
    try {
      const r = await this.post(`/matches/${this.matchId}/events`, { baseVersion: this.s.baseVersion, events: batch });
      const sent = new Set(batch.map((e) => e.id));
      this.s.pending = this.s.pending.filter((e) => !sent.has(e.id)); // keep anything added while the request was in flight
      this.s.baseVersion = r.version;
      this.s.server = r.state;
      this.setStatus("idle");
    } catch (err) {
      if (err instanceof NetworkError) this.setStatus("offline");
      else if (err instanceof ApiError && err.status === 409 && err.body && "newerEvents" in err.body) {
        this.conflict = err.body as unknown as Conflict;
        this.setStatus("conflict");
      } else this.setStatus("error");
    }
    return this.status;
  }

  /** The scorer has seen what the other scorer entered; resend our events on top of it. */
  async acceptConflictAndResend(): Promise<SyncStatus> {
    if (!this.conflict) return this.status;
    this.s.baseVersion = this.conflict.currentVersion;
    this.s.server = this.conflict.state;
    this.conflict = null;
    this.status = "idle";
    return this.sync();
  }

  /** Throw away our unsent events and take the server's version (the other scorer was right). */
  discardPendingAndReset() {
    if (this.conflict) {
      this.s.baseVersion = this.conflict.currentVersion;
      this.s.server = this.conflict.state;
    }
    this.s.pending = [];
    this.conflict = null;
    this.setStatus("idle");
  }
}
