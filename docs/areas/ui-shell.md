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
  four-letter room code, and a menu button. Both pills are small labels (26 px
  tall, 24 px at 360 px wide and below).
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
- **Connection screens.** `RoomLoading` ("Loading GOOK", then after about 6.5
  seconds "Room GOOK isn't ready" with Retry and Back to home), the offline
  screen (Gahook Dash) and the "server updated" screen. The last two keep the
  Back guard alive, so a brief outage does not cost a player their room.
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

### Routing

There is no router library. `getRoute()` in `app.jsx` reads `location.pathname`
and returns `{ mode, code }`; `App` keeps it in state and re-reads it on every
`popstate`. `navigateTo(path)` is `history.pushState` plus a synthetic
`popstate`, so one code path handles Back, links and programmatic moves.

| URL | `mode` | Notes |
| --- | --- | --- |
| `/` | `welcome` | `?room=CODE` prefills the code, `&locked=1` asks for the password (`buildWelcomePath`) |
| `/<CODE>` | `room` | Canonical room URL (`buildRoomPath`). Four letters, any case; the code is normalised to upper case |
| `/host/<CODE>`, `/player/<CODE>`, `/<CODE>/host`, `/<CODE>/player` | `room` | Legacy shapes, still routed. The role comes from the server, not the URL |
| `/information`, `/legal` | `information`, `legal` | Static hubs, no room, reachable offline and mid-outage |

`serveStatic` in `server.js` must list the same shapes and serve `index.html`
for them. Add a route in both places or a reload will 404. `App` renders one of
`InformationHub`, `LegalHub`, `WelcomeScreen`, `RoomLoading` (route code not yet
in the store), `HostMode` (`lobby.isHost`) or `PlayerView`. The document title
follows the mode.

### How state reaches the screen

```text
POST /api/*  --api()-->  server  --SSE "state" / POST /api/state--> useEvents --> reducer --> useSelector
```

- **`api(path, payload, options)`** wraps `createApiClient` from `client/net.ts`.
  Always `POST` JSON, never a query string; it adds `code` and `playerKey`,
  returns `{ ok, ... }` (never throws), and after a successful non-`/api/room`
  call asks `useEvents` for a fresh snapshot unless `refresh: false`.
- **`useEvents(mode, code, playerKey)`** runs once per room. It opens the live
  stream with `createLiveConnection` (a single-use ticket, one stream, retry
  after 1.5 s), fetches `POST /api/state` once, and feeds both into
  `createSnapshotGate`, which drops snapshots at or below the applied
  `stateVersion`. Recovery polling only starts after 25 s of silence (the
  server heartbeat is 15 s) and on returning to a hidden tab. A missing room or
  a ban navigates to `/?room=CODE`; a locked room retries with the saved
  password first.
- **`describeSnapshotCompatibility`** compares the snapshot's schema version
  with `SNAPSHOT_SCHEMA_VERSION` (1) so a deploy in progress shows an
  explanation instead of a half-drawn room.
- **`reducer`** (one Redux store, `createStore(reducer)`) holds `connected`,
  `connectionError`, `error` (the toast) and `lobby` (the last snapshot merged
  over `emptyLobby`). `SNAPSHOT` also updates the server clock offset used by
  every countdown and keeps fresh local pokes and optimistic answers so a
  slow snapshot does not erase them. Components read with `useSelector`.
- **`client/net.ts`** is the browser's only network boundary. Everything
  ambient (`fetch`, `EventSource`, timers) is injected, so `net.test.ts` tests
  ordering, reconnects and "exactly one stream" without a browser. Exports:
  `createApiClient`, `createLiveConnection`, `createSnapshotGate`,
  `describeSnapshotCompatibility`, `connectionMessage`, `nextClockOffset`,
  `redactCredentials` and the `*Like` interfaces. Systems shares the file.

Identity lives in `localStorage`: `gahookz-client-key` is the device's
`playerKey` (`getClientKey`), `gahookz-last-join` the last name and picture.
Room passwords are kept per room by `saveRoomPassword` and a `?pwd=` in the URL
is read once and removed from the address bar.

### The overlay system and z-index scale

Everything that floats over the page uses one scale, defined as custom
properties at the top of `styles.css`. Use a token, never a bare number, for
anything `fixed` or portalled to `<body>`. Small local numbers (0 to 5) inside
one component stay local.

