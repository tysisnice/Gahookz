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
- **Preset avatars:** 23 flat badge pictures (objects, animals and a few jokes)
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

## How it works

### The audio context, the first tap and mute

`App` calls `installGahookWarmup` once. It listens (capture phase) for the
first `pointerdown`, `touchstart` or `keydown` and then calls
`warmGahookEffects({ fromGesture: true })`, which resumes the one shared
`AudioContext` (`window.gahookzAudioContext`), pre-builds the noise buffers,
plays a silent monkey sound to prime the synthesis path, warms speech
synthesis and calls `resumeGameMusic`. A passive warm-up also runs 250 ms
after load, but it only builds buffers: a browser keeps the context suspended
until a gesture, so **no music or sound plays before the player's first touch**.

`getAudioContext()` returns `null` while sound is muted, and every sound
function begins with that check (or `sfxChannel`, which uses it), so muting
silences everything without each caller checking. `applyEffectsMuted`
(`preferences.jsx`) also suspends the context, cancels speech, stops any custom
Gahook audio element and mutes the Gahook channel gain; un-muting resumes the
context and the music.

### Music state machine

`App` maps screen and phase to one of five music states in an effect:

| Screen or phase | Music state |
| --- | --- |
| Offline screen | `off` (stopped) |
| Welcome, Information and Legal pages | `welcome` |
| Phase `lobby` | `lobby` |
| Phase `building` (Quiz question writing) or `herd-writing` | `prep` |
| Phase `finished` | `finale` |
| Anything else in a room (reading, answering, reveal, Herd voting, and so on) | `live` |

`setGameMusicState(state)` ignores a repeat of the current state, stops the
music for `off`, and otherwise calls `resumeGameMusic`, which does nothing
unless music is allowed (`musicAllowed`: sound not muted, the Music switch on,
and the tab visible), the context is running and the gesture has happened.
Then `MusicPlayer.play(state)` starts the new song on the current song's next
bar line (the next beat if the bar line is more than 2 s away) and fades the
old one over about a second; old songs are disconnected four seconds later.

Other transitions:

- **Tab hidden:** `visibilitychange` fades the music out over 0.3 s and restarts
  it on return.
- **Music switch or mute:** a `gahookz-music-change` event (from
  `setMusicEnabled`) starts it, or fades it over 0.8 s; un-muting resumes it.
- **System suspends the context** (a phone call): the `statechange` listener
  resumes the music when the context runs again.
- **Timer:** `runMusicClock` calls `player.scheduleUntil(now + 0.35 s)` every
  90 ms. The composer writes one bar at a time; notes that fall behind a
  throttled timer are dropped rather than played in a burst. The timer is a
  `setTimeout`, not the audio clock, so a background tab (hidden, throttled)
  has the music stopped rather than stuttering.
- **Reading focus:** while the phase is `reading`, `setMusicFocus(true)` takes
  the music to 62% volume and a 2.4 kHz low-pass (time constant 0.4 s), so the
  question can be read or heard. Any other phase, or leaving the room, lifts it.
- **Ducking:** `duckMusic(depth, hold)` dips the music under a sound. Every
  Gahook sound ducks through `resetPokeSoundChannel` (depth 0.55, 1.2 s); the
  effect functions and `speakText` duck on their own.

### The composer and player

`music-composer.ts` has no Web Audio and no DOM, so it is unit-tested in Node
(`music.test.ts`). `MUSIC_STYLES` holds one style per state:

| State | bpm | Swing | Lead | Feel |
| --- | ---: | ---: | --- | --- |
| `welcome` | 82 | 0.22 | marimba | lo-fi, long electric-piano chords |
| `lobby` | 100 | 0.10 | marimba | soft nu-disco |
| `prep` | 88 | 0.16 | marimba | half-time study beat, arpeggios |
| `live` | 112 | 0.06 | filtered saw pluck | upbeat disco-house |
| `finale` | 120 | 0.05 | filtered saw pluck | celebratory piano-house |

