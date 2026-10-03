# Herd

> Everyone writes a prompt, then secretly writes answer options for other people's prompts, and the room votes for its favourite.

**Area:** [game flow](../areas/game-flow.md) · **Status:** live · **Last reviewed:** 2026-10-04

## What it is

Herd is the second game on the host's setup screen, next to Quiz ([Game setup](game-setup.md)).

1. **One prompt each.** Every player writes a single prompt.
2. **Writing answers.** Each player is handed a few prompts from other players and writes a short answer for each (up to 80 characters). Every prompt ends up with up to four answers, all written by other people.
3. **Voting.** Each prompt is shown with its answers in four colours (Red, Blue, Yellow, Green). Everyone votes for their favourite, except that you cannot pick your own answer.
4. **Reveal.** The winning answer, who wrote every answer, and the points.

Authors stay hidden until the reveal. The colour an answer appears in is reshuffled for every prompt, so it never gives its writer away.

## Rules and numbers

- **Length:** Quick plays up to 8 rounds. Full room plays every player's prompt. Custom plays 1 to 20 rounds and starts at 8.
- **Voter points:** `round(500 − 250 × seconds used ÷ 14)`, so 500 for an instant vote down to 250 at the buzzer. Only voters for the winning answer score.
- **Author points:** the writer of every answer, winning or not, earns `round(500 × votes ÷ eligible players)`.
- **Winner:** the most votes. A tie goes to the fastest single vote, then the fastest average vote, then the answer's position.
- If someone never writes an answer, Skip fills it from the built-in catalogue.
- **Known issue:** other players' votes can be seen during voting. Planned: hiding them until the reveal, and optional images on answers: [2026-09-25 update](../plans/2026-09-25-update.md).

## Where it lives

| Part | Code |
| --- | --- |
| Engine | `packages/game-engine/src/herd.ts` — `buildHerdAssignmentPlan`, `buildHerdRoundResults` |
| Server | `standalone/server.js` — `beginHerdAnswerWriting`, `scoreHerdRound` |
| Browser | `standalone/public/app.jsx` — `HerdAnswerWriter`, `HerdLengthSelector` |
| Tests | `standalone/smoke-herd-flow.mjs`, `packages/game-engine/test/herd.test.ts` |

## Related

- [Phases and timers](phases-and-timers.md), [Scoring](scoring.md), [Reveal and results](reveal-and-results.md)

## History

- 2026-08-26 — Herd arrives with the new game modes (`178d56b`).
- 2026-09-11 — Answer colours stop naming their authors (`c7328c9`), and the writing is shared evenly (`db54127`).
