# Game flow — area guide

Last verified against the code: 2026-10-04, commit 56497b9

> Draft skeleton. Sections are filled in one commit at a time.

## Purpose

TODO

## What players see

TODO

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
| `contracts/src/host-settings.ts` | The host-settings request and response schemas, prompt styles, Gahook effect policies, `LockedGameRules`, and the question readiness checks (`isClassicReady`, `questionReadinessProblem`). |
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

## Invariants

TODO

## Tests

TODO

## Common changes

TODO

## Known issues

TODO
