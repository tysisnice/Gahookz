# Reveal and results

> After every question the room sees the answer, who got points, and what was secret until now.

**Area:** [game flow](../areas/game-flow.md) · **Status:** live · **Last reviewed:** 2026-10-04

## What it is

The reveal lasts 12 seconds ([Phases and timers](phases-and-timers.md)). The first 3.5 seconds spotlight the answer and the faces of the players who picked it. Then come the points and the **Good** or **Nah** vote ("Was this question good?"). When everyone has voted, the next question starts early.

- **Classic:** "Correct answer" and the author's intended answer, then the round standings.
- **Majority Rulez:** "Majority rules" and the winning answer, with the other tiles dimmed and who picked each. It shows the winning vote count and the author's prediction, and explains the bonus.
- **Herd:** "The Herd favourite". Every answer shows who wrote it and its author points, and you see "Points for your vote", "Points for your answer" and "This round".
- **Fact check.** Majority and Herd reveals can add a separate **Fact check** with the verified answer, when the prompt came from verified content. It is information only; a popular wrong answer still wins.

## Rules and numbers

- **Tie-breaks.** A tie for the most votes is settled by the fastest single vote, then the fastest average vote, then the answer's fixed position. The reveal names the rule that decided it: "Vote tie · quickest pick wins", "Vote tie · fastest on average" or "Exact tie · settled by answer order".
- **When hidden things become public**, enforced by the server:

| Secret | Public from |
| --- | --- |
| Answer text | Answering (blank while reading) |
| The right or winning answer, the Majority prediction, Herd answer authors and their points | The reveal |

- Voting Good or Nah earlier is refused: "Voting opens after answers are revealed."
- **Planned:** hiding other players' picks until the reveal; today they can be seen while answering, though not whether they are right ([2026-09-25 update](../plans/2026-09-25-update.md)).

## Where it lives

| Part | Code |
| --- | --- |
| Reveal modules | `standalone/public/client/reveal.jsx` — `FactCheckPanel`, `tieBreakLabel`, `HerdRevealBreakdown` |
| Reveal screen | `standalone/public/app.jsx` — `RevealPanel`, `RoundRevealSummary` |
| Server | `standalone/server.js` — `transitionToReveal`, `publicQuestion`, `voteQuestion` |
| Tests | `standalone/smoke-majority-flow.mjs`, `standalone/smoke-herd-flow.mjs` |

## Related

- [Scoring](scoring.md), [Majority Rulez](majority-rulez.md), [Herd](herd.md), [Finale](finale.md)

## History

- 2026-07-20 — "Correct answer" and the Good or Nah vote exist from the first commit (`dd449f2`).
- 2026-08-26 — Majority and Herd reveals arrive (`178d56b`).
- 2026-09-11 — Ties name their deciding rule (`c7328c9`) and Fact check is added (`4231d68`).
- 2026-09-12 — The reveal becomes its own module (`4cca66c`).
