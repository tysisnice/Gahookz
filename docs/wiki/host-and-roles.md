# Host and roles

> The host runs the room from the party screen, can also play as a player, can hand the role to someone else, and is replaced automatically if they vanish.

**Area:** [Systems](../areas/systems.md) · **Status:** live · **Last reviewed:** 2026-10-04

## What it is

A room has one **host** and up to 20 **players**. The host is simply the
browser that created the room: its private device key is stored as the room's
host key, so there is no separate host login. Hosting never needs an account.

The host sees the **party screen** (labelled "Party View" in the top bar), made
to be shown on a big screen: share band with code and QR, player wall,
leaderboards and the host's pause, skip and moderation controls. The host does
not have to play. A host who wants to can tap **Enter as player** to take a
seat, and **exit** it again while the room is in the lobby or while questions
are being written. Players have a read-only party screen in their quick menu.

**Host transfer.** From the player list the host can choose **Make host** for
any connected player. The old host keeps their player seat (if they had one) and
sees a notice that they are no longer the host. Everyone sees "<name> is now
the host" for 10 seconds.

**Host away.** If the host's connection drops while players remain, players see
a countdown ("waiting for them to come back"). If the host returns in time,
nothing changes. If not, the role passes to the earliest-joined player who is
connected and not banned. A replaced host who comes back sees "You were away, so
<name> is now the host". If nobody is connected when the clock runs out, the
next person to connect is promoted at once.

## Rules and numbers

- Host-away countdown: 60 seconds (`GAHOOKZ_ROOM_ABANDON_GRACE_MS`, clamp 0.25 s to 10 min).
- The away banner appears after 2.5 seconds so a refresh does not flash it.
- "Now the host" notice: 10 seconds (`HOST_CHANGE_NOTICE_MS`).
- The host cannot be kicked until the role is handed over.
- Game timers keep running while the host is away. A paused game stays paused
  until a host resumes it.
- Every `/api/host/...` route is host-only by default (`route-policy.mjs`).
- `assignHost` is the only code that moves the role.

## Where it lives

| Part | Code |
| --- | --- |
| Host transfer, `assignHost`, `exitHostAsPlayer`, away clock timers | `standalone/server.js` |
| Promotion rules, notice windows | `standalone/server/host-presence.mjs` |
| Host-only route list | `standalone/server/route-policy.mjs` |
| Snapshot fields `hostPresence`, `hostChange`, `ownHostReplaced` | `packages/contracts/src/schemas.ts` |
| Notices | `standalone/public/client/host-presence.jsx` — `HostPresenceNotices` |
| Party screen, "Enter as player", read-only party view | `standalone/public/app.jsx` — `ReadonlyPartyView` |
| Tests | `standalone/smoke-roles.mjs`, `smoke-host-controls.mjs`, `smoke-room-expiry.mjs`, `standalone/server/host-presence.test.mjs` |

## Related

- [Rooms and room codes](rooms-and-codes.md)
- [Moderation](moderation.md)
- [Lobby](lobby.md)

## History

- 2026-07-20 — Host, players, host transfer and exit-as-player in the first commit.
- 2026-09-12 — Host-only routes become a checked table (`route-policy.mjs`).
- 2026-09-26 — Host-away countdown, automatic promotion and the browser notices ([record](../verification/2026-09-25-update/systems.md)).
- 2026-10-04 — Page written from the code.
