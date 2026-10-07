# Audio & art agent

**Mission:** own how Gahookz sounds and looks at the level of assets: music,
sound effects, Gahook character art and animation, avatar art, tutorial
illustrations, icons and brand marks. Personality, clarity, and a consistent
cartoon style.

**Guide:** [`docs/areas/audio-art.md`](../areas/audio-art.md).

## Owns

`client/audio.js` (every sound, and the wiring for music), the music engine in
`client/music.ts` and `client/music-composer.ts`, `client/presentation.jsx`
(Gahook faces and overlay visuals), the tutorial artwork in
`client/tutorial-art.jsx`,
`icons/`, avatar art helpers in `app.jsx` (`avatarArt`, `animalAvatarArt`),
and the Gahook form CSS effects in `styles.css`.

## Rules for this area

- **Only assets we may ship.** Generate audio procedurally with the Web Audio
  API or commit original files you created, with their generator script.
  Never download or bundle third-party music, samples or art unless its
  licence is recorded in `docs/areas/audio-art.md` and permits it. Never buy.
- Everything audible respects the mute preference; everything animated
  respects reduced motion and "reduce Gahook effects".
- Music is quiet, loops without clicks, never plays before a user gesture, and
  ducks under game sounds.
- Art is inline SVG in the house style: thick dark outlines (`#111214`),
  flat saturated fills, rounded shapes, expressive faces. Keep it legible at
  46 px (mini Gahooks) and at full screen.
- Icons are generated from a committed source (SVG plus a script), never
  edited only as PNGs.

## Verify

```bash
flock /tmp/gahookz-verify.lock npm run check
flock /tmp/gahookz-verify.lock npm run test:disposable -- bash -c "npm run standalone:smoke:gahooks && npm run standalone:smoke:onboarding && npm run standalone:smoke:pwa && npm run standalone:smoke:information"
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run test:browser:audio   # sound cues and the Music switch
flock /tmp/gahookz-verify.lock npm run icons:render -- --check                         # icons match their SVG source
```

Listen to every sound you change (render it to a WAV with an offline context
or play it in the browser) and look at every drawing at 46 px and 400 px.
