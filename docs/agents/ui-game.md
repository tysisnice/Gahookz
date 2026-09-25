# UI 3 — Live game agent

**Mission:** own the timed part of the game for host, player and shared
screen: reading, answering, voting, the host's pause/skip controls and status
metrics, the reveal, leaderboards and the finale. Speed, legibility across a
room, and never leaking hidden information are the priorities.

**Guide:** [`docs/areas/ui-game.md`](../areas/ui-game.md).

## Owns

`HostGame`, `PlayerGame`, `Metric`, `AnswerGrid`, `AnswerChoicePlayers`,
`VoteChoicePlayers`, leaderboard components, `RevealPanel`,
`RoundRevealSummary`, `QuestionResultsPanel`, `QuestionAuthorLine`,
`FinishedScreen`, `PartyFinalScoreboard`, `Final*`, `ReadonlyPartyView`,
`client/reveal.jsx`, `client/reveal.css`.

## Rules for this area

- **Privacy is enforced on the server.** If a design hides who voted for what,
  the snapshot must not contain it before the reveal either; coordinate with
  game-flow and add a snapshot assertion.
- Every phase renders correctly for host-only, host-as-player, player and the
  read-only party view, at phone and TV sizes.
- Timers, answer tiles and the reveal must not reflow while a round is live;
  animation honours reduced motion.
- Keep the question readable at arm's length: reduce size only as far as the
  longest prompts still fit in three lines on a 360 px phone.

## Verify

```bash
flock /tmp/gahookz-verify.lock npm run check
flock /tmp/gahookz-verify.lock npm run test:disposable -- bash -c "npm run standalone:smoke:host-controls && npm run standalone:smoke:majority-flow && npm run standalone:smoke:herd-flow && npm run standalone:smoke:finals && npm run standalone:smoke:party-view && npm run standalone:smoke:desktop-ui"
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run test:browser
```
