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

TODO

## Invariants

TODO

## Tests

TODO

## Common changes

TODO

## Known issues

TODO
