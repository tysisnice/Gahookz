# UI 3 — Live game — area guide

Last verified against the code: 2026-10-07, commit 3649a93

## Purpose

UI 3 owns the screens a room sees once the game starts: the question and its
answers while players read and answer, the reveal (spotlight, vote breakdown,
"Was this question good?"), the live leaderboard and the finale (winners,
party awards, final leaderboard, Congratulate and Boo). It also owns the
read-only **Party View** that lets a player watch the room from the host's
point of view.

Everything here is drawn inside the frame owned by [ui-shell](ui-shell.md) and
reads the same snapshot the shell's `useEvents` delivers; the lobby and
question-making screens before the game are [ui-lobby](ui-lobby.md) (that file
may still be in progress). Rules, scoring and timings belong to
[game-flow](game-flow.md) and the wiki, and are linked, not copied, here.

Shipped in the 2026-09-25 update (all merged, described as they are today):
**U20** Skip beside Pause, **U21** compact Question/Answers boxes, **U22** the
author on the Question chip's row, **U24** smaller question text, **U23** no
other player's pick before the reveal, with an "Answered" avatar row.

## What players see

- **Top bar** (shell): name, `Live` pill, room code, menu. Phase names such as
  "Reading", "Answering", "Majority Reveal" (`labelForPhase` plus the Majority
  or Herd reveal labels) sit on the **phase chip** on the question card.
- **Two compact boxes (U21)** under the bar: `Question 3/8` and `Answers 2/4`
  (answers received over active players). One line each, label left, value
  right, 40 px tall, side by side even at 360 px (`.quiz-meta-row.is-two-up`).
- **Timer row:** a progress bar (`TimerBar`) with, for the host only, the
  controls on its right: the round **Pause/Resume** button (46 x 34 px, amber
  pause, green play) and the blue **Skip** button (icon plus the word, U20,
  `title="Skip to the next phase"`). The row is shown during reading and
  answering; during the reveal it shows only for the first 3.5 s (the spotlight,
  `REVEAL_ANSWER_SPOTLIGHT_MS`) or whenever the viewer has host controls.
  Skip is no longer in the top bar.
- **Question card (U22, U24):** the phase chip on the left and, on the same
  row on the right, `By <author>` with the author's small avatar (shown only
  when the question has an author; it truncates with an ellipsis). The prompt
  is a `<h1>` at 2.6 rem on desktop, 2 rem at 920 px and below, 1.75 rem at
  640 px and below (about 13 % smaller than before; a 64-character prompt takes
  four lines at 360 px). Names a prompt mentions are bold on the player screen
  (`PromptText`; the host screen shows plain text). An optional question image
  sits beside or under the card (`.question-image`).
- **"Answered" row (U23):** inside the question card, once anyone has answered,
  the word `Answered` and a small avatar for each player who has (a status
  region, a pop-in animation unless reduced motion). It shows **who**, never
  **what**. No avatar appears on an answer tile before the reveal, except the
  viewer's own pick on their own tile.
- **Answer tiles** (`AnswerGrid`): four colour tiles. While reading, the text
  is hidden (`...`) and the tiles are not tappable; while answering a player
  taps one, it locks (`is-locked`, own tile `is-selected`) and the choice is
  sent optimistically. A soft "ooh" plays when new answers arrive after the
  first load of a question.
- **Live leaderboard** under the tiles during reading and answering
  (`GameLeaderboardPanel`, top 6, hint "Choose one friend to Gahook this
  question", the per-question Gahook button on each row; own row and used
  targets are disabled).
- **Reveal:** first the **spotlight** (`CorrectAnswerSpotlight`, 3.5 s, labelled
  "Correct answer", "Majority rules" or "The Herd favourite" with the avatars of
  everyone who picked it), then the **breakdown** (Majority or Herd: tie-break
  line, winner, fact-check box when the prompt came from verified content,
  the answer grid with every player's avatar now on their choice, and a
  score box), then the **vote**: "Was this question good?" (Herd: "prompt")
  with **Good** and **Nah**, voter avatars, and the leaderboard again. A
  host-only screen shows the vote as read-only counts. Quiz Classic has no
  breakdown panel; the grid itself shows the correct tile and dims the rest.
