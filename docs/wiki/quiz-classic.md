# Quiz · Classic

> Write questions with a right answer, then race the room to pick it first.

**Area:** [game flow](../areas/game-flow.md) · **Status:** live · **Last reviewed:** 2026-10-04

## What it is

Classic is the Quiz game a new room starts on. Each player writes questions with two to four possible answers and marks the one that is right. When everyone is ready the host starts, and the questions are played one at a time, shared out fairly between authors.

For each question the room gets 5 seconds to read and 14 seconds to pick ([Phases and timers](phases-and-timers.md)). A pick locks the moment it is made. A right answer scores, and the faster it is, the more it scores. A wrong answer, or no answer, scores nothing, and nothing is taken away. The reveal then shows the right answer and everyone's points.

If someone has not finished writing, the host can Skip and the gaps are filled from the built-in catalogue. For Classic, only questions with a verified answer are used, so an opinion prompt never gets an invented "right" answer.

## Rules and numbers

- **Points for a right answer:** `round(1,000 − 500 × seconds used ÷ 14)`. That is 1,000 for an instant answer, about 750 at 7 seconds and 500 at the buzzer.
- The server measures the time from when answering opened, so a device cannot claim a faster answer.
- How many questions each player writes depends on the game length ([Game setup](game-setup.md)).
- Switching Classic to [Majority Rulez](majority-rulez.md) and back keeps every question and every ready status.
- **Known issue:** other players' picks can be seen during answering, though not whether they are right. Planned: [2026-09-25 update](../plans/2026-09-25-update.md).

## Where it lives

| Part | Code |
| --- | --- |
| Points | `standalone/server/scoring.mjs` — `quizPoints` |
| Server | `standalone/server.js` — `submitAnswer`, `selectQuestionsForGame` |
| Settings | `packages/contracts/src/settings.ts` — `GameSettings` (`quizScoring: "classic"`) |
| Tests | `standalone/simulate-games.mjs`, `standalone/smoke-mode-settings.mjs` |

## Related

- [Writing questions](question-writing.md), [Scoring](scoring.md), [Game setup](game-setup.md)

## History

- 2026-07-20 — Quiz scoring by speed exists from the first commit (`dd449f2`).
- 2026-09-09 — Classic and Majority become one canonical setting (`7d4aca9`).
- 2026-09-19 — Quiz and Herd overhaul merged to `main` (`78a1382`).
