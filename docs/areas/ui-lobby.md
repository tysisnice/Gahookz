# UI 2 — Lobby & creation — area guide

Last verified against the code: 2026-10-08, commit d467261 (branch `agent/docs-ui`)

## Purpose

UI 2 owns everything a person sees between opening Gahookz and the first live
round: the welcome screen, the join and profile form, the lobby (host setup and
player waiting room), the question-time screens where players make content, the
Herd answer-writing screen, and the tools those screens use: the paint editor,
the image picker, the Number wheel, the force-start dialog and the How to play
dialog. It also covers the look of the custom Gahook creator, whose file is
owned by social.

The wave-1 (`lobby-setup`: U2, U3, U4, U6, U17) and wave-2 (`lobby-creation`:
U7, U8, U9, U13, U14, U15) changes of the 2026-09-25 update are shipped and
described as they stand. **U18 (writing progress in the player cards) and U19
(images on Herd answers) are in progress, see the
[2026-09-25 update plan](../plans/2026-09-25-update.md); this guide describes the
Herd writing screen as it is today.**

Rules that bind this area: guest play never needs an account (the account panel
is optional, `CLAUDE.md` rule 1); the server, not a hidden button, enforces every
host rule ([game-flow](game-flow.md)); a refused request rolls the screen back.

## What players see

- **Welcome (`/`).** "Make a room, drop a code, GAHOOK." A **Join / Host** pair
  of buttons, a four-letter **Room word** box (prefilled from `?room=`, a random
  placeholder word), an optional **Use password** switch, and the button
  **Join room** or **Create room**. Below: **How to play & tutorials** (the
  overview, Quiz, Herd and Host tabs) and **Rules, terms & privacy**. A wrong
  password plays the jump scare "Wrong password".
- **Join form.** One scrolling page under a "Joining the room / Choose your
  player" banner: a live preview card (picture, name, room), **Your name** (24
  characters, a random funny animal name the first time), **Profile picture** in
  one grid (Draw, Random, then 23 presets, no inner scroll box; four columns on a
  phone, six or seven on a desktop; the selected tile has a ring and a tick), an
  optional **Password** field and a sticky **Join** footer that sits above the
  on-screen keyboard. **Draw** opens a 384 px square paint dialog. If the host
  turned off custom profile pictures, Draw is absent. The optional account panel
  sits underneath.
- **Edit profile.** The same form from the menu, titled "Make your player look
  right", with **Cancel** and **Save changes**.
- **Host lobby ("Party View" in the code, **Lobby** pill).** A **Share Lobby
  Code** band (code, link, QR; tap to copy the link), the room explainer
  (dismissable per room and device), the last game's winner box, the **Players**
  wall with a count and the **Draw** (then **Done**) and **Erase mine** buttons in its heading row,
  then the control panel: **Lobby rules** (opens a dialog), the **Game** cards
  (Quiz, Herd; each is an icon beside a larger title with the description on
  the row below, plus a **How to play** button), **Game length**, **Majority
  Rulez** (Quiz only) and **Begin Game**. A host who is not playing sees a
  **Join game as player** card in the grid.
- **Game length (U2, U6).** One segmented row, Quick / Standard / Custom for Quiz
  and Quick / Full room / Custom for Herd; the selected option's description sits
  at the end of the "Game length" heading. Custom shows a **Number wheel**
  (Quiz: Questions per player 1 to 5; Herd: Rounds 1 to 20). A one-line summary
  ("12 questions · 4 players") has an (i) tip explaining the total.
- **Lobby rules dialog.** Sections Questions (approve questions switch, Funny or
  Educational prompts), Gahook effects (Off, Visual only, Chaos, a help list with
  the live point values, two personal switches for this device, 1v1 duels),
  What players may bring (custom profile pictures, custom Gahooks). **Save
  changes** sends everything at once; Escape, Back and Cancel discard.
- **Player waiting room.** The same wall, read-only cards (each with a
  **Vote kick** and **Challenge to 1v1** menu and the Gahook button), the
  "host is choosing the game" banner and the chat.
