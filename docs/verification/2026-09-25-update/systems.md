# Systems — rooms survive the host leaving (S1)

Agent branch `agent/systems` (commits `80b091d`, `225dde6`, `0099203`,
`0948a61`, `ab95eb4`), merged into `orchestrator/2026-09-25-update`. The
agent's run ended before it wired the browser notices or wrote this record;
the orchestrator finished both on the integration branch.

## Request

"Make it so game rooms are not immediately lost when the host leaves, there
could be a 1 minute timer."

## Before and after

| Situation | Before | After |
| --- | --- | --- |
| Last live connection in a room closes (host had connected) | Room deleted about 0.9 s later | Room kept for `GAHOOKZ_ROOM_ABANDON_GRACE_MS` (default 60 000 ms, clamped 250 ms – 10 min); any host or player reconnecting cancels it |
| Host's connection drops while players stay | Room lives on with no host; nobody can start, reset or run a new game | Players see "<host> disconnected — waiting for them to come back (0:47)"; after the same 60 s the host role passes to the earliest-joined connected, unbanned player with a live stream, through the manual hand-over path; everyone sees "<name> is now the host" |
| Host returns within 60 s | — | Countdown cancelled, nothing changes |
| Replaced host returns | — | Sees "You were away, so <name> is now the host" and keeps their player seat if they had one; a host-only host can join as a player |

Before a host first connects, the existing five-minute expiry still applies,
and only the host can push that deadline out.

## Code

- `standalone/server/host-presence.mjs` — pure decisions (grace parsing,
  promotion candidate, notice windows) with unit tests
  (`host-presence.test.mjs`).
- `standalone/server.js` — timers for abandon grace and host-away, cleared in
  `expireRoom` and on shutdown; snapshot fields `hostPresence`,
  `hostChange`, `ownHostReplaced` (no credentials).
- `packages/contracts/src/schemas.ts` — the three snapshot fields.
- `standalone/public/client/host-presence.jsx` — `HostPresenceNotices`,
  mounted in `HostMode` beside `HostView` and in `PlayerView`'s effects layer;
  styles at the end of `styles.css` ("Host presence notices"). The away
  banner waits 2.5 s so a host refresh does not flash it.
- `.env.example` — documents the variable (commented, default 60 000).

## Verification (orchestrator, 2026-09-26, disposable servers only)

| Command | Result |
| --- | --- |
| `flock … npm run check` | exit 0 — 195 unit tests, typecheck, build |
| `flock … npm run standalone:smoke:room-expiry` | exit 0 — grace survival, expiry after grace, promotion after grace (not before), host return cancels |
| `flock … npm run test:disposable -- bash -c "…gahooks && …arena && …security && …roles && …regressions && …host-controls && …social-creation"` | exit 0 |
| Browser check: host page closed, player at 390×844 | banner "The host disconnected — waiting for them to come back (0:57)"; [screenshot](systems/host-away-banner-390x844.png) |

## Known issues

- The notice sits over the top of the lobby status banner while the host is
  away. Acceptable for a transient warning; revisit if players find it
  intrusive.
- Live game timers keep running while the host is away (by design; the room
  must not stall), so a paused game stays paused until a host resumes it.
