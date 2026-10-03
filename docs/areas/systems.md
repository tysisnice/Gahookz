# Systems — area guide

Verified 2026-10-04 against commit `27da7b6` on branch `agent/docs-core`. Numbers
that other branches may change are marked **(tunable)** so the orchestrator can
re-check them after a merge.

## Purpose

Systems keeps rooms alive, reachable and safe. It owns the process-local room
table, four-letter codes, joining and credentials, room lifetime and expiry,
host presence and transfer, the HTTP API and Server-Sent Events (SSE),
admission control, passwords, bans and moderation, room media, draining,
health and metrics.

Every room lives only inside one Node process. A restart ends its rooms, there
is no recovery, and there must never be more than one production replica. Every
rule below follows from that.

## What players see

- A four-letter room code (`GOOK`, `BONK`, ...) and a link to share. Typing
  anything that is not a letter is ignored.
- "Wrong password", "You're banned", "This lobby is full (20 players maximum)",
  "The server has reached its active room limit" and "This server is finishing
  its current games before an update" are the refusals a player can hit.
- When the host's connection drops, players see a countdown, then a "<name> is
  now the host" notice. A replaced host sees why when they return.
- A kicked player is removed with their questions, answers and chat, and is
  banned from the room. Anyone can report content; the host can remove it.
- Guests never sign in. Nothing in this area may put an account in the join
  path (rule 1 in `CLAUDE.md`).

## Code map

| Concern | Where |
| --- | --- |
| HTTP routing, `handleEvents`, tickets, `createRoomAction`, `joinPlayer`, expiry, host transfer, kick/ban/vote-kick/report/remove-content, drain, health, metrics, static serving | `standalone/server.js` |
| Security headers, `assertSameOrigin`, `readJson`, `sendJson`, `HttpError`, `writeSseState` | `standalone/server/transport.mjs` |
| Token buckets and SSE connection caps | `standalone/server/admission.mjs` |
| Credentials, ban list, admitted credentials, `isHostCredential` | `standalone/server/auth.mjs` |
| Which routes are host-only | `standalone/server/route-policy.mjs` |
| `MAX_PLAYERS_PER_ROOM`, `MAX_ACTIVE_ROOMS`, asset constants | `standalone/server/room.mjs` |
| Content-addressed media store, pruning, serving | `standalone/server/media.mjs` |
| Question inventory used by moderation and pruning | `standalone/server/content-inventory.mjs` |
| Abandon grace, host-away clock, successor choice, public notices | `standalone/server/host-presence.mjs` |
| SSE slow-reader eviction | `standalone/server/sse-backpressure.mjs` |
| Reports (`addReport`, `resolveReport`) | `standalone/server/social.mjs` (social owns the file) |
| Browser network boundary | `standalone/public/client/net.ts` (shared with ui-shell) |
| Browser host-presence notices | `standalone/public/client/host-presence.jsx` |
| Snapshot fields `hostPresence`, `hostChange`, `ownHostReplaced` | `packages/contracts/src/schemas.ts` |

## How it works

### Rooms and codes

Rooms are entries in the `lobbies` map in `server.js`. `normaliseRoomCode`
strips everything that is not a letter, truncates to four and upper-cases;
fewer than four letters means "no code". A client may ask for a code. Otherwise
`generateRoomCode` takes a shuffled list of 30 funny codes that are not in use,
then random four-letter codes (up to 200 tries).

`MAX_PLAYERS_PER_ROOM` is 20. `MAX_ACTIVE_ROOMS` defaults to 32 and is read once
from `GAHOOKZ_MAX_ACTIVE_ROOMS`, clamped to 1-64 (beta runs with 2). **(tunable)**
Creating a room past the cap fails; joining an existing room does not.

### Creating, joining, credentials and the host key

`POST /api/room` is both "create" and "enter". The browser sends a `playerKey`
(a UUID kept in `localStorage`, see `getClientKey` in `app.jsx`). On creation the
server stores that key as `room.hostKey`, so the host key is simply the creator's
device key; there is no separate host token. `intent: "host"` on an existing
room only succeeds for the same key (refreshing expiry); `intent: "join"` never
creates. A new room is refused while draining or shutting down.

