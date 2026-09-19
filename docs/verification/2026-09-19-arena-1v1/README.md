# Gahook Arena (1v1) — verification record

Scope: `ARENA-1V1-PLAN.md`, derived from `/Vault/Gahookz 1v1 changes.md`.
Branch `overhaul/quiz-herd-p00-p12`, on top of the desktop, hosting and mobile
work already in the tree. `/Vault` was read only. No production, beta or port
3102 process was queried or changed, and `scripts/docker-deploy.sh` was never
run. Every stateful run owns a disposable server on `127.0.0.1:3199`.

Failures are preserved: `browser-1.log` … `browser-6.log`, four of which failed.

Tyson's framing was *"make this little 1v1 feel very responsive and fun"*, and
feel is the acceptance criterion — so every item below was played in a real
browser with **two separate browser contexts**, not just unit tested.

## Progress

| Item | Status | Evidence |
| --- | --- | --- |
| 1 — 0.2s tap animation | **Done** | browser: 200ms, fires within one frame of the press |
| 2 — escalating presses near the win | **Done** | 4 unit tests + browser; server-side |
| 3 — mini Gahook | **Done** | browser: inert, capped, arena stays playable |
| 4 — challenge from the player banner | **Done (was incomplete)** | browser; see below |
| 5 — counter-Gahook → challenge, notifications | **Assessed; already satisfied** | see below |
| 6 — Gahook button renders every character | **Done** | browser: monkey 56×56 inside a 58px window |

Final browser run — [`browser-6.log`](browser-6.log), exit 0:

```json
{
  "ok": true,
  "checked": [
    "item 4: player banners offer \"Challenge to 1v1\"",
    "a duel opened in two separate browser contexts and both players got a tap target",
    "item 6: the Classic Monkey renders at 56x56 inside its 58px button window instead of overflowing it",
    "item 1: a 200ms Gahooked-button animation fires within one frame of the press, inert and aria-hidden",
    "item 3: an opponent press lands as an inert mini Gahook, not a full-screen overlay, and the arena stays playable",
    "item 3: six rapid presses left at most 3 mini Gahooks on screen, not one per press",
    "item 1: the Gahooked button clears itself rather than accumulating",
    "item 2: reaching a four-point lead took 7 presses for 4 points, so the last points cost more than one press each",
    "item 2: at a four-point lead the UI shows 2/3 presses and says \"1 MORE TO WIN!\"",
    "item 2: the closing point cost three presses, 1 of them still owed when the check began, enforced server-side"
  ]
}
```

Registered as `npm run test:browser:arena`.

---

## Item 6 — the monkey was clipped, and it was the default character

This one had an exact cause, and it is worth stating plainly because it
affected **most players**, not an edge case.

`standalone/public/client/arena.css` sized the character inside the Gahook
button like this:

```css
.arena-target > span { width: 58px; height: 58px; overflow: hidden; }
.arena-target .poke-animal, .arena-target .custom-gahook-visual { width: 56px; height: 56px; … }
```

The five animals render as `.poke-animal` and a custom Gahook renders as
`.custom-gahook-visual` — but the **Classic Monkey renders as `.poke-monkey`**,
which that rule never matched. Unconstrained it keeps its global
`width: min(72vw, 320px)`, so the 58px `overflow: hidden` window cropped it to
a meaningless fragment of its middle. The Classic Monkey is the default form,
so the character the most people see was the one the rule missed.

`.poke-monkey` was added to that selector and to its narrow-screen counterpart.
Measured in the browser afterwards: **56×56 inside a 58px window, no overflow.**
All six characters are covered by class now rather than five of them.

## Item 2 — escalating presses

Implemented server-side in `standalone/server/arena.mjs` so it cannot be
bypassed by a client, exactly as the plan requires:

```js
export function pressesRequiredAtLead(lead) {
  if (lead >= ARENA_LEAD_TO_WIN - 1) return 3; // one tug from winning
  if (lead >= ARENA_LEAD_TO_WIN - 2) return 2; // two tugs from winning
  return 1;
}
```

### Partial presses when the opponent scores — the decision, and why

