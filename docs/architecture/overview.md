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

Each environment is one plain Node process (`node standalone/server.js`). It
answers four kinds of request:

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
`X-Gahookz-Room` header as well, so a proxy could route by room later; nothing in
the server reads it today.

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

_To be written._

## 4. Limits

_To be written._

## 5. Code layout

_To be written._

## 6. Where it is heading

_To be written. This section will be a plan, not built behaviour._
