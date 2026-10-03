# Install and offline

> Gahookz can be added to a phone or desktop like an app, and when the server cannot be reached it shows an offline screen with the Gahook Dash runner game.

**Area:** [UI shell](../areas/README.md) · **Status:** live · **Last reviewed:** 2026-10-04

## What it is

Gahookz is a Progressive Web App (PWA). A manifest names it "Gahookz", gives it
a monkey icon and opens it full screen. A **service worker** keeps a copy of
the app's pages and scripts so the game loads fast and the shell opens even with
no connection.

The service worker never touches live data. It ignores `/api/`, the `/events`
stream and room media, so a game is never served from the cache. Rooms need the
server and cannot be played offline.

While the page is open the browser checks `/api/health` every 4 seconds. After
two failures, or when the device reports it is offline, it shows the **offline
screen**: "No lobby, still Gahooky." with [Gahook Dash](gahook-dash.md), a
runner game that needs no connection and keeps its high score on the device.
When the server answers again the screen says "Gahookz is back online" and a
button returns to the game. If the server and page are on different releases
(a deploy in progress) players instead see an "Updating" screen with a button
that re-checks.

The **icon** is the monkey on a plain background. On 2026-09-25 the
four-colour ring around the face was removed; the four PNG sizes are rendered
from the one SVG.

The app captures the browser's install prompt, but no button in the game uses it
today (`usePwaInstall` is unused). Install through the browser's own menu
(unverified in a real browser).

## Rules and numbers

- Health check every 4 seconds, 1.4 second timeout, offline after 2 failures.
- Pages are fetched fresh when online and fall back to the cache. The cache name
  changes with every build and old caches are deleted.
- The release hash is stamped into `index.html`, `service-worker.js` and
  `vendor-bootstrap.js` by `npm run build`.
- Icons: 180, 192 and 512 pixel PNGs plus a maskable 512, from `gahookz-monkey.svg`.

## Where it lives

| Part | Code |
| --- | --- |
| Manifest | `standalone/public/manifest.webmanifest` |
| Service worker, install prompt capture | `standalone/public/service-worker.js`, `vendor-bootstrap.js` |
| Offline screen, health check, update screen, Dash | `standalone/public/client/offline.jsx` |
| Icons and renderer | `standalone/public/icons/`, `scripts/render-icons.mjs` (`npm run icons:render`) |
| Tests | `standalone/smoke-pwa.mjs`, `smoke-dash.mjs` |

## Related

- [Gahook Dash](gahook-dash.md)
- [Hosting and deploys](hosting-and-deploys.md)
- [Live connection](live-connection.md)

## History

- 2026-07-20 — Manifest, service worker, release-stamped shell cache and offline screen in the first commit.
- 2026-08-26 — "Updating" screen for a page and server on different releases.
- 2026-10-01 — Icon redrawn without the four-colour ring; `icons:render` added ([record](../verification/2026-09-25-update/art.md)).
