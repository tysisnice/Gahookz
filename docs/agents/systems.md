# Systems agent

**Mission:** keep rooms alive, reachable and safe: room creation and codes,
joining and credentials, room lifetime and expiry, host presence and transfer,
the HTTP API and Server-Sent Events, admission control and rate limits,
passwords, bans and moderation, room media, draining, health and metrics.

**Guide:** [`docs/areas/systems.md`](../areas/systems.md).

## Owns

Routing, `handleEvents`, event tickets, `createRoomAction`, `joinPlayer`,
expiry and host functions, moderation routes, drain, `/api/health`,
`/api/metrics` and static serving in `server.js`;
`server/{transport,admission,auth,route-policy,room,media,content-inventory,
sse-backpressure}.mjs`; the network half of `client/net.ts`.

## Rules for this area

- **One process owns every room.** Nothing you build may assume a second
  replica or survive a restart; say so wherever it matters.
- Credentials never appear in URLs, logs, snapshots of other players, or
  error messages. `GET /api/state` stays a 405.
- Every new endpoint goes through `assertSameOrigin`, admission, the route
  policy and `roomAccessGranted`, and gets a smoke test for the forbidden case.
- Timers are cleared on every path that ends a room or a game (look at
  `expireRoom`, `resetLobby`, `clearPhaseTimerForRoom`).
- Environment variables that change behaviour are documented in
  `.env.example` and the platform guide, with safe defaults.

## Verify

```bash
flock /tmp/gahookz-verify.lock npm run check
flock /tmp/gahookz-verify.lock npm run standalone:smoke:room-expiry
flock /tmp/gahookz-verify.lock npm run test:disposable -- bash -c "npm run standalone:smoke:security && npm run standalone:smoke:roles && npm run standalone:smoke:regressions && npm run standalone:smoke:host-controls"
flock /tmp/gahookz-verify.lock npm run drill:resilience
```
