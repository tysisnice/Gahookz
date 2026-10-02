# Audio slice — music, sound effects, Sad Pig cry, finale cheer (M1, M2, M3, U11 sound)

**Agent:** audio-art, branch `agent/audio`, worktree
`~/gahookz-agent-worktrees/audio`. Production, beta and `/srv/gahookz` were
not touched. Nothing was pushed or merged.

Tyson's note: *"Aside from the gahooking sounds and effects, please do a
complete overhaul of the music and sound effects in the game. Right now
everyone says the music is terrible, perhaps either generate or source some
good chill party music. Add cheering for when someone wins a game."* and, for
U11, *"a fat crying pig that makes an annoying crying sound"*.

**Listen first:** the samples are in [`audio/`](audio/README.md) beside this
file: 24 Ogg/Opus files (1.4 MB) rendered from the game's own code, with
their measured levels.

## What changed for players

- **New music.** A generative chill-party engine replaces the five looping
  oscillator phrases. Every state has its own groove: welcome is mellow lo-fi,
  the lobby a soft nu-disco groove, question/answer writing a light half-time
  study beat, live rounds an upbeat disco-house that sits under the game, and
  the final results celebratory piano-house. It never repeats the same bar for
  long (sections, fills, breaks, new chord progressions and short melodies are
  chosen as it plays), changes state on a bar line, steps back while a
  question is being read, and dips under every game sound.
- **A Music switch.** Players can turn the music off and keep the sound
  effects: in *Player menu → Settings*, in the host's *Lobby rules* (beside
  "Reduce Gahook effects on this device"), and in the join screen's *Menu*.
  It is remembered on the device. Mute still silences everything.
- **New and redesigned sound effects** (not the Gahooks): a confirm when your
  answer locks in, soft ticks in the last three seconds if you have not
  answered, a reveal sound (sparkle if you picked the winning answer, a
  friendly "aww" if not, a soft ta-da otherwise), rising bubbles as answers
  arrive, and new congratulations, ultimate congratulations, boo and 1v1
  arena-win sounds.
- **A crowd cheer when the game ends**: a short brass fanfare and a crowd
  roaring, whooping, whistling and clapping for about three seconds, for
  everyone in the room, once per game. Refreshing or joining into a finished
  game does not replay it.
- **The Sad Pig's cry** for the new `pig` Gahook form: an oink and a snort, a
  nasal, sobbing "WAAAH" that cracks upward and sags, then two wet sniffles.
  A legacy `capybara` Gahook cries the same way.
- The Gahook sounds themselves (monkey, gorilla, koala, croc, chicken, custom
  presets, voice cue, ultimate, counter, GET GOT) are unchanged.

## Engine design (for the area guide and wiki)

### Files

| File | Role |
| --- | --- |
| `standalone/public/client/music-composer.ts` | Pure composer (no Web Audio): styles, chord parsing, voice leading, sections, grooves, fills, lead motifs, seeded randomness. Unit-tested in Node. |
| `standalone/public/client/music.ts` | Player: synthesises the composer's events with Web Audio, schedules ahead of the audio clock, crossfades states, ducking and "focus". Works with any `BaseAudioContext`. |
| `standalone/public/client/music.test.ts` | node:test cases for the composer (run by `npm run test:unit`). |
| `standalone/public/client/audio.js` | Owns the real `AudioContext`, gesture warm-up and mute; drives the music player; every sound effect; the crowd cheer; the pig cry; game cues. Gahook sounds unchanged. |
| `standalone/public/client/preferences.jsx` | New `musicEnabled`, `setMusicEnabled`, `useMusicPreference`, `MUSIC_EVENT`. |
| `standalone/render-audio-samples.mjs` | `npm run audio:samples`: renders music, effects and mixed scenes offline in headless Chromium, writes Ogg/Opus and `levels.json`. |
| `standalone/browser-audio-cues.mjs` | `npm run test:browser:audio`: behavioural check of cues, mute, the Music switch, the pig; optional realtime soak. |

Both TypeScript modules are built like `net.ts` and `back-stack.ts`
(`build-client.mjs` emits `client/music.js` and `client/music-composer.js`,
gitignored, listed in `dev.mjs` and precached by the service worker). The
composer is a separate module because the server tsconfig type-checks
`client/*.test.ts` without DOM types.

### The composer

A **style** per game state:

