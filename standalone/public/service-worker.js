const CACHE_NAME = "gahookz-shell-release-f13e79a1c4d2496d";
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest?v=release-f13e79a1c4d2496d",
  "/styles.css?v=release-f13e79a1c4d2496d",
  "/vendor-bootstrap.js?v=release-f13e79a1c4d2496d",
  "/client/arena.js?v=release-f13e79a1c4d2496d",
  "/client/arena.css?v=release-f13e79a1c4d2496d",
  "/client/reveal.css?v=release-f13e79a1c4d2496d",
  "/client/number-wheel.css?v=release-f13e79a1c4d2496d",
  "/client/reveal.js?v=release-f13e79a1c4d2496d",
  "/client/host-presence.js?v=release-f13e79a1c4d2496d",
  "/client/number-wheel.js?v=release-f13e79a1c4d2496d",
  "/app.js?v=release-f13e79a1c4d2496d",
  "/react-shim.js",
  "/react-dom-client-shim.js",
  "/use-sync-selector.js",
  "/vendor/react.production.min.js",
  "/vendor/react-dom.production.min.js",
  "/vendor/react-redux.browser.js",
  "/vendor/redux.browser.js",
  "/client/net.js?v=release-f13e79a1c4d2496d",
  "/client/preferences.js?v=release-f13e79a1c4d2496d",
  "/client/offline.js?v=release-f13e79a1c4d2496d",
  "/client/audio.runtime.js?v=release-f13e79a1c4d2496d",
  "/client/music.js?v=release-f13e79a1c4d2496d",
  "/client/music-composer.js?v=release-f13e79a1c4d2496d",
  "/client/gahook-forms.js?v=release-f13e79a1c4d2496d",
  "/client/presentation.js?v=release-f13e79a1c4d2496d",
  "/client/tutorial.js?v=release-f13e79a1c4d2496d",
  "/client/tutorial-art.js?v=release-f13e79a1c4d2496d",
  "/client/drawing.js?v=release-f13e79a1c4d2496d",
  "/client/social.js?v=release-f13e79a1c4d2496d",
  "/client/qr.js?v=release-f13e79a1c4d2496d",
  "/client/custom-gahook.js?v=release-f13e79a1c4d2496d",
  "/client/account.js?v=release-f13e79a1c4d2496d",
  "/client/information.js?v=release-f13e79a1c4d2496d",
  "/client/legal.js?v=release-f13e79a1c4d2496d",
  "/client/report-subjects.js?v=release-f13e79a1c4d2496d",
  "/client/report.js?v=release-f13e79a1c4d2496d",
  "/client/controls.js?v=release-f13e79a1c4d2496d",
  "/client/history.js?v=release-f13e79a1c4d2496d",
  "/client/back-stack.js?v=release-f13e79a1c4d2496d",
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
