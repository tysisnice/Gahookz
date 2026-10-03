# UI 1 — Shell — area guide

Last verified against the code: 2026-10-04, commit daaf5ef

## Purpose

UI 1 owns the frame every screen sits in, whatever phase the room is in:
routing and browser history, the top bar, the host/player/join menus, dialogs
and overlays, tooltips and switches, the CSS design tokens, local preferences
(mute, music, reduced effects), the PWA wrapper, and the static Information and
Legal pages. It also owns the plumbing that turns server state into React
state: the reducer, the `useEvents` hook and the `api` client.

Everything else in the browser (UI 2 lobby, UI 3 live game, social, audio-art)
is drawn inside this frame and calls into it, so a change here must stay
backwards-compatible. The frame must never put an account in front of a guest
(rule 1 in `CLAUDE.md`): nothing in this area requires sign-in.

## What players see

- **A top bar.** The Gahookz name, a phase pill (`Join`, `Lobby` or `Live`), the
  four-letter room code, and a menu button. Both pills are at most 28 px tall.
  The host also gets a **Skip phase** button while a round can be skipped.
- **A room menu, three flavours.** `Host menu` (Share Link, tutorials, Change
  name & profile, Gahook picker, Exit as Player, Reset Lobby, Exit Lobby),
  `Player menu` (Share Link, tutorials, Change name & profile, Gahook picker,
  Settings, Exit Lobby) and a plain `Menu` on the join screen (reduce effects,
  music, Exit Lobby). On a phone the menu opens as a full sheet over a backdrop;
  on a wide screen it is a dropdown.
- **`(i)` tips.** A small round button that explains a setting. It opens on
  hover, keyboard focus or tap, and always stays inside the screen.
- **On/Off switches** (`ToggleSwitch`), used by Lobby rules, Settings and the
  Majority Rulez scoring row.
- **The Back button does something sensible.** In a room, Back closes the
  topmost menu, dialog or editor first. With nothing open it asks **"Leave game?
  / Are you sure?"** with **No** (focused) and **Yes**. On the welcome screen,
  Information and Legal pages Back behaves like any website.
- **Toasts.** A short error or status message at the top of the screen that
  clears itself after five seconds or on its close button.
- **Connection screens.** `RoomLoading` ("opening the room", with a slow-load
  hint after about 6.5 seconds), the offline screen and the "server updated"
  screen, all of which keep the Back guard alive.
- **Host-presence notices** ("The host disconnected - waiting for them to come
  back (0:47)", "<name> is now the host"). Systems owns the rules; the shell
  mounts them, see [systems.md](systems.md).
- **Installable app.** Add to Home Screen works, a service worker keeps the
  shell loading offline-ish, and the Information and Legal pages are available
  without a room (`/information`, `/legal`).

## Code map

Matches the ui-shell rows of the [ownership map](README.md#browser--standalonepublic).
Function names are more reliable than line numbers; `app.jsx` is about 5,500 lines.

| Concern | Where |
| --- | --- |
| App root, routing, `RoomLoading`, `HostMode`, `HostView` and `PlayerView` (routing and overlay plumbing only), `getRoute`, `navigateTo`, `useEvents`, `api`, `reducer`, session helpers (`getClientKey` ... `buildRoomLink`), `useModalBodyLock`, `useCloseMenuOnOutside`, `useDetailsMenu` | `standalone/public/app.jsx` |
| `HostQuickMenu`, `PlayerQuickMenu`, `JoinQuickMenu`, `PlayerSettingsDialog`, `EffectsPreference*`, `MusicPreference*`, `RoomStatusBanner`, `HostTopBar`, `PauseButton`, `TimerBar`, `useCountdown`, `labelForPhase` | `standalone/public/app.jsx` |
| `ToggleSwitch`, `InfoTip`, `placeTipBubble`, `QuickMenu`, `QUICK_MENU_SHEET_QUERY`, `useMediaQuery` | `standalone/public/client/controls.jsx` |
| Mute, music and reduced-effects preferences | `standalone/public/client/preferences.jsx` |
| Browser network boundary: `createApiClient`, `createLiveConnection`, `createSnapshotGate`, `connectionMessage`, `describeSnapshotCompatibility`, `nextClockOffset` | `standalone/public/client/net.ts` (shared with systems; tests in `net.test.ts`) |
| Information hub, Legal hub, room QR code | `client/information.jsx`, `client/legal.jsx`, `client/qr.jsx` |
| PWA shell and vendored runtime | `index.html`, `manifest.webmanifest`, `service-worker.js`, `vendor-bootstrap.js`, `vendor/`, `react-shim.js`, `react-dom-client-shim.js`, `use-sync-selector.js` (release-hash stamping belongs to platform) |
| Design tokens (`:root` custom properties, the `--z-*` scale) and global rules | top of `standalone/public/styles.css` |

Also part of this area, added in the 2026-09-25 update, but **not named in the
ownership map yet** (the map lists `controls.jsx` only for `ToggleSwitch` and
`InfoTip`):

| Concern | Where |
| --- | --- |
| Back-button stack (pure, no React), unit-tested | `standalone/public/client/back-stack.ts`, `back-stack.test.ts` |
| `useBackToClose`, `useScrollLock`, `LeaveGameGuard` | `standalone/public/client/history.jsx` |

Mounted by the shell but owned elsewhere:

| Concern | Owner |
| --- | --- |
| `HostPresenceNotices` (`client/host-presence.jsx`), mounted in `HostMode` and `PlayerView` | systems |
| `OfflineExperience`, `ServerUpdateExperience`, `useServerConnection` (`client/offline.jsx`) | social (Gahook Dash lives there too) |
| `WelcomeScreen`, `JoinScreen` | ui-lobby |

## How it works

_Pending._

## Invariants

_Pending._

## Tests

_Pending._

## Common changes

_Pending._

## Known issues

_Pending._
