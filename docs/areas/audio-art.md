# Audio and art — area guide

Last verified against the code: 2026-10-07, commit 05379cf

## Purpose

Audio and art owns how Gahookz sounds and looks at the level of assets: the
background music engine, every sound effect, the Gahook characters and their
full-screen effects, the preset avatars, the tutorial pictures and the app
icon. It does not own where a sound or picture is *used*: the screens that
call these modules belong to the UI areas, and the rules that decide when a
Gahook is sent belong to [social](social.md).

Two promises run through all of it. Everything is made by us: sounds and music
are synthesised in the browser and the art is inline SVG, so the game ships no
third-party audio or images. And everything respects the player's choices:
nothing audible plays while sound is muted, nothing animated plays under
reduced motion or "Reduce Gahook effects", and nothing plays before the player
has touched the page.

Wiki pages: [Music and sound](../wiki/music-and-sound.md),
[Preferences and accessibility](../wiki/preferences-and-accessibility.md),
[Gahook characters](../wiki/gahook-characters.md),
[Tutorials](../wiki/tutorials.md).

## What players see

- **Music** under every screen except the offline one: a different groove for
  the welcome and information pages, the lobby, question writing (Quiz
  building and Herd writing), live rounds and the final results. It starts
  after the first tap or key press, steps back while a question is being read,
  and dips under every game sound.
- **Sound effects** for answering (a lock-in confirm, rising bubbles as other
  answers arrive, soft ticks in the last three seconds), the reveal (sparkle,
  a friendly "aww", or a soft ta-da), congratulations, boos, the 1v1 Arena
  win and a crowd cheer when a game ends. Every Gahook has its own sound.
- **Spoken cues** ("gah hook", "get got", "Winner ...") using the browser's
  speech synthesis, quietly under the same mute rule.
- **Gahook characters** drawn as thick-outlined cartoon heads (Classic Monkey,
  Rage Gorilla, Sad Pig, Chonky Koala, Cool Croc, Cymbal Chicken), each with
  two poses that flip while they are on screen and, apart from the monkey, a
  full-screen backdrop of their own (the Sad Pig's is a rain of tears).
- **Preset avatars:** 23 flat badge pictures (objects, animals and two jokes)
  in the profile picker, plus a player's own drawing.
- **Tutorial pictures:** one 900 by 400 sticker-card illustration per "How to
  play" tab.
- **The app icon:** the monkey on a blue-to-green gradient, as the browser tab
  icon, the iOS home-screen icon and the installed-app icon.
- **Switches:** Music, Mute sound effects and Reduce Gahook effects in the
  player Settings dialog, host Lobby rules and the join-screen menu (see
  [Preferences and accessibility](../wiki/preferences-and-accessibility.md)).

## Code map

| Concern | Where |
| --- | --- |
| Real `AudioContext`, gesture warm-up, music wiring, every sound effect, crowd cheer, Sad Pig cry, game cues, speech | `standalone/public/client/audio.js` (`installGahookWarmup`, `warmGahookEffects`, `getAudioContext`, `setGameMusicState`, `resumeGameMusic`, `stopGameMusic`, `duckMusic`, `syncGameSoundCues`, `speakText`, `playGahookFormSound`, `playSadPigCry`, `playGameWinCheer`) |
| Music player (Web Audio synthesis, scheduling, crossfade, duck, focus) | `standalone/public/client/music.ts` (`MusicPlayer`, `DEFAULT_MUSIC_LEVEL`) |
| Music composer (pure, no Web Audio: styles, chords, sections, grooves, motifs) | `standalone/public/client/music-composer.ts` (`MUSIC_STYLES`, `Composer`, `voiceChord`, `isMusicState`) |
| Composer tests | `standalone/public/client/music.test.ts` |
| Mute, Music and reduced-effects preferences | `standalone/public/client/preferences.jsx` (`effectsMuted`, `musicEnabled`, `setMusicEnabled`, `effectsReduced`, `applyEffectsMuted`, `MUSIC_EVENT`) |
| Switch components | `standalone/public/app.jsx` (`EffectsPreferenceToggle`, `EffectsPreferenceButtons`, `MusicPreferenceToggle`, `MusicPreferenceButton`, `PlayerSettingsDialog`, `JoinQuickMenu`, `HostRulesModal`) |
| Music state per screen, cue sync | `standalone/public/app.jsx`: two effects in `App` (`setGameMusicState`, `syncGameSoundCues`) |
| Gahook character art and overlay | `standalone/public/client/presentation.jsx` (`GahookFormVisual`, `MonkeyFace`, `GorillaFace`, `PigFace`, `KoalaFace`, `CrocFace`, `ChickenFace`, `PokeJumpScare`, `PremiumFormEffects`, `BirdIcon`, `ThumbsUpIcon`, `BananaIcon`) |
| Gahook character list, order, legacy ids | `standalone/public/client/gahook-forms.js` (`GAHOOK_FORMS`, `LEGACY_GAHOOK_FORMS`, `normaliseGahookFormId`) |
| Character CSS effects | `standalone/public/styles.css`: `.poke-overlay.is-form-*`, `.premium-effects-*`, `.poke-overlay.is-premium-form .poke-animal .animal-pose-*`, the `*-rattle`, `*-wobble`, `*-swag`, `pig-sob` and `chicken-crash` animations, and the reduced-motion block `.gahookz-reduced-effects .poke-overlay *` |
| Preset avatars | `standalone/public/app.jsx`: `AVATAR_BASE`, `AVATAR_PRESETS`, `AvatarBadge`, `makeAvatarImage`, `avatarArt`, `animalAvatarArt` |
| Tutorial pictures | `standalone/public/client/tutorial-art.jsx` (`TutorialArtwork`); dialog and copy in `client/tutorial.jsx` |
| App icon | `standalone/public/icons/gahookz-monkey.svg` (source), `gahookz-{180,192,512,maskable-512}.png` (generated), `scripts/render-icons.mjs`; linked from `standalone/public/index.html` and `manifest.webmanifest`, precached in `service-worker.js` |
| Offline sample renderer, audio behaviour check | `standalone/render-audio-samples.mjs`, `standalone/browser-audio-cues.mjs` |
| Build wiring | `standalone/build-client.mjs`, `standalone/dev.mjs` (list `music.ts`, `music-composer.ts`, `tutorial-art.jsx`), `service-worker.js` precache |

Where each sound is called from (the call sites are in other areas' files):
the Gahook, counter, Ultimate, GET GOT, congratulations and boo sounds in
`app.jsx` (`PlayerView`, `HostLobbyPokeEffects`, `RoomGetGotOverlay`), the
Arena win and lose sounds in `client/arena.jsx`, and the Dash sounds in
`client/offline.jsx` (its own beeps, plus `playGahookFormSound`).
