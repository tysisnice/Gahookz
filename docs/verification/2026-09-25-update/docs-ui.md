# docs-ui: outdated statements found in old documents

Written 2026-10-07 by the docs-ui agent (branch `agent/docs-ui`) while writing
`docs/areas/audio-art.md`, `docs/wiki/music-and-sound.md`,
`docs/wiki/navigation-and-back-button.md` and
`docs/wiki/preferences-and-accessibility.md`. Code wins in each case.

| File | Quote | Correction |
| --- | --- | --- |
| `docs/agents/audio-art.md` | "`client/audio.js` (every sound and the music engine)" | The music engine is `client/music.ts` (player) and `client/music-composer.ts` (composer); `audio.js` owns the `AudioContext`, warm-up, mute, every effect and drives the player |
| `docs/agents/audio-art.md` | "the artwork in `client/tutorial.jsx`" | Tutorial artwork moved to `client/tutorial-art.jsx`; `tutorial.jsx` only imports and re-exports `TutorialArtwork` |
| `docs/areas/README.md` | "tutorial artwork inside `client/tutorial.jsx`" (audio-art row) | Same: `client/tutorial-art.jsx`. The audio-art row should also list `client/music.ts`, `client/music-composer.ts` and `scripts/render-icons.mjs` |
| `docs/agents/audio-art.md` | Verify section lists only `check`, gahooks, onboarding, pwa and information smokes | Add `test:browser:audio` and `icons:render -- --check` |
| `docs/agents/audio-art.md` | "Music is quiet ... never plays before a user gesture" (no mention of its own switch) | Music has its own Music switch (`gahookz-music-off`), separate from mute |
| `docs/verification/2026-09-25-update/art.md` (append-only, not edited) | "The pig is silent-ish until the audio agent's cry merges (default sound)" and "Area guide, wiki ... lines for U5 were not written" | The cry merged 2026-10-03 (`f997566`); the guide and wiki now exist |
| `docs/verification/2026-09-25-update/audio.md` (append-only, not edited) | Sad Pig and `capybara` both play the cry via `normaliseGahookFormId` | Still true; note `playGahookFormSound` special-cases `"pig"` before normalising |

Not an outdated statement but a code inconsistency found while documenting
preferences (recorded in the audio-art guide's Known issues): the join-screen
menu and the host's Lobby rules "Reduce Gahook effects" controls call
`useReducedEffects`, which sets reduced effects **and** mutes sound, while the
Settings dialog's switch sets reduced effects only. `docs/areas/ui-shell.md`
describes only the three storage keys, not this difference.
