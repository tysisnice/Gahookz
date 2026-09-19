# Desktop UI changes — implementation plan

Source: `/Vault/Desktop UI changes.md` (23 screenshots, all present in
`/Vault/Archive/attachments/`). Repo: `/mnt/storage/syncthing/codex/2026-07-01/Gahookz`,
branch `overhaul/quiz-herd-p00-p12`.

Read this whole file before touching code. Work the stages in order — later
stages depend on components built in earlier ones.

## Ground rules

- **Never touch production or beta.** All stateful runs use a disposable server
  on `127.0.0.1:3199` via `npm run test:disposable -- <command>`. Do not stop an
  unfamiliar listener. Do not run `scripts/docker-deploy.sh`.
- `/Vault` is **read-only** to you. Do not write there.
- The working tree already carries 37 uncommitted review repairs. **Do not
  revert, stash or commit them.** Your changes land on top.
- `standalone/public/app.jsx` is 242KB. Use targeted edits; never rewrite it
  wholesale.
- `standalone/public/client/*.js` includes handwritten `audio.js` and
  `gahook-forms.js`. Use `npm run clean:generated`; **never** bulk-delete `.js`.
- `.jsx` is outside strict TypeScript. A passing build does **not** prove the
  browser works — verify interactively (stage V).
- Screenshots are the spec. Open each one before implementing its item:
  `/Vault/Archive/attachments/<name>.png` (read-only).

## Verification after every stage

```bash
npm run check    # typecheck + 177 unit tests + build
```

Stage V covers real browser verification. Do not declare a stage done on
`npm run check` alone if it changed layout.

---

## Stage A — Functional bug: host skip/pause returns "Server error"

**This is the only actual broken behaviour in the note. Do it first.**

Screenshot: `Pasted image 20260919084239.png`

Root cause already located:

- `standalone/server.js:127` — `LIVE_GAME_PHASES = ["reading", "answering", "reveal"]`
- `standalone/server.js:4535` — `skipPhase(room)` handles only `reading`,
  `answering`, `reveal`. Herd phases `herd-writing` and `herd-answer` fall
  through, the function returns undefined, and the client shows "Server error".

Fix `skipPhase` to handle `herd-writing` and `herd-answer` by advancing to the
correct next herd phase (trace `beginHerdAnswering` / `transitionAfterHerd*` to
find the real successors — do not guess). Check `setGamePaused` and
`/api/host/pause` for the same phase-list gap.

Decide deliberately whether `LIVE_GAME_PHASES` should include herd phases — it
also gates Gahook poke behaviour, so widening it has side effects. Prefer a
separate, explicit phase list for skip/pause if that is safer.

Add a regression test asserting skip and pause succeed in every herd phase.
Put it beside the existing server tests so `npm run check` picks it up.

---

## Stage B — Shared components (build once, reuse everywhere)

The note asks for the same two widgets repeatedly. Build them first.

1. **Toggle switch.** Tyson explicitly likes the Majority Rulez on/off button
   ("I like this on off button, we will use it later"). Extract it into a
   reusable component. It replaces checkboxes in stage D.
   Reference: `Pasted image 20260919082903.png`
2. **Info tooltip.** An `(i)` affordance that reveals explainer text on
   hover/focus. Must be keyboard-accessible and screen-reader labelled.
   Replaces inline explainer paragraphs.

---

## Stage C — Custom Gahooks

Screenshots: `20260919085413`, `20260919085221`, `20260919082721`

1. Move the pose selector to **below** the canvas.
2. Add icons to all the buttons in `20260919085221`.
3. Support **two** custom Gahooks instead of one. Rename the "Draw my own"
   button to **"Custom Gahook 1"** / **"Custom Gahook 2"**; when the player
   names a custom Gahook, the button shows that name.

Files: `standalone/public/client/custom-gahook.jsx`, `drawing.jsx`.
Persistence for slot 2 must round-trip — check how slot 1 is stored and mirror it.

---

## Stage D — Menus

**Majority Rulez** (`20260919082903`): remove the explainer paragraph; add the
stage-B tooltip next to the label, immediately left of the toggle.

**Game options** (`20260919082030`):
- Move game-length buttons to sit directly under the mode selector and above
  Majority Rulez. They stay there always.
- Remove "reduce Gahook effects" from this menu (it moves to stage E).
- Remove all text under the Begin Game button.
- Game-length buttons are too big — make them shorter, and drop the last line
  of text in each (redundant with the totals block).
- Totals block: one line showing question count and player count. Delete "the
  total updates as players join".

**Herd options** (`20260919083012`): shrink game-length buttons, remove internal
empty space, and make the text block below them concise and visually matched to
the quiz totals block.

**Dark menu** (`20260919082813`):
- Restyle to match Game options — it is far too black right now.
- Replace every checkbox with the stage-B toggle.
- **Scrollbar bug:** this menu shows a scrollbar even with ample room. It must
  render fully whenever vertical space allows, and scroll *only* when the
  viewport genuinely cannot fit it. Likely a fixed height or `overflow: scroll`
  that should be `auto` with `max-height`.

