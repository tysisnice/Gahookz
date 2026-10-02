# Rendered audio samples — 2026-09-25 update

Every file here was rendered from the game's own code (`client/music.ts`,
`client/music-composer.ts`, `client/audio.js`, as built) through an
`OfflineAudioContext` in headless Chromium, then encoded as mono Ogg/Opus at
64 kbit/s. Nothing here is third-party audio. Regenerate with:

```bash
flock /tmp/gahookz-verify.lock bash -c 'npm run build && npm run audio:samples'
```

Levels are measured on the rendered stereo signal before encoding (dBFS:
0 is full scale). *Loudest 400 ms* is the RMS of the loudest 400 ms window,
a fair stand-in for how loud a short effect feels. No file clips. The
numbers per file are also in `levels.json`.

## Music (20 s per state, from a cold start)

| File | What it is | Peak | RMS | Loudest 400 ms | Size |
| --- | --- | ---: | ---: | ---: | ---: |
| [`music-welcome.ogg`](music-welcome.ogg) | welcome music, 20 s from a cold start (seed 2026) | -17.7 | -31.5 | -28.7 | 164 KB |
| [`music-lobby.ogg`](music-lobby.ogg) | lobby music, 20 s from a cold start (seed 2026) | -17.3 | -31.1 | -28.9 | 167 KB |
| [`music-prep.ogg`](music-prep.ogg) | prep music, 20 s from a cold start (seed 2026) | -19 | -33.1 | -30.1 | 166 KB |
| [`music-live.ogg`](music-live.ogg) | live music, 20 s from a cold start (seed 2026) | -18.2 | -32.9 | -30.7 | 169 KB |
| [`music-finale.ogg`](music-finale.ogg) | finale music, 20 s from a cold start (seed 2026) | -16.5 | -31 | -29.1 | 172 KB |
| [`music-transition-lobby-to-live.ogg`](music-transition-lobby-to-live.ogg) | lobby music, then the game starts: crossfade into live on the next bar line | -18.6 | -33.7 | -29.6 | 140 KB |

## Mixed scenes (music, ducking and effects together)

| File | What it is | Peak | RMS | Loudest 400 ms | Size |
| --- | --- | ---: | ---: | ---: | ---: |
| [`mix-live-round.ogg`](mix-live-round.ogg) | a player's round over the live music: reading (music steps back), answers arriving, countdown, answer locked (cancels the last tick), correct reveal, a congratulation | -7.3 | -28.3 | -18.8 | 115 KB |
| [`mix-game-finish.ogg`](mix-game-finish.ogg) | the last reveal ends the game: live music crossfades into the finale while the fanfare and crowd cheer play | -7.6 | -26.9 | -18.9 | 117 KB |

## Sound effects

| File | What it is | Peak | RMS | Loudest 400 ms | Size |
| --- | --- | ---: | ---: | ---: | ---: |
| [`sfx-answer-locked.ogg`](sfx-answer-locked.ogg) | your answer locks in (new) | -11.2 | -25.7 | -22.1 | 11 KB |
| [`sfx-answer-pops.ogg`](sfx-answer-pops.ogg) | other players answering: one bubble per answer, climbing (replaces the vocal ooh) | -18.2 | -33.3 | -28.6 | 4 KB |
| [`sfx-countdown-ticks.ogg`](sfx-countdown-ticks.ogg) | the last three seconds of answering (new) | -13.2 | -38.9 | -33.6 | 7 KB |
| [`sfx-reveal-correct.ogg`](sfx-reveal-correct.ogg) | reveal, you picked the winning answer (new) | -9.2 | -24.6 | -19.9 | 15 KB |
| [`sfx-reveal-wrong.ogg`](sfx-reveal-wrong.ogg) | reveal, you did not (new) | -14 | -24.8 | -21.6 | 8 KB |
| [`sfx-reveal-neutral.ogg`](sfx-reveal-neutral.ogg) | reveal on the host screen or when you did not answer (new) | -10.7 | -27.9 | -23.6 | 14 KB |
| [`sfx-congrats.ogg`](sfx-congrats.ogg) | congratulations (redesigned) | -7.5 | -23.8 | -18.8 | 18 KB |
| [`sfx-ultimate-congrats.ogg`](sfx-ultimate-congrats.ogg) | ultimate congratulations (redesigned) | -5 | -21.7 | -17.6 | 23 KB |
| [`sfx-ultimate-congrats-extra.ogg`](sfx-ultimate-congrats-extra.ogg) | each extra ultimate congratulations tap (redesigned) | -17.6 | -31.9 | -29.1 | 10 KB |
| [`sfx-boo.ogg`](sfx-boo.ogg) | boo (redesigned) | -15.1 | -29 | -25.9 | 11 KB |
| [`sfx-arena-victory.ogg`](sfx-arena-victory.ogg) | 1v1 arena winner: fanfare and a small crowd (redesigned) | -9.7 | -25.1 | -21.1 | 19 KB |

## End-of-game cheer

| File | What it is | Peak | RMS | Loudest 400 ms | Size |
| --- | --- | ---: | ---: | ---: | ---: |
| [`cheer-game-win.ogg`](cheer-game-win.ogg) | end of the game, everyone: fanfare and crowd cheer (new) | -6 | -22.2 | -18.5 | 25 KB |

## Gahook sounds

| File | What it is | Peak | RMS | Loudest 400 ms | Size |
| --- | --- | ---: | ---: | ---: | ---: |
| [`gahook-pig-cry.ogg`](gahook-pig-cry.ogg) | Sad Pig Gahook: the crying pig (new, replaces the Airhorn Capy) | -13.6 | -27.6 | -24.7 | 9 KB |
| [`gahook-capybara-legacy.ogg`](gahook-capybara-legacy.ogg) | a legacy capybara Gahook now cries like the pig | -13.6 | -27.6 | -24.7 | 9 KB |
| [`gahook-monkey-reference.ogg`](gahook-monkey-reference.ogg) | Classic Monkey Gahook, unchanged, for level comparison | -14.6 | -34.2 | -30.9 | 13 KB |
| [`gahook-gorilla-reference.ogg`](gahook-gorilla-reference.ogg) | Rage Gorilla Gahook, unchanged, for level comparison | -0.1 | -31 | -26.9 | 9 KB |

Total: 24 samples, 1.4 MB.
