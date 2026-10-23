# Gahook extraction: the escalation ladder and the effects policy leave server.js

**Date:** 2026-10-23 · **Branch:** `agent/gahook-extract` from `d821ecd` ·
**Roadmap:** section 3, "Extract the Gahook subsystem from `standalone/server.js`
with characterization tests for Off/Visual/Chaos, claims, counter/Ultimate and
lobby GET GOT. Keep outward behaviour unchanged."

Half of that item: the **rules**. The Arena duel's own lifecycle is still in
`server.js` and is named at the end as what remains.

## Why this was worth doing

The four rules the roadmap names were spread across a 5,671-line file:

- the host's effects policy, as a hand-written `Set` of seven URL paths in the
  request dispatcher;
- the one-Gahook-per-question claim, as a bare object on `room.game` with its
  key format spelled out at four call sites;
- the spam windows, the Ultimate ladder, GET GOT, Ultimate Congratulations and
  the Counter Gahook offer, interleaved through a **157-line `pokePlayer`**
  together with the broadcast, the career counters, the whiteboard wipe and the
  payload the browser receives.

Every one of them is a window measured in milliseconds, and none of them could
be reached by a test without starting a server and sleeping. That is why the
suite had come to assert them by searching `server.js` for the *text* of each
constant — `serverSource.includes("ULTIMATE_GAHOOK_BASE_THRESHOLD_MS = 5000")`
and eight more like it. Those assertions prove where a number is written. They
would pass unchanged if the rule stopped being applied, and they fail on a
rename that changes nothing. Both halves of that showed up here: the extraction
broke six of them while changing no behaviour, and the real defect below was
invisible to all of them.

## Measured first, over HTTP, against `main`

### 1. "Off means no gahooking" was not true of the Arena crowd

`server.js` carried this promise above the gate:

> "Off means no gahooking": every Gahook is refused in every phase (lobby,
> building, writing, the round and the finale, congratulations and boos
> included), whoever sends it. The 1v1 Arena has its own switch.

In a room with `gahookEffects: "off"`:

| Request | Result on `main` |
| --- | --- |
| `/api/player/poke` | refused, "The host has turned Gahook effects off for this game." |
| `/api/player/final-poke` `finalKind: "congrats"` | refused (same message) |
| `/api/player/final-poke` `finalKind: "boo"` | refused (same message) |
| `/api/player/duel-challenge` | **ok** — target's `ownPoke` = `{ kind: "duel-challenge", message: "Enter Gahook Arena" }` |
| `/api/player/duel-react` `congrats` | **ok** — winner's `ownPoke` = `{ kind: "congrats", message: "ARENA CHAMPION" }` |
| `/api/player/duel-react` `boo` | **ok** — loser's `ownPoke` = `{ kind: "boo", message: "GET GOT" }` |

A spectator could land a full-screen **GET GOT** on another player in a room
where the host had turned Gahook effects off, through a route the author of the
gate had simply not listed — the same two kinds, `congrats` and `boo`, that the
finale route refused in the same room on the same tick.

This is the drift class the player-media slice closed the day before: a
hand-written list that has to stay in step with the set of things it protects,
and nothing checking that it does.

### 2. A host Gahook silently spends the victim's Counter Gahook

Nine Gahooks from one player, then one Gahook from a host who has not joined as
a player, then three more from the original sender:

| Gahook | `counterAvailable` |
| --- | --- |
| 1–9 from one player | false |
| host's (no sender id) | — |
| 10, 11, 12 from that same player | **false, false, false** |

Without the host's, the tenth earns a counter. `registerCounterGahookSpam`
treats "no sender" as "clear the streak", because there is nobody to fire back
at — so a host joining the pile-on takes away the thing the victim was earning.
Recorded as behaviour, not changed: see **For Tyson** below.

### 3. The Counter Gahook *button* does not follow the cadence

Sixteen Gahooks from one sender, reading the offer id each time: a **new** offer
is minted at 10, 12, 14 and 16, as documented — but `counterAvailable` is true
at 11, 13 and 15 as well, because the previous offer is still live for its 6.5
seconds. "Every second Gahook after ten" describes when a new chance is minted,
not when the button is there. Correct, and now written down.

### 4. The Ultimate threshold ramp has no ceiling

Each Ultimate a player triggers makes their next one a second harder, and
nothing caps it. Measured in one lobby with `GAHOOKZ_DEBUG_SPAM=1`, at a
120 ms Gahook cadence:

| | Threshold | Outcome |
| --- | --- | --- |
| First Ultimate | 5,000 ms | reached after 5.17 s |
| then | 6,000 ms | |
| then | 7,000 ms | |
| then | 8,000 ms | **20 s of unbroken spam produced no further Ultimate** |

The reason it runs away is that the streak clock is reset by the very events it
produces: `finishUltimateGahook` and `applyGetGot` both call `resetGahookSpam`.
So after a few triggers the player must hold an unbroken streak longer than any
Ultimate or GET GOT will let them. Longest streak observed against the 8,000 ms
threshold: 7,052 ms. The threshold resets only at the start and the end of a
game, never inside one and never in a lobby.