**Player menu** (`20260919082133`):
- Host side: remove "reduce Gahook effects".
- Non-host players: replace it with a **Settings** button opening a settings
  menu styled like the host lobby menu. Put Gahook effects in there, plus other
  relevant accessibility options.

---

## Stage E — Lobby painting (behaviour change)

Screenshot: `20260919083057`

- **Remove** painting on the chatbox.
- **Add** painting over the lobby container holding player banners.
- Exactly **one** tool: a single mid-sized brush, `0.6` opacity, colour derived
  from the player's profile picture. One option only — "Draw".
- When a player gets Gahooked, **their** drawings are erased (only theirs).

Needs a server-side drawing surface keyed per player so the erase-on-Gahook hook
can target one player's strokes. Check how the existing chatbox painting syncs
and reuse that transport.

---

## Stage F — Assorted fixes

**Last game played box** (`20260919084444`): styling is unreadable. Redo it and
add padding so it does not touch neighbours.

**Also (from stage H note):** this box must appear **only** on the main lobby
screen. Remove it from every other screen, especially game screens.

**Tutorials** (`20260919083133`): numbers in the coloured square info boxes are
not centred — centre them. On desktop the herd tutorial is a different size from
the others; make all tutorials the same size.

---

## Stage G — Herd

**Question boxes** (`20260919083344`): add ~10px padding around the green lines
above and below the "give me a herd question" box; remove the large whitespace
above the Submit Question button.

**Making herd question** (`20260919083415`):
Two columns — question box and player-banner column — of roughly equal width,
inset from the screen edges rather than pushed hard left/right. When there are
enough players that banners grow taller than the question box, it may split into
three columns. **The question box is always at least as wide as a banner
column, ideally slightly wider.**

**Writing herd answers** (`20260919084002`, `20260919084042`) — big overhaul:
- Move the progress bar into the same column as the questions.
- **The player lobby column is missing entirely from this screen — bring it back.**
- Change the yellow text to something readable (red or blue).
- Remove the per-question "lock this answer" button; players submit all answers
  in one go.

**Answering herd questions** (`20260919084203`):
- Gahook buttons are missing their "Gahook" text — fix.
- Make the leaderboard thinner, matching quiz mode.
- Yellow "noodle" text → readable colour.

**Herd voting screen** (`20260919084224`) — needs judgement, not just CSS:
Remove the purple "0 votes for the favourite" bar. The screen is unclear; bring
it in line with the quiz answer phase. **Before redesigning, understand how herd
is meant to play** — there is no herd doc in `docs/`, so read the herd logic in
`standalone/server.js` and run `npm run test:disposable -- npm run standalone:smoke:herd-flow`
(and `simulate-games.mjs`) to watch a real round. Then make a considered choice.
Observed in the screenshot: answer tiles carry "+0 author pts", a "no pick / +0"
summary sits bottom-right, and scoring text is unreadable against the gradient.

**End game screen** (`20260919084316`):
- With reduce-Gahook-effects on, a strange overlay covers the winners — remove it.
- "Party awards" heading and the text beneath are unreadable: bigger, higher
  contrast, and trim surrounding whitespace.

---

## Stage H — Quiz

**Answer phase** (`20260919084735`): match the herd answer-phase styling exactly
— larger question box, single banner column when few players.

**Narrow layouts** (`20260919085800`): at some widths the question box becomes
very thin and "Create opinion questions" wraps/jams sideways. It must never do
that. The string is too long — shorten it — and fix the layout so it holds at
all sizes.

**Question feedback** (`20260919084945`): make the "was this question good" box
the same width as the leaderboard below it; currently too wide.

**Phase timing** (`20260919085035`): reduce the show-answer phase (before the
good-question vote) by **one second**.

---

## Stage V — Real browser verification

`npm run check` cannot prove any of this. For every stage that changed layout:

```bash
npm run check
npm test
npm run test:disposable -- npm run test:rooms
npm run test:disposable -- npm run test:browser
```

Then drive a real session and **look**:
- Quiz and herd, both end to end.
- Player counts that exercise the column rules: few players (2–4) and many (12+).
- Desktop width plus a narrow width reproducing `20260919085800`.
- Host skip and pause in **every** herd phase (stage A).
- Reduce-Gahook-effects **on**, to check the end-game overlay.

Extend `standalone/browser-flow.mjs` where a check can be automated. Capture
screenshots of changed screens and compare against the originals.

## Reporting

Write findings to `docs/verification/2026-09-19-desktop-ui/README.md`: exact
commands, raw output, and **preserve failures** — do not overwrite a failed run
with a passing rerun. Record anything deferred and why.

If a requested change conflicts with how the game actually works, stop and
write it down rather than guessing. Ambiguity resolved by inspection is fine;
ambiguity resolved by assumption is not.