`joinPlayer` registers the same key as a player credential
(`registerPlayerCredential`: credential to public player id, and back). Players
are addressed publicly by a random UUID; the credential never appears in
another player's snapshot. Re-joining with the same key returns the same
player. `isHostCredential` compares with `timingSafeEqual`.

`roomAccessGranted` decides who may read state or open a stream: banned keys are
refused (403 `room_banned`); an unprotected room admits everyone; a protected
room admits the host, a joined player, or a key whose password has been
verified (`admitCredential`, bounded to 512 per room, revoked on ban). The
refusal for a locked room is 401 `room_locked`.

### Room passwords

Optional, at least four characters on creation, trimmed and capped at 80.
`hashRoomPassword` uses scrypt (N 16384, r 8, p 1, 32-byte key) with a random
16-byte salt per room; `verifyRoomPassword` compares with `timingSafeEqual`.
The hash and salt live on the room and are never serialised. `GET /api/lobby`
reveals only code, phase and `hasPassword`.

### Room lifetime and host presence

| Situation | What happens | Controlled by |
| --- | --- | --- |
| New room, nobody connected yet | Reaped after five minutes | `GAHOOKZ_ROOM_EXPIRE_MS` (default 300000, clamp 250 ms - 60 min) |
| Last live connection closes after the host had connected | Room kept for the **abandon grace**, then `expireRoom` | `GAHOOKZ_ROOM_ABANDON_GRACE_MS` (default 60000, clamp 250 ms - 10 min) **(tunable)** |
| Anyone reconnects inside the grace | Timer cancelled; room carries on | `clearRoomExpiry` in `handleEvents` |
| Host's own stream closes while players remain | Host-away clock of the same length starts; clients get `hostPresence` | `reconcileHostPresence`, `startHostAway` |
| Host-away clock expires | Role passes to the earliest-joined connected, unbanned player with a live stream, via `assignHost(..., "host-away")` | `chooseHostSuccessor` |
| Nobody connected to inherit | Away state stays, overdue; the next player to connect or join is promoted at once | `reconcileHostPresence` |
| Host returns first | Countdown cancelled, nothing changes | `reconcileHostPresence` |
| Shutdown in progress | Empty rooms are released immediately, not held for the grace | `shutdown`, `scheduleRoomExpiry` |

Only the room's own host can push the first-connection deadline out
(`refreshRoomExpiry`); anyone with the code can ensure one exists. A closing
stream waits 900 ms before the player is marked disconnected, so a refresh does
not flicker. Game timers keep running while the host is away: rounds advance,
and a paused game stays paused until a host resumes it. `expireRoom` clears
the phase timer, duel, broadcast timer, expiry timer and host-away timer;
every path that deletes a room must go through it.

### Host transfer and exit

`POST /api/host/make-host` (`transferHost`) requires a connected target.
`assignHost` is the only way the role moves, by hand or by away-promotion. It
admits the previous host's key (so a host-only host can still read a protected
room), clears the away clock, and records `hostChange`. Everyone sees the
"now the host" notice for 10 s. The previous key is held server-side only, so
the replaced host alone gets `ownHostReplaced`, with no time limit.
`/api/host/exit-player` lets a host who was also a player leave their seat in
`lobby` or `building` only.

### Kick, ban, vote-kick, report, remove content

| Action | Route | Rules |
| --- | --- | --- |
| Kick | `/api/host/kick` | `kickPlayer` bans the credential, stores name and avatar in `bannedPlayers`, deletes the player's questions, chat, answers and Herd answers (text blanked, "Removed player"), and repairs the current round. The host cannot be kicked until the role is handed over. |
| Unban | `/api/host/unban` | Removes the credential from the ban list. |
| Vote kick | `/api/player/vote-kick` | Connected players only; not yourself, not the host. Kicks when votes reach a majority of the other connected players (`floor(n/2)+1`). |
| Report | `/api/player/report` | Players or the host. Five per minute per reporter, reasons `offensive`/`harassment`/`spam`/`other`, 200-character note, last 40 kept. |
| Resolve report | `/api/host/report/resolve` | Host only. |
| Remove content | `/api/host/remove-content` | `kind` is `chat`, `herd-answer` (text blanked, slot kept), `player-media` (avatar, custom Gahook, chat, whiteboard strokes) or `question`; then `pruneRoomMedia`. |