- **Question time (`building`).** Players see "Make N questions" and, in the
  right column, the heading **Create questions** (**How to play** on the same
  row, U8), their submitted questions (each with an edit pencil), then the
  **Question builder**: a suggestion button, the question box (4 to 180
  characters), an optional image (Upload image / Draw image), two to four
  answers with a radio for the right one (Majority Rulez: an optional
  prediction; Herd: only the prompt), **Submit question**, and **Ready up** once
  all are in. The host sees the locked options, the Ready count, the approval
  panel (if approval is on), **Start ...** and **Enter as player**.
- **Force start.** If not everyone is ready the start button looks muted (`is-force-start`); a tap
  asks "Players are not ready, start anyway with generated questions?" with
  **Wait for players** and **Force start game**.
- **Herd writing (`herd-writing`) today.** Players see "Write N possible
  answers": the progress meter and per-player cards ("2/4 answers · writing"),
  then one card per assignment (author, prompt, the prompt's image if any, a
  single text box of up to 80 characters), **Submit all answers** and **I'm done
  — ready up**. The host sees the progress and an **Answer review** grid, then
  **Start live Herd**. U18 and U19 are in progress, see the 2026-09-25 update
  plan; neither is in this branch (the player cards still read "In lobby" and
  an answer has no image).
- **Paint editor** (profile picture, question and image drawing): rows Undo /
  Clear canvas / Upload, then three brush sizes and Brush / Eraser, then 11
  colour swatches plus a rainbow custom colour, the canvas, and an export button
  ("Use this profile picture", "Use this image"). No subtitle; the status line
  shows only errors.
- **Custom Gahook creator** (from the Gahook picker in the menus): name, one to
  three pose frames, background colour, effect, sound (record or upload); the
  background picker (U15) is in-app: 38 swatches, Hue and Shade sliders, a hex
  box and a live preview.
- **How to play** dialog: tabs Quiz and Herd (plus Gahookz overview and Host
  where offered), three numbered steps with artwork, **Let's Go!**. It opens
  once by itself the first time a mode is seen on a device.

## Code map

