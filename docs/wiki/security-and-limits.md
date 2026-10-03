# Security and limits

> The server limits how fast and how much anyone can send, keeps passwords and device keys private, and tells browsers how to protect players.

**Area:** [Systems](../areas/systems.md) · **Status:** live · **Last reviewed:** 2026-10-04

## What it is

Anyone on the internet can reach Gahookz, so the server is careful. It slows
down anyone sending too many requests, refuses requests that come from other
websites, hides secrets from other players, and limits how big a room can get.
Players meet this only as short messages: "Wrong password", "You're banned",
"This lobby is full (20 players maximum)" or a "try again" pause.

Your identity in a room is a random device key kept in your browser. It is
never put in a web address, and never shown to other players. Other players
only see a random public id. A room can have a password, stored only as a salted
scrypt hash; the hash never leaves the server.

## Rules and numbers

Request limits (production; outside production every bucket is ten times larger).
A refusal is HTTP 429 with a `Retry-After` header.

| Limit | Per | Burst | Refill per second |
| --- | --- | --- | --- |
| All actions | address | 600 | 80 |
| Actions by one player | address and key | 120 | 20 |
| Creating a room | address | 12 | 0.2 |
| Live-stream tickets | address and key | 20 | 1 |
| Room lookups and stream opens | address | 120 | 20 |

- Live streams: 1024 in total, 32 per address, 64 per room.
- Room password: at least 4 characters, at most 80.
- Request body: 8,000,000 bytes. Stored pictures and audio: 9,000,000 bytes per room.
- Same-origin check: a `POST /api/*` or stream request from another site is refused (403). Requests with no `Origin` header (tools, tests) pass.
- `GET /api/state` always answers 405 so credentials stay out of URLs.
- The client address is read from `X-Forwarded-For` only when `GAHOOKZ_TRUST_PROXY=1`.
- Response headers: a strict content policy (no framing, own-origin only), `nosniff`, no referrer, HSTS when `GAHOOKZ_HTTPS=1`.
- Drain and metrics need a secret bearer token kept outside the repository.

## Where it lives

| Part | Code |
| --- | --- |
| Token buckets, stream caps | `standalone/server/admission.mjs` |
| Headers, same-origin check, body reading | `standalone/server/transport.mjs` |
| Credentials, bans, password admission | `standalone/server/auth.mjs` |
| Host-only routes | `standalone/server/route-policy.mjs` |
| Password hashing, `roomAccessGranted` | `standalone/server.js` |
| Tests | `standalone/smoke-security.mjs`; unit tests `admission`, `auth`, `transport` and `route-policy` in `standalone/server/*.test.mjs` |

## Related

- [Live connection](live-connection.md)
- [Moderation](moderation.md)
- [Rooms and room codes](rooms-and-codes.md)

## History

- 2026-07-20 — Credentials, bans and the host-only check in the first commit.
- 2026-08-26 — Request limits and stream caps added (production foundations).
- 2026-09-05 — Room state gated on the room password.
- 2026-09-12 — Host-only routes become a checked table.
- 2026-10-04 — Page written from the code.
