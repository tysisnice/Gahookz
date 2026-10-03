# Architecture overview

> This page describes what the code does today, except for the last section,
> which is a plan. Last checked 2026-10-04.

## 1. Summary

Gahookz is a real-time party game (Quiz, Majority Rulz and Herd, plus a social
layer of Gahooks, chat, a whiteboard and a 1v1 arena) that runs on one Fedora
machine at `gahookz.com`. Browsers send small JSON commands with `POST /api/*`
and watch the room through Server-Sent Events (SSE). There are no WebSockets.
One Node process per environment holds every room in memory, decides everything
that matters (phase, time, points, who may see what) and also serves the
browser app, the PWA shell and room media. Nobody needs an account to host,
join or finish a game. Accounts are an optional extra layer, and production does
not have them configured today.

```text
Browser / installed PWA
   │  HTTPS
   ▼
Cloudflare (authoritative DNS only, DNS-only mode, no proxying)
   │
   ▼
Home router, TCP 80 and 443
   │
   ▼
Nginx Proxy Manager ──── Docker network `gahookz-proxy` ────┐
   ├─ gahookz.com, www.gahookz.com ──> gahookz       (production, host port 3102)
   ├─ beta.gahookz.com ──────────────> gahookz-beta  (beta, host port 3103)
   └─ dev.gahookz.com (access list) ─> gahookz-dev   (development, host port 3101)
```

Each container listens on port 3001 inside Docker; the host ports 3101 to 3103
are loopback bindings used for local checks, not the public path. All three
run from the Store repository, `/mnt/storage/syncthing/Store/Projects/gahookz`,
since 2026-10-02.

| Environment | Image and source | Notes |
| --- | --- | --- |
| Production `gahookz` | Immutable image, Compose project `gahookz-prod` | Changed only by a deliberate, requested deploy |
| Beta `gahookz-beta` | Image of the production target | Capped at two rooms, no database |
| Development `gahookz-dev` | Bind-mounts the Store working tree, hot reload | Every save in that tree reloads it |

Hosting commands and deploy rules are in [Hosting and deploys](../wiki/hosting-and-deploys.md)
and [the runbook](../operations/runbook.md). The proxy-to-container mapping is
taken from `CLAUDE.md` and the Compose file; the Nginx Proxy Manager
configuration itself is not in this repository.

## 2. Processes and transport

Each environment is one plain Node process (`node standalone/server.js`; dev
wraps it in a watcher). It answers four kinds of request:

| Request | What it does |
| --- | --- |
| `POST /api/*` | Every command: create a room, join, answer, vote, Gahook, host controls. The body is JSON and carries the room `code` and the caller's `playerKey`. Success is `200 {ok: true, ...}`, a refusal is `400` or `404` with a message. |
| `POST /api/events/ticket`, then `GET /events?ticket=...` | The live stream (SSE). The ticket is 24 random bytes, single use, valid two hours. The device key stays inside the server-side ticket and never appears in a URL or a proxy log. |
| `POST /api/state` | Snapshot recovery. The browser asks for a full snapshot when the stream has been silent for 25 seconds, or when a hidden tab wakes. `GET /api/state` is a deliberate 405. |
| `GET /`, assets, `/media/<CODE>/<id>` | The static PWA (`standalone/public`, with a service worker and an offline shell) and room media from memory. |

Every `POST /api/*` passes the same gate in `server.js`: `assertSameOrigin`,
`readJson` (8 MB cap), `admission.assertMutation` (token buckets), then the
route. Anything under `/api/host/` is host-only by default
(`server/route-policy.mjs`). The browser sends the room code in an
`X-Gahookz-Room` header as well. The example config in `deploy/nginx/` hashes on
it, but nothing in the server reads it.

The server pushes a **complete snapshot**, not a patch. `buildSnapshot` builds
it separately for each connected stream, from that stream's role, so hidden
information (answers before reveal, votes, authors, device keys) is never in a
payload the viewer should not have. Each snapshot has a `stateVersion`, and the
browser drops anything older than what it has already shown.

