# Moderation

> The host can kick, ban and clean up content in their room, players can vote to kick, and the server enforces all of it.

**Area:** [Systems](../areas/systems.md) · **Status:** live (reports and content removal have no browser button) · **Last reviewed:** 2026-10-04

## What it is

Rooms are private and short-lived, so moderation is done by the host in the
room, not by an administrator. There is no account to suspend.

**Kick.** From the player list the host can kick a player. They are removed,
banned from that room, and everything they added (questions, answers, chat,
pictures) is deleted. A kicked player sees "You're banned" if they try to
return. The host can unban from the banned players panel in the lobby.

**Vote kick.** Any connected player can vote to kick another player (not
themselves, not the host). When a majority of the other connected players have
voted, the player is kicked exactly as above.

**Reports and content removal.** The server can accept a report on any piece of
content and let the host resolve it or remove the content (chat, a Herd answer,
a profile picture, a custom Gahook, a whiteboard stroke or a question). As of
this review nothing in the browser calls these routes (searched in
`standalone/public`), so they work through the API and tests only. The
[legal page](information-and-legal-pages.md) tells players to "use the report
button in the room", which is not true yet.

## Rules and numbers

- A kick bans the device key, not the network address. Clearing browser storage
  gives a new key.
- The host cannot be kicked or vote-kicked until the role is handed over.
- Vote-kick threshold: half of the other connected players, rounded down, plus one.
- Reports: 5 per minute per reporter, reasons offensive, harassment, spam or
  other, a 200-character note, the last 40 kept.
- Bans last only as long as the room.
- Removing a Herd answer blanks its text and keeps its slot, so the vote still works.
- Deleted pictures and audio are pruned from the room's media store.
- Every `/api/host/...` route is checked on the server for the host key.

## Where it lives

| Part | Code |
| --- | --- |
| Kick, unban, vote kick, remove content | `standalone/server.js` — `kickPlayer`, `voteKickFromPlayer`, `removeContent` |
| Reports | `standalone/server/social.mjs` — `addReport`, `resolveReport` |
| Ban list and credentials | `standalone/server/auth.mjs` |
| Pruning removed media | `standalone/server/media.mjs`, `content-inventory.mjs` |
| Host-only routes | `standalone/server/route-policy.mjs` |
| Browser buttons | `standalone/public/app.jsx` — `PlayerCard` (Kick), `ReadonlyPlayerCard` (Vote kick), `BannedPlayersPanel` (Unban) |
| Tests | `standalone/smoke-roles.mjs`, `smoke-room-rules.mjs`, `smoke-review-repairs.mjs` |

## Related

- [Host and roles](host-and-roles.md)
- [Security and limits](security-and-limits.md)
- [Room chat](room-chat.md)

## History

- 2026-07-20 — Kick, ban and vote kick in the first commit.
- 2026-09-06 — Reports, report resolution and content removal added with the legal pages.
- 2026-10-04 — Page written; missing report button noted.
