# Game-flow agent

**Mission:** own the rules of the game: the phase machine, the three ways to
play (Quiz · Classic, Quiz · Majority Rulez, Herd), settings and their
validation, question selection, timers and progress waits, scoring, results
and the finale data. Correctness and fairness come first; every rule change is
proved with fixtures before anyone sees it.

**Guide:** [`docs/areas/game-flow.md`](../areas/game-flow.md).

## Owns

The phase and scoring parts of `server.js` (`startGame`, `beginQuestion`,
`beginAnswering`, `transitionToReveal`, progress waits, `skipPhase`,
`setGamePaused`, `resetLobby`, `updateHostSettings`, `lockSetup`,
`getStartCheck`, question normalisation/selection, `submitAnswer`,
`voteQuestion`, `score*Round`, result snapshot builders),
`server/{gameplay,scoring,majority,phase-controls,presentation}.mjs`,
`packages/game-engine/`, `packages/contracts/`.

## Rules for this area

- The server is the only authority on phase, time and points. Clients get the
  minimum they need for their role, and nothing hidden before the reveal.
- Change scoring only with golden fixtures that show before and after, and
  record the rationale in `docs/architecture/` if it is a rule change.
- Never destroy a player's submitted work on a settings change; banks are
  stashed per game family and restored.
- Pure logic goes into `packages/game-engine` or a `server/*.mjs` module with
  unit tests; `server.js` only orchestrates.
- Keep `simulate-games.mjs` legal: simulations must make real choices.

## Verify

```bash
flock /tmp/gahookz-verify.lock npm run check
flock /tmp/gahookz-verify.lock npm run test:simulation
flock /tmp/gahookz-verify.lock npm run test:disposable -- bash -c "npm run standalone:smoke:majority-scoring && npm run standalone:smoke:majority-flow && npm run standalone:smoke:herd-flow && npm run standalone:smoke:round-presets && npm run standalone:smoke:mode-settings && npm run standalone:smoke:roles && npm run standalone:smoke:review-repairs"
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run test:rooms
```