### One Gahook, from tap to every screen

1. **Tap.** A player taps another player's card. `app.jsx` calls
   `api("/api/player/poke", { playerKey, playerId })`. `createApiClient`
   (`client/net.ts`) adds the room code and POSTs JSON.
2. **Gate.** Same-origin check, body read, rate-limit buckets, then
   `handleAction` finds the room by code and `handleRoomAction` routes to
   `pokeFromPlayer`. Nothing here reads an account.
3. **Rules.** In a live game the host may have turned Gahook effects off, which
   refuses the request. Otherwise the sender must be joined and connected, the
   target connected and not the sender, and during a live round each sender
   gets one Gahook per question. In the lobby there is no such limit.
4. **Mutation.** `pokePlayer` changes the room in memory: it records the target's
   latest Gahook, moves points when the host's effects policy is "chaos", and updates spam streaks that
   can trigger Counter or Ultimate Gahooks.
5. **Broadcast.** `broadcastState(room, { immediate: true })` bumps
   `stateVersion` and flushes on the same tick. If the room already flushed
   within the last 50 ms, one flush is scheduled instead, so a Gahook storm
   costs one fan-out per floor, not one per tap.
6. **Fan-out.** `flushBroadcast` walks the open streams of that room.
   `sendState` builds each client's own snapshot and writes it with one
   `res.write`. A reader whose socket is full keeps only its newest snapshot.
7. **Reply.** The sender's POST returns `{ ok: true, pokeId, kind, ... }`. The
   sender does not need a separate snapshot fetch (`refresh: false`).
8. **Render.** On every phone, the host screen and the shared party screen, the
   `EventSource` message reaches `createSnapshotGate`, which discards stale
   versions. The reducer stores the snapshot and React draws the overlay for the
   target's latest Gahook.

```text
tap -> POST /api/player/poke -> room mutated in memory -> broadcastState
    -> one snapshot per open stream (SSE) -> snapshot gate -> every screen
```

The recovery poll, ticket renewal and reconnect delay are in
[Live connection](../wiki/live-connection.md). The numbers behind steps 5 and 6
are in [Systems](../areas/systems.md), "Broadcast coalescing and SSE
backpressure".

> Correction to older text: `OPERATIONS-AND-ROADMAP.md` section 3 says the client
> polls `GET /api/state` every 1.8 seconds. That is no longer true. The poll is a
> `POST`, and it runs only when the stream is silent.

## 3. State ownership

Every room is one plain object in the `lobbies` map in `standalone/server.js`,
created by `makeLobby`. The process owns it outright.

