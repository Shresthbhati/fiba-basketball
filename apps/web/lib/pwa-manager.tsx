"use client";

import { useEffect } from "react";
import { OfflineSyncBanner } from "./offline-sync-banner";

export function PwaManager() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      // In production or when supported, register service worker
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          // Check for service worker updates
          reg.addEventListener("updatefound", () => {
            const installing = reg.installing;
            if (installing) {
              installing.addEventListener("statechange", () => {
                if (installing.state === "installed" && navigator.serviceWorker.controller) {
                  // New update installed
                  console.info("[PWA] New version available");
                }
              });
            }
          });
        })
        .catch((err) => {
          // SW registration might be blocked in some private browsing or test environments
          console.debug("[PWA] Service worker registration ignored:", err);
        });
    }
  }, []);

  return <OfflineSyncBanner />;
}
