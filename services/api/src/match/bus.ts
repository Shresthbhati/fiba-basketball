import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

export type StreamMessage = {
  id: string; schemaVersion: 1; resourceId: string; resourceVersion: number; occurredAt: string; type: string; data: unknown;
};

/**
 * In-process fan-out for live updates. Messages are hints, not the record: clients refetch
 * authoritative state on (re)connect. With more than one API instance this becomes Redis pub/sub.
 */
export class MatchBus {
  private readonly em = new EventEmitter().setMaxListeners(0);

  publish(matchId: string, type: string, version: number, data: unknown) {
    const msg: StreamMessage = { id: randomUUID(), schemaVersion: 1, resourceId: matchId, resourceVersion: version, occurredAt: new Date().toISOString(), type, data };
    this.em.emit(matchId, msg);
  }

  subscribe(matchId: string, fn: (m: StreamMessage) => void): () => void {
    this.em.on(matchId, fn);
    return () => this.em.off(matchId, fn);
  }
}
