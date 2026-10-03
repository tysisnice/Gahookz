# Lobby

> The waiting room where everyone meets, shares the room code and messes about while the host sets up the game.

**Area:** [UI lobby](../areas/README.md) · **Status:** live · **Last reviewed:** 2026-10-04

## What it is

The lobby is the first screen after joining. The host sees the setup controls ([Game setup](game-setup.md), [Lobby rules](lobby-rules.md)). Players see "The host is choosing the game" and a short tutorial button.

- **Share Lobby Code.** A band at the top shows the four-letter code, the join link and a QR code. Tapping it shares the link ([Rooms and room codes](rooms-and-codes.md)).
- **Players.** Every player has a card and a count shows how many are connected. A card has a Gahook button ([Gahooks](gahooks.md)), Vote kick ([Moderation](moderation.md)) and, when allowed, **Challenge to 1v1**.
- **1v1 challenges.** A player in the room can challenge another connected player to a [Gahook Arena](gahook-arena.md) duel. The host can switch duels off in Lobby rules ("The host has turned off lobby duels.").
- **Lobby painting.** Players can draw over the player wall ([Lobby painting](lobby-painting.md)).
- **Chat.** The floating chat bubble works in the lobby and while questions are being written ([Room chat](room-chat.md)).
- **Last game.** After a game, a summary shows the mode, the winner (or "Shared win"), their points and the top eight players. Your own row is highlighted.

Nobody needs an account at any point here.

## Rules and numbers

- The host needs at least one connected player, or to play too, before locking the rules.
- The summary only appears once a game has finished in this room.
- The lobby is the only time game settings can change.

## Where it lives

| Part | Code |
| --- | --- |
| Share band, summary | `standalone/public/app.jsx` — `LobbyCodeBand`, `PreviousGameSummary` |
| QR code | `standalone/public/client/qr.jsx` — `RoomQrCode` |
| Player cards | `standalone/public/app.jsx` — `PlayerCard`, `ReadonlyPlayerCard` |
| Painting, chat | `standalone/public/app.jsx` — `LobbyPaintSurface`, `RoomSocialHub` |
| Server | `standalone/server.js` — `lockSetup`, `challengeGahookDuel`, `lastGameSummary` |
| Tests | `standalone/smoke-layout.mjs`, `standalone/smoke-arena-lifecycle.mjs` |

## Related

- [How a game works](how-a-game-works.md), [Host and roles](host-and-roles.md)

## History

- 2026-07-20 — First version with the code band and QR code (`dd449f2`).
- 2026-08-26 — Last-game summary added (`178d56b`).
- 2026-09-19 — Painting moves from the chat onto the player wall (`78a1382`).
- 2026-09-29 — The band is renamed Share Lobby Code and gets less padding on phones (`c14abbc`).
