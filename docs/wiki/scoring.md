# Scoring

> Every way a player's points go up or down, on one page.

**Area:** [game flow](../areas/game-flow.md) · **Status:** live · **Last reviewed:** 2026-10-04

## What it is

Everyone starts a game on 0. Points are whole numbers and the server decides all of them. Speed points use the time the server measured from when answering opened, out of 14 seconds ([Phases and timers](phases-and-timers.md)).

## Rules and numbers

| Source | Who | Points |
| --- | --- | --- |
| [Classic](quiz-classic.md) | Anyone who picks the right answer | `round(1,000 − 500 × seconds used ÷ 14)`, from 1,000 down to 500. Wrong or no answer scores 0. Paid at once. |
| [Majority Rulez](majority-rulez.md) voters | Anyone who picks the winning answer | The same curve, 500 to 1,000. Paid at the reveal. |
| Majority author bonus | The question's author | A flat 100, only if every eligible player voted, all for the winning answer, and it matches the author's prediction. |
| [Herd](herd.md) voters | Anyone who votes for the winning answer | `round(500 − 250 × seconds used ÷ 14)`, from 500 down to 250. |
| Herd authors | The writer of every answer | `round(500 × votes ÷ eligible players)`, winning or not. |
| Gahook steal | One Gahook at another player during a question | 50 moves from the target to the sender. |
| GET GOT | The player a Gahook pile-up lands on | −1,000 — but unreachable in practice, see below. |

- **Chaos rule.** The two Gahook rows apply only when the host's Gahook effects rule is **Chaos**, the default. On "Off" or "Visual only" nobody loses points to a Gahook ([Lobby rules](lobby-rules.md)). They also apply only during a question, and each player gets one Gahook per question. In the lobby and at the finale a Gahook is just a reaction.
- **GET GOT is never actually charged.** It needs fifty Gahooks in one unbroken streak, which the one-per-question limit and the 32-player cap make impossible during a question, and a pile-up built in the lobby or at the finale costs nothing. The row above is what the code would pay; the game as played never reaches it. Decided 2026-10-19 to leave it that way ([record](../verification/2026-10-18-host-poke-claim/README.md)).
- Nothing stops a score going below zero.
- **The Gahook Arena awards no points.** A duel changes nothing on the scoreboard.

## Where it lives

| Part | Code |
| --- | --- |
| Classic | `standalone/server/scoring.mjs` — `quizPoints`; `standalone/server.js` — `submitAnswer` |
| Majority | `standalone/server/majority.mjs` — `buildMajorityResults`, `MAJORITY_AUTHOR_BONUS` |
| Herd | `packages/game-engine/src/herd.ts` — `speedPoints`, `buildHerdRoundResults` |
| Gahooks | `standalone/server.js` — `pokePlayer`, `applyGetGot`, `gahookScoringAllowed` |
| Tests | `standalone/smoke-majority-scoring.mjs`, `standalone/smoke-gahooks.mjs`, `packages/game-engine/test/herd.test.ts` |

## Related

- [Gahooks](gahooks.md), [Gahook Arena (1v1)](gahook-arena.md), [Finale](finale.md)
- [Reveal and results](reveal-and-results.md) (ties), [scoring alternatives](../architecture/0003-scoring-alternatives.md)

## History

- 2026-07-20 — Speed scoring, the Gahook steal and GET GOT exist from the first commit (`dd449f2`).
- 2026-08-26 — Majority and Herd scoring arrive (`178d56b`).
- 2026-09-11 — The server enforces the Chaos rule, not just the UI (`2ae50f4`).
- 2026-09-19 — Quiz and Herd overhaul merged to `main` (`78a1382`).