| Token | Value | Used by |
| --- | --- | --- |
| `--z-chat` | 40 | Floating room chat (`.waiting-room-social`) |
| `--z-notice` | 44 | Host-presence notices (`.host-presence-layer`, pointer events off) |
| `--z-popover` | 48 | `InfoTip` bubbles |
| `--z-menu` | 50 | Quick menus and the phone sheet backdrop, player-card action menus |
| `--z-modal` | 60 | Lobby rules, Settings, force start, tutorials, creation dialogs, account delete |
| `--z-gahook` | 70 | Jump scares, Counter Gahook prompt, host mini Gahooks |
| `--z-arena-reactions` | 88 | 1v1 crowd reactions (`client/arena.css`) |
| `--z-arena` | 94 | 1v1 arena overlay (`client/arena.css`) |
| `--z-confirm` | 96 | "Leave game?", so it shows over the arena too |
| `--z-toast` | 100 | Error and status toasts |

Conventions every overlay follows:

- Portal to `document.body` (`window.ReactDOM.createPortal`), so no ancestor
  can clip or re-stack it.
- Freeze the page with `useScrollLock(active)` (`useModalBodyLock` in
  `app.jsx` is an alias). The lock is reference-counted, so a dialog opened from
  the phone sheet does not reset the scroll position when either closes.
- Register with `useBackToClose(open, onClose)` (next section) and use the
  returned `isTopmost()` in Escape and outside-click handlers.
- Focus moves inside on open and returns to the trigger on close.

### The Back-button contract

Room URLs are one URL, so menus and dialogs used to be invisible to history and
Back dropped players out of the room. `client/back-stack.ts` (pure, tested with
a fake history in `back-stack.test.ts`) and `client/history.jsx` fix that:

```text
[ ... | /CODE base | /CODE guard | /CODE overlay 1 | /CODE overlay 2 ]
```

- **`useBackToClose(open, onClose)`**: while `open`, Back calls `onClose`.
  Closing any other way consumes the entry with `history.go()`, so history
  never grows. Returns a stable `isTopmost()`. Wired into the three menus,
  Settings, Lobby rules, the force-start confirm, How to play, the custom Gahook
  creator, both drawing editors, profile editing, the party view and the host's
  "join as player" form.
- **`<LeaveGameGuard active onLeave />`**: mounted once by `App` while the
  person is *in* a room (the host or a joined player; not on the join form).
  Back with nothing open shows "Leave game? / Are you sure?" with No (focused)
  and Yes. Yes calls `navigateTo("/")`, exactly like Exit Lobby. No restores the
  guard entry from inside the tap.
- **Why no re-push without a tap.** Chrome skips history entries a page added
  without a user activation, so every push happens inside the tap that opened
  something (or the tap on No). A second Back while the prompt shows leaves the
  room.
- Entries carry only `{ gahookzBack: { path, depth } }`, never which overlay made
  them; the stack reconciles the browser to the number it wants. A close and an
  open in the same tick cancel out. Changing page forgets the layers without
  calling their `onBack`.
- `createBackStack` exports `open`, `close`, `isTop`, `guard`, `restoreGuard`,
  `wanted` and `dispose`; `BACK_STACK_MARK` names the history-state key.

### Menus

`QuickMenu` (`client/controls.jsx`) is the shell of the host, player and join
menus. Its trigger is a `<summary>` inside a `<details>` that React controls,
so the old styles and tests keep their hooks. It switches presentation with
`useMediaQuery(QUICK_MENU_SHEET_QUERY)`, where `QUICK_MENU_SHEET_QUERY` is
`(max-width: 720px), (max-height: 560px)`:

- **Sheet** (phones, short landscape): a portalled `role="dialog"
  aria-modal="true"` over `.quick-menu-backdrop`, scroll lock, its own
  scrolling, a close button that takes focus, Tab trapped inside.
- **Dropdown** (wide): the same children under the button, closed by outside
  pointer-down, Escape or Back, capped to the window height.
- `children` may be `({ close }) => ...`; `close({ restoreFocus: false })` is for
  an action that opens another screen. Contents stay mounted while closed, so a
  dialog opened from the menu keeps its state. `PlayerView` owns the Settings
  dialog for the player menu for that reason.

`HostQuickMenu`, `PlayerQuickMenu` and `JoinQuickMenu` in `app.jsx` supply the
items. The host reaches personal switches through Lobby rules (ui-lobby); a
player reaches them through `PlayerSettingsDialog`.

### Tooltips