The plan flagged this as one of two places a wrong guess causes real problems,
and asked for the behaviour to be decided and documented.

**Decision: a part-charged point is dropped when the player's lead changes.**

Charge is stamped with the lead it was earned at. If the current lead differs,
it resets before the press is counted — and the opponent scoring clears it
eagerly, so `charge` always means "progress toward the point currently being
paid for" rather than a value that is only correct once re-read.

The alternative — carrying partial presses — is exploitable. A player three
ahead owes two presses. They could bank one, let the opponent score (dropping
them to a lead of two, where a point costs one press), and cash the banked
press immediately: **a point bought at a cheaper rate than the one they played
for.** Resetting cannot be gamed in either direction, and it costs a trailing
player nothing, because presses only ever accumulate while ahead.

Both directions are covered by
`a part-charged point is dropped when the opponent scores, and cannot be banked`
in `standalone/server/arena.test.mjs`.

### A consequence that had to be fixed with it

Target sequence numbers used to be derived from **points**
(`duel.hits[playerId] + targets.length + 1`). Once a press near the win could
fail to score, that would hand out duplicate sequence numbers and the client
would never find its next target — the button would simply stall the moment the
rubber band engaged. Sequences now count **presses**, and `arenaProgress`
publishes `ownPresses` so the client asks for the right one.

### Truthfulness of the copy

The plan asked for the strings to stay honest. `"ONE MORE PULL!"` was a lie at
a lead of four, where the point costs three presses. It now reads
`"3 MORE TO WIN!"` and counts down, backed by a row of pips showing presses
paid. The spectator footer said `"Pull 5 taps ahead to win"` and the score read
`"N taps"` — points and presses are no longer the same thing, so both now say
points.

### Tests

Four unit tests were added and three existing ones updated — the old ones
encoded "every tap scores", which is now deliberately false. Nothing was
weakened to make it pass; the 2,000-seeded-race test still runs, with its
invariants re-expressed in presses rather than points:

```
✔ a five-point lead wins, including a comeback after both pass five
✔ closing out a win costs more presses the closer it gets
✔ a part-charged point is dropped when the opponent scores, and cannot be banked
✔ the remaining presses are published so a non-scoring tap reads as the mechanic, not a bug
✔ 2,000 seeded tap races keep scores, ordered buffers, bounded memory and winners consistent
```

## Item 1 — the tap animation

The pressed button is left where it was and fades out over 200ms while its
replacement is **already live underneath it**, so the animation costs no input
latency. It is fired at press time, not on acknowledgement — waiting for the
server would put a round trip between the finger and the feedback, which is the
lag this is meant to hide.

The browser check asserts the ghost exists **within one animation frame** of the
press (which a round trip could not satisfy), that it is `pointer-events: none`
so it can never eat the next tap, that it is `aria-hidden`, and that it cleans
itself up rather than accumulating over a 45-second match.

Reduced effects and `prefers-reduced-motion` degrade it to a still fade rather
than removing it — taking away the only confirmation that a press registered
would be the opposite of an accessibility improvement.

## Item 3 — mini Gahook

**The volume question the plan flagged was the design decision here.** At four
taps a second each, one poke per press would be sixty extra fan-outs a second in
the one place the game can least afford them.

So no new messages are sent at all. The duel already carries `lastHit`, and the
opponent's mini Gahook is derived from it on the client. The server's broadcast
floor (see the hosting evidence) already coalesces `lastHit` to at most one per
flush, so the volume is bounded before it ever reaches the browser. It is then
throttled again to one card per 150ms and capped at three on screen, because
"bounded" and "readable" are not the same thing. **SSE cost of this feature:
zero.**

For the other two cases — a duel participant being Gahooked, whether by their
opponent or by a bystander in the lobby — `PlayerView` routes an ordinary Gahook
to the mini treatment while the player is in an active duel. The full-screen
jump scare would black out the arena for its whole duration, which in a
45-second match is the difference between losing and not being allowed to play.
Interactive and ceremonial kinds (counter offers, arena challenges, Get Got,
Ultimate, congratulations) are deliberately excluded: those carry a button the
player has to press, or are results rather than interruptions.

