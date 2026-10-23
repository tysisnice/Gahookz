# Moderation

> The host can kick, ban and clean up content in their room, players can vote to kick, and the server enforces all of it.

**Area:** [Systems](../areas/systems.md) · **Status:** live · **Last reviewed:** 2026-10-23

## What it is

Rooms are private and short-lived, so moderation is done by the host in the
room, not by an administrator. There is no account to suspend.

**Kick.** From the player list the host can kick a player. They are removed,
banned from that room, and everything they added (questions, answers, chat,
pictures, whiteboard marks) is deleted. A kicked player sees "You're banned" if
they try to return. The host can unban from the banned players panel in the
lobby; that panel shows their name and one of the built-in avatars, never the
picture they uploaded, because the panel stays on the shared screen and the
picture is often the reason they were removed.

**Randomize name & pfp.** Beside Kick in the same menu, for when the person is
welcome but what they are called or wearing is not. It gives them a safe name
and a built-in avatar, removes their uploaded picture everywhere the room had
copied it, and rewrites the old name wherever it was printed — their chat
messages, the author badge on their questions and Herd answers, and the results
screen. It leaves their content alone: the question they wrote, the answers
they gave and anything they drew all stay. Use **Remove player media** for
those.

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
appears when a new one arrives), can dismiss one, and can remove the thing that
was reported from the same list: "Remove message" for chat, "Remove answer" for
a Herd answer, "Remove question" for a question. A removal that worked also
dismisses the report; one that could only go part of the way leaves it open
(see below). Reports never reveal the reporter to other players.

**Content removal.** The server lets the host remove content: chat, a Herd
answer, a question, or a player's media (profile picture, custom Gahook,
whiteboard strokes and the pictures on their answers). The reports list reaches
chat, answers and questions. A player's media has no button of its own, because
nothing in the game reports a player — a host dealing with somebody rather than
with one thing they posted kicks them, which clears the same media.

A question already chosen for the round is the one case that cannot be fully
undone: it comes out of the question list, so it can never be chosen again, but
it stays in the round the players are in, because the phase machine counts that
list and dropping an entry mid-game would skip or repeat a round. The host is
told so and asked to Skip past it, and the report stays open as the reminder.

## Rules and numbers

- A kick bans the device key, not the address, and lasts as long as the room.
  Clearing browser storage gives a new key.
- The host cannot be kicked or vote-kicked until the role is handed over.
- Vote-kick threshold: half of the other connected players, rounded down, plus one.
- Reports: 5 per minute per reporter, reasons offensive, harassment, spam or
  other, a 200-character note, the last 40 kept. Subjects: chat, answer,
  question, drawing, player or room.
- Removing a Herd answer blanks its text and its picture and keeps its slot. Kicking a player or removing their media also clears the pictures on their Herd answers.
- Where a room keeps a picture is listed once, in `server/player-media.mjs`, and
  walked twice: the pruner decides what to keep and moderation decides what to
  clear. Before 2026-10-23 those were two separate lists and they had drifted
  ([record](../verification/2026-10-23-player-media/README.md)).
- Switching custom profile pictures off parks an upload rather than deleting
  it, so that switching the setting back on restores it. Moderation clears the
  parked copy too, or the host's action would be undone by a later toggle.
- A picture a player replaces is collected. A Gahook still playing on somebody
  else's card belongs to whoever sent it and goes when *they* are moderated.
- Moderation stops the room serving a picture; it cannot reach a copy a phone
  has already downloaded.
- An answer is named by its prompt as well as its own id, because answer ids are colour names every prompt reuses; a request without the prompt is refused rather than blanking that colour everywhere.
- Every `/api/host/...` route is checked on the server for the host key.

## Where it lives

| Part | Code |
| --- | --- |
| Kick, unban, vote kick, remove content, randomize | `standalone/server.js` — `kickPlayer`, `voteKickFromPlayer`, `removeContent`, `randomizePlayerIdentity` |
| Where a room keeps a player's media and identity | `standalone/server/player-media.mjs` — `playerMediaSites`, `retainedPlayerMedia`, `clearPlayerMedia`, `renamePlayerEverywhere` |
| Reports | `standalone/server/social.mjs` — `addReport`, `resolveReport` |
| Ban list and credentials | `standalone/server/auth.mjs` |
| Pruning removed media | `standalone/server/media.mjs`, `content-inventory.mjs` |
| Host-only routes | `standalone/server/route-policy.mjs` |
| Browser buttons | `standalone/public/app.jsx` — `PlayerCard` (Kick), `ReadonlyPlayerCard` (Vote kick), `BannedPlayersPanel` (Unban), `ReportProvider` (report dialog, host list, menu items); `client/report.jsx` — `ReportButton`, `ReportDialog`, `HostReportsDialog` |
| What the host may remove, and how a subject is named | `standalone/public/client/report-subjects.js` — `canRemoveSubject`, `removalRequestFor` (unit-tested beside it) |
| Tests | `standalone/smoke-roles.mjs`, `smoke-room-rules.mjs`, `smoke-review-repairs.mjs`, `smoke-social-media.mjs` (reports), `smoke-player-media.mjs` (media on every moderation surface), `server/player-media.test.mjs`, `browser-herd-report.mjs` (report flow, screenshots), `browser-player-media.mjs` (the host screen while moderating) |

## Related

- [Host and roles](host-and-roles.md)
- [Security and limits](security-and-limits.md)
- [Room chat](room-chat.md)

## History

- 2026-07-20 — Kick, ban and vote kick in the first commit.
- 2026-09-06 — Reports, report resolution and content removal added with the legal pages.
- 2026-10-04 — Page written; missing report button noted.
- 2026-10-08 — Report buttons, "Report a problem" and the host Reports list added; the legal page wording matches.
- 2026-10-19 — The host can remove a reported answer or question from the list,
  not just chat; an in-play question says what is left to do instead of
  reporting a success nothing could see
  ([record](../verification/2026-10-19-small-fixes/README.md)).
