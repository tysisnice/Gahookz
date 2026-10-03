# Rooms and room codes

> Every game happens in a room with a four-letter code that anyone can type, open as a link or scan as a QR code.

**Area:** [Systems](../areas/systems.md) · **Status:** live · **Last reviewed:** 2026-10-04

## What it is

When someone hosts a game, the server makes a room and gives it a four-letter
code such as `GOOK` or `BONK`. Players join by typing the code, opening the
share link (the site address followed by the code) or scanning the QR code on
the lobby's code band. Tapping the band copies the link and opens the phone's
share sheet when there is one. Codes contain letters only: anything else you
type is ignored, and the code is always shown in capitals.

The host can ask for a particular code. If they do not, the server picks one
of 30 funny codes that nobody is using, and falls back to random letters.
A host can also protect the room with a password (see
[Security and limits](security-and-limits.md)). Guests never need an account to
host or join.

A room lives only in the memory of the one server process. If the server
restarts, every room ends and nothing is recovered. That is why deploys wait
for games to finish first (see [Hosting and deploys](hosting-and-deploys.md)).

## Rules and numbers

- Code: exactly four letters. `normaliseRoomCode` strips non-letters,
  truncates and upper-cases.
- Players per room: 20 (`MAX_PLAYERS_PER_ROOM`).
- Rooms alive at once: 32 by default (`GAHOOKZ_MAX_ACTIVE_ROOMS`, clamped 1 to
  64). Creating a room past the cap fails; joining an existing one does not.
- A new room nobody has opened is removed after 5 minutes.
- When the last connection closes, the room is kept for 60 seconds, then
  removed. Anyone reconnecting inside that minute keeps it alive.
- A room is also released at once during a shutdown if it is empty.
- Joining again from the same browser returns the same player, because the
  browser keeps a private device key (`playerKey`) in local storage. The key
  that created the room is the host key.
- `GET /api/lobby` tells a visitor only the code, the phase and whether a
  password is set.

## Where it lives

| Part | Code |
| --- | --- |
| Room table, `normaliseRoomCode`, `generateRoomCode`, `createRoomAction`, `joinPlayer`, `expireRoom` | `standalone/server.js` |
| Player and room caps | `standalone/server/room.mjs` |
| Credentials and host key check | `standalone/server/auth.mjs` |
| Lifetime and abandon grace | `standalone/server/host-presence.mjs` |
| Share link, code band, QR code | `standalone/public/app.jsx` (`buildRoomLink`, `LobbyCodeBand`), `standalone/public/client/qr.jsx` (`RoomQrCode`) |
| Tests | `standalone/smoke-room-expiry.mjs`, `standalone/smoke-security.mjs`, `standalone/smoke-regressions.mjs` |

## Related

- [Host and roles](host-and-roles.md)
- [Security and limits](security-and-limits.md)
- [Live connection](live-connection.md)
- [Systems area guide](../areas/systems.md)

## History

- 2026-07-20 — Rooms, codes, the player and room caps and the join link in the first commit.
- 2026-09-12 — `GAHOOKZ_MAX_ACTIVE_ROOMS` added so the beta site can run with a cap of 2.
- 2026-09-26 — Abandon grace (`GAHOOKZ_ROOM_ABANDON_GRACE_MS`, 60 s) and host-away timing added.
- 2026-10-04 — Page written from the code.