Verified in the browser: a press lands on the opponent as a mini Gahook, adds
**no** full-screen overlay, stays inert and aria-hidden, and the opponent still
has a working tap target throughout. Six rapid presses left at most three cards
on screen.

## Item 4 — challenge from the player banner (this was genuinely incomplete)

The plan described this as existing work to reuse. It did exist — **but only in
the host's own lobby view.** `HostLobby` and `HostBuildingLobby` pass
`canChallenge` to `PlayerCard`, which renders "Challenge to 1v1".

Every non-host player sees `ReadonlyPlayerCard` instead, whose banner menu
contained only "Vote kick". So the players who actually play the arena could not
start one from a banner at all. The browser check caught this
([`browser-2.log`](browser-2.log)):

```
AssertionError: a player banner should offer Challenge to 1v1
```

`ReadonlyPlayerCard` now takes `canChallenge`/`onChallenge` and renders the
action, wired in `PlayerWaitingLobby` and `PlayerLobby` — the lobby and
question-building phases, which are the phases the server permits duels in. The
existing `/api/player/duel-challenge` path and its anti-spam guard are reused
untouched, as the plan requires; nothing is gated client-side beyond the
obvious (a connected opponent who is not you, when no duel is already running).

`ReadonlyPartyView` deliberately does **not** get it: that is the spectator/TV
shell.

## Item 5 — counter-Gahook to challenge, and challenge notifications

**Assessed as already satisfied. No change made.** Reasoning, so the judgement
can be checked rather than taken on trust:

- **Counter-Gahook → challenge already works.** A player who is counter
  Gahooked gets a `START GAHOOK ARENA` action on that overlay, driven by the
  `duelChallengeUntil` window at `standalone/server.js` and handled in both
  `HostLobbyPokeEffects` and `PlayerView`. This is the existing mechanism the
  plan said to extend rather than reinvent, and it needed no extension.
- **A challenge is already a notification, and it cannot hijack a round.**
  `challengeGahookDuel` refuses any phase that is not `lobby` or `building`, so
  there is structurally no mid-round to interrupt — the concern the plan raises
  cannot occur. In the lobby the challenge arrives as an overlay carrying the
  `ENTER GAHOOK ARENA` button, which is the action the notification has to
  offer; a quieter toast would be *less* useful, because the player would then
  have to go and find the way in.

If Tyson wants a softer treatment in the lobby specifically, that is a taste
call rather than a defect, and it is a small change to make once he has seen it.
It is written down here rather than guessed at, as the plan asks.

## Preserved failures

| Log | Exit | What happened |
| --- | --- | --- |
| [browser-1.log](browser-1.log) | 1 | Harness read player ids from the join reply, which does not carry them |
| [browser-2.log](browser-2.log) | 1 | **Real defect:** player banners had no "Challenge to 1v1" (item 4) |
| [browser-3.log](browser-3.log) | 0 | Passed items 1, 2, 4, 6 before the item-3 checks existed |
| [browser-4.log](browser-4.log) | 1 | Assertion conflated "no overlay at all" with "the press added no overlay" |
| [browser-5.log](browser-5.log) | 1 | Item-2 arithmetic assumed a clean slate; earlier checks had left partial charge |
| [browser-6.log](browser-6.log) | 0 | Final: all ten checks pass |

Two of these were my own bad assertions rather than product defects, and both
were fixed by making the test read real state instead of assuming it — the
item-2 checks now drive from the server's published `pressesRequired` /
`pressesDone` rather than from a running tally.

## Deferred

- **Human feel.** "Responsive and fun" is ultimately Tyson's call. The
  measurable parts are verified — 200ms, one frame, no added input latency, no
  extra network traffic — but nobody has played it for enjoyment.
- **Touch devices.** The duel was played with synthetic pointer events in
  headless Chromium at desktop size. Real fingers on a real phone are untested.

## Commands

```bash
npm run check                                                     # 186 passed, 0 failed
npm run test:disposable -- npm run standalone:smoke:arena
npm run test:disposable -- node standalone/browser-arena-1v1.mjs  # browser-1..6.log
```