Bans are per device credential, not per network address; a player who clears
browser storage gets a new key.

### Admission, rate limits and SSE caps

`createAdmissionController` holds token buckets. Limits below are production;
outside `NODE_ENV=production` every bucket is scaled by 10. **(tunable)**

| Bucket | Key | Capacity | Refill per second |
| --- | --- | --- | --- |
| Global mutations | address | 600 | 80 |
| Actor mutations | address + `playerKey` | 120 | 20 |
| Room creation (`/api/room`) | address | 12 | 0.2 |
| Event tickets (`/api/events/ticket`) | address + key | 20 | 1 |
| Unauthenticated reads (`/api/lobby`, `/events`) | address | 120 | 20 |

A refusal is 429 `rate_limited` with `Retry-After`. The read bucket exists
because `/api/lobby` answers "is this code live?" and would otherwise be a
free enumeration oracle. SSE streams are capped at 1024 in total, 32 per
address and 64 per room; beyond that, 503 `event_capacity` with a 1.5 s
retry. The address comes from `X-Forwarded-For` only when
`GAHOOKZ_TRUST_PROXY=1`.

### Event tickets and same-origin checks

The browser asks `POST /api/events/ticket` (after `roomAccessGranted`) for a
24-byte random ticket, then opens `GET /events?ticket=...`. Tickets are
single use (deleted on consume), last two hours and are capped at 4096 in the
process. The credential never sits in a URL: it stays server-side inside the
ticket. `handleEvents` re-checks access (a ban can land between ticket and
stream) and that `?room=` matches the ticket.

`assertSameOrigin` guards every `POST /api/*` and `GET /events`: a
`Sec-Fetch-Site: cross-site` request or an `Origin` whose host differs from the
`Host` header is refused with 403. A request with no `Origin` passes (curl,
tests). `GET /api/state` is deliberately a 405.

### Route policy

`isHostOnlyRoute` treats every path under `/api/host/` as host-only.
`handleRoomAction` calls `requireHost` for those before dispatch, so a new
`/api/host/...` route is strict by default. `HOST_ONLY_ROUTES` lists the 20
known routes; a unit test asserts the table matches the routes the server
really answers and that each is guarded.

### Media store

Images and custom-Gahook audio arrive as data URLs and are stored once per room
by `storeRoomAsset`: the bytes are hashed (SHA-256, first 32 hex characters),
kept in `room.media`, and replaced everywhere by `/media/<CODE>/<id>`.
Accepted images are PNG, JPEG, WEBP, GIF; audio is MP3, WAV, OGG, WEBM, M4A, AAC.

| Limit | Value |
| --- | --- |
| Data-URL length: image / profile picture | 3,000,000 / 1,500,000 characters |
| Data-URL length: custom Gahook frame / audio | 180,000 / 280,000 characters |
| Stored bytes per room | 9,000,000 (`MAX_ROOM_ASSET_CHARS` of 12,000,000, times 0.75) |
| JSON request body | 8,000,000 bytes (`readJson`); 413 beyond |

`serveRoomMedia` answers `GET /media/<CODE>/<id>` with `immutable` private
caching and no authentication; an id is only useful to someone who has seen
it. `pruneRoomMedia` deletes assets no longer referenced by players, banned
players, questions, answers, chat or pokes. Media dies with its room.

### Broadcast coalescing and SSE backpressure

`broadcastState` bumps `stateVersion` and schedules one flush per room: normal
changes wait `STATE_BROADCAST_MS` (30 ms); `{ immediate: true }` flushes on the
same tick unless the room flushed within the floor `GAHOOKZ_BROADCAST_FLOOR_MS`
(default 50, clamp 0-250), when it schedules a flush instead. A Gahook storm
therefore costs one fan-out per floor, not one per Gahook. Each frame is one
`res.write`; if the socket reports a full buffer the client is *saturated*,
only its newest snapshot is kept, and the socket is destroyed after 30 s
without draining (`markSseClientSaturated`). A heartbeat is sent every 15 s.

### Drain, health and metrics