| Held in memory for the life of the room | Where |
| --- | --- |
| Players, public ids, scores, connection state | `room.players` |
| Credentials: the host key (the creator's device key), player credentials, admitted credentials after a password check, bans | `server/auth.mjs` |
| Room password, as a salted scrypt hash that is never serialised | `room.passwordHash`, `room.passwordSalt` |
| Phase, deadline, questions, answers, votes, Herd assignment plan | `room.phase`, `room.game`, `room.questions` |
| Timers: phase, progress wait, broadcast flush, expiry, host-away, duel | cleared together by `expireRoom` |
| Chat (last 60 messages), whiteboard (last 160 strokes), reports (last 40) | `server/social.mjs` |
| Drawings, profile pictures and custom-Gahook images and audio, up to about 9 MB decoded | `room.media`, `server/media.mjs` |

Outside any room the process also holds the open SSE streams, the event tickets
(at most 4096), the rate-limit buckets, the account-session cache and in-flight
Google sign-in flows. All of it is gone when the process stops.

**What survives a restart** is deliberately small:

- **The career-result journal.** When a signed-in player finishes a game, the
  result is appended and fsynced to `GAHOOKZ_CAREER_JOURNAL` before it is
  acknowledged. Production Compose points it at `/app/data/career.journal` on
  the `career-data` volume, and the server redelivers whatever was pending when
  it starts. Guests never enter it, so while production has no accounts
  configured it holds nothing. See [Accounts](../areas/accounts.md).
- **PostgreSQL accounts, only when configured.** Accounts, sessions, the saved
  look, two cloud custom-Gahook slots and career statistics live in PostgreSQL
  when `DATABASE_URL` is set. **Production is not configured today.** Per the
  accounts guide, `/api/health` there reports `accountPersistence: "memory"`
  and Google sign-in is unavailable, and the memory repository is lost on
  restart too. Beta has no database by design. I did not query the live server
  while writing this page.

Everything else ends with the process: rooms, players, credentials, chat,
drawings, media. There is no persistence or recovery for an active room, which
is why deploys drain first (`POST /api/drain`, or `SIGTERM`, bounded by
`GAHOOKZ_DRAIN_TIMEOUT_MS`) and why the server still tells players so.

**Why exactly one production replica.** The design leans on the process being
the single writer:

- Room mutation is plain code on one in-memory object, with no lock or lease.
  Two processes could each believe they own the same code.
- The room table, tickets, open streams, media and rate limits are all local. A
  request that reached the wrong replica would answer "That room does not
  exist", and a room's media would not be there.
- A second replica would not add capacity for a given room, only split the
  players of one party across two worlds.

Recovery inside one process is feasible, and recovery across processes is a much
larger project, as [ADR 0002](0002-room-recovery-feasibility.md) records. Neither
is built. Until one is built **and tested**, no document should imply that a
restart keeps a game.

## 4. Limits

These are the headline numbers that shape capacity. The full list, with the
request-rate buckets and what each refusal looks like, is in
[Security and limits](../wiki/security-and-limits.md); room lifetime is in
[Rooms and room codes](../wiki/rooms-and-codes.md).

| Limit | Value | Set by |
| --- | --- | --- |
| Active rooms per process | 32 by default, 1 to 64 through `GAHOOKZ_MAX_ACTIVE_ROOMS`; beta runs with 2 | `server/room.mjs` |
| Players per room | 20 | `MAX_PLAYERS_PER_ROOM` |
| Live streams | 1024 in total, 32 per address, 64 per room | `server/admission.mjs` |
| Media per room | about 9 MB decoded, in memory, dropped with the room | `server/media.mjs` |
| JSON request body | 8,000,000 bytes | `readJson` in `server/transport.mjs` |
| Chat and whiteboard kept | 60 messages, 160 strokes | `server/social.mjs` |
| Container (production Compose) | 1 GB memory and 2 CPUs by default, 128 processes | `compose.yaml` |

Creating a room past the cap fails; joining an existing room does not. Two
consequences are worth knowing. Because the per-address caps count the client
address, a venue where many players share one public address shares those caps
too. And because every room, stream and image sits in one process's memory, the
32-room cap is a memory and fan-out budget as much as a policy: raising it is a
load question, not a configuration one.

## 5. Code layout

The ownership map in [the areas README](../areas/README.md) says which agent
edits which function. This table is the short version, by folder.

| Folder | What it holds | Owner and guide |
| --- | --- | --- |
| `standalone/server.js` | HTTP routing, room commands, phase machine, snapshots, SSE, static serving. About 5,600 lines, the highest-risk file. | Shared: [systems](../areas/systems.md) (transport, rooms), [game-flow](../areas/game-flow.md) (phases, scoring), social (Gahooks, chat, arena) |
| `standalone/server/*.mjs` | Extracted server features. `transport`, `admission`, `auth`, `route-policy`, `room`, `media`, `host-presence`, `sse-backpressure` belong to systems; `gameplay`, `scoring`, `majority`, `phase-controls`, `presentation` to game-flow; `arena`, `social`, `custom-gahook` to social; `accounts`, `account-room`, `career-outbox` to accounts | [systems](../areas/systems.md), [game-flow](../areas/game-flow.md), [accounts](../areas/accounts.md) |
| `standalone/public/app.jsx` and `client/*.jsx` | The browser app: state, routes, API client, host and player screens, feature modules | ui-shell, ui-lobby, ui-game, social, audio-art (profiles in [`docs/agents/`](../agents/README.md)) |
| `standalone/public/styles.css` | The whole visual system, about 11,400 lines, each rule owned by the area of its component | Same as the component it styles |
| `packages/contracts`, `packages/game-engine` | Typed schemas and snapshot types; the pure phase and Herd engine | [game-flow](../areas/game-flow.md), shared with systems |
| `packages/accounts`, `infra/postgres` | Career statistic helpers; the account schema | [accounts](../areas/accounts.md) |
| `packages/content` | Prompt catalogue | [content](../areas/content.md) |
| `Dockerfile`, `compose.yaml`, `scripts/`, `deploy/`, `.github/`, `standalone/build-client.mjs`, `dev.mjs` | Build, dev server, Docker, deploy tooling, CI | [platform](../areas/platform.md) |
| `standalone/smoke-*.mjs`, `browser-*.mjs`, `load-*.mjs`, `drill-resilience.mjs` | The regression net | [quality](../areas/quality.md) |
| `standalone/legacy/` | Retired modes, not built | nobody |

At this commit the area guides for the browser areas, social and audio-art are
not written yet, so their rows point at the agent profiles. Three files
(`server.js`, `app.jsx`, `styles.css`) are oversized and still growing; prefer
extracting a vertical slice into a new module over adding to them.

## 6. Where it is heading

> **This section is a plan. None of it is built, and none of it is scheduled.**
> It summarises `OPERATIONS-AND-ROADMAP.md` section 11 and
> [ADR 0001](0001-long-term-foundation.md), checked against the code on
> 2026-10-04. Anything that would change production needs Tyson's decision.

The plan keeps the protocol and the player experience, adds typed boundaries,
then moves state out of the process on purpose. The target repository is an npm
workspace with `apps/web`, `apps/server`, `apps/desktop` (an Electron host
shell for Steam) and `apps/mobile` (a Capacitor wrapper), over shared packages
such as `client-data`, `ui` and `entitlements`. There is no `apps/` folder
today: the server and the browser app both live under `standalone/`.

| Plan, in order | Today |
| --- | --- |
| A pure `game-engine`: `(roomState, command, now, rng)` to `(nextState, effects)`, with no HTTP, timers or global maps | Partial. `packages/game-engine` holds phase maths and the Herd engine. Quiz and Majority Rulz mutation, and every timer, still live in `server.js`. |
| Versioned runtime schemas for every command and snapshot | Partial. `packages/contracts` has schemas, but the server validates only the host-settings request with them. Other commands use hand-written checks. |
| One authoritative room worker, with explicit room affinity | Exactly one process, no affinity needed. The browser already sends `X-Gahookz-Room` for it, and the server ignores it. |
| PostgreSQL for accounts, entitlements, prompt packs, moderation records and consent | Accounts and saved looks have a schema and code (`infra/postgres`), unprovisioned in production. Entitlements, prompt packs, audit records and consent are not built. |
| Object storage for user media, with validation, expiry and moderation | Not built. Media lives in process memory and ends with the room. |
| Redis, only if needed, for snapshots, coordination and pub/sub | Not built, and not needed with one process. |
| A drain and migration strategy before any second game node | Drain exists. Migration does not, and [ADR 0002](0002-room-recovery-feasibility.md) explains why it is a large project. |
| Guest room play stays account-free | Unchanged, and a standing rule. |

SSE stays the transport for web, Electron and Capacitor. WebSockets would be
reconsidered only if measured latency or a platform limit justified them. Until
recovery and affinity exist and are tested, the constraint in section 3 stands:
one process, one production replica, and a deploy that drains first.
