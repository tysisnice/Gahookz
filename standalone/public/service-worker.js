const CACHE_NAME = "gahookz-shell-release-0f4d9ee3c045904a";
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest?v=release-0f4d9ee3c045904a",
  "/styles.css?v=release-0f4d9ee3c045904a",
  "/vendor-bootstrap.js?v=release-0f4d9ee3c045904a",
  "/client/arena.js?v=release-0f4d9ee3c045904a",
  "/client/arena.css?v=release-0f4d9ee3c045904a",
  "/app.js?v=release-0f4d9ee3c045904a",
  "/react-shim.js",
  "/react-dom-client-shim.js",
  "/use-sync-selector.js",
  "/vendor/react.production.min.js",
  "/vendor/react-dom.production.min.js",
  "/vendor/react-redux.browser.js",
  "/vendor/redux.browser.js",
  "/client/net.js?v=release-0f4d9ee3c045904a",
  "/client/preferences.js?v=release-0f4d9ee3c045904a",
  "/client/offline.js?v=release-0f4d9ee3c045904a",
  "/client/audio.runtime.js?v=release-0f4d9ee3c045904a",
  "/client/gahook-forms.js?v=release-0f4d9ee3c045904a",
  "/client/presentation.js?v=release-0f4d9ee3c045904a",
  "/client/tutorial.js?v=release-0f4d9ee3c045904a",
  "/client/drawing.js?v=release-0f4d9ee3c045904a",
  "/client/social.js?v=release-0f4d9ee3c045904a",
  "/client/qr.js?v=release-0f4d9ee3c045904a",
  "/client/custom-gahook.js?v=release-0f4d9ee3c045904a",
  "/client/information.js?v=release-0f4d9ee3c045904a",
  "/icons/gahookz-monkey.svg",
  "/icons/gahookz-180.png",
  "/icons/gahookz-192.png",
  "/icons/gahookz-512.png",
  "/icons/gahookz-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.filter((name) => name.startsWith("gahookz-shell-") && name !== CACHE_NAME).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/events" || url.pathname.startsWith("/room-media/") || url.pathname.startsWith("/media/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put("/index.html", response.clone());
          return response;
        }
        return (await caches.match("/index.html")) || response;
      }).catch(() => caches.match("/index.html"))
    );
    return;
  }

  if (url.searchParams.has("v")) {
    event.respondWith(
      fetch(request).then((response) => {
        if (response.ok) caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
        return response;
      }).catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      }
      return response;
    }))
  );
});
