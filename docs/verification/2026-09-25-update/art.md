# Art — Sad Pig, tutorial artwork, site icon (U11, U7 art, U5)

Agent branch `agent/art` (audio-art agent; the form registration is the
social area's, done here as the brief asked). Commits: `8e40c7a`, `8372931`
(orchestrator checkpoints of unfinished work), `77534e0` (Sad Pig, verified),
`6a2ee17`, `5f28cb1` (tutorial artwork checkpoint and precache entry) and
the commits after them on this branch.

## What changed

### U11 — Sad Pig replaces Airhorn Capy

Tyson: *"remove the capy and instead have another one next to the monkeys
and call it Sad Pig and have him be a fat crying pig that makes an annoying
crying sound."*

- **Art** — `PigFace` in `client/presentation.jsx`: a fat pink pig (round
  head, a double chin under it, jowl creases) with two poses like the other
  premium forms. Pose A, the wail, is the only pose drawn at mini size, so it
  carries the character alone: eyes screwed shut under sad brows, blue tears
  running down both cheeks, a wide-open wailing mouth and a small snot
  bubble. Pose B, the sob between wails: wet puppy eyes, a wobbling lip,
  tears spraying sideways and a full-size snot bubble.
- **Full-screen effect** — `styles.css`: `.poke-overlay.is-form-pig` is a
  pink glow in a storm of blue rain streaks; `.premium-effects-pig` rains
  teardrops down the screen and bounces used tissues (every third prop) and
  puddles (every fourth). The pig itself sobs (`pig-sob`: squash on the
  wail, stretch on the gulp, in step with the pose change). Everything stops
  under reduced motion, "reduce Gahook effects" and mute, through the
  existing `.gahookz-reduced-effects .poke-overlay *` rule; the pig then
  shows the wail pose, still.
- **Registry** — `client/gahook-forms.js`: order is now Classic Monkey, Rage
  Gorilla, **Sad Pig**, Chonky Koala, Cool Croc, Cymbal Chicken (in the
  two-column picker the pig sits directly under the monkey).
- **Legacy id** — `capybara` maps to `pig` everywhere a form id arrives:
  `LEGACY_GAHOOK_FORMS` in `client/gahook-forms.js` (stored choice, cached
  snapshot, older client; a stored `capybara` is rewritten to `pig` the first
  time it is read) and the same table in `server.js` (`normaliseGahookForm`,
  used on join and on `/api/player/gahook-form`). Accounts do not store the
  form, so no saved account data needed migrating.
- **Gahook Dash** — `client/offline.jsx`: `drawDashPig` replaces
  `drawDashCapybara` in the obstacle sequence, in the same 58 × 56 box and
  hitbox, so difficulty is unchanged.
- **Sound** — not in this branch. `client/audio.js` belongs to the audio
  agent, who is writing the cry for form id `"pig"`. Until that merges, the
  pig plays the default Gahook sound.
- The random player name "Cheeky Capybara" is untouched (a name generator,
  not a form).

### U7 (art) — tutorial illustrations

Tyson: *"Completely revamp all the tutorial images. Make them much higher
quality, make them clear, have personality, and simple."*

- The artwork moved out of `client/tutorial.jsx` into
  **`client/tutorial-art.jsx`**; `tutorial.jsx` imports and re-exports
  `TutorialArtwork` with the same `{ mode, label }` props. The only other
  edit to `tutorial.jsx` is the four `artworkLabel` strings, which describe
  the new pictures. The module is registered in `build-client.mjs`
  (generated list and the import rewrite), `dev.mjs`, `.gitignore` and the
  service-worker precache.
- New pictures for **Gahookz (overview), Quiz, Herd and Host**. Majority
  Rulz keeps its old picture (`MajorityTutorialArtwork`, in a clearly marked
  legacy block) until the later wave removes that tab; delete the block with
  the tab.
  - Gahookz: friends pop up around a phone showing the room word → a
    question card, pencil and answer colours → the monkey bursts out of a
    starburst, with +50 and a trophy.
  - Quiz: write a question and mark the right colour → beat the stopwatch to
    the right tile, +900 → a yelling monkey Gahooks a crying Sad Pig, −50.
  - Herd: a chicken asks one question → a croc in sunglasses writes secret
    answers on sticky notes, padlocked → three friends vote one answer to the
    crown, +500.
  - Host: hold up the room word as friends arrive → pick a game card and
    switch an option on → the crowned monkey runs the room with Pause and
    Skip.

## Art style rules followed

- House style from `docs/agents/audio-art.md`: `#111214` outlines, flat
  saturated fills from the site palette (pink `#ff3d8b`, yellow `#ffdf45`,
  blue `#246bfe`, green `#20b26b`, orange `#ff8a00`, purple `#7c3aed`),
  rounded shapes, expressive faces, hard offset shadows instead of blur.
- Legible at the smallest size it is shown: the pig was checked at 46 px
  (picker and mini Gahooks) and 400 px; the tutorials at 260 px (a 320 px
  phone), 300 px (360 px phone) and 900 px (desktop dialog).
- Tutorials: one 900 × 400 picture, three numbered sticker cards whose badge
  colours match the numbered steps below them (green, blue, pink), chunky
  yellow connectors. Few, big shapes; the only words are the room word and
  point values, and no text is under 40 units (≈13 px on a 360 px phone;
  measured: smallest rendered text 18 px at 360, 15 px at 320, 55 px at
  1280). `smoke-onboarding` enforces the 40-unit floor on the redrawn art.
- The Gahook characters are the cast, drawn as simplified heads in
  `tutorial-art.jsx` (monkey, pig, koala, chicken, croc) so they can change
  expression; the monkey is the hero and the Sad Pig is usually on the wrong
  end of it.
- Static art: nothing in the tutorials animates, so there is nothing for
  reduced motion to stop.

## Verification

All under `flock /tmp/gahookz-verify.lock`, Node 24 (`PATH=/usr/bin:$PATH`),
disposable servers only.

| Command | Result |
| --- | --- |
| `npm run check` (Sad Pig) | pass — 210 unit tests (206 + 4 new in `client/gahook-forms.test.ts`), typecheck, build |
| `npm run test:disposable -- bash -c "… smoke:gahooks && … smoke:dash && … smoke:pwa && … smoke:onboarding && … smoke:information"` (Sad Pig) | exit 0 |
| `npm run check` (tutorials) | pass — 210 tests |
| `npm run test:disposable -- bash -c "… smoke:onboarding && … smoke:herd-flow && … smoke:pwa && … smoke:information && … smoke:gahooks && … smoke:dash"` (tutorials) | exit 0 |
| `npm run test:disposable -- bash -c "… smoke:onboarding && … smoke:herd-flow && npm run test:browser:mobile"` | exit 0 (tutorial tabs at 360 px) |
| `npm run test:disposable -- npm run test:browser:desktop-ui` | exit 0 on the third run. Run 1 failed in the Herd pass (`answerCount>=1` 200 ms after the click), run 2 timed out waiting for the first page to render; load average was ~5 on this two-core host with another agent working. Both failures are waits in code this branch does not touch; the tutorial steps passed in all three runs |
| `npm run test:disposable -- node docs/verification/2026-09-25-update/art/capture.mjs pig` | exit 0: picker order and selection asserted at 390 and 360 px; a pig Gahook asserted (`aria-label="Sad Pig Gahook"`, 15 props) at 390 and 1280 px; a `capybara` selection answered `pig` |
| `… capture.mjs tutorials` | exit 0: every redrawn tutorial opened from Welcome at 360, 1280 and 320 px, labelled, no horizontal overflow, no page errors |

New or changed assertions:

- `smoke-gahooks`: forms map uses `pig: "PigFace"` and checks each form's
  switch branch; Sad Pig's position and label; the capy is gone; both legacy
  tables exist; pig CSS effects exist; behaviourally, joining with
  `"Capybara"` and selecting `"capybara"` both give `"pig"`. The pig's
  *sound* assertion is skipped only while `audio.js` still has the old
  `form === "capybara"` branch and no `form === "pig"` one; it becomes strict
  by itself when the audio agent's change lands, and the orchestrator can
  then delete the `pigCryPending` clause.
- `smoke-onboarding`, `smoke-herd-flow`: artwork assertions read
  `tutorial-art.jsx`; the dialog must import it; the service worker must
  precache it; the redrawn art must have no text under 40 units.
- `client/gahook-forms.test.ts` (new): order, legacy mapping, stored-choice
  rewrite, unreadable storage.

## Evidence

Sad Pig: [picker, 390 px](art/pig-picker-390.jpg),
[picker, 360 px](art/pig-picker-360.jpg),
[picker tiles](art/pig-picker-tiles-390.jpg),
[Gahook, phone](art/pig-gahook-390.jpg),
[Gahook, desktop](art/pig-gahook-1280.jpg),
[46 px and 92 px beside the other forms](art/pig-mini-46-and-92.png),
[both poses at 400 px](art/pig-poses-400.jpg).

Tutorials (phone 360 px and desktop 1280 × 800):
[Gahookz](art/tutorial-overview-360.jpg) / [desktop](art/tutorial-overview-1280.jpg),
[Quiz](art/tutorial-quiz-360.jpg) / [desktop](art/tutorial-quiz-1280.jpg),
[Herd](art/tutorial-herd-360.jpg) / [desktop](art/tutorial-herd-1280.jpg),
[Host](art/tutorial-host-360.jpg) / [desktop](art/tutorial-host-1280.jpg);
artwork alone at 320 px:
[Gahookz](art/tutorial-art-overview-320.jpg), [Quiz](art/tutorial-art-quiz-320.jpg),
[Herd](art/tutorial-art-herd-320.jpg), [Host](art/tutorial-art-host-320.jpg).

Re-run the captures with
`flock /tmp/gahookz-verify.lock npm run test:disposable -- node docs/verification/2026-09-25-update/art/capture.mjs [pig,tutorials]`.

## Known issues

- The pig is silent-ish until the audio agent's cry merges (default sound).
- The Majority Rulz tutorial still shows its old small-text picture; it goes
  with the tab in wave 2.
- `test:browser:desktop-ui` is load-sensitive on this host (see above).
