import { ApiError, NetworkError } from "./api";

export type PendingSet = { clientId: string; exerciseId: string; reps: number; loadKg?: number; rpe?: number };
export type SetStatus = "idle" | "syncing" | "offline" | "signin";
type Saved = { pending: PendingSet[] };
export interface SetStore { load(key: string): Saved | null; save(key: string, v: Saved): void }
export type SetPost = (path: string, body: unknown) => Promise<unknown>;

export const localSetStore: SetStore = {
  load: (k) => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as Saved) : null; } catch { return null; } },
  save: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable: keep working in memory */ } },
};

/**
 * Sets are stored on the device until the server confirms them. Each carries its own id, so resending after a lost
 * response never logs a set twice. A set the server permanently refuses (for example the workout was finished
 * elsewhere) is dropped and reported rather than blocking the rest.
 */
export class SetQueue {
  private pending: PendingSet[];
  status: SetStatus = "idle";
  rejected: string[] = [];
  private listeners = new Set<() => void>();
  private syncing = false;

  constructor(private sessionId: string, private post: SetPost, private store: SetStore = localSetStore) {
    this.pending = store.load(this.key)?.pending ?? [];
  }
  private get key() { return `ciq.sets.${this.sessionId}`; }
  private emit() {
    this.store.save(this.key, { pending: this.pending });
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ciq:queue-updated"));
    }
    this.listeners.forEach((l) => l());
  }
  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  get items(): readonly PendingSet[] { return this.pending; }

  add(s: Omit<PendingSet, "clientId">): PendingSet {
    const item: PendingSet = { ...s, clientId: crypto.randomUUID() };
    this.pending.push(item);
    this.emit();
    return item;
  }
  remove(clientId: string) { this.pending = this.pending.filter((p) => p.clientId !== clientId); this.emit(); }

  async sync(): Promise<SetStatus> {
    if (this.syncing || this.pending.length === 0) return this.status;
    this.syncing = true;
    this.status = "syncing";
    this.emit();
    try {
      while (this.pending.length > 0) {
        const next = this.pending[0]!;
        try {
          await this.post(`/training/sessions/${this.sessionId}/sets`, next);
          this.pending = this.pending.filter((p) => p.clientId !== next.clientId);
        } catch (err) {
          if (err instanceof NetworkError) { this.status = "offline"; return this.status; }
          if (err instanceof ApiError && err.status === 401) { this.status = "signin"; return this.status; }
          if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
            this.rejected.push(err.message);
            this.pending = this.pending.filter((p) => p.clientId !== next.clientId);
          } else { this.status = "offline"; return this.status; } // server trouble: keep it and retry later
        }
        this.emit();
      }
      this.status = "idle";
      return this.status;
    } finally {
      this.syncing = false;
      this.emit();
    }
  }
}
