# Herd answer writing — per-player progress and answer images (U18, U19)

Agent branch `agent/herd-writing`, roles ui-lobby and game-flow. Commits: U18
`8e0fd03`, U19 server `b84818f`, U19 client `8fed805` and the commits after
it (see `git log agent/herd-writing`). Node 24, disposable server on port 3199,
nothing run against 3101–3103.

Tyson's requests (screenshot `Screenshot_20260925_124814_Brave.jpg`):

- U18: "In herd answer making screen, move the individual players answer
  progress to their player banner, replacing the In lobby text with something
  like '0/2 answered'."
- U19: "Add the option for players to upload or draw an image for each answer.
  Use similar buttons that are in the quiz mode but make them appear side by
  side just under each answer box to save vertical space."

## What changed

### U18 — progress in the player cards

- The separate "0/1 answers · writing" list is gone. During Herd writing each
  player's card shows "0/4 answered", then "Done" (`herdProgressText`), where
  the card used to say "In lobby". Host and player screens both do this.

### U19 — an optional picture on every Herd answer

- **Rule: text required, picture optional.** An image-only answer is refused
  with the existing "Write an answer before submitting it."; the picture rides
  along with the words. This keeps voting readable and every tile has text for
  screen readers.
- **Writing screen.** Under each answer box, **Upload image** and **Draw
  image** sit side by side (`ImageUploadDrawPicker compact`): the same picker
  and paint editor Quiz uses, without its dashed frame. They stay on one row
  at 390, 360 and 320 px (the Quiz picker stacks them under 560 px). Once a
  picture is attached a thumbnail (96 px tall at most, with an **x**) appears
  above the buttons and they read **Replace image** and **Edit drawing**.
  The drawing dialog is the shared picker's, so it already uses
  `useBackToClose`: Back closes it and keeps the draft.
- **Drafts.** Text and picture drafts are held per question in
  `PlayerHerdPreparation`, so they survive moving between answers, live
  updates from other players, and a failed submit. A removed picture stays
  removed; "Submit all answers" always sends the current picture (`""` clears
  the stored one, an omitted field keeps it).
- **Size.** Answer pictures are shrunk in the browser to 960 px and about
  500 KB (Quiz allows 1500 px and 1.8 MB), because a room keeps one per answer
  and holds about 9 MB of pictures in all.
