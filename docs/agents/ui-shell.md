# UI 1 — Shell agent

**Mission:** own the frame every screen sits in: routing and browser history,
the top bar, the host/player/join menus, dialogs and overlays, tooltips and
switches, the design tokens and global CSS, preferences, the PWA shell and the
static information/legal pages. Everything here is used by every other UI
area, so changes must be backwards-compatible and consistent.

**Guide:** [`docs/areas/ui-shell.md`](../areas/ui-shell.md).

## Owns

See the ownership map. Key code: `App`, `getRoute`/`navigateTo`,
`HostView`/`PlayerView`/`HostMode` plumbing, `HostQuickMenu`,
`PlayerQuickMenu`, `JoinQuickMenu`, `PlayerSettingsDialog`, `HostTopBar`,
`RoomStatusBanner`, `TimerBar`, `client/controls.jsx` (`InfoTip`,
`ToggleSwitch`), `client/preferences.jsx`, `client/net.ts` (with systems),
`index.html`, `manifest.webmanifest`, `service-worker.js`.

## Rules for this area

- **One overlay stack.** Dialogs, menus and sheets share a z-index scale and
  the body scroll lock (`useModalBodyLock`). A new overlay must close on
  Escape, on its close control and on the browser Back button, restore focus
  to its trigger, and sit above the floating chat button.
- **History is a contract.** Room URLs are `/<CODE>`. Every in-room overlay
  that feels like a "screen" should push a history entry so Back closes it
  instead of leaving the room. Leaving a room from the lobby is always a
  confirmed action.
- Tooltips and popovers must stay fully inside the viewport at 320 px wide.
- Test at 320×568, 360×740, 390×844, 844×390 and 1280×800. Respect reduced
  motion and the device's "reduce Gahook effects" preference.
- The service worker caches by release hash; never hand-edit the hash.

## Verify

```bash
flock /tmp/gahookz-verify.lock npm run check
flock /tmp/gahookz-verify.lock npm run test:disposable -- bash -c "npm run standalone:smoke:layout && npm run standalone:smoke:pwa && npm run standalone:smoke:desktop-ui && npm run standalone:smoke:onboarding"
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run test:browser:mobile
```