Deliberate as a direction (the comment says the threshold should rise), almost
certainly not deliberate as "the signature escalation stops working". It is a
feel decision, so it is characterized and flagged, not changed.

## What changed

### `standalone/server/gahook-policy.mjs` (new, 138 lines)

The host's four policies, the route table, and the one-per-question claim.

```js
export const GAHOOK_ROUTE_SWITCHES = new Map([
  ["/api/player/poke", "effects"],
  …
  ["/api/player/duel-react", "effects"],   // the crowd's congrats and boos
  ["/api/player/duel-challenge", "arena"]  // the one deliberate exception
]);
```

`gahookRouteRefusal(room, pathname)` replaces both checks in the dispatcher.
Refusing at the route, rather than inside `pokePlayer`, keeps a refused request
free of side effects: `counterPokeFromPlayer` spends the player's one counter
offer before it pokes, and `challengeGahookDuel` creates the duel before it
pokes.

**`duel-react` is now `effects`-governed.** That is the fix for finding 1.
**`duel-challenge` is deliberately not**: a challenge is announced *only*
through that overlay (`publicGahookDuel` publishes nothing until a duel is
active), so gating it would turn the Arena off, which is what the host's
separate Arena switch is for. That reading is the old comment's own last line.

### `standalone/server/gahook-escalation.mjs` (new, 353 lines)

Every window, every counter and the ladder itself, with the clock passed in.
`escalateGahook(player, { now, specialKind, senderPlayer, senderId, liveRound,
scoringAllowed, debug })` returns

```js
{ kind, ultimateStack, ultimateUntil, scorePenalty, pointsStolen, schedule }
```

where `schedule` is `"ultimate"`, `"congrats"` or `null` — the reset timer the
caller must start. The module owns no timers and sends nothing, because a timer
has to close over the room table to broadcast when it fires; that is the same
division `server/host-presence.mjs` uses.

`pokePlayer` is **157 lines → 92**, and now reads as validate → decide → record
→ publish.

### One behaviour alignment, not observable

`clearExpiredUltimateGahook` read `Date.now()` while its caller had already
computed a `now`. It now takes `now`. Not observable: `options.now` is passed
only by `counterPokeFromPlayer`, whose `counter` kind returns from the ladder
before that line is reached, so every path that reaches it had
`now === Date.now()` already. It is the rule `pokePlayer`'s own comment states
— one logical Gahook, one timestamp.

### Tests

| | `main` | here |
| --- | --- | --- |
| Unit tests | 320 | **368** |
| `standalone/server.js` | 5,671 lines | **5,404** |
| `pokePlayer` | 156 lines | **92** |

- **`gahook-escalation.test.mjs`** (32 tests) — the ladder with an injected
  clock: the 5 s threshold and one millisecond short of it, a 1.3 s pause
  breaking a streak, the stack cap collapsing into a GET GOT, the ramp measured
  out to `[5000, 6000, 7000, 8000]` and the fifth at 9,000, the steal in all
  four policies and in the lobby, GET GOT live and in the lobby, the counter
  cadence at 10/12/14/16, a different sender and a sender-less host Gahook
  breaking the streak, eight celebrations from three people versus two, one
  person sustaining it for five seconds, and that a celebration pile-on never
  pushes anybody towards a GET GOT.
- **`gahook-policy.test.mjs`** (16 tests) — the four policies including an
  unknown one falling back to Chaos, which route answers to which switch, and
  the claim ledger: one per question per sender, a new one next question,
  another sender's claim is not yours, a refused Gahook gives it back, and a
  claim spent on somebody who has left reads as unspent.
- **The structural one.** `"every route that can send a Gahook is in the table,
  with a switch named"` walks `server.js`'s own call graph — which functions
  reach `pokePlayer`, and which `pathname ===` branch dispatches to one of them
  — and compares the answer with `GAHOOK_ROUTE_SWITCHES`. It inspects 51 routes
  and finds 9. This is the test that would have caught the defect in finding 1
  the day it was introduced, and it is why the table is not just a tidier
  version of the same hand-written list.
- **`smoke-arena-lifecycle.mjs`** gains the HTTP proof: with effects off an
  ordinary Gahook is refused, the Arena handshake still lands, the duel plays
  to a finish, both crowd reactions are refused — and with effects back on the
  same boo lands, so the refusal is the policy and not a broken route.
