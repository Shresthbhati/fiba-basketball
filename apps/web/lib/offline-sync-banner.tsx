"use client";

import { useState } from "react";
import { useOfflineSync } from "./use-offline-sync";

export function OfflineSyncBanner() {
  const {
    isOnline,
    pendingScoreEvents,
    pendingSets,
    totalPending,
    isSyncing,
    triggerSync,
  } = useOfflineSync();

  const [showDetails, setShowDetails] = useState(false);

  // If online and no pending items: show nothing
  if (isOnline && totalPending === 0) {
    return null;
  }

  const isOffline = !isOnline;

  return (
    <aside
      role="status"
      aria-live="polite"
      style={{
        background: isOffline ? "#7c2d12" : "#1e293b",
        borderBottom: `2px solid ${isOffline ? "#ea580c" : "#3b82f6"}`,
        color: "#f8fafc",
        padding: "0.5rem 1rem",
        fontSize: "0.875rem",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.75rem",
        position: "sticky",
        top: 0,
        zIndex: 100,
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
        <span
          role="img"
          aria-label={isOffline ? "Disconnected" : "Pending Sync"}
          style={{ fontSize: "1.1rem" }}
        >
          {isOffline ? "⚡📡" : "🔄"}
        </span>

        <div>
          <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span>{isOffline ? "Offline Mode" : "Pending Synchronization"}</span>
            {totalPending > 0 && (
              <span
                style={{
                  background: isOffline ? "#ea580c" : "#2563eb",
                  color: "#ffffff",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  padding: "0.1rem 0.45rem",
                  borderRadius: "9999px",
                }}
              >
                {totalPending} queued
              </span>
            )}
          </div>
          <div style={{ color: "#cbd5e1", fontSize: "0.8rem" }}>
            {isOffline ? (
              <span>
                You are disconnected. Match scores &amp; training sets are stored safely on this device and will sync when reconnected.
              </span>
            ) : (
              <span>
                {totalPending} local action{totalPending === 1 ? "" : "s"} waiting to sync to the server.
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        {totalPending > 0 && (
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            style={{
              background: "transparent",
              color: "#93c5fd",
              border: "1px solid #3b82f6",
              borderRadius: "4px",
              padding: "0.3rem 0.6rem",
              fontSize: "0.775rem",
              cursor: "pointer",
            }}
          >
            {showDetails ? "Hide Details" : "View Breakdown"}
          </button>
        )}

        {isOnline && totalPending > 0 && (
          <button
            type="button"
            onClick={() => void triggerSync()}
            disabled={isSyncing}
            style={{
              background: isSyncing ? "#64748b" : "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: "4px",
              padding: "0.35rem 0.75rem",
              fontSize: "0.8rem",
              fontWeight: 600,
              cursor: isSyncing ? "not-allowed" : "pointer",
            }}
          >
            {isSyncing ? "Syncing..." : "Sync Now"}
          </button>
        )}
      </div>

      {showDetails && totalPending > 0 && (
        <div
          style={{
            width: "100%",
            background: "rgba(0, 0, 0, 0.25)",
            padding: "0.5rem 0.75rem",
            borderRadius: "4px",
            marginTop: "0.25rem",
            fontSize: "0.775rem",
            display: "flex",
            gap: "1.5rem",
          }}
        >
          <div>
            <strong>Match Events:</strong> {pendingScoreEvents} pending
          </div>
          <div>
            <strong>Training Sets:</strong> {pendingSets} pending
          </div>
          <div style={{ color: "#94a3b8" }}>
            Storage: IndexedDB/LocalStorage (RFC 9457 &amp; Idempotency-Key protected)
          </div>
        </div>
      )}
    </aside>
  );
}
