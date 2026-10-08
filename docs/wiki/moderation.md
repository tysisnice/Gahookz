# Moderation

> The host can kick, ban and clean up content in their room, players can vote to kick, and the server enforces all of it.

**Area:** [Systems](../areas/systems.md) · **Status:** live · **Last reviewed:** 2026-10-08

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

**Reports.** Any player who has joined a room, a guest included (no account),
can report. There is a small "Report" control beside another player's chat
message, beside the author of a question (on the question screen and on a Herd
answer card), and beside a revealed Herd answer (not on the voting tiles, which
are tap targets), and "Report a problem" in the player menu reports the room
(which also covers drawings). Each opens a confirm dialog with a reason and an
optional note; nothing is sent until "Send report". The host sees open reports
under "Reports" in the host menu (a count shows on the item and a short notice
appears when a new one arrives), can dismiss one, and for a chat report can
remove the message from the same list. Reports never reveal the reporter to
other players.

**Content removal.** The server also lets the host remove content (chat, a Herd
answer, a profile picture, a custom Gahook, a whiteboard stroke or a question).
In the browser only "Remove message" in the reports list calls this; the other
kinds still work through the API and tests only.

## Rules and numbers

- A kick bans the device key, not the address, and lasts as long as the room.
  Clearing browser storage gives a new key.
- The host cannot be kicked or vote-kicked until the role is handed over.
- Vote-kick threshold: half of the other connected players, rounded down, plus one.
- Reports: 5 per minute per reporter, reasons offensive, harassment, spam or
  other, a 200-character note, the last 40 kept. Subjects: chat, answer,
  question, drawing, player or room.
- Removing a Herd answer blanks its text and its picture and keeps its slot. Kicking a player or removing their media also clears the pictures on their Herd answers.
- Every `/api/host/...` route is checked on the server for the host key.

## Where it lives

| Part | Code |
| --- | --- |
| Kick, unban, vote kick, remove content | `standalone/server.js` — `kickPlayer`, `voteKickFromPlayer`, `removeContent` |
| Reports | `standalone/server/social.mjs` — `addReport`, `resolveReport` |
| Ban list and credentials | `standalone/server/auth.mjs` |
| Pruning removed media | `standalone/server/media.mjs`, `content-inventory.mjs` |
| Host-only routes | `standalone/server/route-policy.mjs` |
| Browser buttons | `standalone/public/app.jsx` — `PlayerCard` (Kick), `ReadonlyPlayerCard` (Vote kick), `BannedPlayersPanel` (Unban), `ReportProvider` (report dialog, host list, menu items); `client/report.jsx` — `ReportButton`, `ReportDialog`, `HostReportsDialog` |
| Tests | `standalone/smoke-roles.mjs`, `smoke-room-rules.mjs`, `smoke-review-repairs.mjs`, `smoke-social-media.mjs` (reports), `browser-herd-report.mjs` (report flow, screenshots) |

## Related

- [Host and roles](host-and-roles.md)
- [Security and limits](security-and-limits.md)
- [Room chat](room-chat.md)

## History

- 2026-07-20 — Kick, ban and vote kick in the first commit.
- 2026-09-06 — Reports, report resolution and content removal added with the legal pages.
- 2026-10-04 — Page written; missing report button noted.
- 2026-10-08 — Report buttons, "Report a problem" and the host Reports list added; the legal page wording matches.