`POST /api/drain` (`{ "active": false }` cancels) needs the metrics bearer token;
draining refuses new rooms but keeps every existing room playable. `SIGTERM`
does the same, releases empty rooms, then waits up to
`GAHOOKZ_DRAIN_TIMEOUT_MS` (default 20 s, max 30 min) for rooms to finish before
ending them. Keep that wait inside the container's stop grace period.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | `ok`, schema version, release, `revision`, instance, `draining`, `activeRooms`, `careerResults`, `accountPersistence`, `googleLoginAvailable` |
| `GET /api/ready` | 200 normally; 503 when draining, shutting down or at room capacity |
| `GET /api/metrics` | Prometheus text. Needs `GAHOOKZ_METRICS_TOKEN` as a bearer token: 404 when no token is configured, 401 when wrong. Gauges for rooms, players, event streams, tickets, rooms by mode; counters for requests, 2xx/4xx/5xx, rate limits, streams, rooms created/expired, access denials, login failures |

### Security headers and static serving

`applySecurityHeaders` sets a CSP (`default-src 'self'`, inline scripts and
styles allowed, `frame-ancestors 'none'`, `object-src 'none'`, `img-src` with
`data:` and `blob:`), COOP/CORP `same-origin`, `Permissions-Policy` (microphone
for self only), `Referrer-Policy: no-referrer`, `nosniff`, `X-Frame-Options:
DENY`, and HSTS when `GAHOOKZ_HTTPS=1`. `serveStatic` rewrites the room, host
and player URL shapes to `index.html`, blocks path traversal and Syncthing
conflict copies, and sends `Cache-Control: no-cache` with an ETag.

## Invariants

- One process owns every room; nothing assumes a second replica or survives a
  restart.
- Credentials never appear in URLs, logs, other players' snapshots or error
  messages. `GET /api/state` stays a 405.
- Every new endpoint goes through `assertSameOrigin`, admission, the route
  policy and `roomAccessGranted`, and gets a smoke test for the forbidden case.
- Every path that ends a room goes through `expireRoom`, which clears every
  timer. A timer armed on a dead room must not outlive it.
- Host promotion goes only through `assignHost`.
- Guest play never needs an account.

## Tests

Run under the shared lock with Node 24 (`PATH=/usr/bin:$PATH`):

```bash
flock /tmp/gahookz-verify.lock npm run check
flock /tmp/gahookz-verify.lock npm run standalone:smoke:room-expiry
flock /tmp/gahookz-verify.lock npm run test:disposable -- bash -c "npm run standalone:smoke:security && npm run standalone:smoke:roles && npm run standalone:smoke:regressions && npm run standalone:smoke:host-controls"
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run drill:resilience
```

Unit tests: `admission.test.mjs`, `auth.test.mjs`, `transport.test.mjs`,
`route-policy.test.mjs`, `sse-backpressure.test.mjs`, `host-presence.test.mjs`,
`content-inventory.test.mjs`. `smoke-room-expiry` owns its own server on port
3199, so do not wrap it; `drill-resilience` does not start one, so do wrap it. Evidence for the host-presence work is in
`docs/verification/2026-09-25-update/systems.md`.

## Common changes

- **Add a host action:** put it under `/api/host/`, add it to `HOST_ONLY_ROUTES`,
  add a smoke assertion that a non-host key is refused.
- **Change a limit:** edit the constant, update the table above and
  `.env.example` if it is an environment variable, and add the case to
  `smoke-security`.
- **Add a new kind of stored media:** go through `storeRoomImage` or
  `storeRoomAudio`, retain it in `pruneRoomMedia`, and add it to
  `removeContent` if players can author it.
- **Add an environment variable:** read it once at start-up, clamp it, document
  it in `.env.example` and the platform guide.

## Known issues

- `assertRoomAssetCapacity` and `roomAssetChars` in `server/room.mjs` are not
  called by anything else; the working cap is the byte check in `media.mjs`.
- `generateRoomCode` falls back to a UUID slice that can contain digits, which
  `normaliseRoomCode` would reject. The path needs 200 random collisions among
  at most 64 rooms, so it is unreachable in practice.
- The host-away notice overlaps the lobby status banner while it shows.
- Bans survive only as long as the room, and only per device key.

Live backlog: [`../backlog.md`](../backlog.md).
