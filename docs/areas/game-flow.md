# Game flow — area guide

Last verified against the code: 2026-10-04, commit 56497b9

## Purpose

Game flow owns the rules of the game: the phase machine that moves a room from
lobby to finale, the three ways to play (Quiz · Classic, Quiz · Majority Rulez
and Herd), the host's settings and their validation, which questions are played,
the timers and progress waits, pause and skip, scoring, and the data behind the
reveal and the finale.

The server is the only authority on phase, time and points. Browsers draw what
the snapshot says and send commands; they never decide what happens next. Every
room lives inside one Node process, so none of this survives a restart (see
[systems.md](systems.md)). Guests play all of it without an account: accounts
receive finished results afterwards and are never part of starting or playing.

## What players see

- **Lobby.** The host picks Quiz · Classic, Quiz · Majority Rulez or Herd, and
  a game length (Quick, Standard, Custom; Herd: Quick, Full room, Custom), then
  locks the rules. The lobby shows the planned number of questions and a rough
  duration. Players join with a code, no sign-in.
- **Building.** Each player writes their share of questions (Herd: one prompt
  each). The host cannot start until everyone has submitted and is ready, or
  uses force-start or Skip, which fills the gaps from the catalogue. The refusals
  a host can see include "Lock in the game options first.", "Add at least one
  question first.", "Approve or reject pending questions first." and "Every
  connected player needs their questions submitted and ready status."
- **Herd answer writing.** Each player is handed a few prompts from other
  players to answer. "Every assigned Herd answer needs to be written first." and
  "Every Herd answer writer needs to mark ready." explain why Start is refused.
