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
`popstate`, so Back, links and code all take one path.

| URL | `mode` | Notes |
| --- | --- | --- |
| `/` | `welcome` | `?room=CODE` prefills the code; `&locked=1` asks for the password (`buildWelcomePath`) |
| `/<CODE>` | `room` | Canonical (`buildRoomPath`). Four letters, any case, normalised to upper case |
| `/host/<CODE>`, `/player/<CODE>`, `/<CODE>/host`, `/<CODE>/player` | `room` | Legacy shapes, still routed; the URL never chooses the role, the server does |
| `/information`, `/legal` | `information`, `legal` | Static hubs. They still render during an outage |

`serveStatic` in `server.js` lists the same shapes and serves `index.html` for
them, so a new route needs both. `App` renders `InformationHub`, `LegalHub`,
`WelcomeScreen`, `RoomLoading` (the route's code is not yet in the store),
`HostMode` (`lobby.isHost`) or `PlayerView`.

### How state reaches the screen

```text
api() POST /api/*  -->  server  -->  SSE "state" and POST /api/state  -->  useEvents  -->  reducer  -->  useSelector
```

- **`api(path, payload, options)`** wraps `createApiClient` (`client/net.ts`).
  Always a `POST`, never a query string; it adds `code` and `playerKey`, never
  throws, and returns `{ ok, ... }`. After a successful non-`/api/room` call it
  asks `useEvents` for a fresh snapshot, unless `refresh: false`.
- **`useEvents(mode, code, playerKey)`** runs once per room: one stream from
  `createLiveConnection` (single-use ticket, reconnect after 1.5 s) plus a first
  `POST /api/state`, both through `createSnapshotGate`, which drops any snapshot
  at or below the applied `stateVersion`. A recovery snapshot is fetched only
  after 25 s of silence (the server heartbeat is 15 s) or when a hidden tab
  returns. A missing room or a ban goes to `/?room=CODE`; a locked room first
  retries with the password this tab holds.
- **`describeSnapshotCompatibility`** checks the snapshot's schema version
  against `SNAPSHOT_SCHEMA_VERSION` (1), so a deploy in progress explains itself
  instead of drawing half a room.
- **`reducer`** (one Redux store) holds `connected`, `connectionError`, `error`
  (the toast) and `lobby` (the last snapshot over `emptyLobby`). `SNAPSHOT` also
  updates the server clock offset used by countdowns and keeps fresh local pokes
  and optimistic answers a slow snapshot would erase. Components use `useSelector`.
- **`client/net.ts`** is the only network boundary. `fetch`, `EventSource` and
  timers are injected, so `net.test.ts` covers ordering, reconnects and "exactly
  one stream" in plain `node --test`. Systems shares the file.

Identity is local: `gahookz-client-key` in `localStorage` is the device's
`playerKey` (`getClientKey`), `gahookz-last-join` the last name and picture, and
room passwords live in `sessionStorage` per room. A `?pwd=` in the URL is read
once and removed from the address bar.

### The overlay system and z-index scale

Everything that floats over the page uses one scale, custom properties at the
top of `styles.css`. Use a token, never a bare number, for anything `fixed` or
portalled to `<body>`; local numbers 0 to 5 inside one component stay local.

| Token | Value | Used by |
| --- | --- | --- |
| `--z-chat` | 40 | Floating room chat |
| `--z-notice` | 44 | Host-presence notices (pointer events off) |
| `--z-popover` | 48 | `InfoTip` bubbles |
| `--z-menu` | 50 | Quick menus and sheet backdrop, player-card action menus |
| `--z-modal` | 60 | Lobby rules, Settings, force start, tutorials, creation dialogs |
| `--z-gahook` | 70 | Jump scares, Counter Gahook prompt, host mini Gahooks |
| `--z-arena-reactions` | 88 | 1v1 crowd reactions (`client/arena.css`) |
| `--z-arena` | 94 | 1v1 arena overlay (`client/arena.css`) |
| `--z-confirm` | 96 | "Leave game?", visible over the arena too |
| `--z-toast` | 100 | Error and status toasts |

Every overlay: portals to `document.body`; freezes the page with
`useScrollLock(active)` (reference-counted, so a dialog opened from the phone
sheet does not reset scroll; `useModalBodyLock` in `app.jsx` is an alias);
registers with `useBackToClose` and uses the returned `isTopmost()` in its
Escape and outside-click handlers; moves focus in on open and back to the
trigger on close.

### The Back-button contract

A room is one URL, so menus and dialogs were invisible to history and Back
dropped players out of the room. `client/back-stack.ts` (pure, tested with a fake
history in `back-stack.test.ts`) and `client/history.jsx` give each open overlay
one history entry above one "guard" entry for the room:

```text
[ ... | /CODE base | /CODE guard | /CODE overlay 1 | /CODE overlay 2 ]
```

- **`useBackToClose(open, onClose)`**: while `open`, Back calls `onClose`. Closing
  any other way consumes the entry with `history.go()`, so history never grows.
  Wired into the three menus, Settings, Lobby rules, the force-start confirm,
  How to play, the custom Gahook creator, the drawing editors, profile editing,
  the party view and the host's "join as player" form.
- **`<LeaveGameGuard active onLeave />`**: mounted once by `App` while the person
  is in a room (the host or a joined player, not the join form). Back with nothing
  open asks "Leave game? / Are you sure?" with No (focused) and Yes. Yes is
  `navigateTo("/")`, like Exit Lobby; No restores the guard entry.
- **Pushes happen only inside a tap.** Chrome skips history entries added without a
  user activation, so a second Back while the prompt shows leaves the room.
- Entries carry only `{ gahookzBack: { path, depth } }`; the stack reconciles the
  browser to the count it wants, and a close plus an open in one tick cancel out.
  Changing page forgets the layers without calling `onBack`. `createBackStack`
  exports `open`, `close`, `isTop`, `guard`, `restoreGuard`, `wanted`, `dispose`.

### Menus

`QuickMenu` (`client/controls.jsx`) is the shell of the host, player and join
menus. Its trigger is a `<summary>` in a React-controlled `<details>`, so old
styles and tests keep their hooks. `useMediaQuery(QUICK_MENU_SHEET_QUERY)`, where
`QUICK_MENU_SHEET_QUERY` is `(max-width: 720px), (max-height: 560px)`, picks:

- **Sheet** (phones, short landscape): a portalled `role="dialog" aria-modal="true"`
  over `.quick-menu-backdrop`, scroll lock, its own scrolling, a close button that
  takes focus, Tab trapped inside.
- **Dropdown** (wide): the same children under the button, closed by an outside
  pointer-down, Escape or Back.

`children` may be `({ close }) => ...`; `close({ restoreFocus: false })` is for an
action that opens another screen. Contents stay mounted while closed, so a
dialog opened from the menu keeps its state (`PlayerQuickMenu` renders
`PlayerSettingsDialog` inside its children for that reason). Hosts reach the
personal switches through Lobby rules (ui-lobby), players through Settings.

### Tooltips

`InfoTip` is a `<button aria-expanded aria-describedby>` plus a `role="note"`
bubble that stays in the tree, hidden, so a screen reader can read it. Hover and
focus show it, a click pins it, Escape or a tap elsewhere unpins it.
`placeTipBubble(bubble, anchor, align)` places it in viewport coordinates
(`position: fixed`, so a scrolling dialog cannot clip it): above by default, below
when there is more room, clamped 8 px inside the screen at any width, then
corrected for a transformed ancestor by measuring where it landed. It re-runs on
resize and on any scroll.

### Preferences

Local to the device; no account, no server. `client/preferences.jsx` keeps three
switches in `localStorage` and mirrors them onto `<html>`:

| Preference | Key | Effect |
| --- | --- | --- |
| Mute | `gahookz-effects-muted` | `html.gahookz-muted`; suspends audio, cancels speech |
| Reduce effects | `gahookz-effects-reduced` | `html.gahookz-reduced-effects` |
| Music | `gahookz-music-off` (inverted: on by default) | `MUSIC_EVENT`, followed by `client/audio.js` |

`effectsReduced()` is true if muted, preferred, or the system reports
`prefers-reduced-motion`. Each has a getter, setter, `use...Preference` hook and
`CustomEvent`, so every switch on screen stays in step.

### PWA shell

`index.html` loads the stylesheets and an import map (React and Redux are
vendored in `vendor/`, bridged by the `*-shim.js` files and
`use-sync-selector.js`), then `vendor-bootstrap.js`, which registers
`/service-worker.js`, captures `beforeinstallprompt` and imports `/app.js`.
`manifest.webmanifest` is `display: standalone`, scope `/`, with 192, 512 and
maskable icons.

`service-worker.js` precaches `SHELL_ASSETS` into `gahookz-shell-<release>` and
deletes older `gahookz-shell-*` caches on activate. `/api/*`, `/events` and media
are never cached; navigations are network-first with `/index.html` as the offline
fallback; `?v=` assets are network-first with a cache fallback; the rest is
cache-first. The release hash is stamped into `index.html`, `service-worker.js`
and `vendor-bootstrap.js` by the build; never hand-edit it. Stamping rules:
[platform.md](platform.md).

### Breakpoints

No tokens; each component writes its own media queries. Counts from
`grep -o '@media[^{]*' styles.css | sort | uniq -c | sort -rn`:
`prefers-reduced-motion: reduce` (7); `max-width` 760 (4), 640 (3), 920 (2), 560
(2), 360 (2, the top bar shrinks), and one each of 1250, 1180, 900, 860, 840, 720,
580, 520, 480, 380; `min-width: 761px` to `920px` (4), 1360 (2), and one each of
921, 1100, 1600; two height-aware queries (`max-width: 900px and max-height:
560px`, `max-width: 640px, max-height: 520px`); and `print` (the Information
page). The menu sheet breakpoint is not in CSS: `QUICK_MENU_SHEET_QUERY` is
evaluated in JavaScript. Check phone widths 320, 360 and 390, landscape 844 x 390,
and desktop 1280.

### Accessibility conventions

- Switches are `role="switch"` with `aria-checked` and a visible On/Off.
- Dialogs are `role="dialog" aria-modal="true" aria-labelledby`; the Leave prompt
  is `role="alertdialog"` and focuses its safe answer, No.
- Escape closes only the topmost overlay; Tab is trapped in sheets and the prompt.
- Toasts are `role="status"`, load failures `role="alert"`; icon-only buttons
  carry an `aria-label`. Nothing depends on hover: tips open on focus and tap.
- Motion respects `prefers-reduced-motion` and `html.gahookz-reduced-effects`.

## Invariants

- **Guest play never needs an account.** Nothing in the frame, the menus or the
  join path may ask for sign-in; accounts only add extras (`client/account.jsx`).
- **One overlay stack.** Use the `--z-*` tokens, the shared scroll lock and
  `useBackToClose`; never a bare large `z-index` and never a second body lock.
- **Escape and Back close one layer at a time**, the topmost first, and focus
  returns to the trigger. Leaving a room by Back is always confirmed.
- **Tooltips, menus and sheets stay fully inside the viewport at 320 px wide.**
- **Credentials stay out of URLs and logs.** `api()` and `fetchSnapshot` use
  `POST` bodies; `redactCredentials` exists for anything that echoes a payload.
- **A snapshot the client cannot render must explain itself**, not half-draw.
- **The release hash is never hand-edited**, and the three stamped files are
  committed after a final `npm run build`.
- **Generated files** (`app.js`, `client/*.js` except `audio.js` and
  `gahook-forms.js`, `release.json`) are build output: edit `.jsx`/`.ts`.

## Tests

Run under the shared lock with Node 24 (`PATH=/usr/bin:$PATH`, `node --version`
must say v24). The ui-shell profile, plus the navigation harness:

```bash
flock /tmp/gahookz-verify.lock npm run check
flock /tmp/gahookz-verify.lock npm run test:disposable -- bash -c "npm run standalone:smoke:layout && npm run standalone:smoke:pwa && npm run standalone:smoke:desktop-ui && npm run standalone:smoke:onboarding"
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run test:browser:navigation
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run test:browser:mobile
```

- **Unit:** `back-stack.test.ts` (the Back-stack rules against a fake history) and
  `net.test.ts` (ordering, reconnects, one stream). `npm run check` runs both.
- **Source-text smokes** (`layout`, `pwa`, `onboarding`, `desktop-ui`) assert that
  structures, strings and shell stamps exist; they do not prove the screen looks
  right. When you legitimately move code they describe, update the assertion.
- **`browser-navigation.mjs`** drives Chromium at 320x568, 360x740, 390x844 and
  1280x800: tooltips stay 8 px inside, pill sizes, one guard entry per room, Back
  closes one layer at a time, Leave game? No/Yes/Escape, the phone sheet over the
  chat, the desktop dropdown, focus return. **`browser-mobile-ui.mjs`** measures
  phone, short-landscape and desktop geometry for the lobby and game screens.

**Taking screenshots.** A build does not verify a layout, so look at one. Both
harnesses refuse anything but `http://127.0.0.1:3199` and create their rooms
over the API (`POST /api/room`, `/api/player/join`). They open one
`createBrowserContext()` per player, `setViewport({ width, height, isMobile,
hasTouch, deviceScaleFactor: 2 })`, and seed `gahookz-client-key` plus
`gahookz-how-to-play-seen-v2-<mode>` in `localStorage` so no tutorial covers the
screen. To capture a new screen, copy `pageFor` and `capture` from
`browser-navigation.mjs` into a `standalone/browser-<topic>.mjs` and run it with
`npm run test:disposable -- node standalone/browser-<topic>.mjs`. Phone sizes
are 390x844 and 360x740 (plus 320x568 and 844x390 landscape); desktop is 1280x800.

Screenshots write into dated `docs/verification/` folders that are hard-coded in
the harnesses: `browser-navigation` writes JPEGs to
`docs/verification/2026-09-25-update/ui-shell/` (set `GAHOOKZ_SHELL_SCREENSHOTS=0`
to skip), and `browser-mobile-ui` rewrites PNGs under
`docs/verification/2026-09-19-mobile-ui/`. Evidence is append-only: after a run,
`git checkout -- docs/verification/2026-09-19-*`, and commit re-captures only in
the current update's folder. Never point either harness at 3101, 3102 or 3103.

## Common changes

- **Add an overlay** (dialog, sheet, editor): portal it to `document.body`, give it
  a `--z-*` token (add one to the scale only if none fits, and document it in
  the comment at the top of `styles.css` and here), call `useScrollLock` and
  `useBackToClose`, handle Escape only when `isTopmost()`, move and restore
  focus, and add a case to `browser-navigation.mjs`.
- **Add a menu item:** edit `HostQuickMenu`, `PlayerQuickMenu` or `JoinQuickMenu`;
  an action that opens another screen calls `close({ restoreFocus: false })`.
- **Add a tooltip:** wrap the text in `<InfoTip label="...">`; do not position it
  yourself. Check it at 320 px.
- **Add a route:** extend `getRoute`, add the shape to `serveStatic` in
  `server.js`, and cover both in a smoke test.
- **Add a client module:** add it to `generatedFiles` and the transform list in
  `build-client.mjs` (platform) and to `SHELL_ASSETS` in `service-worker.js`.
- **Add a preference:** a key, getter, setter, hook and event in
  `client/preferences.jsx`; mirror it onto `<html>` if CSS needs it.

## Known issues

- **`/host` and `/play` route as rooms.** `serveStatic` serves `index.html` for
  both, but `getRoute` reads each as a four-letter code (`HOST`, `PLAY`).
- **`client/legal.js` is built but missing from `SHELL_ASSETS`**, so it is cached
  only after its first online load, not at install.
- **"Reduce Gahook effects" also mutes sound** in the host Lobby rules and the
  join menu (`useReducedEffects` sets both), while `PlayerSettingsDialog` keeps
  them separate.
- **The ownership map does not list `history.jsx`, `back-stack.ts`,
  `QuickMenu` or `useMediaQuery`**, which belong to this area.
- **`browser-mobile-ui` rewrites a dated historical evidence folder** on every run
  and must be restored by hand.
- The host-away notice overlaps the lobby status banner while it shows
  (see [systems.md](systems.md)).

Live backlog: [`../backlog.md`](../backlog.md). Feature pages:
[install and offline](../wiki/install-and-offline.md),
[information and legal pages](../wiki/information-and-legal-pages.md),
[live connection](../wiki/live-connection.md).