Each style also has three or four four-bar chord progressions written as
names (`Am9`, `G13`), a groove per section kind, a pentatonic scale for lead
motifs, and levels. A song is a seeded random walk of sections: a two-bar
intro, then eight-bar A and B sections and four-bar breaks (a break only after
at least two sections since the last). Each section picks a progression that
differs from the previous one, a groove variant and optional fills, crash and
riser. `voiceChord` keeps the four-note voicings close to the previous chord.
Patterns are 16-step strings, so a groove can be edited without code.

`music.ts` (`MusicPlayer`) plays the events with synthesised kick, clap or
snare, hats, shaker, bass, electric piano (FM), pad, marimba and pluck leads,
crash and riser. Each song has its own output, reverb send and echo send so
two songs can overlap during a crossfade. The shared bus is high-pass 32 Hz,
glue compressor, focus filter, duck gain and an output level of
`DEFAULT_MUSIC_LEVEL` (0.155). The player accepts any `BaseAudioContext`, which
is how `render-audio-samples.mjs` renders the same code offline.

### Sound inventory and triggers

All effects are built from oscillators and generated noise; none is a sample.
Effects share one palette (marimba, FM chime, woodblock, bubble pop, brass,
swish, pink-noise crowd; C-major pitches) and go through `sfxChannel`, which
trims by `SFX_LEVEL` (0.65) into a bus with a limiter (threshold -4 dB).

| Sound | Function | Triggered from |
| --- | --- | --- |
| Answer locked: woodblock and two marimba notes | `playAnswerLockedSound` | `syncGameSoundCues`: your own answer appears during `answering` |
| Countdown ticks at 3, 2 and 1 s left, rising | `playCountdownTick` | `syncGameSoundCues` (`syncCountdownTicks`), scheduled on the audio clock from `phaseEndsAt` and the server clock offset; cancelled if you answer, the host pauses or the phase ends |
| Reveal: correct (marimba run and chimes), wrong (soft falling "aww"), neutral (soft chord) | `playRevealSound` | `syncGameSoundCues`: phase becomes `reveal`; result from your answer against the winning answer |
| Rising bubbles, one per new answer, climbing the scale | `playAnswerOohSound` | `AnswerGrid` (`app.jsx`), when other players' selections appear |
| Game win: brass fanfare and a 3.2 s crowd | `playGameWinCheer` | `syncGameSoundCues`: phase becomes `finished` |
| Congratulations, Ultimate Congratulations, and its extra-tap chime | `playCongratsSound`, `playUltimateCongratsSound`, `playUltimateCongratsExtraSound` | `PlayerView` (`app.jsx`); `playCongratsSound` also in Gahook Dash |
| Boo (five formant-filtered low voices) | `playBooSound` | `PlayerView` |
| 1v1 Arena win (fanfare, small crowd) / lose (GET GOT sound) | `playVictoryPartySound` / `playGetGotSound` | `client/arena.jsx` |
| Gahook per character: monkey, gorilla, koala, croc, chicken (sweeps, tones, noise); Sad Pig cry (`pig` and legacy `capybara`); custom presets bonk, honk, boing, airhorn, none, or the player's own recording | `playGahookFormSound`, `playMonkeyPokeSound`, `playSadPigCry` | `PlayerView`, `HostLobbyPokeEffects`, `client/arena.jsx`, the custom Gahook creator's preview, host mini Gahooks, Dash |
| Voice cue after a Gahook (three descending buzzes); long cue | `playGahookVoiceCue`, `playLongGahookCue` | `PlayerView`, wrong-password and banned pokes in `WelcomeScreen` and `JoinScreen`, Dash |
| Ultimate Gahook, its extra, Counter Gahook, GET GOT | `playUltimateGahookSound`, `playUltimateExtraGahookSound`, `playCounterGahookSound`, `playGetGotSound` | `PlayerView`, `HostLobbyPokeEffects`, `RoomGetGotOverlay` |
| Spoken cues ("gah hook", "get got", "Winner ...", "congratulations", "boo") | `speakText` (browser speech synthesis; ducks the music) | `PlayerView`, `FinishedScreen`, `RoomGetGotOverlay` |

The Gahook sounds (not the effects palette) go straight to the speakers
without the effects limiter, and each starts by calling
`resetPokeSoundChannel`, which cuts the previous Gahook's gain so sounds do
not pile up.