- **Six source-text assertions removed**, each replaced by behaviour:

  | Removed from | Asserted | Now proved by |
  | --- | --- | --- |
  | `smoke-gahooks` | `ULTIMATE_GAHOOK_BASE_THRESHOLD_MS = 5000` | unit: 5 s streak, and 4,999 ms is not |
  | `smoke-gahooks` | `ULTIMATE_GAHOOK_GRACE_MS = 1000` | unit: `ultimateUntil` is the trigger + 1,000 |
  | `smoke-gahooks` | the threshold ramp expression | unit: `[5000, 6000, 7000, 8000]` |
  | `smoke-gahooks` | `function applyGetGot` and its one call site | unit: four `applyGetGot` cases, both ladder branches reach `get-got` |
  | `smoke-gahooks` | `COUNTER_GAHOOK_TRIGGER_COUNT = 10`, `REPEAT_EVERY = 2` | unit: earned at exactly 10, 12, 14, 16 |
  | `smoke-finals` | `ULTIMATE_CONGRATS_TRIGGER_COUNT = 8`, `MIN_SENDERS = 3` | unit: three senders trigger, two do not |

  `smoke-security.mjs` gains four **negative** tripwires instead, which is what
  that shape of assertion is good for: there must be no second home for the
  constants, no `EFFECT_GATED_GAHOOK_ROUTES`, and the dispatcher must pass
  through the one gate.

## Non-vacuity

**23 mutations, 23 caught.** Two had to be fixed first, and both were the test's
fault, not the code's:

- **M12 "a streak never breaks"** (idle window 1,200 → 60,000 ms) was **missed**,
  because the test measured the window with the very constant that defines it
  and moved with it. A test like that proves a relationship, not a number. The
  windows a player feels are now asserted as literals, with a comment saying
  why, and the behaviour tests use literal millisecond gaps.
- **M18** could not be applied: `result.schedule = "ultimate"` appears in both
  ladder branches, so the anchor was ambiguous. Split into M18a (an extending
  Ultimate does not push its reset timer back) and M18b (a new Ultimate never
  asks for one); M18a needed a new assertion, since no test had checked the
  extend branch's timer.

**M2 is `main`'s behaviour.** Marking `/api/player/duel-react` as `arena`
instead of `effects` reproduces the defect exactly, and `smoke-arena-lifecycle`
fails on it — so the fix has a behavioural proof, not only a structural one.

Two of the mutations exist because being in the table is not the whole rule.
**M21** moves the gate below the first Gahook route it is supposed to protect:
a route can be listed and still bypass the gate if it is dispatched first, so
the structural test also checks the order. **M22** drops `shame-poke` from the
table; it used to be caught only by the structural test, and
`smoke-room-rules` now refuses it over HTTP along with `counter-poke`, so every
`effects`-governed route in the table has behavioural coverage and not only
structural coverage.

## Gates

Node 24.22.0, everything under `flock /tmp/gahookz-verify.lock`, disposable
server on 127.0.0.1:3199 only.

| Gate | Result |
| --- | --- |
| `npm run check` | typecheck clean, **368/368** unit, build `release-535ce45117f717de` |
| `npm test` (36 scripts) | exit 0 |
| `npm run docs:check` | passed |
| Mutation matrix | 23 applied, 23 caught |

## A gap this slice fell into: nothing typechecks the server

`npm run typecheck` runs three projects. None of them includes a single line of
the server: `tsconfig.server.json` includes `standalone/server/**/*.ts`, and
there are **no `.ts` files in that directory at all**. No `allowJs` anywhere.

So when the extraction left `ULTIMATE_GAHOOK_BASE_THRESHOLD_MS` referenced in
`joinPlayer` and no longer declared, `npm run typecheck` passed. Every single
join then failed at runtime with `ReferenceError`, which the smoke chain caught
immediately — but a typechecker is the cheap place to catch it.

Measured what closing that would cost, with `checkJs` and loose strictness:

| | Files | Errors |
| --- | --- | --- |
| `standalone/server/*.mjs` already clean | **18 of 25** | 0 |
| the remaining 7 modules | `accounts` 12, `career-outbox` 9, `account-room` 8, `social` 5, `admission` 3, `host-presence` 1 | 38 |
| `standalone/server.js` | 1 | 59 |

Both modules added here are among the clean 18. Adding those 18 to a
typechecked project is a config change with no code changes, and it would have
caught this slice's one real mistake. Proposed as its own small slice rather
than smuggled into a refactor commit; in the backlog.

## What is still in `server.js`

The Arena duel: `challengeGahookDuel`, `acceptGahookDuel`, `tapGahookDuel`,
`reactToGahookArena`, the deadline timer and `publicGahookDuel`. Its decisions
are thin — the engine is already `server/arena.mjs` — but every one of them is
bound to a timer that broadcasts, so it is a different shape of extraction from
this one and belongs in its own slice.

## For Tyson

Three questions, all gameplay feel, none of them blocking:

1. **Should the Ultimate ramp have a ceiling?** Measured above: by the fourth
   Ultimate in one lobby, 20 seconds of continuous Gahooks produce none. A cap
   (say 8 s) or a reset between rounds are both one line. Not changed, because
   it changes how the game feels.
2. **Should a host Gahook spend the victim's counter streak?** It does today,
   invisibly. The alternative — count the streak only for Gahooks that have a
   sender, and leave it alone otherwise — is also one line.
3. **With Gahook effects off, should the Arena's challenge overlay still
   appear?** It does, deliberately, because that overlay *is* the invitation and
   the Arena has its own switch. But it is a full-screen interruption with the
   challenger's character on it in a room where the host asked for none. The
   host can turn the Arena off instead, so there is a control either way.
