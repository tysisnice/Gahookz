# docs-core — stale or wrong statements found (2026-10-04)

Run: `docs-steward` agent, branch `agent/docs-core`, commit base `27da7b6`.
Scope: the systems, platform, quality, accounts and content area guides. Nothing
was run against Docker or ports 3101-3103. Old documents were not edited by this
pass; each item is recorded for the owner of that file.

| File | Statement | Correction (what the code or config does) |
| --- | --- | --- |
| `CLAUDE.md`, "Deploying, when you have been asked to" and "Confirm what is actually live" | `cd /srv/gahookz` before deploying and running `scripts/docker-status.sh` | The same file says `/srv/gahookz` is at an old revision and is not the production source (containers run from the Store repository since 2026-10-02). The deploy section needs the Store path. |
| `docs/agents/systems.md`, "Verify" | `flock ... npm run drill:resilience` | `standalone/drill-resilience.mjs` defaults to `http://127.0.0.1:3199` and starts no server, so it must be wrapped: `npm run test:disposable -- npm run drill:resilience`. |
| `docs/agents/accounts.md`, "Verify" | same unwrapped `npm run drill:resilience` | Same correction. |
| `standalone/server/route-policy.mjs` header comment | "All nineteen are guarded today" | `HOST_ONLY_ROUTES` lists 20 routes. Code comment, not a document; not changed. |
| `scripts/docker-deploy.sh` | Compares the running image to `gahookz:local` | `compose.yaml` defaults the production image to `${GAHOOKZ_PROD_IMAGE:-gahookz:prod-local}`. The check can only pass if the host's `.env` sets `GAHOOKZ_PROD_IMAGE=gahookz:local` (not verified; `.env` was not read). |
| `.env.example` | Presented as the documented environment | It omits `GAHOOKZ_DRAIN_TIMEOUT_MS`, `GAHOOKZ_MAX_ACTIVE_ROOMS`, `GAHOOKZ_BROADCAST_FLOOR_MS`, `GAHOOKZ_PROD_IMAGE` and `GAHOOKZ_BETA_IMAGE`, which `compose.yaml` or the server read. |
| `standalone/dev.mjs` | Header says client rebuilds are automatic | `client/host-presence.jsx` and `client/legal.jsx` are missing from its watch sets, so editing only those does not rebuild. |
| `standalone/server/room.mjs` | Exports `assertRoomAssetCapacity` and `roomAssetChars` as the room image-storage guard | Nothing else calls them; the working cap is the byte check in `server/media.mjs` (9,000,000 bytes per room). |
| `package.json` | `engines.node` is `>=20.0.0` | CI, Docker and the verified runtime are Node 24 (`packages/` also needs Node 24's native type stripping in production). |

No other statement in the five guides is marked "unverified" except where
`.env` or Docker state would have been needed; those places say so.

## Wiki pages written (2026-10-04, `docs-steward`, branch `agent/docs-core`)

Eleven core wiki pages, one commit each, written from the area guides and
confirmed against the code: `rooms-and-codes.md`, `host-and-roles.md`,
`security-and-limits.md`, `live-connection.md`, `hosting-and-deploys.md`,
`testing.md`, `accounts-and-career.md`, `moderation.md`,
`install-and-offline.md`, `information-and-legal-pages.md` and
`prompts-and-suggestions.md`. Nothing was run against Docker or ports
3101-3103; the content counts were re-measured with a read-only import of
`packages/content` (20 educational, 20 funny, 175 legacy, personalised share 0.35).

More stale or wrong statements found while writing:

| File | Statement | Correction (what the code does) |
| --- | --- | --- |
| `standalone/public/client/legal.jsx`, "Reporting something in a room" | "Use the report button in the room. It goes straight to the host" | Nothing in `standalone/public` calls `/api/player/report`, `/api/host/report/resolve` or `/api/host/remove-content`, and the snapshot's `reports` field is never read by the browser. The routes exist and are tested (`smoke-roles`, `smoke-room-rules`, `smoke-review-repairs`), but no button exists. Either build the buttons or reword the page. |
| `standalone/public/client/legal.jsx`, Privacy "If you play as a guest" | The room ends "a few minutes after everyone leaves" | An abandoned room is kept for 60 seconds (`GAHOOKZ_ROOM_ABANDON_GRACE_MS`, since 2026-09-26); a room nobody has opened expires after 5 minutes. |
| `standalone/public/client/offline.jsx` | Exports `usePwaInstall` as the install flow | Nothing imports it, so no install button exists; `vendor-bootstrap.js` captures `beforeinstallprompt` and nothing consumes it. Install works only through the browser's own menu (unverified in a real browser). |
| `standalone/public/client/information.jsx` | `/information` is the public guides page | No in-app link to `/information` was found (the welcome screen links only to `/legal`); the page is reachable by address. Menus were not exhaustively checked. |
| `standalone/public/client/information.jsx`, `legal.jsx` | "reviewed 10 August 2026", "Last updated 6 September 2026" | Hard-coded strings in the source; they do not move when the guides change. |
