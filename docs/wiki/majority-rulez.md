# Majority Rulez

> A Quiz with no right answer: the answer most of the room picks wins.

**Area:** [game flow](../areas/game-flow.md) · **Status:** live · **Last reviewed:** 2026-10-04

## What it is

Majority Rulez is a scoring switch on Quiz. The host turns it on in the lobby ([Game setup](game-setup.md)); turning it off returns to [Quiz · Classic](quiz-classic.md). Players write the same kind of question, but nobody marks a right answer. Instead the author may predict which answer the room will pick, and the prediction is optional.

Everyone picks an answer in the same 14 seconds. At the reveal the most popular answer wins, and each player who picked it scores. The reveal also shows the author's prediction.

If you write a question from an educational prompt and keep its wording, the reveal adds a separate **Fact check** with the verified answer. It is only information: a popular wrong answer still wins, and the room's votes alone decide the points.

## Rules and numbers

- **Winner:** the answer with the most votes. A tie goes to the answer with the fastest single vote, then the fastest average vote, then its fixed position in the question. The reveal names the rule that actually decided it.
- **Points for the winning answer:** the same speed curve as Classic, 500 to 1,000. Everyone else scores 0. Points are given at the reveal.
- **Author bonus:** a flat 100 points, only when every eligible player voted, all of them for the winning answer, and it matches the author's prediction. One missing or different vote, even the author's own, loses it.
- Players who do not answer score 0. If nobody answers, there is no winner.
- **Known issue:** other players' picks can be seen during answering. Planned: [2026-09-25 update](../plans/2026-09-25-update.md).

## Where it lives

| Part | Code |
| --- | --- |
| Winner and bonus | `standalone/server/majority.mjs` — `buildMajorityResults`, `MAJORITY_AUTHOR_BONUS` |
| Server | `standalone/server.js` — `scoreMajorityRound`, `transitionToReveal` |
| Fact check | `standalone/public/client/reveal.jsx` — `FactCheckPanel` |
| Tests | `standalone/smoke-majority-scoring.mjs`, `standalone/smoke-majority-flow.mjs`, `standalone/server/majority.test.mjs` |

## Related

- [Scoring](scoring.md), [Prompts and suggestions](prompts-and-suggestions.md), [Reveal and results](reveal-and-results.md)

## History

- 2026-08-26 — Majority Rulez arrives with the new game modes (`178d56b`).
- 2026-09-11 — Ties now name the rule that decided them (`c7328c9`).
- 2026-09-19 — Quiz and Herd overhaul merged to `main` (`78a1382`).