`syncGameSoundCues(lobby)` is called by `App` with each snapshot of the room
being shown (and `null` elsewhere). The first snapshot of a room code on a page
only records the phase, question and answer, so a join, refresh or reconnect
never replays a reveal or a cheer. The finale cheer fires at most once per
10 s as a guard against a phase flicker.

### Gahook character art

Each character is an inline SVG (viewBox `0 0 220 220`) in `presentation.jsx`:
`MonkeyFace`, `GorillaFace`, `PigFace`, `KoalaFace`, `CrocFace`,
`ChickenFace`, chosen by `GahookFormVisual`. A static head is shared by two
poses (`animal-pose-a`, `animal-pose-b`); CSS flips between them
(`premium-pose-a/b`, speed per character), and each character also has its own
shake animation. The monkey is the base form; the other five are "premium
forms": `PokeJumpScare` adds `is-premium-form` and renders `PremiumFormEffects`
(15 spans, styled per form by `.premium-effects-<id>`) behind the card. A custom
Gahook is drawn from the player's frames by `CustomGahookVisual` (up to three
frames, effect shake, spin, bounce or zoom). Congratulations show `BirdIcon`
and `ThumbsUpIcon`; GET GOT and boos add `BananaIcon` bursts.

**Sad Pig** (replaced Airhorn Capy on 2026-09-30, `77534e0`): a fat pink pig
with a double chin. Pose A is the wail (eyes screwed shut, blue tears down
both cheeks, a wide mouth, a small snot bubble) and is the only pose that must
carry the character at 46 px mini size; pose B is the sob between wails. Its
backdrop `.poke-overlay.is-form-pig` is a pink glow with blue rain streaks, and
`.premium-effects-pig` rains teardrops, bouncing tissues (every third prop) and
puddles (every fourth). The cry (`playSadPigCry`) is an oink and snort, a
nasal "WAAAH" that cracks upward and sags, then two wet sniffles. A stored or
sent `capybara` id maps to `pig` (`LEGACY_GAHOOK_FORMS`, the form-picking rules
are in [social](social.md)).

Everything animated stops under `.gahookz-reduced-effects .poke-overlay *` and
the matching `.gahookz-muted` rules: the character is shown still, in its first
pose.

### Avatars, tutorial pictures and the icon

**Avatars.** `AVATAR_BASE` in `app.jsx` lists 23 presets (id, label, two
colours and an art key). `makeAvatarImage` builds an SVG data URI per preset: a
rounded square in the preset colour, two soft circles and the art from
`avatarArt` or `animalAvatarArt`. `AvatarBadge` shows a player's drawn picture
(`avatarImageDataUrl`) when there is one, otherwise the preset (the first when
the id is unknown). Drawing and upload belong to profiles (see
[Joining and profiles](../wiki/joining-and-profiles.md)).

**Tutorial pictures.** `tutorial-art.jsx` draws one 900 by 400 SVG per tab via
`TutorialArtwork({ mode, label })`: three numbered sticker cards with badge
colours green, blue and pink matching the numbered steps below, and chunky
yellow connectors. Overview, Quiz, Herd and Host have a redrawn picture;
Majority Rulez still shows its older picture (`MajorityTutorialArtwork`, in a
legacy block of the same file). The cast are simplified heads (`MonkeyHead`,
`PigHead`, `KoalaHead`, `ChickenHead`, `CrocHead`) so they can change
expression. The pictures are static, so reduced motion has nothing to stop.
Nothing that has to be read is smaller than 40 units, which `smoke-onboarding`
enforces. `tutorial.jsx` imports and re-exports `TutorialArtwork`; the dialog is
documented in [Tutorials](../wiki/tutorials.md).

**Icon.** `icons/gahookz-monkey.svg` is the only source (a blue-to-green
gradient, the monkey with a yellow headband and a soft shadow; the four-colour
ring was removed on 2026-10-02). `scripts/render-icons.mjs` loads it in the
headless Chromium that Puppeteer installs and screenshots it into
`gahookz-180.png` (iOS touch icon), `gahookz-192.png`, `gahookz-512.png`
(manifest, purpose `any`) and `gahookz-maskable-512.png` (manifest, purpose
`maskable`). The maskable icon is the same picture; every run measures the
farthest `#111214` outline pixel and fails if it reaches the maskable safe zone
(radius 204.8 of 512 units; the monkey reaches about 189). `index.html` links
the SVG as the tab icon and the 180 px PNG as the touch icon, and the service
worker precaches all five files. PNGs are never edited by hand.

