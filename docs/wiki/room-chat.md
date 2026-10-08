# Room chat

> A floating chat bubble for talking while the room waits.

**Area:** [social](../areas/social.md) · **Status:** live · **Last reviewed:** 2026-10-07

## What it is

While the room is waiting, a round chat button floats in the corner. Tap it to open the chat, type a message and press Send. While it is closed it shows how many messages you have not read, and brief notifications of new messages from other people pop up beside it. Tapping anywhere outside the chat, or the × button, tucks it away again. It starts closed.

Players and the host can both chat; the host appears as "Host". Chat is for waiting only (the lobby, question writing and Herd answer writing): once the game starts the bubble goes away. Beside every message from another player is a small **Report** button ([Moderation](moderation.md)).

## Rules and numbers

- **Open in the lobby, while questions are being written and during Herd answer writing.** The server refuses chat in any other phase ("Chat is available while the room is waiting."). Herd writing was added on 2026-10-08, matching what the browser already offered.
- Up to **240 characters** per message; control characters and extra spaces are removed; an empty message is refused.
- At most **6 messages per 10 seconds** per player ("Chat is moving quickly").
- The room keeps the latest **60** messages.
- The host can remove a message ([Moderation](moderation.md)): it stays as a "removed" line with no text or picture, so the conversation does not shift. Messages from a kicked player are removed the same way.
- Messages are visible to everyone in the room and are not saved after the room closes.

## Where it lives

| Part | Code |
| --- | --- |
| Server | `standalone/server/social.mjs` — `addChatMessage`, `removeChatMessage`, `publicChatMessages`; `standalone/server.js` — `postRoomChat` |
| Browser | `standalone/public/client/social.jsx` — `WaitingRoomSocial`; mounted in `app.jsx` |
| Tests | `standalone/smoke-social-creation.mjs` (refused once the game runs), `smoke-herd-flow.mjs` (accepted in Herd writing), `smoke-social-media.mjs`, `browser-herd-report.mjs` |

## Related

- [Lobby painting](lobby-painting.md), [Moderation](moderation.md), [Security and limits](security-and-limits.md)

## History

- 2026-07-20 — Room chat exists from the first commit (`dd449f2`).
- 2026-09-06 — Host can remove messages, leaving a tombstone (`815c7e4`).
- 2026-10-08 — Chat accepted during Herd answer writing; Report button on other players' messages.
- 2026-09-19 — Chat becomes the floating bubble; drawing leaves it for the lobby wall (`78a1382`).
