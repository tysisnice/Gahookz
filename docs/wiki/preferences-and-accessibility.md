# Preferences and accessibility

> Three personal switches for sound and motion, kept on your device, with no account needed.

**Area:** [UI shell](../areas/ui-shell.md) · **Status:** live · **Last reviewed:** 2026-10-07

## What it is

Every player can turn down the noise and the motion. The switches belong to the device, not the room: nobody else is affected and nothing is saved on the server.

- **Mute sound effects** silences music, effects and spoken cues.
- **Music** turns off only the background music ([Music and sound](music-and-sound.md)).
- **Reduce Gahook effects** keeps every Gahook and its scoring but removes the full-screen animation, shaking and flashing; the character shows as a still picture.

The game also follows the device's own "reduce motion" setting. Nothing in the game needs sound to play.

## Rules and numbers

- **Where:** the player **Settings** dialog (all three, under Accessibility); the host's **Lobby rules** (Reduce Gahook effects and Music, labelled "on this device"); the join-screen **Menu** (Reduce Gahook effects, Music).
- **Mute wins.** Muted counts as reduced effects too.
- **Not the same everywhere.** The join menu and the host's Lobby rules switch set reduced effects *and* mute together. The Settings dialog's reduced-effects switch sets only reduced effects. This is a known inconsistency ([area guide](../areas/audio-art.md#known-issues)).
- Music defaults to on; the others to off.
- Switches are real on/off switches that screen readers announce with their state. Menus and dialogs close on Escape and Back, and return focus to where they were opened ([Navigation](navigation-and-back-button.md)).
- The welcome screen has no sound controls.

## Where it lives

| Part | Code |
| --- | --- |
| Storage and hooks (`gahookz-effects-muted`, `gahookz-effects-reduced`, `gahookz-music-off`) | `standalone/public/client/preferences.jsx` — `setEffectsMuted`, `setEffectsReducedPreference`, `setMusicEnabled` |
| Switches and dialogs | `standalone/public/app.jsx` — `PlayerSettingsDialog`, `HostRulesModal`, `JoinQuickMenu`; `client/controls.jsx` — `ToggleSwitch` |
| Reduced-motion styles | `standalone/public/styles.css` — `.gahookz-reduced-effects`, `.gahookz-muted` |
| Tests | `standalone/smoke-party-view.mjs`, `standalone/browser-audio-cues.mjs` |

## Related

- [Lobby rules](lobby-rules.md), [Gahooks](gahooks.md), [Navigation and the Back button](navigation-and-back-button.md)

## History

- 2026-07-20 — Mute and reduced-effects preferences exist from the first commit (`dd449f2`).
- 2026-09-19 — The Settings dialog arrives in the release-candidate overhaul (`78a1382`).
- 2026-10-03 — A separate Music switch is added in all three places (`f997566`).
