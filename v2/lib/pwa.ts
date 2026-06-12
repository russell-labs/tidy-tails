// Client-side PWA helpers (M2).

// Evict every Cache Storage entry. Called on sign-out so a shared device
// never serves one account's cached authed HTML to the next. Best-effort:
// failures must never block the sign-out itself.
export async function clearAppCaches(): Promise<void> {
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    // Belt to the suspenders above: also tell the active service worker.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.controller?.postMessage({
        type: "TIDY_CLEAR_CACHES",
      });
    }
  } catch {
    // Cache eviction is best-effort; sign-out proceeds regardless.
  }
}