- **Finale:** "Final scores are in" with the winner or joint winners, then the
  **final leaderboard** (everyone, a **Boo** button per row), then **Party
  awards** (best question or prompt, last place, worst question or prompt,
  each with Congratulate or Send a boo). The host sees **New game with same
  rules** and **Reset Lobby**. A player with a saved career result sees a
  one-line status above the winners (queued, delivered, exhausted,
  unavailable).
- **Party View (player):** the player menu opens a read-only copy of the host
  screen ("Player controls" button to go back). In a game it is `HostGame`
  with Skip (host only) and no Pause; at the end it is `ReadonlyFinishedScreen`.

Herd answer writing and the **Herd answer images** are being changed by another
agent: **in progress**, not described here. See [Herd](../wiki/herd.md) for the
shipped rules.

## Code map

Matches the ui-game rows of the [ownership map](README.md#browser--standalonepublic).
Use function names, not line numbers; `standalone/public/app.jsx` is about
5,500 lines.

| Concern | Where |
| --- | --- |
| Host screen for live phases: `HostGame` (used by `HostView`, and by `ReadonlyPartyView` for Party View) | `standalone/public/app.jsx` |
| Player screen: `PlayerGame` (also what a host who joined as a player sees, with Pause and Skip) | `app.jsx` |
| `Metric`, `AnswerGrid`, `AnsweredPlayersRow`, `AnswerChoicePlayers`, `withOptimisticAnswerSelection`, `SkipPhaseButton` | `app.jsx` |
| `GameLeaderboardPanel`, `LeaderboardList`, `LeaderboardStrip`, `getPokeFlashClass`, `questionUseIds` | `app.jsx` |
| Reveal: `RevealPanel`, `RoundRevealSummary`, `CorrectAnswerSpotlight`, `getRevealAnswer`, `useRevealIntro`, `VoteChoicePlayers`, `REVEAL_ANSWER_SPOTLIGHT_MS` (3500) | `app.jsx` |
| Reveal breakdowns, `FactCheckPanel`, `PromptText`, `tieBreakLabel` (`AnswerGrid` is passed in as a prop to avoid an import cycle) | `client/reveal.jsx`, `client/reveal.css` |
| Finale: `FinishedScreen` (host), `PartyFinalScoreboard` (player), `ReadonlyFinishedScreen`, `FinalSpotlightRow`, `FinalShameRow`, `FinalGahookCard`, `FinalReadOnlyCard`, `getFinalSpotlights`, `finalModeLabels`, `QuestionResultsPanel`, `QuestionAuthorLine` | `app.jsx` |
| Party View: `ReadonlyPartyView` | `app.jsx` |
| Server side of U23: `publicAnswerSelections` (called while building each snapshot's `answerSelections`) | `standalone/server.js` |
| Shared with ui-shell and not owned here: `TimerBar`, `PauseButton`, `useCountdown`, `HostTopBar`, `labelForPhase` | `app.jsx` |
| Styles | see *CSS organisation* below |

Mounted here, owned elsewhere: `ModeTutorialLauncher` (ui-lobby; auto-opens the
"How to play" dialog once per mode on a player's first game screen),
`GahookRoster` and the Gahook layers in `PlayerView` (social), `AvatarBadge`
(ui-lobby).

## How it works

### Which component renders when

`HostMode` (a host who is not playing) returns `FinishedScreen` for `finished`
and `HostGame` for every other live phase. `PlayerView` returns `PlayerGame`
for any phase that is not `lobby`, `building` or `herd-writing`; `PlayerGame`
itself switches to `PartyFinalScoreboard` when the phase is `finished`.
Both screens branch on `lobby.phase`:

| Phase | Shown |
| --- | --- |
| `reading` | question, hidden tile text, Answered row, leaderboard |
| `answering` | the same with tappable tiles (player only), host controls on the timer row |
| `reveal` | spotlight for 3.5 s, then `RevealPanel` |
| `finished` | the finale |

`roundActive` (`reading` or `answering`) gates the Answered row and the live
leaderboard. During the reveal the server's phase length is split: the first
`REVEAL_ANSWER_SPOTLIGHT_MS` is the spotlight, the rest (never under 1 s) is the
vote timer inside `RoundRevealSummary`. Durations come from
`lobby.phaseDurations`; see [phases and timers](../wiki/phases-and-timers.md).

### How state reaches the screens

These screens hold almost no state of their own. The shell's reducer holds the
last snapshot (`lobby`); the fields used here are `phase`, `currentQuestion`,
`currentQuestionIndex`, `totalQuestions`, `answerCount`, `activePlayerCount`,
`answerSelections`, `ownAnswer`, `ownVote`, `players`, `leaderboard`,
`phaseEndsAt`, `phaseDurations`, `paused`, `pausedRemainingMs`,
`phaseWaitingForProgress`, `ownGahookUses`, `winners`/`losers`,
`questionResults` and `ownPlayer.careerResultStatus`. Actions go through `api`:

| Action | Request |
| --- | --- |
| Answer | `POST /api/answer` (optimistic `OPTIMISTIC_ANSWER`, rolled back with `ROLLBACK_OPTIMISTIC_ANSWER` and `forceSnapshotRevert` on failure; 1 s timeout) |
| Pause, Skip | `POST /api/host/pause` (`{ paused }`), `POST /api/host/skip` |
| Phase finished early | `POST /api/player/progress` (from `TimerBar`'s `onComplete`; players only, the host's own bar does not call it) |
| Vote Good/Nah | `POST /api/question/vote` (optimistic `OPTIMISTIC_VOTE`) |
| Gahook during a round | `POST /api/player/round-poke`; reveal and Party View use `/api/player/poke`; host uses `/api/host/poke` |
| Finale | `POST /api/player/final-poke` or `/api/host/final-poke` with `finalKind` `congrats` or `boo`; `POST /api/host/new-game`, `POST /api/host/reset` |

### U23: what a snapshot says about answers

`publicAnswerSelections(room, viewerPlayerId)` returns `[]` outside `answering`
and `reveal`. In `answering` it drops the question author's own answer for
everyone but that author, then, because nobody may learn another player's pick
(a late answerer could copy), returns for other players only
`{ playerId, answeredAt, isOwn: false }` and for the viewer
`{ playerId, answerId, answeredAt, isOwn: true }`. In `reveal` every entry
carries `answerId`. This is the same for every mode (Classic, Majority, Herd),
every role (host, player, party view) and the SSE stream. The client therefore
cannot draw a pick it does not have: `AnswerGrid` groups by `answerId`, so
tiles show only the viewer's own avatar before the reveal, and
`AnsweredPlayersRow` shows who has answered from `playerId` alone.
`withOptimisticAnswerSelection` adds the viewer's pick at once, before the
server's snapshot arrives. Never add an `answerId` to another player's entry
in the client or the server.

### The reveal

`useRevealIntro` is true for the first 3.5 s of the reveal (it respects pause).
Then `RevealPanel` picks `MajorityRevealBreakdown` (reads `question.majorityResults`),
`HerdRevealBreakdown` (reads `question.herdResults`; shows points for the vote,
for the answer and the round total; the copy says "up to 500 points" for each,
which is Herd's scoring and lives in [scoring](../wiki/scoring.md)) or nothing for
Quiz Classic, followed by `RoundRevealSummary`. Both breakdowns reuse
`AnswerGrid` with `reveal`, which marks the correct tile (`is-correct`, "OK")
and dims the rest, shows each Herd answer's author and `authoredPoints`, and
shows the avatars of everyone who picked each tile. The Majority copy states
the exact author-bonus rule; the Herd and Majority screens never call a vote
winner "correct". The `FactCheckPanel` is separate from the winner on purpose.

### Finale

`getFinalSpotlights(lobby)` works out winners (`winners`, else `winner`, else
everyone on the top score), losers (only when someone scored lower than the
top; a winner is never also a loser), and the best and worst question's author
from `questionResults`. Mode changes the award titles (Herd says "prompt").
`FinalGahookCard` sends the Congratulate or Boo and shows the effect at once
(`OPTIMISTIC_POKE`); `readonly` cards omit the button. `FinishedScreen` also
speaks the winners once (`speakText`); the fanfare and cheer come from the
shared audio cues ([audio-art](audio-art.md)).

### CSS organisation

All in `standalone/public/styles.css` (ordered by history, so search by class)
plus `client/reveal.css` for the fact check and reveal breakdown.

| Section | Selectors |
| --- | --- |
| Meta boxes (U21) | `.quiz-meta-row`, `.quiz-meta-row.is-two-up`, `.metric-row` |
| Stage and timer | `.question-stage`, `.game-timer-row`, `.timer-bar`, `.pause-game-button`, `.host-round-controls`, `.skip-phase-button` |
| Question card | `.question-copy`, `.question-copy h1`, `.phase-chip`, `.question-copy-head`, `.question-author-line`, `.question-image` |
| Answered row (U23) | `.answered-players-row`, `.answered-players-label`, `.answered-players-avatars`, `.answered-player` |
| Tiles | `.answer-grid`, `.answer-tile`, `.answer-<id>`, `.answer-choice-players`, `.is-locked`, `.is-selected`, `.is-correct`, `.is-dimmed` |
| Reveal | `.correct-answer-spotlight`, `.majority-reveal-breakdown`, `.round-score-breakdown`, `.reveal-round-summary`, `.vote-panel`, `.vote-button`, `.vote-count` |
| Leaderboard | `.leaderboard-list` (and `.is-large`), `.leaderboard-strip`, `.reveal-leaderboard-panel`, `.game-leaderboard-panel` |
| Finale | `.winner-band`, `.finale-*`, `.final-gahook-card`, `.question-results`, `.final-party-grid`, `.party-final-actions` |

Breakpoints that matter for these screens (each rule writes its own query):
`max-width: 1250px`, `920px` (question text 2 rem; two-column leaderboard
strip), `min-width: 761px` with `max-width: 920px`, `760px` (two queries) and
`640px` (question text 1.75 rem, shorter vote buttons, image height
`min(48vh, 400px)`). `prefers-reduced-motion: reduce` switches off the Answered
pop-in. There is no breakpoint for the answer tiles beyond these.

Responsive and accessibility rules: nothing may scroll sideways at 360 px; the
two meta boxes stay on one row; the author line truncates instead of wrapping;
the Answered row is `role="status"` with an `aria-label` listing the names and
each avatar carries a `title`; the spotlight is `role="status" aria-live="assertive"`;
the timer has an `aria-label` ("12 seconds left" or "Game paused"); Pause is
labelled "Pause game"/"Resume game"; disabled Gahook buttons explain why in
their `title`. Final cards wrap long names (`overflow-wrap: anywhere`).

## Invariants

- **No pick before the reveal.** Another player's `answerId` must not appear in
  any pre-reveal snapshot, in any mode or role; the client must not infer it.
  The Answered row shows who, never what (U23).
- **The question author does not appear as answered to others** during
  `answering`; only the author sees their own entry.
- **Skip and Pause live on the timer row**, together, host only. The top bar
  has neither. A host in Party View gets Skip but no Pause.
- **Keep both game screens in step.** `HostGame` and `PlayerGame` duplicate
  the meta boxes, the question card and the timer row; change both. The smokes
  check source text in both.
- **Player-written text is rendered by React, never as markup** (`PromptText`
  splits the string; names are never put in HTML).
- **The reveal never relabels a vote winner as the correct answer** in
  Majority or Herd, and states the tie-break rule that actually applied.
- **One Gahook per question** is enforced by the server; the client only
  disables the buttons (`questionUseIds`).
- Do not edit the generated `app.js`; edit `.jsx`, rebuild, and commit the
  stamped files ([ui-shell](ui-shell.md)).

## Tests

Run with Node 24 under the shared lock:

```bash
flock /tmp/gahookz-verify.lock npm run check
flock /tmp/gahookz-verify.lock npm run test:disposable -- bash -c "npm run standalone:smoke:layout && npm run standalone:smoke:finals && npm run standalone:smoke:party-view && npm run standalone:smoke:host-controls && npm run standalone:smoke:majority-flow && npm run standalone:smoke:herd-flow && npm run standalone:smoke:roles"
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run test:browser
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run test:browser:desktop-ui
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run test:browser:mobile
```

What each covers: `smoke-layout` (CSS declarations, answer grid source),
`smoke-finals` (shared leaderboard panel used in rounds, reveal and finale),
`smoke-party-view` (host views use the party components), `smoke-host-controls`
(pause and resume in every phase), `smoke-majority-flow`, `smoke-herd-flow` and
`smoke-roles` (U23: no `answerId` for other players before the reveal, own pick
kept, choices present at the reveal, Party View included; `smoke-roles` covers
Classic), `browser-flow` and `browser-desktop-ui` (a real game through
Chromium) and `browser-mobile-ui` (phone geometry). Most smokes assert source
text, so moving code means updating the assertion. No unit test covers these
components; a build alone does not prove a layout, so look at a screenshot.

**Taking screenshots.** Both harnesses refuse any base other than
`http://127.0.0.1:3199`. The reference script is
`docs/verification/2026-09-25-update/ui-game/capture-shots.mjs`: it creates a
room over the API, plays to the answering phase with two of four players
answered, then opens one browser context per viewer and captures the host and a
player at 1280x800 and 390x844 (and 360 px for the longest prompt). Run it with
`npm run test:disposable -- node docs/verification/2026-09-25-update/ui-game/capture-shots.mjs`
under the lock, after `npm run build`. Output goes to that folder; evidence is
append-only, so commit re-captures only in the current update's folder. Setup
conventions (`setViewport` with `deviceScaleFactor`, seeding `gahookz-client-key`
and `gahookz-how-to-play-seen-v2-<mode>` so the tutorial does not cover the
screen) are in [ui-shell](ui-shell.md#tests).

## Common changes

- **Add something under the question:** put it in the `question-copy` block of
  **both** `HostGame` and `PlayerGame`, gate it with `roundActive` if it is only
  for answering, and never read a pick from another player's selection.
- **Change a size on the question card:** edit `.question-copy h1` and its
  two media overrides (920 px, 640 px), then check a long prompt at 360 px.
- **Add a host control:** put it in `.host-round-controls` beside Pause and
  Skip, pass the handler from `HostMode` and from `PlayerGame`'s host branch,
  and add a case to `smoke-host-controls`.
- **Change the reveal for one mode:** edit the breakdown in `client/reveal.jsx`;
  keep `AnswerGrid` a prop. The result fields come from the server's
  `publicMajorityResults`/Herd results ([game-flow](game-flow.md)).
- **Add a finale award:** extend `getFinalSpotlights`, `finalModeLabels` and
  `FinalShameRow`, and the server's `questionResults` if it needs data.
- **Show more about who answered:** only data in `publicAnswerSelections` may
  be used. Anything more is a server change and a U23 regression test first.

## Known issues

- `.host-skip-phase-button` rules in `styles.css` are left over from the old
  top-bar Skip; no component uses the class now.
- `HostGame` shows the prompt as plain text; `PlayerGame` bolds named players
  (`PromptText`).
- `smoke-layout` still carries an assertion message ("Ordinary live answer
  choices should show player identities") that predates U23; its check is
  `!anonymous={!reveal}`, which still holds.
- The Herd answer-writing and Herd answer image changes were in progress when
  this guide was written; the reveal text for Herd may change.
- `backlog.md` still lists the pre-U23 leak of other players' picks as open;
  U23 is merged. Close that line.

Live backlog: [`../backlog.md`](../backlog.md). Feature pages:
[reveal and results](../wiki/reveal-and-results.md), [finale](../wiki/finale.md),
[phases and timers](../wiki/phases-and-timers.md), [Herd](../wiki/herd.md),
[Majority Rulez](../wiki/majority-rulez.md).
