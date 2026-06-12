// Tidy Tails v2 — service worker (M2: PWA part 1).
//
// Scope: installable app shell, offline read-through for recently viewed
// pages, a tenant-neutral offline fallback, and a clear-caches message used
// by sign-out. No background sync and no write queue (design-lock spec §5.9).
//
// VERSION is the cache-busting knob: bump it in any PR that changes cached
// shell behavior; activate() then drops every older cache (including the
// pre-M2 "tidy-tails-v2-shell-v1").

const VERSION = "v2";
const CACHE = `tidy-tails-v2-shell-${VERSION}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

// Sign-out (and any future privacy surface) posts this to evict cached
// authed pages — a shared device must not serve one tenant's cached HTML
// to the next account. The page-side helper also deletes via the Cache
// Storage API directly; this handler is the belt to that suspenders.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "TIDY_CLEAR_CACHES") {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))),
    );
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Page navigations: network-first so data stays fresh; cached copy of the
  // same URL as fallback; the offline page when neither is available. Never
  // fall back to "/" — serving a different (possibly stale, authed) page in
  // place of the requested one confuses more than it helps.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match(OFFLINE_URL)),
        ),
    );
    return;
  }

  // Static build assets and icons: cache-first.
  if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
  }
});
