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
  wall with a count and the **Draw / Erase mine** buttons in its heading row,
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
- **Force start.** If not everyone is ready the start button turns amber; a tap
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

(In progress.)

## Invariants

## Tests

## Common changes

## Known issues