- **A question.** Five seconds to read, with the four coloured answer slots
  shown but the text blank. Fourteen seconds to answer; picking locks the
  answer ("Answer already locked."), and the earlier the pick the more it is
  worth. In Herd a player cannot pick their own answer ("You wrote that answer.
  Pick someone else's.").
- **Reveal.** Twelve seconds: the correct or winning answer, the points each
  player earned, who wrote each Herd answer, the Majority author's prediction
  and a Good or Nah vote on the question. Voting is closed until then ("Voting
  opens after answers are revealed."). When everyone has voted, the next
  question starts early.
- **Host controls.** Pause and Skip. Pause shows a frozen countdown for
  everyone and holds it until a host resumes. Pausing outside a question is
  refused with a reason, as is skipping a finished game.
- **Finale.** The leaderboard, with shared ranks for ties, the winner or winners
  and the lowest score. When everyone ties it is a shared win with no loser.

The screens themselves belong to the three UI areas; this guide covers the
rules and data behind them.

## Code map

Owner: game-flow. Line numbers are at commit `56497b9`; function names are the
reliable handle, so grep for them.

### Server modules — `standalone/server/`

| File | What it holds |
| --- | --- |
| `gameplay.mjs` | `phaseProgressKey`, `allActivePlayersAnswered`, `allActivePlayersProgressReady`: the "has everyone finished this step" checks that end a phase early. |
| `scoring.mjs` | `quizPoints` (speed-scaled points), leaderboard sorting and ranking with ties, `scorePlacements` (podium and equal-rank handling), `gameEligiblePlayers`. |
| `majority.mjs` | `buildMajorityResults` and `MAJORITY_AUTHOR_BONUS`: groups the votes of a Majority Rulez round into a winner, tied winners and author credit. |
| `phase-controls.mjs` | `PAUSABLE_PHASES`, `SKIPPABLE_PHASES`, `skipDecision`, `pauseDecision`: which phases the host may pause or skip, and what a skip means in each. |
| `presentation.mjs` | `presentPlayer`: the public shape of a player in a snapshot. Social fields (pokes, Gahooks, Dash) ride along here, but the score and name come from game-flow. |

### Engine and contracts — `packages/`

| File | What it holds |
| --- | --- |
| `game-engine/src/phases.ts` | `PHASE_DURATIONS_MS`, `nextPhase`, `remainingMs`, `resumeDeadline`, `plannedRounds`, `estimatedDurationMs`. Pure phase maths. |
| `game-engine/src/herd.ts` | Herd answer limits, `buildHerdAssignmentPlan` (who writes which answers) and `buildHerdRoundResults` (grouping, points, tie-breaks). |
| `contracts/src/settings.ts` | `GameSettings` (`gameFamily`, `quizScoring`), validation and the legacy `GameMode` mapping (`toLegacyGameMode`, `fromLegacyGameMode`, `normaliseGameSettings`, `scoringLabel`). |
| `contracts/src/host-settings.ts` | The host-settings request and response schemas, prompt styles, Gahook effect policies, `LockedGameRules` (declared but not yet used by any code), and the question readiness checks (`isClassicReady`, `questionReadinessProblem`). |
| `contracts/src/game.ts` | `GAME_MODES`, `GAME_PHASES`, `ROUND_PRESETS` and the schema versions. |

### `standalone/server.js` functions

| Function | Line | Role |
| --- | --- | --- |
| `updateHostSettings` | 2496 | Validates and applies the host's mode, scoring, length and rule choices while the room is in `lobby`. |
| `lockSetup` | 2703 | Moves `lobby` to `building` and freezes the rules (`room.lockedRules`) the game will be scored and explained by. |
| `submitAnswer` | 3022 | Records one player's pick during `answering`. Quiz scores it on the spot; Majority and Herd store it unscored until the reveal. Ends the phase early when every connected player has answered. |
| `scoreMajorityRound` | 3097 | Turns a round's votes into points, through `buildMajorityResults`. |
| `scoreHerdRound` | 3136 | Turns a Herd round's selections into points, through `buildHerdRoundResults`. |
| `voteQuestion` | 3181 | Records a player's Good or Nah rating of the question just played, during `reveal` only. When everyone connected has voted, the next question starts. |
| `getStartCheck` | 4106 | Answers "may this game start, and if not, why" for the host's Start button, for both `building` and `herd-writing`. |
| `startGame` | 4365 | Starts play from `building` or `herd-writing`: selects the questions (unless Herd already prepared them), zeroes scores, begins question 1. |
| `beginQuestion` | 4486 | Enters `reading` for a question index and arms the phase timer. |
| `beginAnswering` | 4518 | Enters `answering` and arms the answering timer. |
| `transitionToReveal` | 4534 | Closes `answering`, scores a Majority or Herd round, enters `reveal`. |
| `setGamePaused` | 4659 | Pauses or resumes the running phase timer (host only). |
| `skipPhase` | 4712 | Advances the current phase at once, following `skipDecision`. |
| `resetLobby` | 4738 | Returns the room to `lobby` (or `building` for a new game that keeps unplayed questions), zeroing scores and parking the questions that were written. |

Nearby, not in the brief's list but part of the same machine: `finishGameNow`,
`forceStartGame`, `beginHerdAnswerWriting`, `selectQuestionsForGame`,
`waitForProgressThen`, `acknowledgeProgress` and `recordCareerResults` (hands
the result to the accounts area). `server.js` is 5,604 lines at this commit. Prefer extracting new pure logic into
`packages/game-engine` or a `server/*.mjs` module with unit tests, and keep
`server.js` to orchestration.

## How it works

The server is the only authority on phase, time and points. A room is in
exactly one of seven phases (`GAME_PHASES` in `packages/contracts/src/game.ts`),
and `room.phase` plus `room.phaseEndsAt` is all a client needs to draw it.

### Phases

```text
lobby ──lockSetup──> building ──start──> reading ─> answering ─> reveal ─┐
                        │                   ^                           │
                        └─(Herd)─> herd-writing ─start─┘                │
                                            reading <──next question────┘
                                            finished <──last question / host ends──
```

| Phase | Entered by | Ends when | Clock |
| --- | --- | --- | --- |
| `lobby` | `makeLobby` on room creation; `resetLobby` | The host locks the rules: `POST /api/host/lock-setup` runs `lockSetup`. It needs one connected player, or the host choosing to play. | none |
| `building` | `lockSetup`; `resetLobby` with `phase: "building"` (`POST /api/host/new-game`) | Host Start (`/api/host/start`) passes `getStartCheck`: someone is connected, at least one question exists, none are pending approval, and every connected player has submitted their quota and is ready. Quiz then calls `startGame`; Herd calls `beginHerdAnswerWriting`. Host Skip or force-start (`forceStartGame`) fills the gaps from the catalogue. | none |
| `herd-writing` | `beginHerdAnswerWriting` (Herd only) | Host Start once every assigned answer has text and every writer is ready, then `startGame({ preparedQuestions: true })`. Skip or force-start fills unwritten answers from `GENERATED_HERD_ANSWERS` first. | none |
| `reading` | `beginQuestion(room, index)` | The reading timer ends, every connected player acknowledges, and `beginAnswering` runs. | 5 s |
| `answering` | `beginAnswering` | The timer ends, or every connected player has answered. `transitionToReveal` runs. | 14 s |
| `reveal` | `transitionToReveal` (scores Majority and Herd rounds here) | The timer ends and everyone acknowledges, or every connected player has voted Good or Nah on the question. Then `beginQuestion(index + 1)`. | 12 s |
| `finished` | `beginQuestion` past the last question; `finishGameNow` (host Start pressed during a live phase) | `resetLobby` from `POST /api/host/reset` (clean lobby) or `/api/host/new-game` (back to `building`, unplayed questions kept). | none |

`finishGameNow` and the final `beginQuestion` both call `recordCareerResults`,
which only hands finished scores to the accounts area; guests are unaffected.

### Durations and the constants behind them

| Constant | Value | Where |
| --- | --- | --- |
| `PHASE_DURATIONS_MS.reading` | 5,000 ms | `packages/game-engine/src/phases.ts`; read in `server.js` as `READING_MS` |
| `PHASE_DURATIONS_MS.answering` | 14,000 ms | same; `ANSWERING_MS`, also the denominator for speed points |
| `PHASE_DURATIONS_MS.reveal` | 12,000 ms | same; `REVEAL_MS` |
| `PROGRESS_SETTLE_MS` | 200 ms | `server.js`; pause between "everyone is ready" and advancing |
| `PROGRESS_FORCE_ADVANCE_MS` | 5,000 ms | `server.js`; the longest the server waits for stragglers |
| Vote advance delay | 300 ms | `scheduleVoteAdvance`; after the last Good or Nah vote |
| `REVEAL_ANSWER_SPOTLIGHT_MS` | 3,500 ms | `standalone/public/app.jsx`; client-only pacing inside the 12 s reveal |

One question therefore takes 31 s of timers at most (5 + 14 + 12), and the
lobby's estimate (`estimatedGameDurationMs`) is exactly that times the planned
question count. Real games run longer: the progress waits, pauses and
Gahooks all add time. **(tunable)**

### Progress waits

A phase deadline does not advance the game by itself. When the phase timer
fires, `waitForProgressThen` sets `room.game.waitingForProgress` and waits for
every connected ("active") player to acknowledge. Each browser acknowledges
when its own timer bar completes, with `POST /api/player/progress`
(`acknowledgeProgress`), naming the phase and question index. A stale
acknowledgement for another phase or question is ignored with `ignored: true`.

- When all active players are acknowledged, `scheduleProgressAdvance` waits
  `PROGRESS_SETTLE_MS` and re-checks before `advanceCurrentPhase` runs.
- If someone never acknowledges (a frozen tab), `scheduleProgressFallback`
  forces the advance after `PROGRESS_FORCE_ADVANCE_MS`.
- The check is `allActivePlayersProgressReady` in `gameplay.mjs`, keyed by
  `phaseProgressKey` (`phase:index`). An empty room counts as ready.
- `advanceCurrentPhase` does nothing while the room is paused.
- The two early exits skip the wait entirely: all connected players answered
  (`allActivePlayersAnswered`, then `windowedTransitionAfterAnswers`, 200 ms)
  and all connected players voted on the reveal (`scheduleVoteAdvance`).

### Pause and skip

Both are host-only (`requireHost`) and both ask `server/phase-controls.mjs`
first. That module is pure: it takes a phase and returns what to do.

| Phase | Pause (`pauseDecision`) | Skip (`skipDecision`) |
| --- | --- | --- |
| `reading` | allowed | `begin-answering` |
| `answering` | allowed | `reveal` (scores the round) |
| `reveal` | allowed | `next-question` |
| `building`, `herd-writing` | refused: "This part of the game waits for players, not a timer. Use Skip to move on." | `force-start`: start now with what exists, filling gaps |
| `lobby` | refused: "The game can only be paused during a question." | refused: "There is nothing to skip right now." |
| `finished` | refused, same wording as `lobby` | refused: "The game has already finished." |

`PAUSABLE_PHASES` is `reading`, `answering`, `reveal`. It is deliberately a
separate list from `LIVE_GAME_PHASES` in `server.js`, which decides who may
Gahook whom; widening that one to cover `herd-writing` would change Gahook rules.

`setGamePaused` accepts `{ paused: true | false }` or toggles. Pausing records
`pausedRemainingMs` (via `remainingMs`, never negative), whether the room was
already waiting on progress, clears the phase timer and sets `phaseEndsAt` to
`null`. Resuming restores the remainder as a fresh deadline, or, if the
remaining time had already run out, goes straight back into the progress wait.
If a paused `answering` phase has everyone answered, resuming advances to the
reveal. A pause survives the host being away: game timers keep their state and
a paused game stays paused until a host resumes it (see
[systems.md](systems.md)).

### Modes and settings

There are two game **families**, and Quiz has two **scoring rules**, which gives
the three ways to play that players see:

| Name shown (`scoringLabel`) | `gameFamily` | `quizScoring` | Legacy `gameMode` | Who writes what |
| --- | --- | --- | --- | --- |
| Quiz · Classic | `quiz` | `classic` | `quiz` | Each player writes questions with up to four answers and chooses the **intended** answer (`intendedAnswerId`). |
| Quiz · Majority Rulez | `quiz` | `majority` | `majority` | The same questions, but no answer is correct; the room's most popular choice wins. The author may predict the winner (`predictedAnswerId`). |
| Herd | `herd` | any (remembered) | `herd` | Each player writes one prompt. Then every prompt gets up to four short answers (`HERD_MAX_AUTHORED_ANSWERS`) written by *other* players, and the room votes for the answer it likes best. |

`GameSettings` in `packages/contracts/src/settings.ts` is the single writable
truth. The old `gameMode` string is derived from it by `toLegacyGameMode` and is
never stored as an independent field, because two writable copies drift
silently. New rooms start on Quiz · Classic (`DEFAULT_GAME_SETTINGS`). Under
Herd the remembered `quizScoring` is kept only so the lobby can restore the
host's Majority choice when they switch back.

**How a mode is selected.** The host's rules modal sends one
`POST /api/host/settings` request, validated by `HostSettingsRequestSchema`
(strict: an unknown key is a rejection). `updateHostSettings` then:

- refuses unless the room is in `lobby` ("Settings are locked once the quiz starts");
- rejects a stale request when `settingsRevision` no longer matches the room's;
- passes `gameFamily`/`quizScoring` and any legacy `gameMode` through
  `normaliseGameSettings`, which rejects a contradiction (`gameMode: "herd"`
  with `gameFamily: "quiz"`) instead of guessing;
- on a **family** change only, parks the outgoing family's questions in
  `room.savedQuestionBank` (`stashFamilyQuestions`) and restores the incoming
  family's. Switching Classic and Majority keeps every question and every
  player's ready state, because only the scoring changes;
- re-stamps each question's `mode` (`applyQuestionScoring`) and bumps
  `settingsRevision`.

`lockSetup` later copies the choice into `room.lockedRules`, and
`applyQuestionScoring` prefers `room.lockedRules.gameMode`, so a game is scored by
the rules in force when setup locked. `transitionToReveal` branches on each
question's own `mode`.

**Game length.** `roundPreset` is `quick`, `standard` or `custom`
(`ROUND_PRESETS`). The numbers live in `server.js` **(tunable)**:

| Family | Preset | Questions per player | Most rounds played |
| --- | --- | --- | --- |
| Quiz (both scorings) | Quick | 1 | 10 (`QUICK_MAX_ROUNDS`) |
| Quiz | Standard (the default) | `clamp(floor(18 / players), 1, 3)` | 18 (`STANDARD_MAX_ROUNDS`) |
| Quiz | Custom | 1 to 5 (default 3) | no cap |
| Herd | Quick (what a family switch to Herd starts on) | 1 | 8 (`HERD_QUICK_MAX_ROUNDS`) |
| Herd | `standard`, shown as "Full room" | 1 | no cap: every eligible player's prompt is played |
| Herd | Custom | 1 | `herdRoundTarget`, 1 to 20 (`HERD_MAX_CUSTOM_ROUNDS`, default 8) |

`maximumRoundsForPreset` returns the cap and `questionsPerPlayerForPreset` the
quota. Before play, `plannedQuestionCount` is
`plannedRounds(connectedPlayers x quota, cap)` from `phases.ts`; once questions are
chosen (`herd-writing`, any live phase, `finished`) it is simply
`quizQuestions.length`. The lobby's duration estimate multiplies that by the
31 seconds of timers per round. Each family remembers its own preset
(`room.familyLengths`).

**Which questions are played.** `selectQuestionsForGame` takes the eligible
players' questions that are ready for the mode (`questionReadyForMode`: Classic
needs an intended answer, Majority does not, Herd takes only Herd prompts),
caps them at the preset, and deals them round-robin across authors
(`fairRoundRobinQuestions`) so no author dominates a capped game. Questions that
missed the cut in an earlier game get first refusal, then the order is shuffled.
Eligible players (`room.game.eligiblePlayerIds`) are the ones connected when
the game starts (Herd: when answer writing begins). `joinPlayer` appends anyone
who joins during `reading`, `answering` or `reveal`, so late arrivals are scored
and ranked; someone who joins during Herd's `herd-writing` has no answers
assigned and is not in the list.

**Herd answer allocation.** `buildHerdAssignmentPlan` in `herd.ts` decides who
writes which answer. Each question wants `min(4, players)` answers. Slots are
shared out evenly: every writer gets `floor(slots / players)` answers and a random
few get one more. A question's own author is excluded whenever enough other
players exist. Overshoot is repaired by moving an answer to an under-loaded
writer. Each answer also gets a `displayIndex` from a fresh shuffle per question,
so the colour an answer appears in (Red, Blue, Yellow, Green) never reveals its
author. The plan is built in `beginHerdAnswerWriting`, which writes the
assignments onto each question's `answers`; an answer a writer never submits is
filled from `GENERATED_HERD_ANSWERS` by force-start.

### Scoring

Points are whole numbers. Every speed-scaled award uses the time the **server**
measured between `answerOpenedAt` (when `answering` began) and the request
arriving, clamped to 0 to 14,000 ms (`ANSWERING_MS`). A client cannot claim a
faster time.

| Mode | Who scores | Points | When applied |
| --- | --- | --- | --- |
| Classic | A player who picks the intended answer | `round(1000 - elapsed / 14000 x 500)`: 1,000 for an instant answer, about 750 at 7 s, 500 at the buzzer (`quizPoints`). A wrong answer or no answer scores 0. | At once, inside `submitAnswer` |
| Majority Rulez | Every player who picked the **winning** answer | The same `quizPoints` curve, 500 to 1,000. Everyone else scores 0. | At the reveal, in `scoreMajorityRound` |
| Majority Rulez author bonus | The question's author | Flat 100 (`MAJORITY_AUTHOR_BONUS`), only if the vote was **unanimous** and the author's prediction named the winning answer | At the reveal |
| Herd, voter | Every player who picked the winning answer | `round(500 - elapsed / 14000 x 250)`: 500 for an instant vote down to 250 (`speedPoints`, `HERD_MAX_VOTE_POINTS`) | At the reveal, in `scoreHerdRound` |
| Herd, answer author | The writer of **every** answer, winning or not | `round(500 x votes / eligible players)` (`HERD_MAX_AUTHOR_POINTS`) | At the reveal |

**Who wins a Majority or Herd round.** The answer with the most votes. If
several answers tie on votes, the tie is separated by, in order: the fastest
single vote, then the fastest average vote, then the answer's fixed position in
the question. `tieBreakReason` (`none`, `fastest`, `average` or `order`) names
the rule that actually decided it, so the reveal never calls an order tie-break a
speed win. A player who does not answer is not in the results and scores 0. If
nobody answers, there is no winner and nobody scores.

**Details that matter.**

- Majority has no correct answer. The author's prediction can earn the bonus but
  never makes an answer "correct". A fact-check attached to an educational
  question is shown beside the result and is never a scoring key.
- The author bonus needs every eligible player to have answered, all with the
  winning answer. One missing or different vote, even the author's own, loses it.
- In Herd, `submitAnswer` refuses a vote for your own answer
  (`ownAnswer: true`), so a writer cannot collect both the voter and author award
  from one choice. An answer filled in by force-start still pays the writer it
  was assigned to.
- Gahook interactions that move points (`GAHOOK_STEAL_POINTS` 50,
  `GET_GOT_SCORE_PENALTY` 1,000) change `player.score` outside this area; the
  social guide owns those rules.
- Scores are reset to 0 in `startGame` and `resetLobby`.

**Leaderboard and placings** (`server/scoring.mjs`).
`sortedLeaderboard` orders by score, highest first, with the earlier joiner
first on equal scores. `rankedLeaderboard` gives tied scores the same rank
(1, 1, 3). `scorePlacements` reports every player on the top score as a winner,
and every player on the bottom score as a loser, except when everybody is tied:
then it is a shared win with no losers. `winner` and `loser` are set only when
exactly one player holds that position. Only `gameEligiblePlayers` are ranked.

### Privacy and snapshots

Room state reaches browsers as a snapshot built on the server for each viewer.
Two builders decide what a viewer may learn about the current round:
`publicQuestion` (the question and its answers) and `publicAnswerSelections`
(who picked what). Only these two were audited for this guide; the other
snapshot fields (player scores, results, Gahook state) were not.

**What other players can see before the reveal, today.**

| Phase | Visible to every viewer | Not yet visible |
| --- | --- | --- |
| `reading` | The question text and image, its author, and the answer *slots* (label, colour and shape) with the text blanked. | Answer text, which answer is correct, Herd answer authors, results. |
| `answering` | Answer text. **For every player who has answered: their player id, the answer id they picked, and when** (`answerSelections`, with an `isOwn` flag). | Which answer is correct (Classic), the winner (Majority, Herd), Herd answer authors, prediction, results. |
| `reveal`, `finished` | Everything: the correct or winning answer, every selection, results, Herd answer authors and points, the Majority prediction. | Nothing about the round. |

The plain statement: **before the reveal, other players' Majority Rulez and Herd
choices are visible to everyone.** The browser draws each player's picture on the
tile they chose. This is a known gap, not a design decision. A planned wave-2
change (brief item U23 in
[`docs/plans/2026-09-25-briefs.md`](../plans/2026-09-25-briefs.md)) will stop the
server sending other players' choices before the reveal in those two modes and
send only who has answered. Until it merges, this section describes the code, and
whoever merges it must rewrite the table above.

Facts about the code that the change has to account for:

- `publicAnswerSelections` does not look at the mode. Classic Quiz leaks the same
  way: other players' picked answer ids are visible during `answering`, though
  not whether they are correct, because `correct` stays `undefined` until the
  reveal. The U23 brief leaves Classic unchanged unless the leak exists there;
  it does.
- It takes the viewer's player id, not their role, and `publicQuestion` ignores
  its `role` argument, so host, player and party-screen snapshots carry the same
  fields.
- One protection already exists: during `answering` the question author's own
  pick is withheld from everyone but the author, so the person who wrote a
  prompt cannot be copied.
- Herd answer authors stay hidden until the reveal. `publicQuestion` never sends
  `authorId` for an answer, only an `ownAnswer` flag for the viewer's own
  answers, and `author` stays `null` until `reveal`.
- The server enforces all of this, not the UI. Hiding a field in the browser
  does not count (see the invariants below).

## Invariants

- The server decides phase, time and points. Answer time is measured by the
  server from `answerOpenedAt`; a client-supplied time is never used.
- Hidden information stays on the server until the reveal: correct answers,
  winners, Herd answer authors, the Majority prediction. Enforce it in the
  snapshot builders, not in the UI. (The one standing exception, other players'
  picks during `answering`, is a known gap: see *Privacy and snapshots*.)
- `GameSettings` is the only writable record of the mode. `gameMode` is derived
  with `toLegacyGameMode`, and a request whose two spellings disagree is
  rejected, never guessed at.
- Settings change only in `lobby`. `lockSetup` freezes the rules into
  `room.lockedRules`, and a started game is scored by those, not by whatever the
  lobby shows later.
- A settings change never destroys submitted work. Questions over a lowered
  quota, and a whole family's questions after a switch, are parked in
  `room.savedQuestionBank` and restored when the quota or family returns.
- Classic scores only against an intended answer a human chose. Automatic fill
  for Classic uses verified factual questions only (`generationStyleFor`); an
  opinion prompt never gets an invented correct answer.
- Every phase change goes through the named functions (`lockSetup`,
  `beginHerdAnswerWriting`, `startGame`, `beginQuestion`, `beginAnswering`,
  `transitionToReveal`, `finishGameNow`, `resetLobby`). Each clears the phase
  timer and the progress wait first, and `beginAnswering` and
  `transitionToReveal` refuse to run in the wrong phase, so a duplicated timer or
  retried command cannot advance a game twice.
- A round is scored once. `scoreMajorityRound` and `scoreHerdRound` return
  early when the question is already marked `majorityScored` or `herdScored`.
- Pause applies only to `PAUSABLE_PHASES`, and `advanceCurrentPhase` does nothing
  while paused. `PAUSABLE_PHASES` is separate from `LIVE_GAME_PHASES`, which
  gates Gahooks; do not merge them.
- In Herd, a player cannot vote for their own answer, and an answer's colour
  slot (`displayIndex`) is shuffled per question so it never names its author.
- Scoring changes need golden fixtures showing before and after, and a record in
  `docs/architecture/` if the rule changes.
- Guest play never needs an account. `recordCareerResults` only forwards players
  who already have one.

## Tests

Run under the shared lock with Node 24 (`PATH=/usr/bin:$PATH`). This is the
game-flow profile from [`docs/agents/game-flow.md`](../agents/game-flow.md):

```bash
flock /tmp/gahookz-verify.lock npm run check
flock /tmp/gahookz-verify.lock npm run test:simulation
flock /tmp/gahookz-verify.lock npm run test:disposable -- bash -c "npm run standalone:smoke:majority-scoring && npm run standalone:smoke:majority-flow && npm run standalone:smoke:herd-flow && npm run standalone:smoke:round-presets && npm run standalone:smoke:mode-settings && npm run standalone:smoke:roles && npm run standalone:smoke:review-repairs"
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run test:rooms
```

For pause and skip, add `standalone:smoke:host-controls` to the disposable batch.
For the finale, add `standalone:smoke:finals`.

| Test | Covers |
| --- | --- |
| `packages/game-engine/test/phases.test.ts` | `nextPhase`, `remainingMs`, `resumeDeadline`, `plannedRounds`, `estimatedDurationMs` |
| `packages/game-engine/test/herd.test.ts` | Herd allocation, results, points, tie-breaks |
| `packages/game-engine/test/replay.test.ts` | replaying recorded rounds through the engine |
| `packages/game-engine/test/scoring-alternatives.test.ts` | the two scoring alternatives that were evaluated and not adopted |
| `packages/contracts/test/settings.test.ts`, `host-settings.test.ts` | settings normalisation, the strict host-settings schema, readiness checks |
| `packages/contracts/test/fixtures.test.ts` and `fixtures/` | recorded snapshots per phase and role; recapture with `npm run capture:fixtures` |
| `standalone/server/majority.test.mjs` | `buildMajorityResults` |
| `standalone/server/phase-controls.test.mjs` | `skipDecision`, `pauseDecision` |
| `smoke-majority-scoring`, `smoke-majority-flow`, `smoke-herd-flow` | scoring and a full game of each mode over HTTP |
| `smoke-round-presets`, `smoke-mode-settings` | game length, settings, family switching |
| `smoke-host-controls` | Skip and Pause through every phase |
| `simulate-games.mjs` (`test:simulation`), `simulate-room-flows.mjs` (`test:rooms`) | whole games with real choices; keep the simulations legal |

The unit tests never start a server. `test:disposable` owns port 3199 and
refuses an occupied one; never point any of this at ports 3101 to 3103 or a
public domain. Several smokes assert on source text, so when a legitimate change
alters the code they describe, update the assertion to say the new thing; never
weaken a check to get a pass.

## Common changes

- **Change a phase length.** Edit `PHASE_DURATIONS_MS` in
  `packages/game-engine/src/phases.ts`; the server reads it as `READING_MS`,
  `ANSWERING_MS` and `REVEAL_MS`. Speed points scale with `ANSWERING_MS`
  automatically, the lobby's duration estimate follows, and the client's 3,500 ms
  reveal spotlight sits inside the reveal. Update `phases.test.ts` and the
  *Durations* table above.
- **Change a point value.** Edit `quizPoints` (`scoring.mjs`), `speedPoints` and
  `HERD_MAX_*` (`herd.ts`) or `MAJORITY_AUTHOR_BONUS` (`majority.mjs`). Add
  fixtures that show before and after, update `smoke-majority-scoring`, write the
  reason in `docs/architecture/` (see
  [0003](../architecture/0003-scoring-alternatives.md) for the form), and update
  the *Scoring* section and the wiki numbers.
- **Change game length.** Edit `QUICK_MAX_ROUNDS`, `STANDARD_MAX_ROUNDS`,
  `HERD_QUICK_MAX_ROUNDS`, `HERD_MAX_CUSTOM_ROUNDS` or the per-player quota in
  `server.js`, then run `smoke-round-presets` and update the length table.
- **Add a host setting.** Add the field to `HostSettingsRequestSchema` (strict)
  and the response schema in `host-settings.ts`, handle it in
  `updateHostSettings`, freeze it in `lockSetup` if it affects scoring, and add a
  case to `smoke-mode-settings`.
- **Make a phase pausable or skippable.** Edit the lists and decisions in
  `phase-controls.mjs` and its test. Do not widen `LIVE_GAME_PHASES`.
- **Add or change a mode.** It touches `settings.ts` (`toLegacyGameMode`,
  `scoringLabel`), `questionReadyForMode`, `normaliseQuestion`,
  `applyQuestionScoring`, `transitionToReveal`, `publicQuestion` and the engine,
  plus the UI areas. Add a flow smoke and a simulation case.
- **Show or hide something before the reveal.** Change `publicQuestion` or
  `publicAnswerSelections`, recapture the snapshot fixtures, add a smoke
  assertion on a pre-reveal snapshot for player, host and party roles, and update
  the *Privacy and snapshots* table.

## Known issues

- **Other players' picks are visible before the reveal.** In `answering`,
  `publicAnswerSelections` sends every other player's chosen answer id in all
  three modes (Classic too, though correctness stays hidden), so Majority Rulez
  and Herd choices can be copied. A wave-2 change
  (U23) will hide them; see *Privacy and snapshots*.
- **`LockedGameRules` is unused.** The interface in
  `packages/contracts/src/host-settings.ts` has a different shape from the object
  `lockSetup` stores in `room.lockedRules`, and nothing imports it.
- **The engine's phase maths is not what runs.** `nextPhase`, `resumeDeadline`
  and `estimatedDurationMs` are unit-tested, but `server.js` imports only
  `PHASE_DURATIONS_MS`, `plannedRounds` and `remainingMs`. The live machine has
  its own transitions and its own `estimatedGameDurationMs`, so `phases.test.ts`
  tests a model of the rules rather than the rules.
- **A disconnected Herd writer blocks Start.** `getStartCheck` waits for every
  *eligible* writer to mark ready, connected or not. Skip or force-start gets
  past it, filling the missing answers. Read from the code, not reproduced.
- **Skip while paused is unchecked.** `skipPhase` does not look at `room.paused`
  and `skipDecision` only looks at the phase. By reading, a skip during a pause
  starts the next phase's timer while the room is still marked paused. Whether
  the UI offers Skip then is unconfirmed. Not run.
- `publicMajorityResults` lists `unanimous` twice in one object literal. Harmless.

Live backlog: [`../backlog.md`](../backlog.md).