### House art style and asset licensing

- **Style:** thick `#111214` outlines, flat saturated fills from the site palette
  (pink `#ff3d8b`, yellow `#ffdf45`, blue `#246bfe`, green `#20b26b`, orange
  `#ff8a00`, purple `#7c3aed`), rounded shapes, expressive faces, hard offset
  shadows instead of blur. Check every drawing at 46 px and at 400 px.
- **Licensing:** only assets we may ship. Audio is generated procedurally with
  Web Audio or committed as original files with their generator script; art is
  inline SVG we drew. Never download or bundle third-party music, samples or art
  unless its licence is recorded in this guide and permits it; never buy. There
  is currently **no third-party asset** in the game. A player's own recorded or
  uploaded custom Gahook sound is user content, played back to the room, not an
  asset we ship ([Custom Gahooks](../wiki/custom-gahooks.md)).

## Invariants

- **Nothing audible before a gesture, or while muted.** All sound goes through
  `getAudioContext()` (null when muted) and the context stays suspended until
  `warmGahookEffects({ fromGesture: true })`. A new sound function must start
  with that check, usually via `sfxChannel`.
- **Music has its own switch and never plays in a hidden tab.** `musicAllowed`
  is the single gate: sound not muted, Music on, tab visible.
- **Music ducks under every game sound.** A new effect calls `duckMusic`; a new
  Gahook sound is covered by `resetPokeSoundChannel`.
- **No sound or music replays on join, refresh or reconnect.**
  `syncGameSoundCues` records the first snapshot of a room without playing.
- **The composer stays pure** (no Web Audio, no DOM) so it runs under Node
  tests, and the player accepts any `BaseAudioContext` so the sample renderer
  runs the real code.
- **Everything animated stops under reduced effects.** New Gahook art must be
  covered by the `.gahookz-reduced-effects .poke-overlay *` rule (put it inside
  `.poke-overlay`) and must still read as a still picture.
- **Characters are legible at 46 px** (mini Gahooks and the picker) and at full
  screen; the first pose alone must carry the character.
- **Tutorial pictures use no text under 40 units** (`smoke-onboarding`).
- **Icons come from the SVG.** Change `gahookz-monkey.svg`, run
  `npm run icons:render`, commit both; the maskable outline must stay inside
  the safe zone (the script fails otherwise).
- **A retired Gahook id keeps working.** `capybara` maps to `pig`; never remove
  a mapping from `LEGACY_GAHOOK_FORMS` without migrating stored choices.
- **Only assets we may ship** (see the licensing rule above).
- `music.ts`, `music-composer.ts` and `tutorial-art.jsx` are built to `.js`
  files that are gitignored, listed in `build-client.mjs` and `dev.mjs` and
  precached by the service worker; a new client module needs all four.

## Tests

Run under the shared lock with Node 24
(`export PATH=$HOME/.local/opt/node-v24.13.1-linux-x64/bin:$PATH`).

```bash
# typecheck, unit tests (composer: music.test.ts; forms: gahook-forms.test.ts) and build
flock /tmp/gahookz-verify.lock npm run check
# Gahook forms, sounds source checks, Sad Pig, legacy capybara mapping
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run standalone:smoke:gahooks
# tutorial artwork (labels, 40-unit text floor, precache), icons, information pages
flock /tmp/gahookz-verify.lock npm run test:disposable -- bash -c "npm run standalone:smoke:onboarding && npm run standalone:smoke:pwa && npm run standalone:smoke:information"
# Gahook Dash (uses the Sad Pig sprite and the shared sounds)
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run standalone:smoke:dash
# Music switch assertions in the settings and rules dialogs
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run standalone:smoke:party-view
# audio cues in a real browser: no cheer on refresh, one cheer per game, mute, Music switch, pig cry
# (build first: npm run build)
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run test:browser:audio
# icons are reproducible from the SVG (launches Chromium; rerun if it times out under load)
flock /tmp/gahookz-verify.lock npm run icons:render -- --check
```

