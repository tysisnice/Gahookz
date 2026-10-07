const CACHE_NAME = "gahookz-shell-release-c9e88aee542037ef";
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest?v=release-c9e88aee542037ef",
  "/styles.css?v=release-c9e88aee542037ef",
  "/vendor-bootstrap.js?v=release-c9e88aee542037ef",
  "/client/arena.js?v=release-c9e88aee542037ef",
  "/client/arena.css?v=release-c9e88aee542037ef",
  "/client/reveal.css?v=release-c9e88aee542037ef",
  "/client/number-wheel.css?v=release-c9e88aee542037ef",
  "/client/reveal.js?v=release-c9e88aee542037ef",
  "/client/host-presence.js?v=release-c9e88aee542037ef",
  "/client/number-wheel.js?v=release-c9e88aee542037ef",
  "/app.js?v=release-c9e88aee542037ef",
  "/react-shim.js",
  "/react-dom-client-shim.js",
  "/use-sync-selector.js",
  "/vendor/react.production.min.js",
  "/vendor/react-dom.production.min.js",
  "/vendor/react-redux.browser.js",
  "/vendor/redux.browser.js",
  "/client/net.js?v=release-c9e88aee542037ef",
  "/client/preferences.js?v=release-c9e88aee542037ef",
  "/client/offline.js?v=release-c9e88aee542037ef",
  "/client/audio.runtime.js?v=release-c9e88aee542037ef",
  "/client/music.js?v=release-c9e88aee542037ef",
  "/client/music-composer.js?v=release-c9e88aee542037ef",
  "/client/gahook-forms.js?v=release-c9e88aee542037ef",
  "/client/presentation.js?v=release-c9e88aee542037ef",
  "/client/tutorial.js?v=release-c9e88aee542037ef",
  "/client/tutorial-art.js?v=release-c9e88aee542037ef",
  "/client/drawing.js?v=release-c9e88aee542037ef",
  "/client/social.js?v=release-c9e88aee542037ef",
  "/client/qr.js?v=release-c9e88aee542037ef",
  "/client/custom-gahook.js?v=release-c9e88aee542037ef",
  "/client/account.js?v=release-c9e88aee542037ef",
  "/client/information.js?v=release-c9e88aee542037ef",
  "/client/controls.js?v=release-c9e88aee542037ef",
  "/client/history.js?v=release-c9e88aee542037ef",
  "/client/back-stack.js?v=release-c9e88aee542037ef",
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
