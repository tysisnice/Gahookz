# Phases and timers

> A game moves through a fixed list of phases, and the server alone decides when each one starts and ends.

**Area:** [game flow](../areas/game-flow.md) · **Status:** live · **Last reviewed:** 2026-10-04

## What it is

A room is always in exactly one phase, and every screen draws what the server says. In play order:

1. **Lobby.** The host sets the rules, then locks them. No clock.
2. **Building.** Players write questions. No clock; the host starts when everyone is ready.
3. **Herd writing** (Herd only). Players write answer options for each other's prompts. No clock.
4. **Reading.** 5 seconds to read the question. The answer text is blank.
5. **Answering.** 14 seconds to pick an answer.
6. **Reveal.** 12 seconds for the result, the points and the Good or Nah vote.
7. **Finished.** The final scoreboard. No clock.

Reading, answering and reveal repeat for every question.

## Rules and numbers

- One question is at most 31 seconds of timers. Real games run longer.
- **Progress waits.** When a timer ends, the server waits until every connected screen reports it has finished. A frozen tab cannot stall the room: after 5 seconds the server moves on anyway.
- **Early exits.** When everyone has answered, or everyone has voted Good or Nah, the game moves on at once.
- **Pause** (host only) works in reading, answering and reveal. It freezes the countdown for everyone until a host resumes. Elsewhere it is refused with a reason.
- **Skip** (host only) ends the phase now: reading to answering, answering to the reveal (which scores the round), the reveal to the next question. While players are still writing, Skip starts the game with what exists and fills the gaps from the built-in catalogue.
- **Known issue:** Skip ignores Pause. A skip during a pause starts the next phase's timer while the room still counts as paused.

## Where it lives

| Part | Code |
| --- | --- |
| Durations | `packages/game-engine/src/phases.ts` — `PHASE_DURATIONS_MS` |
| Server | `standalone/server.js` — `beginQuestion`, `beginAnswering`, `transitionToReveal`, `waitForProgressThen`, `setGamePaused`, `skipPhase` |
| Pause and skip rules | `standalone/server/phase-controls.mjs` — `pauseDecision`, `skipDecision` |
| Tests | `standalone/smoke-host-controls.mjs` |

## Related

- [How a game works](how-a-game-works.md), [Reveal and results](reveal-and-results.md)

## History

- 2026-09-11 — Phase progression becomes a pure decision the server uses (`ececdf5`).
- 2026-09-19 — Quiz and Herd overhaul merged to `main` (`78a1382`).