| State | Used for | Tempo | Swing | Key / feel | Drums | Keys |
| --- | --- | ---: | ---: | --- | --- | --- |
| `welcome` | welcome, information, legal pages | 82 | 0.22 | E♭ major, lo-fi | boom-bap kick, soft snare, lazy hats | long electric-piano chords |
| `lobby` | lobby | 100 | 0.10 | A dorian / C, nu-disco | soft four-on-the-floor, clap, off-beat open hats or shaker | off-beat stabs or held chords |
| `prep` | question writing, Herd answer writing | 88 | 0.16 | F major, study beat | half-time kick, snare on 3, hats or shaker | 8th-note and 3-3-2 arpeggios |
| `live` | reading, answering, reveal | 112 | 0.06 | G minor / B♭, disco-house | four-on-the-floor, clap | off-beat and house stabs |
| `finale` | final results | 120 | 0.05 | D major, piano-house | four-on-the-floor, clap, shaker | "piano house" stabs |

Each style has three or four four-bar chord progressions written as chord
names (`Am9`, `G13`, `Bb9sus`, ...). Chords are four-note rootless voicings
(ninths, elevenths, thirteenths); `voiceChord` picks the octave of each tone
to move as little as possible from the previous chord inside G3–E5, with
penalties for low clusters. The bass plays roots, octaves, fifths and a
chromatic approach into the next chord.

A song is a sequence of **sections**: a two-bar intro (pads and keys only),
then eight-bar A and B sections and four-bar breaks (no kick or bass), chosen
by a seeded random walk (a break at most every third section). Each section
picks a progression (never the same twice in a row), a groove variant, an
arpeggio shape, a possible fill for its last bar (snare roll, a dropped last
beat, or a noise riser) and a possible crash on its downbeat. B sections
usually carry a **lead motif**: a two-bar phrase from the key's major
pentatonic, stated in bars 1–2 and answered with a variation in bars 5–6,
with notes on the beat snapped to the chord underneath. The marimba plays it
in welcome, lobby and prep; a filtered saw pluck in live and finale.

Patterns are 16-step strings (velocity digits for drums, letters for bass,
`X`/`x`/`a` for keys), so a groove can be edited without touching code.

### The player and its sound

Instruments, all synthesised: kick (pitch-swept sine plus a click), clap
(three noise slaps and a tail) or soft snare, closed and open hats and shaker
(one shared 1.5 s seeded noise buffer through shared filters), bass (sine for
weight plus a filtered saw so phone speakers hear it), electric piano
(two-operator FM, bright attack, mellow ring, slow auto-pan), pad (two
detuned saws per note through one drifting low-pass), marimba and pluck
leads (through a dotted-eighth echo), crash and riser.

Signal path: each song has its own output, reverb send and echo send (so a
state change can fade one song while the next starts), and its pads, keys and
bass pass through a side-chain "pump" gain that dips on each kick. Everything
meets in one bus: high-pass at 32 Hz → glue compressor (−14 dB, 3:1) →
"focus" low-pass and gain → **duck** gain → output level → speakers. The
reverb is a `ConvolverNode` with a generated 1.8 s impulse.

- **Scheduling.** `audio.js` calls `player.scheduleUntil(now + 0.35 s)` every
  90 ms. The composer writes one bar at a time; only that bar is queued. Notes
  that fall behind a throttled timer are dropped rather than played in a
  burst.
- **State changes.** `play(state)` starts the new song on the current song's
  next bar line (or next beat if the bar line is more than 2 s away) and fades
  the old one over about a second; old songs are disconnected four seconds
  later.
- **Ducking.** Every game sound calls `duckMusic(depth, hold)`; Gahook
  sounds duck through `resetPokeSoundChannel`, speech through `speakText`.