- **Voting and reveal.** `AnswerGrid` draws the picture above the answer text:
  at most 120 px tall on a phone, 150 px from 900 px wide and 220 px from
  1400 px, so a tall drawing cannot push a tile off the screen. The party
  screen, the player screen and `HerdRevealBreakdown` share this. The alt text
  is "Picture sent with this answer"; it never names the writer, even at the
  reveal (where the tile's own caption names the author and points).
- **Host review.** The host's "Answer review" shows each picture beside the
  answer (up to 110 px tall).
- **Server (earlier commit `b84818f`, reviewed by the orchestrator).** The
  picture is validated and stored like a question image and served from the
  room media store; snapshots carry only the media URL, and it is sent to
  voters only when the answer text is. Host removal, player-media removal and
  kick delete it. Not re-reviewed here beyond running its smoke.

### Also fixed — a lost closing brace in `styles.css`

The `agent/lobby-creation` merge (`02ae85c`) dropped the `}` that closes
`.question-copy-head .question-author-line span`. Everything after it, about
330 lines, was then parsed as CSS nested inside that rule, so those rules
silently never applied: the compact picker, the answer-tile pictures, and the
**paint editor row layout from U8**. The first `herd-writing` browser run
caught it (the compact buttons stacked). The brace is restored in commit
`8fed805`. Effects on other screens: the paint editor now has its intended
rows (visible in `drawing-dialog-390x844.png`), a few screenshots
render slightly differently (an underline on the Herd number wheel's selected
value is gone), and every `test:browser:mobile` check still passes.
Evidence photographed after the merge but before this fix (the
`lobby-setup` and `lobby-creation` screenshots) was taken with the broken
stylesheet; the 2026-09-19 and `lobby-setup` re-captures were restored to
their committed copies, not replaced.

## Verification

All on this branch, Node 24, serialised with `flock /tmp/gahookz-verify.lock`.

| Command | Result |
| --- | --- |
| `npm run check` (typecheck, 225 unit tests, build) | exit 0 |
| `npm run test:disposable -- npm run standalone:smoke:herd-flow` | exit 0 — images accepted, oversize and non-image refused, image-only refused, re-saving text keeps the image, moderation prunes the blob, anonymous while voting, shown at the reveal, deleted on kick |
| `npm run test:disposable -- npm run test:rooms` | exit 0 |
| `npm run test:disposable -- npm run test:browser` | exit 0 (full guest game with no account) |
| `npm test` | exit 0 — 15,000 seeded games, room expiry, the shared smoke scripts and the account suite |
| `npm run test:disposable -- bash -c "npm run standalone:smoke:round-presets && …mode-settings && …room-rules && …onboarding && …social-creation && …layout && …party-view && …desktop-ui"` | exit 0 (run because the stylesheet fix touches every screen) |
| `npm run test:disposable -- npm run test:browser:mobile` | exit 0 |
| `npm run test:disposable -- npm run test:browser:herd-writing` (new, `standalone/browser-herd-writing.mjs`) | exit 0 — see below |

What `test:browser:herd-writing` asserts, in a real Chromium against a
disposable server, with five players:

- at 390×844, 360×740 and 320×568: four answer boxes, each followed within
  16 px by exactly two buttons labelled "Upload image" and "Draw image" on one
  row, 40–52 px tall (one line of text), unclipped, inside the viewport, and the
  page does not scroll sideways;
- upload a real PNG file, draw a stroke in the paint dialog, attach and then
  remove a picture; Back closes the drawing dialog and keeps the draft;
- a live update from another player (their save broadcasts a snapshot) leaves
  text, uploaded and drawn pictures and a removed picture as they were;
- thumbnails are at most 100 px tall; labels become "Replace image";
- Submit all: the server holds media URLs for the two pictured answers and none
  for the text-only and the removed one; the picture is served (HTTP 200); the
  player card reads "4/4 answered" or "Done"; the old progress card is gone;
- host review shows bounded pictures; party screen tiles are at most 155 px
  tall;
- voting at 390 px: pictures load, are at most 125 px tall, tiles stay inside
  the phone, no author is shown, alt text never contains a player's name;
- reveal: pictures load, every tile names its author, the alt text still does
  not, nothing scrolls sideways; no page errors anywhere.

Screenshots, in [`herd-writing/`](herd-writing/) (all looked at):

| File | Shows |
| --- | --- |
| `writing-empty-390x844.png`, `-360x740`, `-320x568` | the two buttons side by side under each box at three phone sizes (at 320 px the icons are dropped so the labels stay on one line) |
| `writing-image-attached-390x844.png` | an uploaded picture attached to an answer: thumbnail with **x**, "Replace image" / "Edit drawing" |
| `writing-drawing-attached-390x844.png` | a drawn picture attached to a second answer |
| `drawing-dialog-390x844.png` | the paint dialog opened from "Draw image" |
| `writing-image-attached-1280x800.png` | the same screen on a desktop, with per-player progress ("1/4 answered", "Done") in the cards |
| `host-review-1280x800.png` | the host's Answer review with pictures |
| `voting-tile-image-390x844.png` | a voting screen on a phone: four tiles with pictures |
| `party-voting-1280x800.png` | the same on a desktop party screen |
| `reveal-image-390x844.png`, `reveal-1280x800.png` | the reveal: pictures, authors, points |

## Interpretations

- "Use similar buttons that are in the quiz mode": the same picker, so the
  same icons and wording, in a compact variant. After attaching, the labels
  change to "Replace image" and "Edit drawing" (Quiz says "Choose upload" and
  "Draw or edit") because the shorter words fit two columns at 320 px.
- Text stays required (the brief recommended it). The optional hint under
  the buttons is hidden in the compact variant to save height.
- Picture size is bounded per viewport (120 / 150 / 220 px) rather than one
  size, so a phone's two-column grid stays on screen and a TV gets a bigger
  picture.

## Known issues and follow-ups

- On a 1280×800 laptop the second row of Herd tiles needs a scroll once every
  answer has a picture; that is the price of showing pictures at all.
- A picture cannot be opened full size: a tap on a voting tile is a vote. A
  zoom control on the tile is a possible follow-up.
- `docs/areas/ui-lobby.md`, the area guide named in
  `docs/agents/ui-lobby.md`, does not exist in the repository, so there was no
  guide to update; this record and the Herd wiki page carry the details.
- `styles.css` still holds unused `.herd-preparation-progress` rules left over
  from the removed progress card (U18); harmless, left for a clean-up.
- `packages/contracts` fixtures do not list `imageDataUrl` on Herd review items
  (the snapshots are not schema-validated for Herd); regenerate with
  `npm run capture:fixtures` if that changes.
- Chromium launched first time on every run here; no retries were needed.
