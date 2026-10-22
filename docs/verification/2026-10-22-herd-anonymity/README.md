# Herd anonymity at the server — P02 steps 1, 2 and 4

Date: 2026-10-22. Branch `agent/herd-anonymity`, worktree
`Projects/gahookz/worktrees/herd-anonymity`, from `main` at `fec0830`.
Requested by Tyson: "go ahead with P02 steps 1, 2 and 4". No deploy, no
container or infrastructure change.

## What the three steps ask for

1. An independent, unbiased displayed-slot permutation for **each** question,
   generated once and kept private, with injectable randomness in tests and no
   exposed seed or assignment map.
2. Writer-assignment indices decoupled from displayed slots and answer ids, so
   voting, self-vote flags, writing, moderation, attribution, timers and
   results all go through stable identities.
4. Deterministic 4-, 5-, 8- and 20-player attack fixtures where a prior reveal
   does not predict the next mapping through the old circular formula, over
   many seeds rather than one; a refresh keeps the same question order.

## What was already true, and what was not

`buildHerdAssignmentPlan` already drew an independent `shuffledSlots(…)` per
question and already sorted each question's assignments by `displayIndex`, and
the engine's seeded tests already covered 4/5/8/20 players. The gap was never
the engine. It was that **nothing proved the server spent that permutation**:
`standalone/server.js` read `ANSWER_META[assignment.displayIndex]` inline, and
every engine test would still have passed had it read `answerIndex`, with the
leak back in production and no failing test anywhere.

So the work was to make the decoupling a named, tested thing, to attack the
real server rather than the engine, and to measure what the attacks are worth
instead of asserting a round number.

## The defect this found

**The shared screen named every writer before the vote.** During
`herd-writing` the host screen — the screen the whole room is looking at, which
the client labels "Party View" — rendered every answer as it arrived with
`Answer by <name>` underneath, from `herdAnswerReview`. Two lines below it, the
same screen said:

> Answers stay anonymous during voting. Their writers are revealed with the
> points.

That was false on screen at every Herd party. The October 21 privacy audit had
checked that *non-hosts* cannot obtain that payload, which is a different
question from whether the host should show it to the room, and P02 step 3's
wording — "no author-labelled draft lists should expose other writers before
reveal" — covers exactly this list.

Fixed by not sending it: `publicHerdAssignments` now omits `answerAuthor` from
the host's review and keeps it only in a writer's own list, where the client
needs it to say which answers are theirs to write. Nothing is lost —
moderation addresses an answer by its prompt and its displayed slot, which is
what `/api/host/remove-content` already takes, and the player wall above the
list already shows who still owes an answer. The screen's promise is now true.

This belongs to step 3, which was marked covered. It is reported here rather
than quietly folded in, because the step's status was wrong and should be read
as wrong.

## Measured before asserting

**The old circular formula, replayed.** It names one of the `n` players for
each displayed slot, so an unbiased seating scores `1/n`. 120 seeds per size:

| Players | Hit rate | Chance (1/n) | Old allocator |
| --- | --- | --- | --- |
| 4 | 0.257 | 0.250 | 1.000 |
| 5 | 0.237 | 0.200 | 1.000 |
| 8 | 0.129 | 0.125 | 1.000 |
| 12 | 0.089 | 0.083 | 1.000 |
| 20 | 0.050 | 0.050 | 1.000 |

The existing test asserted `rate < 0.6`, which half a leak would have passed.
It now asserts `rate < 1/n + 0.08`, roughly twice the largest excess measured.

**A second attack, which needs no notes beyond counting.** Each prompt is
revealed in display order, so after each reveal the room knows how many answers
every player has had shown. The allocator hands each prompt to its
*least-loaded* writers in order, so if the displayed slot followed the writing
rotation, whoever had written least would sit at Red almost every time. Rate of
"the first displayed slot holds a least-loaded writer", counting only prompts
where some writer is strictly behind another:

| Players | Displayed slot | Writing rotation | Chance |
| --- | --- | --- | --- |
| 5 | 0.519 | 1.000 | 0.500 |
| 8 | 0.483 | 0.820 | 0.481 |
| 12 | 0.456 | 0.755 | 0.482 |
| 20 | 0.477 | 0.750 | 0.485 |

The rotation column is asserted too, in the same test: it is what keeps the
displayed-slot assertion from being vacuous, and if it ever stops holding the
test says so instead of quietly passing. With four players there is nothing to
measure, because everybody writes on every prompt and no writer is ever behind
another; that is asserted explicitly rather than skipped in silence.

**The seating is redrawn per prompt, not per game.** Across 2000 seeded games
at 4, 5 and 8 players, the fewest reversed writer pairs in a single game was
two and no game had none — which is why a single game over HTTP is enough to
test it at the server.

## Changes

