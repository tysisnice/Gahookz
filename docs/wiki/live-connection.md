# Live connection

> Browsers send commands as plain requests and watch the room through a one-way live stream, with a snapshot fetch as the safety net.

**Area:** [Systems](../areas/systems.md) · **Status:** live · **Last reviewed:** 2026-10-04

## What it is

Gahookz does not use WebSockets. A browser **sends commands** (answer, vote,
poke, start the game) as small `POST /api/...` requests. It **receives the
room** through Server-Sent Events (SSE), a stream the server keeps open and
pushes a complete new room snapshot down whenever something changes.

To open a stream the browser first asks `POST /api/events/ticket`. The server
returns a one-time ticket, and the browser opens `/events?ticket=...`. The
player's private key therefore never appears in a web address or a proxy log.

If the stream goes quiet, the browser also fetches a snapshot with
`POST /api/state` (`GET` on that path is deliberately refused). Snapshots carry
a `stateVersion`; the browser drops any snapshot older than the newest it has
shown, so the game never jumps backwards.

When the connection fails, the browser retries on its own. Players see a
"could not reach the room" message only after two failures in a row. If the room
is gone they are sent to the welcome screen, if they are banned they are sent
away, and if the room has a password the saved one is presented again.

## Rules and numbers

- Heartbeat: the server sends one every 15 seconds.
- Recovery: if nothing arrives for 25 seconds (heartbeat plus 10), the browser
  fetches a snapshot. It checks every 5 seconds, and also whenever a hidden tab
  becomes visible again.
- Reconnect delay: 1.5 seconds, doubling up to 30 seconds, with random jitter.
- Tickets: single use, last 2 hours, at most 4096 held at once.
- Streams: 1024 total, 32 per address, 64 per room. Over the cap the server answers 503 with a 1.5 second retry.
- Updates: changes are grouped (30 ms), with at least 50 ms between sends to one room. A slow reader keeps only its newest snapshot and is cut off after 30 seconds without catching up.
- A browser on an incompatible release shows "refresh to keep playing" instead of a half-drawn room (`SNAPSHOT_SCHEMA_VERSION`, currently 1).
- Credentials are stripped from anything logged (`redactCredentials`).

## Where it lives

| Part | Code |
| --- | --- |
| Stream, tickets, snapshot route | `standalone/server.js` — `handleEvents`, `buildSnapshot`, `broadcastState` |
| Backpressure | `standalone/server/sse-backpressure.mjs` |
| Headers and stream framing | `standalone/server/transport.mjs` |
| Browser network boundary | `standalone/public/client/net.ts` — `createApiClient`, `createLiveConnection`, `createSnapshotGate` |
| Wiring and recovery poll | `standalone/public/app.jsx` — `useEvents` |
| Snapshot schema | `packages/contracts/src/` |
| Tests | `standalone/public/client/net.test.ts`, `standalone/server/sse-backpressure.test.mjs`, `standalone/drill-resilience.mjs` |

## Related

- [Security and limits](security-and-limits.md)
- [Rooms and room codes](rooms-and-codes.md)
- [Hosting and deploys](hosting-and-deploys.md)

## History

- 2026-07-20 — Commands, SSE and snapshots in the first commit.
- 2026-09-09 — Browser network code gathered into one testable module (P01).
- 2026-09-11 — Recovery poll runs only when the stream is silent; slow readers handled (P08).
- 2026-10-04 — Page written from the code.