- **Focus.** During the `reading` phase the music drops to 62% and loses its
  top end (low-pass 2.4 kHz), so the question can be read (and heard, when the
  host's screen reads it aloud).
- **When it plays.** Never before a user gesture (the existing warm-up model:
  the context stays suspended until `warmGahookEffects` resumes it), never
  while muted, never with the Music switch off, and not in a hidden tab
  (`visibilitychange` fades it out and restarts it on return). If the system
  suspends the context (a phone call) it resumes when the context runs again.
- **Level.** `DEFAULT_MUSIC_LEVEL = 0.155`, chosen by measurement (below).

### Sound effects

`audio.js` builds every non-Gahook effect from one palette that matches the
music: marimba (the music's lead), FM chime, woodblock, bubble pop, round
brass, filtered-noise swish, pink-noise crowd. Pitches are C major, attacks
are 1.5–25 ms, and one trim (`SFX_LEVEL = 0.65`) keeps them level with the
Gahook sounds. In the game they play through a bus with a safety limiter
(−4 dBFS); every effect also accepts a `{ ctx, destination }` channel, which
is how the renderer and the Gahook poke channel use them.

## Inventory: before and after

| Sound | Before | After | Triggered from |
| --- | --- | --- | --- |
| Music | `GAME_MUSIC`: 5–8 raw oscillator notes looping per state, peaks around −33 dBFS | Generative engine (above) | `App` effect → `setGameMusicState` (unchanged mapping of route and phase) |
| Answer arrivals | `playAnswerOohSound`: a sine "ooh" per new answer | Rising bubbles, one per answer, climbing the scale through the question; the player's own answer is not double-counted | `AnswerGrid` (unchanged trigger) |
| Answer locked | — | **New** `playAnswerLockedSound`: woodblock + two rising marimba notes | `syncGameSoundCues`: your `ownAnswer` appears during `answering` |
| Countdown | — | **New** `playCountdownTick`: soft woodblock at 3, 2, 1 s left, rising; cancelled if you answer, the host pauses, or the phase ends | `syncGameSoundCues`, scheduled on the audio clock from `phaseEndsAt` and the server clock offset; only while you have not answered |
| Reveal | — | **New** `playRevealSound`: correct (marimba run + chimes), wrong (soft falling "aww"), neutral (soft chord) | `syncGameSoundCues`: phase becomes `reveal`; result from your answer and the revealed winning answer(s) |
| Congratulations | Square/triangle arpeggio and noise | Marimba run, chimes, sparkle, a few claps | `PlayerView` special Gahooks; Gahook Dash congratulations bird |
| Ultimate congratulations | Three square-wave arpeggio passes | Three climbing marimba runs, chimes, a small crowd | `PlayerView` |
| Ultimate congratulations, extra tap | Triangle triad | Chime triad and a pop | `PlayerView` |
| Boo | Saw descent and noise | Five low "boo" voices (formant-filtered) sliding down, with breath | `PlayerView` (final boo) |
| 1v1 arena win | `playVictoryPartySound`: square arpeggio | Fanfare and a small crowd | `client/arena.jsx` (unchanged call) |
| Game win | `playVictoryPartySound` on the finale screens, replayed on every mount or refresh | **New** `playGameWinCheer`: fanfare and a 3.2 s crowd cheer, once per game, for everyone | `syncGameSoundCues`: phase becomes `finished` (not on the first snapshot) |
| Spoken cues | `speakText` (TTS) | Unchanged, but the music now ducks while speaking | `PlayerView`, `FinishedScreen` |
| Sad Pig Gahook | `capybara`: airhorn stabs | **New** cry for `pig`; `capybara` plays it too | `playGahookFormSound` |
| Other Gahook sounds | — | Unchanged (verified byte-for-byte) | — |
| Gahook Dash, arena tap tone | — | Unchanged (social area: `offline.jsx`, `arena.jsx`) | — |

### Game cue rules (`syncGameSoundCues`)

`App` calls it with every snapshot of the room being shown (or `null`
elsewhere). The first snapshot of a room code on a page only records the
phase, question and answer, so a join, refresh or reconnect never replays a
reveal or a cheer. After that it plays what changed: answer locked, reveal,
finale cheer (at most once per ten seconds, as a guard against a phase
flicker), and keeps the countdown ticks and the reading-time focus in step.

## The Music preference

- `localStorage["gahookz-music-off"] = "1"` when off; absent or `"0"` means on.
- `setMusicEnabled(bool)` stores it and dispatches `gahookz-music-change`;
  `audio.js` listens and starts or fades the music. `useMusicPreference()` is
  the React hook.
- UI: `PlayerSettingsDialog` (a `RuleToggleRow` "Music"), `HostRulesModal`
  (a `rules-personal-row` "Music on this device", `MusicPreferenceToggle`),
  `JoinQuickMenu` (`MusicPreferenceButton`, "Turn music off/on", matching the
  menu's existing effects button). Screenshots:
  [`audio-ui/`](audio-ui/) at 390×844 and 1280×800.

## Levels

Measured by `npm run audio:samples` on the rendered signal (full table in
[`audio/README.md`](audio/README.md) and `audio/levels.json`). No sample
clips.

| Group | Peak (dBFS) | RMS (dBFS) | Loudest 400 ms |
| --- | --- | --- | --- |
| Music, five states | −19.0 to −16.5 | −33.1 to −31.0 | −30.7 to −28.7 |
| New/redesigned effects | −18.2 (bubbles) to −5.0 (ultimate congrats) | | −33.6 (ticks) to −17.6 |
| Game-win cheer | −6.0 | −22.2 | −18.5 |
| Sad Pig cry | −13.6 | −27.6 | −24.7 |
| Unchanged Gahooks (monkey, gorilla) | −14.6, −0.1 | | −30.9, −26.9 |

So the music sits roughly 10 dB under the effects (more while ducked), and the
effects sit level with the Gahook sounds. In the mixed scenes the loudest
moment is an effect (−18.8 dBFS) over ducked music.

How the mix was balanced: stems of the lobby song were rendered per
instrument (`GAHOOKZ_AUDIO_STEMS=lobby`). The first version was almost all
kick and sub-bass (sub band −1.5 dB of total energy, highs −35 dB): fine on
headphones, near-silent on a phone speaker. Kick and sub were cut, keys,
pad, clap and hats raised, and the electric piano and bass given more
harmonics. Final balance of the five states (energy per band relative to the
total): sub −3 to −4 dB, 120–300 Hz −5 to −6, 300–800 Hz −6 to −9,
800 Hz–2 kHz −11 to −16, 2–5 kHz −19 to −25, 5–12 kHz −18 to −24, spectral
centroid 300–545 Hz — warm, as lo-fi and disco-house are, but no longer bass
only.

CPU and memory: the engine creates about 15 (prep, welcome) to 43 (finale)
short-lived sound sources a second; everything else (filters, buses, the
reverb) is shared per song. A five-minute realtime soak through every state,
with a transition every 20 s, kept the JS heap at 2.8–2.9 MB after garbage
collection.

## Commands and results

All with Node 24 (`PATH=/usr/bin:$PATH`) and `flock /tmp/gahookz-verify.lock`.

| Command | Result |
| --- | --- |
| `npm run check` | pass — 215 unit tests (9 new for the composer), typecheck, build |
| `npm run test:disposable -- bash -c "npm run standalone:smoke:gahooks && …onboarding && …pwa && …social-creation && …information && …party-view && …finals"` | pass, 7/7 `"ok": true` |
| `npm run test:disposable -- npm run standalone:smoke:party-view` (after adding the Music assertion) | pass |
| `npm run test:browser:audio` | pass, 7 checks: no cheer on a refresh into a finished game; one cheer when a game ends; answer-locked and reveal once each; countdown ticks scheduled; mute silences every cue; Music switch stops and restarts the music while effects still play, and persists; `pig` and `capybara` make the same cry, not the monkey's |
| `GAHOOKZ_AUDIO_SOAK_SECONDS=300 npm run test:browser:audio` | pass, heap growth after warm-up 0.1 MB |
| `npm run audio:samples` | 24 samples, 1.4 MB, no clipping |
| `npm run test:disposable -- node docs/verification/2026-09-25-update/audio-ui/capture.mjs` | 6 screenshots, no page errors |
| `npm run test:disposable -- npm run test:browser` | pass |

## Cross-area edits

- `app.jsx` (ui-shell): `App` gains one effect calling `syncGameSoundCues`;
  imports. `PlayerSettingsDialog`: a Music row. `JoinQuickMenu`: a Music
  button. New `MusicPreferenceToggle` / `MusicPreferenceButton` beside
  `EffectsPreference*`.
- `app.jsx` (ui-lobby): `HostRulesModal` gains one `rules-personal-row`.
- `app.jsx` (ui-game): `FinishedScreen` no longer calls
  `playVictoryPartySound` (the cheer replaces it; the "Winner …" speech
  stays); `PartyFinalScoreboard` loses the effect that called it.
- `client/preferences.jsx` (ui-shell): the Music preference.
- `build-client.mjs`, `dev.mjs`, `.gitignore`, `service-worker.js`
  (platform/ui-shell): register `music.ts` and `music-composer.ts`.
- `package.json`: `audio:samples`, `test:browser:audio`.
- `smoke-party-view.mjs` (quality): two assertions for the Music switch.

## Known issues and follow-ups

- **Nobody has listened yet.** The agent cannot hear; balance and levels are
  measured, not judged by ear. Tyson should play the samples. Easy knobs:
  `DEFAULT_MUSIC_LEVEL` (music.ts), `SFX_LEVEL` (audio.js), and the patterns,
  tempos and progressions in `MUSIC_STYLES` (music-composer.ts).
- The unchanged Rage Gorilla Gahook peaks at −0.1 dBFS; Gahook sounds go
  straight to the speakers without the effects limiter. Left as it was
  because the brief keeps the Gahook sounds; routing the poke channel through
  the limiter would be a one-line follow-up.
- The welcome screen has no sound or music control (it never had a mute
  either), and a host mid-game reaches personal sound settings only through
  Lobby rules in the lobby. A shell-level settings door would fix both.
- Answer bubbles are still triggered by `AnswerGrid` from other players'
  selections. When U23 stops sending other players' choices before the
  reveal, move this trigger into `syncGameSoundCues` using `answerCount`.
- Gahook Dash (`offline.jsx`) and the arena tap tone (`arena.jsx`) still use
  their own square/sine beeps; they could adopt the new palette (social area).
- The host's question read-aloud (`PlayerGame`) does not call `speakText`, so
  it relies on the reading-time focus dip rather than an explicit duck.
- `FinishedScreen` still speaks "Winner …" on mount, including after a
  refresh (unchanged behaviour); over the cheer it reads as an announcer.