`InfoTip` is a real `<button aria-expanded aria-describedby>` plus a
`role="note"` bubble that stays in the tree (hidden) so a screen reader can read
it. Hover and focus show it; a click pins it, and Escape or a tap elsewhere
unpins. `placeTipBubble(bubble, anchor, align)` positions it in viewport
coordinates with `position: fixed`: above by default, below when there is more
room, clamped 8 px (`TIP_EDGE_MARGIN`) inside the screen at any width, then
corrected for any transformed ancestor by measuring where it landed. It re-runs
on resize and on any scroll, so a scrolling dialog cannot strand it.

### Preferences

All local to the device (no account, no server). `client/preferences.jsx` keeps
three switches in `localStorage` and mirrors them onto `<html>`:

| Preference | Key | Effect |
| --- | --- | --- |
| Mute | `gahookz-effects-muted` | `html.gahookz-muted`; suspends the audio context, cancels speech and custom audio |
| Reduce effects | `gahookz-effects-reduced` | `html.gahookz-reduced-effects` |
| Music | `gahookz-music-off` (stored inverted, so music is on by default) | `MUSIC_EVENT`, which `client/audio.js` follows |

`effectsReduced()` is true if muted, preferred or the system reports
`prefers-reduced-motion`. Each preference has a getter, a setter, a
`use...Preference` hook and a `CustomEvent`, so every switch on screen stays in
step. CSS keys off the classes, not off the hooks.

### PWA shell

`index.html` loads the stylesheets and an import map (React and Redux are
vendored under `vendor/`; `react-shim.js`, `react-dom-client-shim.js` and
`use-sync-selector.js` bridge the import map), then `vendor-bootstrap.js`, which
registers `/service-worker.js`, captures `beforeinstallprompt` and imports
`/app.js`. `manifest.webmanifest` is `display: standalone`, scope `/`, with
192, 512 and maskable icons.

`service-worker.js` precaches `SHELL_ASSETS` into `gahookz-shell-<release>` on
install and deletes older `gahookz-shell-*` caches on activate. Fetch rules:
`/api/*`, `/events` and media are never cached; navigations are network-first
with `/index.html` as the offline fallback; assets with `?v=` are network-first
with a cache fallback; the rest is cache-first. The release hash comes from the
build and is stamped into these three tracked files by `build-client.mjs`; never
hand-edit it. See [platform.md](platform.md) for the stamping rules.

### Breakpoints

`styles.css` has no breakpoint tokens; media queries are written per component.
The ones actually used (`grep -o '@media[^{]*' styles.css | sort | uniq -c`),
most common first:

| Query | Count | Typical use |
| --- | --- | --- |
| `(prefers-reduced-motion: reduce)` | 7 | Stop animation |
| `(max-width: 760px)` | 4 | Main phone layout |
| `(min-width: 761px) and (max-width: 920px)` | 4 | Tablet |
| `(max-width: 640px)` | 3 | Narrow phone adjustments |
| `(max-width: 920px)`, `(max-width: 560px)`, `(max-width: 360px)` | 2 each | Tablet, small phone, tiny phone (top bar shrinks) |
| `(min-width: 1360px)` | 2 | Wide desktop |
| `(max-width: 720px), (max-height: 560px)` | 1 | Menu sheet (mirrors `QUICK_MENU_SHEET_QUERY`) |
| `(max-width: 900px) and (max-height: 560px)` | 1 | Short landscape |
| `(min-width: 921px)`, `1100px`, `1600px` | 1 each | Desktop steps |
| `print` | 1 | Printable pages |

Plus single-use `max-width` queries at 860, 840, 580 and 520 px.

### Accessibility conventions

- Switches are `role="switch"` with `aria-checked` and a visible On/Off.
- Dialogs are `role="dialog" aria-modal="true" aria-labelledby`; the Leave
  prompt is `role="alertdialog"` and focuses its safe answer, No.
- Escape closes only the topmost overlay (`isTopmost()`); Tab is trapped in
  sheets and the Leave prompt.
- Toasts are `role="status"`, load failures `role="alert"`, the join preview
  `aria-live="polite"`. Icon-only buttons carry an `aria-label`.
- Never rely on hover: tips open on focus and tap too.
- Motion respects `prefers-reduced-motion` and `html.gahookz-reduced-effects`.

## Invariants

_Pending._

## Tests

_Pending._

## Common changes

_Pending._

## Known issues

_Pending._
