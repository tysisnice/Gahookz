# Herd

> Everyone writes a prompt, then secretly writes answer options for other people's prompts, and the room votes for its favourite.

**Area:** [game flow](../areas/game-flow.md) · **Status:** live · **Last reviewed:** 2026-10-08

## What it is

Herd is the second game on the host's setup screen, next to Quiz ([Game setup](game-setup.md)).

1. **One prompt each.** Every player writes a single prompt.
2. **Writing answers.** Each player is handed a few prompts from other players and writes a short answer for each (up to 80 characters). Every prompt ends up with up to four answers, all written by other people. Under each answer box are **Upload image** and **Draw image**, side by side, so an answer can carry a picture too (see below). In the player cards each writer's progress reads "0/4 answered" and then "Done".
3. **Voting.** Each prompt is shown with its answers in four colours (Red, Blue, Yellow, Green). Everyone votes for their favourite, except that you cannot pick your own answer.
4. **Reveal.** The winning answer, who wrote every answer, and the points.

Authors stay hidden until the reveal. The colour an answer appears in is reshuffled for every prompt, so it never gives its writer away.

### Answer images

- **Text is required, the picture is optional.** An answer with only a picture is refused ("Write an answer before submitting it."), which keeps voting readable and keeps screen readers useful.
- A player can upload a photo or draw one in the same paint editor as question images. Once a picture is attached the buttons read **Replace image** and **Edit drawing**, and the thumbnail has an **x** to remove it. Drafts (text and picture) stay on the screen when a player moves between their answers or when a live update arrives.
- The browser shrinks an upload to at most 960 px and about 500 KB before sending, because a room stores many of them (a room holds at most about 9 MB of pictures in all). A drawing is exported at 900 px at most. The server accepts the same image types and the same 3,000,000-character limit as question images.
- Voting tiles and the reveal show the picture above the answer text, no taller than 120 px on a phone, 150 px on a laptop and 220 px on a wide party screen. Its alt text is "Picture sent with this answer" and never names the writer.
- The host's **Answer review** during writing shows each picture next to the answer and its writer.
- Neither an answer's text nor its picture is sent to anyone until the vote opens; the writer's own answers are sent only to the writer (and the host's review).
- The host can remove an answer: its text and picture go. Kicking a player, or removing their media, removes their answer pictures too. Pictures are served from the room's media store and disappear with the room.

## Rules and numbers

- **Length:** Quick plays up to 8 rounds. Full room plays every player's prompt. Custom plays 1 to 20 rounds and starts at 8.
- **Voter points:** `round(500 − 250 × seconds used ÷ 14)`, so 500 for an instant vote down to 250 at the buzzer. Only voters for the winning answer score.
- **Author points:** the writer of every answer, winning or not, earns `round(500 × votes ÷ eligible players)`.
- **Winner:** the most votes. A tie goes to the fastest single vote, then the fastest average vote, then the answer's position.
- If someone never writes an answer, Skip fills it from the built-in catalogue.
- **Known issue:** other players' votes can be seen during voting. Planned: hiding them until the reveal: [2026-09-25 update](../plans/2026-09-25-update.md).
- Tapping a picture in a voting tile votes for that answer; there is no full-size view yet.

## Where it lives

| Part | Code |
| --- | --- |
| Engine | `packages/game-engine/src/herd.ts` — `buildHerdAssignmentPlan`, `buildHerdRoundResults` |
| Server | `standalone/server.js` — `beginHerdAnswerWriting`, `scoreHerdRound` |
| Server (answer images) | `standalone/server.js` — `submitHerdAuthoredAnswer`, `publicHerdAssignments`, `publicQuestion`, `publicHerdResults`; `standalone/server/media.mjs` — `pruneRoomMedia` |
| Browser | `standalone/public/app.jsx` — `PlayerHerdPreparation`, `HerdAnswerWriter`, `ImageUploadDrawPicker` (`compact`), `AnswerGrid`, `HerdLengthSelector`; `standalone/public/client/reveal.jsx` — `HerdRevealBreakdown` |
| Tests | `standalone/smoke-herd-flow.mjs`, `standalone/browser-herd-writing.mjs`, `packages/game-engine/test/herd.test.ts` |

## Related

- [Phases and timers](phases-and-timers.md), [Scoring](scoring.md), [Reveal and results](reveal-and-results.md)

## History

- 2026-08-26 — Herd arrives with the new game modes (`178d56b`).
- 2026-09-11 — Answer colours stop naming their authors (`c7328c9`), and the writing is shared evenly (`db54127`).
- 2026-10-08 — Per-player progress moves into the player cards (U18) and answers can carry an optional uploaded or drawn picture (U19).