`GAHOOKZ_AUDIO_SOAK_SECONDS=300` before `test:browser:audio` adds a realtime
soak through every music state. `npm run audio:samples` renders 24 Ogg/Opus
samples (music states, effects, mixed scenes) offline in headless Chromium and
writes `levels.json`; it is how levels are measured, because an agent cannot
hear. The output is under `docs/verification/2026-09-25-update/audio/`.

## Common changes

- **Add or change a sound effect.** Build it in `audio.js` from the palette
  helpers (`mallet`, `chime`, `woodblock`, `pop`, `brass`, `swish`), start with
  `sfxChannel(channel)`, call `duckMusic`, export it, and call it from the
  trigger. For an event that follows room state, add it to
  `syncGameSoundCues` so the first-snapshot rule applies. Render the samples and
  check the level against `SFX_LEVEL`.
- **Change the music.** Tempo, swing, progressions, grooves and levels are
  data in `MUSIC_STYLES`; the overall loudness is `DEFAULT_MUSIC_LEVEL`. Run
  `npm run check` (composer tests) and `npm run audio:samples`, then listen.
- **Add a music state.** Add it to `MusicState`, `MUSIC_STATES` and
  `MUSIC_STYLES`, and map a screen or phase to it in the `App` effect.
- **Add a Gahook character.** Draw `<Name>Face` in `presentation.jsx` with two
  poses and a `.premium-effects-<id>` rule and `.is-form-<id>` backdrop, add a
  case to `GahookFormVisual`, a sound branch in `playGahookFormSound`, the id to
  both `GAHOOK_FORMS` lists and a Dash sprite; checklist and the server side are
  in [social](social.md#common-changes). Add the character to the tutorial
  heads if it appears there.
- **Change an avatar.** Edit `AVATAR_BASE` and `avatarArt`/`animalAvatarArt` in
  `app.jsx`; ids are stored in profiles, so never reuse or rename an id.
- **Redraw a tutorial picture.** Edit the matching `*TutorialArtwork` and beat
  functions in `tutorial-art.jsx`, keep text at 40 units or more, and check the
  picture at 260, 360 and 900 px wide. Change `artworkLabel` copy in
  `tutorial.jsx`.
- **Change the icon.** Edit `gahookz-monkey.svg`, run
  `flock /tmp/gahookz-verify.lock npm run icons:render` (add
  `-- --preview <dir>` for the 512 px, 48 px and safe-zone pictures), commit the
  SVG and PNGs, and rebuild so the release hash in the service worker changes.

## Known issues

Backlog: see [the backlog](../backlog.md). Found while writing this guide:

- **The "Reduce Gahook effects" switches disagree.** The join-screen menu
  (`EffectsPreferenceButtons`) and the host's Lobby rules row
  (`EffectsPreferenceToggle`) go through `useReducedEffects`, which sets the
  reduced preference **and** mutes sound; the Settings dialog's switch sets the
  reduced preference only. See
  [Preferences and accessibility](../wiki/preferences-and-accessibility.md).
- **The welcome screen has no sound controls** and a host mid-game reaches
  personal sound settings only through Lobby rules in the lobby.
- **Nobody has judged the music by ear.** Balance and levels were measured
  (see `docs/verification/2026-09-25-update/audio.md`); the knobs are
  `DEFAULT_MUSIC_LEVEL`, `SFX_LEVEL` and `MUSIC_STYLES`.
- **Gahook sounds bypass the effects limiter.** The Rage Gorilla peaks at about
  -0.1 dBFS; routing the poke channel through the limiter is a small follow-up.
- **Dash and the Arena tap tone keep their own beeps** (`offline.jsx`,
  `arena.jsx`) instead of the effects palette.
- **`FinishedScreen` speaks "Winner ..." on every mount**, including after a
  refresh, over the cheer.
- **Majority Rulez tutorial picture is the old one** (small text) until its tab
  is removed.
- **Installed app icons** may keep the old picture until the OS refreshes them;
  icon URLs are not content-hashed.
- **Chromium checks are load-sensitive:** `icons:render` and `test:browser:audio` start
  Chromium and can time out on a busy host; rerun when the load drops.
