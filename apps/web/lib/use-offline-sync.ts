"use client";

import { useEffect, useState, useCallback } from "react";

export interface OfflineSyncState {
  isOnline: boolean;
  pendingScoreEvents: number;
  pendingSets: number;
  totalPending: number;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  triggerSync: () => Promise<void>;
}

export function scanLocalQueues(): { pendingScoreEvents: number; pendingSets: number } {
  if (typeof window === "undefined" || !window.localStorage) {
    return { pendingScoreEvents: 0, pendingSets: 0 };
  }

  let pendingScoreEvents = 0;
  let pendingSets = 0;

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;

      if (key.startsWith("ciq.score.")) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw) as { pending?: unknown[] };
            if (Array.isArray(parsed?.pending)) {
              pendingScoreEvents += parsed.pending.length;
            }
          }
        } catch {
          // ignore parsing error
        }
      } else if (key.startsWith("ciq.sets.")) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw) as { pending?: unknown[] };
            if (Array.isArray(parsed?.pending)) {
              pendingSets += parsed.pending.length;
            }
          }
        } catch {
          // ignore parsing error
        }
      }
    }
  } catch {
    // localStorage restricted or disabled
  }

  return { pendingScoreEvents, pendingSets };
}

export function useOfflineSync(): OfflineSyncState {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== "undefined" ? navigator.onLine : true;
  });
  const [pendingCounts, setPendingCounts] = useState<{ pendingScoreEvents: number; pendingSets: number }>({
    pendingScoreEvents: 0,
    pendingSets: 0,
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const refreshCounts = useCallback(() => {
    const counts = scanLocalQueues();
    setPendingCounts(counts);
  }, []);

  useEffect(() => {
    refreshCounts();

    const handleOnline = () => {
      setIsOnline(true);
      refreshCounts();
      // Auto-trigger sync when transitioning online
      window.dispatchEvent(new CustomEvent("ciq:sync"));
    };

    const handleOffline = () => {
      setIsOnline(false);
      refreshCounts();
    };

    const handleStorage = () => {
      refreshCounts();
    };

    const handleQueueUpdated = () => {
      refreshCounts();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("ciq:queue-updated", handleQueueUpdated);

    // Polling interval to check for updates
    const interval = setInterval(refreshCounts, 2500);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("ciq:queue-updated", handleQueueUpdated);
      clearInterval(interval);
    };
  }, [refreshCounts]);

  const triggerSync = useCallback(async () => {
    setIsSyncing(true);
    try {
      window.dispatchEvent(new CustomEvent("ciq:sync"));
      // Short delay for in-flight requests
      await new Promise((resolve) => setTimeout(resolve, 800));
      refreshCounts();
      setLastSyncedAt(new Date());
    } finally {
      setIsSyncing(false);
    }
  }, [refreshCounts]);

  const totalPending = pendingCounts.pendingScoreEvents + pendingCounts.pendingSets;

  return {
    isOnline,
    pendingScoreEvents: pendingCounts.pendingScoreEvents,
    pendingSets: pendingCounts.pendingSets,
    totalPending,
    isSyncing,
    lastSyncedAt,
    triggerSync,
  };
}
