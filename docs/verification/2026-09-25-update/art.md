# Art — Sad Pig, tutorial artwork, site icon (U11, U7 art, U5)

Agent branch `agent/art` (audio-art agent; the form registration is the
social area's, done here as the brief asked). Commits: `8e40c7a`, `8372931`
(orchestrator checkpoints of unfinished work), `77534e0` (Sad Pig, verified),
`6a2ee17`, `5f28cb1` (tutorial artwork checkpoint and precache entry),
`88723ec` (tutorial artwork, verified), `88758d5`, `03039be` (icon
checkpoints) and the final icon commit that adds the icon section below.

## Summary

| Item | Tyson's request | Outcome | Evidence |
| --- | --- | --- | --- |
| U11 Sad Pig | Replace the Airhorn Capy with a fat crying pig called Sad Pig, next to the monkeys | Done and verified: new `PigFace`, full-screen rain-of-tears effect, picker order, `capybara` maps to `pig`, Dash obstacle swapped. The cry sound is the audio agent's | [Sad Pig](#u11--sad-pig-replaces-airhorn-capy), evidence below |
| U7 art Tutorial pictures | Redo every tutorial image: higher quality, clear, personality, simple | Done and verified: new `client/tutorial-art.jsx` pictures for Gahookz, Quiz, Herd and Host; Majority Rulz keeps its old picture until its tab is removed | [Tutorials](#u7-art--tutorial-illustrations), evidence below |
| U5 Site icon | Remove the four-colour ring around the monkey's face; keep the monkey and the background as they are | Done and verified: the ring is gone from `gahookz-monkey.svg`; the four PNGs are re-rendered from it by `npm run icons:render` and are reproducible | [Icon (U5)](#icon-u5--no-ring-around-the-monkey), evidence below |

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

### Icon (U5) — no ring around the monkey

Tyson: *"remove the 4 color ring around the monkey's face. Keep the monkey's
face and background as is."*

- **What changed** — `standalone/public/icons/gahookz-monkey.svg` no longer
  draws the cyan circle (`#06b6d4`) and the yellow and pink arcs
  (`#facc15`, `#ec4899`) that formed the ring around the face. Nothing else
  in the SVG moved: the dark blue-to-green gradient background, the monkey
  (ears, head, face, eyes, nose, smile, yellow headband) and its soft drop
  shadow are byte-for-byte the same markup as before. The change is three
  deleted lines.
- **How the PNGs are produced** — they are never edited by hand. The new
  `scripts/render-icons.mjs` (`npm run icons:render`) loads the SVG into the
  headless Chromium that Puppeteer already installs and screenshots it at each
  size, writing `gahookz-180.png` (apple-touch-icon), `gahookz-192.png` and
  `gahookz-512.png` (manifest, purpose `any`) and `gahookz-maskable-512.png`
  (manifest, purpose `maskable`) into `standalone/public/icons/`.
  - `npm run icons:render -- --check` re-renders in memory and fails if a
    committed PNG differs, so a stale icon is detectable. Chromium's
    rasteriser can differ by a pixel between versions, so a failure means
    "re-render and look".
  - `npm run icons:render -- --preview <dir>` also writes the 512 px and 48 px
    previews and the safe-zone picture used as evidence below.
- **Maskable safe zone** — the maskable icon is the same picture as the 512 px
  one, on purpose: the gradient is full-bleed and the monkey already sits
  inside the safe zone (the central circle of radius 40% of the icon, 204.8 of
  512 units), so a launcher may crop to a circle, squircle or rounded square
  without cutting the face. The ring that was removed sat at radius 194 with
  a 25 unit stroke (outer edge about 206 from its own centre), that is on the
  edge of the safe zone, so a tight crop would have trimmed it; removing it
  also makes the icon safer to crop. This was checked three ways:
  1. by geometry from the SVG: the farthest solid edge is the monkey's ears at
     about 189 units from the centre, 15 units inside the zone (headband end
     caps 162, headband top 170, head 168);
  2. by measurement: the script finds the farthest `#111214` outline pixel in
     the rendered maskable PNG and **fails the render if it reaches the safe
     zone**. Result: 189.0 of 204.8 units. A one-off measurement of all four
     PNGs gave 189.0 (512 and maskable), 188.0 (192 px) and 187.9 (180 px,
     scaled to 512 units);
  3. by eye: `art/icon-maskable-safe-zone.png`, left the maskable icon with the
     safe-zone circle drawn on, right the worst crop (the safe-zone circle
     alone). Both ears, the headband and the smile are inside it, nothing is
     clipped.
  The script's old note said to add maskable padding if the monkey ever left
  the zone; it did not, so the maskable PNG needed no padding.
- **Legibility at small sizes** — at 48 px (tab and home-screen size) the
  monkey reads cleanly on the gradient; at 192 px the face, eyes and headband
  are crisp. Without the ring the monkey could be a little larger in the
  frame, but Tyson asked for the monkey and the background to stay as they
  are, so the scale is unchanged.
- **Where the icon is used** — the SVG is the browser-tab icon
  (`<link rel="icon">`), the 180 px PNG is the iOS apple-touch-icon, and the
  manifest uses the 192, 512 and maskable PNGs. The service worker precaches
  all five files in the release cache, so the release hash changes with them;
  the stamped `index.html`, `service-worker.js` and `vendor-bootstrap.js` are
  committed from the final build.
- **Regression guard** — `smoke-pwa` asserts the ring is gone (no `#06b6d4`
  stroke, no `A194 194` arc) in addition to the existing checks that the
  monkey and its brown fill are present and the four PNGs are valid PNGs of
  the right size.
- **Reproducibility check** — after the final commit's re-render, `git status`
  shows no change to any of the four PNGs, and `--check` reports they match
  a fresh render (see Verification). The previews `icon-512.png` and
  `icon-48.png` were also byte-identical to the committed ones; only the
  safe-zone picture changed, because it is now drawn by the script instead of
  by hand.

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

Icon (U5), run on 2026-10-02 with Node v24.13.1, each under
`flock /tmp/gahookz-verify.lock`:

| Command | Result |
| --- | --- |
| `npm run icons:render` (first attempt) | Chromium timed out launching ("Timed out after 30000 ms while waiting for the WS endpoint URL"; load average 11 and 125 MB free memory on the shared host). Not a code fault; no file was written |
| `npm run icons:render` (retry) | wrote all four PNGs (20892, 21789, 98837 and 98837 bytes). `git status` afterwards: **no change** to any PNG, so the committed PNGs are reproducible from the SVG |
| `npm run icons:render -- --preview docs/verification/2026-09-25-update/art` | same four PNGs, again unchanged; `icon-512.png` and `icon-48.png` byte-identical to the committed previews; prints `maskable safe zone: monkey outline reaches 189.0 of 204.8 units from the centre`; rewrote `icon-maskable-safe-zone.png` (now drawn by the script) |
| `npm run icons:render -- --check` | exit 0: `Icons match a fresh render of gahookz-monkey.svg.` |
| `npm run check` | exit 0: typecheck, 210 of 210 unit tests pass, build `release-c61f95b87b5834c5` |
| `npm run test:disposable -- bash -c "npm run standalone:smoke:pwa && npm run standalone:smoke:onboarding && npm run standalone:smoke:information && npm run standalone:smoke:gahooks && npm run standalone:smoke:dash"` | exit 0: all five report `"ok": true` (pwa includes the new no-ring assertion); disposable server on 3199 started and stopped by its owned PID |

No browser check re-captured anything under `docs/verification/2026-09-19-*`
(`git status` showed no change there), so nothing needed restoring.

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
- `smoke-pwa` (U5): `gahookz-monkey.svg` has no `#06b6d4` stroke and no
  `A194 194` arc, so the ring cannot return unnoticed.
- `scripts/render-icons.mjs` (U5): every render of the maskable PNG fails if
  the monkey's outline reaches the safe zone (radius 204.8 of 512 units).

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

Icon (U5): [512 px](art/icon-512.png), [48 px](art/icon-48.png) and
[maskable safe zone](art/icon-maskable-safe-zone.png) (left: the icon with the
safe-zone circle drawn on; right: the worst-case crop). The shipped files are
`standalone/public/icons/gahookz-{180,192,512,maskable-512}.png` and
`gahookz-monkey.svg`.

Re-run the captures with
`flock /tmp/gahookz-verify.lock npm run test:disposable -- node docs/verification/2026-09-25-update/art/capture.mjs [pig,tutorials]`
and the icon evidence with
`flock /tmp/gahookz-verify.lock npm run icons:render -- --preview docs/verification/2026-09-25-update/art`.

## Known issues

- The pig is silent-ish until the audio agent's cry merges (default sound).
- The Majority Rulz tutorial still shows its old small-text picture; it goes
  with the tab in wave 2.
- `test:browser:desktop-ui` is load-sensitive on this host (see above).
- Installed copies of the app may keep the old icon until the browser or
  launcher refreshes it. The service worker precaches the icons in the
  release cache, so a new release refetches them, but that is the web cache
  only: what an installed home-screen or app-drawer icon shows is up to the
  operating system (an iOS home-screen icon is fixed when the app was added),
  and was not tested here. Removing and re-adding the app gets the new icon.
  The icon URLs themselves are not content-hashed; only the manifest link is.
- The icon script launches Chromium and can time out on a busy host (see the
  Verification table); rerun it when the load drops.
- Area guide, wiki and `docs/CHANGELOG.md` lines for U5 were not written by
  this agent: `docs/areas/audio-art.md` does not exist on this branch and the
  brief limited the documentation to this record. Suggested changelog line
  under Players: "The app icon no longer has the four-colour ring around the
  monkey's face." Under Developer: "App icons are rendered from
  `gahookz-monkey.svg` by `npm run icons:render`."