Matches the ui-lobby rows of the [ownership map](README.md#browser--standalonepublic).
Use function names, not line numbers; `app.jsx` is about 5,500 lines.

| Concern | Where |
| --- | --- |
| Welcome: `WelcomeScreen`, `EntryModeArt`; password and prefill helpers (`getWelcomePrefill`, `getUrlPassword`, `saveRoomPassword`, `getSavedRoomPassword`, `buildWelcomePath`) | `standalone/public/app.jsx` |
| Join and profile: `JoinScreen`, `JoinPlayerPreview`, `useKeyboardInset`, `AvatarPicker`, `ImageUploadDrawPicker`, `shrinkImageFile`, `AvatarBadge`, `makeAvatarImage`, `animalAvatarArt`, `AVATAR_PRESETS`, `getSavedJoin`, `saveJoinSession` | `app.jsx` |
| Host lobby and setup: `HostLobby`, `GameFamilySelector`, `RoundPresetSelector`, `HerdLengthSelector`, `LengthPresetSegments`, `MajorityScoringToggle`, `ModeTutorialLauncher`, `ModeArt`, `LobbyCodeBand`, `PreviousGameSummary`, `HostRulesModal`, `RuleToggleRow`, `GahookEffectsHelp`, `LockedRulesSummary`, `BannedPlayersPanel` | `app.jsx` |
| Player lobby and cards: `PlayerWaitingLobby`, `PlayerLobby`, `PlayerCard`, `ReadonlyPlayerCard` | `app.jsx` |
| Question time: `HostBuildingLobby`, `QuestionBuilder`, `SubmittedQuestionList`, `QuestionApprovalPanel`, `ForceStartControl` | `app.jsx` |
| Herd writing: `HostHerdPreparation`, `PlayerHerdPreparation`, `HerdPreparationProgress`, `HerdAnswerWriter` | `app.jsx` |
| Number wheel (U6) | `client/number-wheel.jsx`, `client/number-wheel.css` |
| Paint editor: `SimplePaintEditor`, `getBoundedCanvasSize` | `client/drawing.jsx` |
| How to play: `GameTutorial`, `TUTORIAL_CONTENT` (artwork: `tutorial-art.jsx`, audio-art) | `client/tutorial.jsx` |
| Custom Gahook creator: `CustomGahookCreator`, `BackgroundColourPicker`, `BACKGROUND_PICKER_SWATCHES` (file owned by social; the dialog around it is in `GahookFormPicker`, `app.jsx`) | `client/custom-gahook.jsx` |
| **Not yet in the ownership map:** `LengthPresetSegments`, `useKeyboardInset`, `client/number-wheel.*` | as above |

Mounted here, owned elsewhere: `HostTopBar`, `RoomStatusBanner`, `QuickMenu`s
(ui-shell); `LobbyPaintSurface`, `RoomSocialHub`, `GahookDuelArena`
(social); `AccountPanel` wraps `client/account.jsx` (accounts); `HostGame`,
`PlayerGame` (ui-game).

## How it works

### Which screen renders when

`HostMode` and `PlayerView` (ui-shell plumbing) pick the screen from
`lobby.phase` and `lobby.ownPlayer`:

| Phase | Host (not playing) | Player, or host playing |
| --- | --- | --- |
| no `ownPlayer` | `HostLobby` | `JoinScreen` (new player) |
| `lobby` | `HostLobby` | `PlayerWaitingLobby` |
| `building` | `HostBuildingLobby` | `PlayerLobby` (the host also gets approval panel and start button) |
| `herd-writing` | `HostHerdPreparation` | `PlayerHerdPreparation` (the host also gets the start button) |
| later | ui-game | ui-game |

`HostMode` shows the player workspace when the host has a player and the phase
is past `lobby`, when "Join game as player" is open (`joiningAsPlayer`) or when
profile editing is open; **Enter as player** re-joins silently with the saved
join (`enterAsPlayer`) if the saved code matches, otherwise opens `JoinScreen`.
The phase labels in the top bar come from `HostTopBar`: `Join`, `Lobby`, `Live`.

### The welcome and join flow

- `WelcomeScreen` posts `/api/room` with `{ code, playerKey, passwordEnabled,
  password, intent }` (`join` or `host`; choosing Host fills a random word if the
  box is not four letters) and then `navigateTo("/CODE")`. The password is kept
  in `sessionStorage` per room (`roomPasswordKey`); `?pwd=` is read once and
  removed from the URL (`getUrlPassword`).
- `JoinScreen` posts `/api/player/join` (new) or `/api/player/profile`
  (editing). Both use `{ refresh: false }` and then `window.gahookzRefreshSnapshot`.
  Editing is optimistic (`OPTIMISTIC_PLAYER_PROFILE`) and rolls back through
  `forceSnapshotRevert` on a refusal. `wrongPassword` and `banned` replies play
  the jump scare and sound before the toast.
- **Saved identity** is local: `gahookz-last-join` (`getSavedJoin`,
  `saveJoinSession`; a stray `password` field is stripped on read and write).
  A signed-in player's saved look overrides it through `onAccountProfile` and
  `useAccountJoinPrefill` (accounts); the form stays editable.
- **Pictures.** `AVATAR_PRESETS` is `AVATAR_BASE` (23 entries) rendered to
  SVG data URLs by `makeAvatarImage` / `animalAvatarArt`. A drawn picture keeps
  the first preset's id underneath it, so a preset only shows selected when there
  is no drawing. `allowCustomProfiles` (a room rule) hides Draw and clears any
  drawn image.
- `useKeyboardInset` reads `visualViewport` and sets `--join-keyboard-inset` on
  the form when the keyboard covers more than 80 px, so the sticky Join footer
  rises above it. Pinch-zoom is ignored.

### Lobby setup and the optimistic settings pattern

`HostLobby` never edits the lobby directly. Each control calls a handler from
`HostMode.hostAction`, which posts `/api/host/settings` (or `/api/host/lock-setup`
for **Begin Game**) with `{ refresh: false }`, applies an `OPTIMISTIC_HOST_SETTINGS`
patch for the keys it knows (`gameMode`, `gameFamily`, `quizScoring`,
`approveQuestions`, `roundPreset`, `allowCustomProfiles`, `allowCustomGahooks`,
`promptStyle`, `herdRoundTarget`), and on a refusal restores the previous values,
calls `forceSnapshotRevert` and shows the toast. Two controls keep a request
counter (`questionLimitRequestRef`, `roundPresetRequestRef`) so a late answer to
an older tap cannot overwrite a newer one. The visible plan (total questions, the
duration estimate) is computed by `plannedQuestionsForLobby`,
`estimatedRoundDurationMs` and `formatDurationEstimate`, and shown as zero until
the server's plan matches the selection (`serverPlanMatchesSelection`).

- **Game family and scoring.** `GAME_FAMILIES` has two entries, Quiz and Herd;
  Majority Rulez is a scoring switch (`familyOf`, `scoringOf`) shown only for Quiz.
  `GAME_MODES` still lists three ids for tutorials and old records.
- **`LengthPresetSegments`** (U2) is a `role="radiogroup"` of `role="radio"`
  buttons with a roving tab index; arrow keys move and select, Home and End jump.
- **`NumberWheel`** (U6) is the `role="spinbutton"`; it shows `value` and asks the
  parent for a new one, so the server stays authoritative and a clamped number
  scrolls back. A swipe commits once, 140 ms after the strip stops
  (`SETTLE_MS`); arrows step 1, Page Up and Page Down step 5, Home and End jump;
  the buttons are `tabIndex=-1` pointer shortcuts; reduced motion turns smooth
  scrolling off. Limits in this area: Quiz 1 to 5 per player, Herd 1 to 20
  (`HERD_CUSTOM_ROUNDS_MAX` mirrors `HERD_MAX_CUSTOM_ROUNDS` in `server.js`).
- **Lobby rules** (`HostRulesModal`): the draft is reset on the render that opens
  the dialog, Save sends one request carrying `settingsRevision` (a stale Save is
  refused whole), the dialog traps Tab, Escape and Back cancel, and focus returns
  to the **Lobby rules** button. Wiki: [lobby rules](../wiki/lobby-rules.md).
- **Share band** (U17): `LobbyCodeBand` reads "Share Lobby Code"; the compact
  variant is used on the question-time screens.
- **Tutorial launch.** `ModeTutorialLauncher` opens `GameTutorial` and, with
  `autoOpen`, does so once per device and mode, remembered in
  `gahookz-how-to-play-seen-v2-<mode>` (`host` for the host lobby, the game mode
  for players). Setting that key is how tests keep the dialog off the screen.

### Question time

`PlayerLobby` computes `slotsUsed`, `remaining` and `canReady` from
`ownPlayer.questionSlotsUsed` and `lobby.maxQuestionsPerPlayer`. `QuestionBuilder`
holds the draft, posts `/api/question` (or `/api/question/edit`), and:

- fetches suggestions from `/api/question/suggest` (one server-side source; the
  host's Funny or Educational choice applies). A Herd suggestion fills only the
  prompt; a Quiz one selects the verified answer only when the server named it;
- is optimistic when approval is off (`OPTIMISTIC_QUESTION_SUBMITTED`, rolled
  back by `ROLLBACK_OPTIMISTIC_QUESTION`), with a 1.2 s timeout, and puts the
  draft back on failure; with approval on it reports "Question sent for host
  approval.";
- needs a text of at least 4 characters (180 maximum), and for Quiz two to four
  non-empty answers with one chosen; Majority Rulez's chosen answer is a
  `predicted` flag; Herd sends `answers: []`;
- editing a submitted question un-readies the player first (`beginQuestionEdit`).

`ForceStartControl` takes `canStart` (everyone ready), `canForceStart` and the
dialog copy; it closes itself when `canStart` becomes true and on Escape or
Back. Herd uses the labels "Deal out answer prompts" and "Start live Herd" and
its own dialog copy.

### Herd writing (current)

`PlayerHerdPreparation` reads `lobby.ownHerdAssignments`; drafts live in local
state keyed by `questionId`; **Submit all answers** posts `/api/herd/answer` once
per assignment and then `/api/player/ready`, stopping at the first error and
keeping every draft. The roster uses `ReadonlyPlayerCard` with
`showQuestionStatus={false}`. `HerdPreparationProgress` shows the meter and a
`herd-writer-card` per writer. **In progress (U18, U19):** per-card progress and
answer images; update this section and the screen list when that work merges.

### Pictures, drawing and uploads

- `ImageUploadDrawPicker` (question images) accepts PNG, JPEG, WebP or GIF up to
  20 MB, runs `shrinkImageFile` (longest side 1500 px, WebP at quality 0.84,
  lowering quality then scale up to eight times until the data URL is at most
  2,400,000 characters) and can open the paint editor (720 x 480, exported at most
  900 px, WebP 0.82) in a portalled `creation-modal`.
- `SimplePaintEditor` is the one paint editor. Props that matter: `width`,
  `height`, `maxExportDimension`, `mimeType`, `imageQuality`, `maxUploadBytes`,
  `allowUpload`, `exportLabel`. Defaults: 11 palette colours, brush sizes 4, 12
  and 28 px, 12 undo steps, canvas capped at 1024 px, upload limit clamped to
  100 KB to 20 MB. Two canvases (a base for an uploaded picture, a layer for
  strokes) so Clear can keep or drop either; drawing uses pointer events with
  `touch-action: none`; the status line is a `role="status"` that is visually
  hidden unless it is an error. The custom colour is still the native colour
  input (only the custom Gahook creator got the in-app picker, U15).
- The profile-picture dialog is 384 px square, WebP 0.82. Unlike the image
  picker's dialog it is not portalled: `JoinScreen` renders its
  `creation-modal-backdrop` in place (fixed positioning, `--z-modal`).
- **Lobby paint** (Draw / Done / Erase mine over the wall) is social's
  `LobbyPaintLayer`; U9 only fixed where its buttons go: it portals them into the
  empty `.lobby-paint-slot` in the "Players" heading row. Every lobby screen
  including `HostHerdPreparation`'s "Answer review" heading provides one; the
  player's Herd roster does not, so there the buttons fall back to floating at
  the wall's corner.

### Custom Gahook creator

`GahookFormPicker` (shell menus) lists the built-in Gahooks and one button per
custom slot; the creator opens in a portalled `creation-modal custom-gahook-modal`
(`role="dialog"`, label "Make your own Gahook"). `CustomGahookCreator` is
self-contained and hands the result to `onSave`; the server validates it
([social](social.md), `server/custom-gahook.mjs`). Client-side limits: name 32
characters, up to 3 pose frames (each under 130 KB by default, lowered by the
room's limits), 8 preset background colours, 4 effects (shake, spin, bounce,
zoom), 6 sounds (bonk, honk, boing, airhorn, silent, My sound), a recording up to
5 s (1 to 10 s allowed) or an uploaded sound under 200 KB. `BackgroundColourPicker`
(U15) has 38 swatches (the 8 brand colours, 12 bright, 12 deep, 6 neutrals), Hue
and Shade sliders, an editable hex box and a live preview of the Gahook. Pose
frames are drawn with `SimplePaintEditor`. Wiki: [custom Gahooks](../wiki/custom-gahooks.md).

### The How to play dialog

`GameTutorial({ mode, open, onClose, includeHost, allowedModes })` renders tabs
from `TUTORIAL_CONTENT` (`overview`, `quiz`, `herd`, `host`; there is no Majority
Rulez tab since U7). The default tab list is Quiz and Herd, plus Host when
`includeHost`; the welcome screen passes all four. The dialog is a
`role="dialog" aria-modal`, tabs follow the arrow-key pattern, Escape and a
backdrop tap close it, Tab is trapped, and focus returns to the opener. It is not
portalled and freezes the page itself through `document.body.style.overflow`
(not `useScrollLock`); its callers register it with `useBackToClose`. Step
numbers are centred with a grid (U13). Wiki: [tutorials](../wiki/tutorials.md).

### CSS organisation

All in `standalone/public/styles.css` (about 11,800 lines) except
`client/number-wheel.css`. Find a section by its class prefix; the comment
headers worth knowing are "Social waiting room", "Reusable paint surface and
creation dialogs", "Custom Gahook creator", "Final cascade for the lobby
refinement (kept after every legacy breakpoint)", "Herd uses the Quiz shell, with
one focused cooperative writing intermission" and "In-app background colour
picker for custom Gahooks".

| Area | Class prefixes |
| --- | --- |
| Welcome and join | `.welcome-*`, `.join-form`, `.party-join-form`, `.join-player-preview`, `.avatar-picker`, `.avatar-choice` (`--avatar-tile` 84 px, 70/64/60 px in narrower queries) |
| Lobby shell | `.host-lobby`, `.host-lobby-layout`, `.social-lobby-layout`, `.setup-lobby`, `.building-lobby`, `.room-status-banner`, `.code-band`, `.player-wall`, `.player-grid`, `.player-card`, `.lobby-paint-slot` |
| Setup | `.mode-selector`, `.round-preset-*`, `.majority-toggle`, `.locked-options-summary`, `.rules-modal`, `.rules-*`, `.force-start-*`, `.number-wheel*` |
| Question time | `.question-creation-heading`, `.question-builder`, `.builder-*`, `.submitted-question-*`, `.image-upload-draw-picker` |
| Herd writing | `.herd-*` (progress, writer cards, review grid) |
| Dialogs and tools | `.creation-modal*`, `.avatar-paint-modal`, `.simple-paint-editor*`, `.colour-picker*`, `.custom-gahook-*`, `.tutorial-*` |

Breakpoints that touch these classes (there are no tokens; each rule writes its
own): `max-width` 350, 360, 380, 420, 480, 520, 560, 640, 760, 840, 900, 920 px;
`min-width: 921px` and `min-width: 1360px` for the desktop lobby; `min-width:
761px` with `max-width: 920px` for a phone held sideways (the setup columns);
`max-width: 900px` with `max-height: 560px` for the join form in short landscape;
`max-width: 640px` with `max-height: 520px` for the share band; and
`prefers-reduced-motion: reduce` for the rules dialog. Overlays use the shell's
`--z-modal` ([ui-shell](ui-shell.md#the-overlay-system-and-z-index-scale)).

### Accessibility conventions

Segments are a radio group, the wheel a spinbutton, switches are `role="switch"`
(`ToggleSwitch`, shell); dialogs are `role="dialog" aria-modal="true"` with a
label; the join preview and plan summary are `aria-live="polite"`; avatar tiles
are `aria-pressed` buttons; icon-only buttons have an `aria-label`; the paint
editor's canvas is a labelled `role="img"` with a hidden how-to paragraph and its
status is announced; nothing depends on hover.

## Invariants

- **Guest play never needs an account.** The join form works with no sign-in;
  the account panel only prefills.
- **The server is authoritative.** Every setting change is optimistic with
  rollback; the number wheel never owns its value; the visible plan is not shown
  as fact until the server's plan matches.
- **Stale requests lose.** A late reply never overwrites a newer tap
  (request counters); a stale rules dialog is refused whole (`settingsRevision`).
- **No password in storage but `sessionStorage`**, never in `gahookz-last-join`,
  never left in the URL.
- **One overlay stack:** dialogs register `useBackToClose`, use a `--z-*` token,
  trap focus and return it. A dialog opened from a menu keeps its state.
- **Drafts survive failure:** a failed question or Herd answer submit keeps what
  the player typed.
- **A drawn picture and a preset are never both shown selected.**
- **The Join footer is never clipped** at 320 to 1280 px wide or under a
  keyboard; the sheet is one page, with no inner scroll box.
- **Majority Rulez is a Quiz option, not a game.** The selector shows two games.
- **The plan's numbers are the server's.** Limits in this area (1 to 5, 1 to 20,
  4 to 180, 80, 24) are copies of server constants; change both together.

## Tests

Run under the lock with Node 24 (see the agent rules; `node --version` must say
v24). Rebuild first when browser source changed: `npm run build`.

```bash
flock /tmp/gahookz-verify.lock npm run check
flock /tmp/gahookz-verify.lock npm run test:disposable -- bash -c "npm run standalone:smoke:layout && npm run standalone:smoke:onboarding && npm run standalone:smoke:desktop-ui && npm run standalone:smoke:social-creation && npm run standalone:smoke:round-presets && npm run standalone:smoke:mode-settings && npm run standalone:smoke:room-rules && npm run standalone:smoke:party-view && npm run standalone:smoke:herd-flow"
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run test:browser:mobile
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run test:browser:desktop-ui
flock /tmp/gahookz-verify.lock npm run test:disposable -- node standalone/browser-lobby-creation.mjs
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run test:browser
```

- The smokes mostly assert source text (control names, class names, copy); a
  legitimate move of the code means updating the assertion. `smoke-layout` and
  `smoke-round-presets` were updated for the U2 and U6 controls,
  `smoke-onboarding`, `smoke-social-creation` and the two UI browser tests for
  the wave-2 changes.
- `browser-mobile-ui.mjs` measures phone, short-landscape and desktop geometry
  for the join form (three avatar rows at 360 x 800, nothing clipped at
  740 x 360, keyboard-open Join) and the setup screen (320 x 568: segments,
  cards, Share Lobby Code, the wheel by +, arrows, End and swipe, confirmed on the
  server). `browser-lobby-creation.mjs` asserts geometry for U7, U8, U9, U13,
  U14 and U15 at 360 x 740, 390 x 844, 320 x 568 and 1280 x 800 and saves
  screenshots into `docs/verification/2026-09-25-update/lobby-creation/`.
- `browser-flow.mjs` plays a room end to end; `smoke-herd-flow.mjs` covers the
  server side of Herd writing.

**Taking screenshots.** Use the same method as the
[shell guide](ui-shell.md#tests): a Puppeteer script that refuses any base but
`http://127.0.0.1:3199`, creates the room over the API, opens one browser context
per player, sets the viewport (390 x 844, 360 x 740, 320 x 568, 844 x 390 and
1280 x 800, `deviceScaleFactor: 2`) and seeds `gahookz-client-key` and
`gahookz-how-to-play-seen-v2-<mode>` (plus `host`) in `localStorage` so no
tutorial covers the screen. `standalone/browser-lobby-creation.mjs` and
`docs/verification/2026-09-25-update/lobby-setup/capture.mjs` are working
templates. Their output folders are fixed; evidence is append-only, so revert
any rewritten dated folder (`git checkout -- docs/verification/2026-09-19-*`).

## Common changes

- **Add a game-length option or change a preset:** edit `ROUND_PRESETS` (Quiz
  copy) or the `options` array in `HerdLengthSelector`, the server constants
  (game-flow) and the lobby wiki pages; update `smoke-round-presets`.
- **Change a limit** (questions per player, Herd rounds): the server clamp, the
  `NumberWheel` `min`/`max`, `HERD_CUSTOM_ROUNDS_MAX`, the wiki page
  [game setup](../wiki/game-setup.md).
- **Add a room rule:** add the field to `RULES_FIELDS` and `currentRules`, a
  `RuleToggleRow` or choice in `HostRulesModal`, the optimistic key list in
  `HostMode.hostAction` if it should apply at once, and enforce it on the server
  (`smoke-room-rules`).
- **Add a profile picture preset:** append to `AVATAR_BASE` (and its art in
  `animalAvatarArt` if it is an animal), then check the grid at 320 px.
- **Add a tutorial tab or step:** edit `TUTORIAL_CONTENT` and `TUTORIAL_MODE_ORDER`
  here, the artwork in `tutorial-art.jsx` (audio-art), and `smoke-onboarding`.
- **Add a field to the question builder:** state in `QuestionBuilder`, payload,
  server validation, the edit path (`editingQuestion`) and the draft restore on
  failure.
- **Add a dialog:** follow the shell recipe ([ui-shell](ui-shell.md#common-changes)):
  portal, `--z-modal`, scroll lock, `useBackToClose`, focus in and out.
- **Change the Herd writing screen:** U18 and U19 are in progress; check the
  update plan before editing `PlayerHerdPreparation`.

## Known issues

- U18 and U19 (Herd writing progress in cards, answer images) are not in this
  branch; see the [2026-09-25 update plan](../plans/2026-09-25-update.md).
- The paint editor's custom colour is the native colour input; only the custom
  Gahook background got the in-app picker.
- `GameTutorial` is not portalled and uses `document.body.style.overflow` instead
  of `useScrollLock`; `tutorial-art.jsx` still carries an unreachable Majority
  Rulz artwork branch, and `tutorial.jsx` spells it "Majority Rulz".
- `GAME_MODES` still has three modes; the selector shows two.
- The ownership map omits `LengthPresetSegments`, `useKeyboardInset` and
  `client/number-wheel.*`, and gives `client/custom-gahook.jsx` to social while
  its look is a ui-lobby concern.
- `PlayerHerdPreparation`'s roster has no `.lobby-paint-slot`, so the paint
  buttons float there.
- Preset detail strings in `ROUND_PRESETS` ("up to 10 rounds", "1-3 each, up to
  18 rounds") are UI copy that must be kept in step with the server by hand.

Live backlog: [`../backlog.md`](../backlog.md). Feature pages:
[joining and profiles](../wiki/joining-and-profiles.md), [lobby](../wiki/lobby.md),
[lobby rules](../wiki/lobby-rules.md), [game setup](../wiki/game-setup.md),
[writing questions](../wiki/question-writing.md), [herd](../wiki/herd.md),
[tutorials](../wiki/tutorials.md).
