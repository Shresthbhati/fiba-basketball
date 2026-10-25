// COURT IQ Service Worker - PWA Offline Shell & Caching Strategy
const CACHE_NAME = "courtiq-v1";
const PRECACHE_ASSETS = [
  "/",
  "/offline.html",
  "/manifest.json",
  "/icons/icon-192.svg",
  "/icons/icon-512.svg",
  "/icons/icon-maskable.svg",
];

// Install Event: Precache offline fallback shell and key assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => {
        // Precache error non-fatal during partial connectivity
        console.warn("[SW] Precache warning:", err);
        return self.skipWaiting();
      })
  );
});

// Activate Event: Purge stale caches and claim clients immediately
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
            return Promise.resolve();
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

// Fetch Event: Routing & Caching Strategies
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // 1. Pass non-GET requests straight to network (mutations are handled by client-side ScoreQueue/SetQueue)
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // 2. API & SSE Stream Requests: Network-First with RFC 9457 offline fallback
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/streams/")) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({
            type: "https://courtiq.net/probs/offline",
            title: "Network Offline",
            status: 503,
            detail: "Device is disconnected. Active scorebook and workout logs remain queued locally.",
          }),
          {
            status: 503,
            headers: {
              "Content-Type": "application/problem+json",
              "X-CourtIQ-Offline": "true",
            },
          }
        );
      })
    );
    return;
  }

  // 3. Navigation Requests: Network-First with cached page or offline.html fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // If valid response, clone and update cache
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offlinePage = await caches.match("/offline.html");
          return offlinePage || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
        })
    );
    return;
  }

  // 4. Static Assets & Icons: Stale-While-Revalidate
  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".woff2");

  if (isStatic) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const copy = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // Default: Network with cache fallback
  event.respondWith(
    caches.match(request).then((cached) => {
      return (
        cached ||
        fetch(request).then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
      );
    })
  );
});
