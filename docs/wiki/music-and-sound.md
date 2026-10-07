# Music and sound

> Gahookz makes its own chill party music and every sound effect, and plays them only after your first tap.

**Area:** [audio and art](../areas/audio-art.md) · **Status:** live · **Last reviewed:** 2026-10-07

## What it is

The game has background music with a different groove for each part of the night: mellow lo-fi on the welcome and information pages, a soft disco groove in the lobby, a light study beat while questions are written, upbeat disco-house during live rounds and celebratory piano-house on the final results. It changes mood on a beat.

On top of the music are sound effects: a confirm when your answer locks in, soft ticks in the last three seconds, a reveal sound (sparkle if you were right, a friendly "aww" if not), congratulations and boos, a crowd cheer when a game ends, and a sound for every [Gahook](gahooks.md), including the Sad Pig's cry ([characters](gahook-characters.md)). Some Gahooks also speak ("gah hook", "get got").

Everything is generated in the browser: no recorded files.

## Rules and numbers

- **Nothing plays before your first tap or key press.** Browsers block it.
- **Music steps back during reading** (quieter and duller) so the question can be read, and dips under every effect.
- **Joining, refreshing or reconnecting never replays** a reveal or a cheer. The game-end cheer plays once per game.
- **Mute** silences everything: music, effects and speech. The separate **Music** switch turns off only the music. Both are per device ([Preferences and accessibility](preferences-and-accessibility.md)).
- Music pauses in a hidden tab.
- The offline screen ([Gahook Dash](gahook-dash.md)) plays no music.

## Where it lives

| Part | Code |
| --- | --- |
| Sounds, music wiring, mute and gesture rules | `standalone/public/client/audio.js` — `syncGameSoundCues`, `setGameMusicState`, `playGameWinCheer` |
| Music | `standalone/public/client/music-composer.ts` — `MUSIC_STYLES`; `music.ts` — `MusicPlayer` |
| Which music for which screen | `standalone/public/app.jsx` — `App` |
| Tests | `standalone/public/client/music.test.ts`, `standalone/browser-audio-cues.mjs` |

## Related

- [Preferences and accessibility](preferences-and-accessibility.md), [Finale](finale.md), [Reveal and results](reveal-and-results.md)
- [Audio and art area guide](../areas/audio-art.md) has every sound and its trigger.

## History

- 2026-07-20 — Looping oscillator music and Gahook sounds exist from the first commit (`dd449f2`).
- 2026-09-30 — Sad Pig replaces Airhorn Capy, with a new cry (`77534e0`).
- 2026-10-03 — A generated music engine, a Music switch, new effects and a game-end cheer replace the old music (`f997566`).