| File | Change |
| --- | --- |
| `standalone/server/herd-answers.mjs` | New. `buildHerdAnswerSlots` turns a plan's assignments into a question's answers, taking identity from `displayIndex`, sorting into display order rather than trusting the plan's order, and refusing a slot that does not exist, two writers in one slot or one writer twice. `assertHerdDisplaySlots` is a startup check. |
| `standalone/server/herd-answers.test.mjs` | New, 9 tests. A plan where rotation and slots disagree on every writer, so reading `answerIndex` fails loudly. |
| `standalone/server.js` | Calls the new module; asserts the display table seats every writer the cap allows, at startup; stops sending `answerAuthor` in the host's review list. |
| `standalone/public/app.jsx` | The review card says "Writer hidden until the reveal" instead of naming them. |
| `packages/game-engine/test/herd.test.ts` | Legacy-formula bound tightened to `1/n + 0.08`; new workload attack at 5/8/12/20 with its own non-vacuity demonstration; the four-player case recorded as unmeasurable; new per-prompt reseating test at 4/5/8/20. |
| `standalone/smoke-herd-anonymity.mjs` | New, in `standalone:smoke:shared` after `herd-flow`. Plays a real five-player game and attacks it over HTTP. |
| `packages/contracts/src/schemas.ts` | `ownHerdAssignments` and `herdAnswerReview` described rather than tolerated: the own list must name its writer, the host's review must not carry the field at all. Tolerated keys 58 → 56. |
| `packages/contracts/test/contracts.test.ts` | The same rule pinned on hand-built payloads. |
| `packages/contracts/test/fixtures/*` | Re-captured: 35 snapshots, same file set, `herd-writing.host` no longer names writers while `herd-writing.player` still does. |

Nothing in the engine changed. The permutation is still spent into the answer
objects rather than retained as a private map, so there is no seed and no
assignment table for a later payload to leak.

## Non-vacuity: nine mutations, applied one at a time

Each was applied to the real source, run, then restored from a pristine copy
with `cp` and verified by checksum.

| Mutation | Caught by | Not caught by |
| --- | --- | --- |
| Identity read from `answerIndex` | 6 unit tests; `smoke-herd-anonymity` (slots out of order) | — |
| The whole display path follows `answerIndex`, sort included | 4 unit tests | **the server smoke passed** (3→5 of 16, 10→18 of 30) |
| Host review names writers again | `smoke-herd-anonymity`, contract test | — |
| One slot permutation for the whole game | the existing engine test on rotation order | my new reseating test |
| One roster shuffle for the whole game (slot = the writer's roster rank) | the new engine reseating test **and** `smoke-herd-anonymity` | — |
| `displayIndex: answerIndex` in the engine | 3 engine tests, including the workload attack | — |
| Answer order depends on who is looking | `smoke-herd-anonymity` refresh check | — |
| Answer list reshuffled on every call | `smoke-herd-anonymity` slot-order check | — |
| `HERD_MAX_AUTHORED_ANSWERS` raised to 5 | the server refuses to start; unit test | — |

The second row is the honest one. A faithful regression — rotation used for
both the sort and the identity — leaves the colours complete and in order, so
the server suite cannot see it; the leak is statistical over many games and
only the seeded engine fixtures measure it. The two layers are not
interchangeable, and the division of labour is deliberate: the engine fixtures
measure predictability, the server suite proves the server spends the
permutation and keeps identities stable.

The fourth row corrects an assumption worth recording: the new reseating test
does **not** catch one slot permutation per game, because the writer chosen for
each rotation position still varies per prompt. The pre-existing test on
rotation-position order catches that. What the new test catches is one *roster*
shuffle per game — the defect as `IMPLEMENTATION-PLAN.md` words it — where a
writer's slot follows a fixed per-game roster rank and every pair keeps its
order on every prompt.

## Gates

| Command | Result |
| --- | --- |
| `npm run check` | 279 unit tests pass (up from 266), strict typecheck, build `release-70d7efeeafd8d804` |
| `npm test` (full chain) | exit 0, with `Herd anonymity smoke passed: 5 prompts played, writers unnamed until the reveal, 3 of 16 slots named by replaying the old formula, 18 of 30 shared writer pairs reseated` |
| `npm run standalone:smoke:contract-drift` | passed; 76 snapshot fields still all accounted for, corpus matches the server |
| `npm run docs:check` | passed |

All heavy jobs ran under `flock /tmp/gahookz-verify.lock` against the
disposable server on 127.0.0.1:3199. Production, beta and development
containers were not touched.

## Limits

- **Social anonymity is not claimed.** A writer recognises their own wording, a
  table can collude, and two people who wrote near each other can compare
  notes. What is claimed is that the payload and the displayed slot carry no
  information about who wrote an answer.
- The server's randomness is still `Math.random`, deliberately: injecting a
  seed into a live server would be a way to predict a real game. Determinism
  lives in the engine fixtures, where the RNG is a parameter, and the server
  suite asserts only properties that hold for every game.
- The server suite plays one five-player game per run. Its two attack
  assertions are bounded well away from both chance and a leak (fewer than
  three quarters of slots named; at least one reseated pair, against a floor of
  two measured over 2000 seeded games), but they are not a statistical study —
  that is what the engine fixtures are for.
- `smoke-herd-anonymity` proves a refresh returns the same prompt, the same
  round number and the same answers in the same order, and that a player's
  fetch matches the host's. It does not enumerate the whole remaining question
  list, because no snapshot exposes one.
- Step 3 is now *more* covered than its record said and *less* complete than
  its record claimed: the host review is fixed, but whether the shared screen
  should show unvoted answer text at all is a product judgement, not a defect,
  and is left to Tyson.
