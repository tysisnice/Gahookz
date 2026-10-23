# Player media across every moderation surface

Branch `agent/player-media`, worktree `Projects/gahookz/worktrees/player-media`,
cut from `main` at `6bfb8fd`. Roadmap section 2, item 2 — the half that was
still open after the 2026-10-21 identity work: *"player media across every
moderation surface."*

No deploy. No `.env`, container, proxy or credential change.

## The shape of the problem

A room copies a player's uploaded picture into a lot of places: their card, the
hidden slot that holds it while custom profiles are off, both custom-Gahook
slots, a Gahook still playing on somebody else's card, the author badge on
every question and Herd answer, a chat message, the ban record, the room-wide
GET GOT banner and the end-of-game summary.

Two walks need that list. The pruner walks it to decide what to **keep**; host
moderation walks it to decide what to **clear**. They were written out
separately — the pruner in `server/media.mjs`, the clear lists inline in three
handlers in `server.js` — and nothing held them to each other. They had drifted
in both directions.

## Measured first, over HTTP, on a real room

Each of these was reproduced against a disposable server before anything was
changed.

**Kicking somebody over their picture broadcast the picture.** The ban record
kept `avatarImageDataUrl`, the pruner explicitly retained it, and
`bannedPlayers` is in *every* snapshot — host, other players and an
unauthenticated guest all received the URL, and the host screen, which is the
screen the whole room is watching, printed it in a Banned Players panel that
stays. The bytes went on being served. What the kicked player had drawn on the
shared whiteboard stayed on it, too: `kickPlayer` removed their chat but never
their strokes.

```
banned entry on the host screen: {"name":"Villain","avatarImageDataUrl":"/media/MDKY/b9c0ad64…"}
  the picture is still served: 200
who receives it:  host ✓   another player ✓   a guest / shared screen ✓
whiteboard strokes left by the kicked player: 1 of 1
```

**"Randomize name & pfp" left both.** The button is the host's direct answer to
an unacceptable name or picture. It cleared the visible avatar and rewrote the
author badge on three question collections — and missed the saved question
bank, every Herd answer, the chat message sitting under the old name and
picture, the results screen, and the hidden copy. It never pruned, so the bytes
stayed served.

```
media references in the host snapshot AFTER: 1
  chatMessages[0].senderAvatarImageDataUrl = /media/MNHL/b9e69440…  served=200
their name on those messages: ["Villain"]
```

**A settings toggle undid the moderation outright.** Switching custom profiles
off parks the picture in `hiddenAvatarImageDataUrl` rather than deleting it, so
that turning the setting back on restores it. Randomizing in between cleared
the *visible* field, which was already empty:

```
host switched custom profiles OFF; visible avatar = ""
host pressed "Randomize name & pfp"; visible avatar = ""
host switched custom profiles back ON; visible avatar = "/media/MZYE/5b16f64c…"   served = 200
```

**A replaced picture was never collected.** `updatePlayerProfile` had no prune
at all. One player changing their picture twelve times left **all twelve**
stored and served; only the last was on anybody's screen. So a host who asks
somebody to change an unacceptable picture does not thereby remove it, and a
room fills its media budget with pictures nobody is looking at.

**And the drift ran the other way too.** The end-of-game summary and the
room-wide GET GOT banner both carry a picture into the snapshot and neither was
in the pruner's retain list, so the room could be displaying bytes the pruner
was free to delete.

**The contrast that makes these defects rather than choices:** the dedicated
control, `remove-content kind=player-media`, already did the whole job —
cleared every surface it knew about, pruned the bytes to a 404 and cleared the
whiteboard. Three sibling controls simply did not.

## Changes

`standalone/server/player-media.mjs` (new) enumerates the surfaces once. Each
site declares its owner, what sort of copy it holds — `avatar`, `upload` or
`drawing` — how to read the media it currently references, how to clear it, and
how to rewrite the identity printed beside it. `retainedPlayerMedia` is the
read walk; `clearPlayerMedia` and `renamePlayerEverywhere` are the write walks.

- `pruneRoomMedia` now takes its retain list from that enumeration instead of
  keeping a second copy, which closes the summary and banner gaps by
  construction.
- `kickPlayer` clears the removed player's media everywhere, whiteboard
  included. The ban record keeps a name and a built-in avatar so the host can
  still see who to unban.
- `randomizePlayerIdentity` clears the `avatar` kind — including the hidden
  copy — renames every surface that prints an identity, and prunes. It
  deliberately leaves their question, their Herd answer and their drawing
  alone: this control changes who someone appears to be, and *Remove player
  media* is the one that takes content away.
- `updatePlayerProfile` prunes.
- `removeContent kind=player-media` delegates to the same walk, so it keeps its
  behaviour and can no longer drift from its siblings.
