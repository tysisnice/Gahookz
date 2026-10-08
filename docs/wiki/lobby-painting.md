# Lobby painting

> A Draw button that lets you scribble over the lobby's player wall while you wait.

**Area:** [social](../areas/social.md) · **Status:** live · **Last reviewed:** 2026-10-07

## What it is

In the lobby, a **Draw** button sits by the player wall. Press it (it becomes **Done**), then drag a finger or the mouse across the wall to leave a translucent line. Everyone in the room sees it. There is deliberately one tool: your lines come out in your own profile colour, at one brush size and one see-through opacity. Tapping anywhere off the wall also finishes drawing. **Erase mine** appears once you have drawn something and removes only your own lines.

A painted line also disappears when that player gets [Gahooked](gahooks.md), so a Gahook wipes the target's scribbles and nobody else's.

## Rules and numbers

- Available while the room is waiting: the lobby, question-writing and Herd answer writing (the server accepted Herd writing from 2026-10-08, matching the browser). Every other limit is unchanged. A drawing is reported with "Report a problem" in the player menu ([Moderation](moderation.md)).
- Brush width 7, opacity 0.6; the wall uses the player's profile colour. The server accepts three sizes (3, 7, 14), a brush or eraser, and any `#rrggbb` colour, but this screen only sends the one brush.
- A stroke has 1 to 128 points, all inside the wall. At most **60 strokes per 10 seconds** per player. The room keeps the latest **160** strokes, newest last.
- "Erase mine" can be used once every 2 seconds.
- Strokes belong to the player who drew them and last only as long as the room does.
- Painting shares its transport with the old chat whiteboard (`/api/room/whiteboard/...`); chat no longer draws ([Room chat](room-chat.md)).
- Painting never changes a score and needs no account.

## Where it lives

| Part | Code |
| --- | --- |
| Server | `standalone/server/social.mjs` — `addWhiteboardStroke`, `clearWhiteboard`, `clearWhiteboardForPlayer`; `standalone/server.js` — `postRoomWhiteboardStroke`, `clearRoomWhiteboard`, `pokePlayer` |
| Browser | `standalone/public/client/social.jsx` — `LobbyPaintLayer`, `LOBBY_PAINT_OPACITY`, `LOBBY_PAINT_BRUSH`; `app.jsx` — `LobbyPaintSurface` |
| Tests | `standalone/smoke-social-creation.mjs` |

## Related

- [Lobby](lobby.md), [Room chat](room-chat.md), [Gahooks](gahooks.md)

## History

- 2026-07-20 — A whiteboard sits inside the chat from the first commit (`dd449f2`).
- 2026-09-19 — Drawing moves from the chat onto the lobby player wall (`78a1382`, [changelog](../CHANGELOG.md)).
- 2026-09-25 — Tapping off the wall finishes drawing, like **Done** ([changelog](../CHANGELOG.md)).