- The client's optimistic kick no longer spreads the live player into the
  banned row, which put the picture back on the host's screen for the moment
  before the next snapshot.
- `bannedPlayers` moves from tolerated to **described** in the contract (58
  tolerated keys → 57), with `avatarImageDataUrl` pinned to `""`.

### Decisions worth knowing

**One owner per rule.** The ban record is built from the player exactly like
every other copy, and the clear walk strips it. Blanking the field at
construction *as well* was tried first and is what made mutation M9 pass: with
two places enforcing it, either could be deleted while the other quietly held
the line. That is the same failure the snapshot adapter hit on 2026-10-23, and
it is recorded here for the same reason — a redundant rule is not a defended
one.

**A Gahook belongs to whoever sent it.** The copy sitting in a victim's
`latestPoke` answers to the sender's moderation, not the victim's. Clearing
only a sender's own slots left their picture playing on the card of the player
they aimed it at.

**Removing a player's media does not rename them.** Moderating media and
replacing an identity are different controls and stay different.

## Non-vacuity

**Thirteen mutations**, each applied to real source, run against the suite that
protects it, and restored by checksum. **13 of 13 caught.** M9 missed on the
first pass — the ban record's emptiness had two owners — and was fixed by
giving the rule one owner rather than by adjusting the test.

| | rule broken | caught by |
| --- | --- | --- |
| M1 | the hidden copy is left behind | unit |
| M2 | the results screen stops being a surface | unit |
| M3 | a room-wide Gahook's target picture stops being a surface | unit |
| M4 | every control removes everything | unit |
| M5 | renaming reaches only their own card | unit |
| M6 | clearing drawings does not bump the whiteboard revision | unit |
| M7 | a poke belongs to who received it, not who sent it | unit |
| M8 | uploads are not retained by the pruner | unit |
| M9 | nothing strips the picture from the ban record | smoke |
| M10 | a replaced picture is never collected | smoke |
| M11 | randomize renames but leaves the picture | smoke |
| M12 | a chat message keeps the old name | smoke |
| M13 | a kicked player's media is left in the room | smoke |

**Both new suites were run against `main`.** `smoke-player-media.mjs` was split
into its five blocks and each was run against `main`'s server: four fail with
the measured defect, and the fifth — the dedicated media control — passes,
because that one control was already right.

```
randomize                      Error: Randomizing a player left their picture behind at: chatMessages[0]…
the hidden copy                Error: A picture parked by switching custom profiles off came back…
kick                           Error: Kicking somebody over their picture sent that picture to the host screen…
a replaced picture is not kept Error: A picture the player replaced is still stored and served…
the dedicated media control    BLOCK PASSED (no defect found)
```

`browser-player-media.mjs` against `main`'s client fails with
*"the picture the host kicked somebody for was printed back into the Banned
Players panel: /media/QXDQ/7022abdc…"*. Its own anti-vacuity guards are in the
suite: it asserts the host screen really is showing both uploaded pictures
before asserting none are left, and it asserts the Banned Players panel
actually appeared before concluding that no picture is in it. The second guard
was added after the first run passed for the wrong reason — the kick had not
fired, so the panel did not exist and the picture check matched nothing.

## Gates

Verified on Node 24.22.0, every heavy job under `flock /tmp/gahookz-verify.lock`,
all servers disposable on 127.0.0.1:3199.

- `npm run check` — 320/320 unit tests (up from 308), strict TypeScript, build
  `release-535ce45117f717de`
- `npm test` — the full shared chain, exit 0, 36 scripts, including the new
  `standalone:smoke:player-media`
- `npm run test:browser:player-media` — 7 checks
- `npm run test:browser` — 18 checks
- `npm run docs:check`

## Limits

- **Nothing was deployed.** Production is still `74a489949e02`.
- **Media is removed from the room, not from a device that already fetched it.**
  `/media/` assets are served with a long immutable cache lifetime, so a player
  who already loaded a picture keeps their copy. Moderation stops the room
  serving it and stops it being shown; it cannot reach into a browser cache.
- **No rate limit was added to profile uploads.** The churn finding is fixed by
  collecting replaced pictures, which bounds what a room *stores*; it does not
  bound how often a player may upload. Nothing observed needed it, and a limit
  on a guest action is a product decision.
- **The banned list still goes to every client**, including an unauthenticated
  guest. It no longer carries media, which is what this slice is about, but a
  guest learning who was removed is a payload question for the privacy contract
  rather than a media one.
- **`remove-content kind=player-media` keeps its existing reach over chat**:
  messages are removed, not merely stripped of a picture. That is unchanged
  behaviour, restated here because the walk now makes it explicit.
