# Navigation and the Back button

> Back closes the menu you are in, and only asks "Leave game?" when nothing is open.

**Area:** [UI shell](../areas/ui-shell.md) · **Status:** live · **Last reviewed:** 2026-10-07

## What it is

A room is one web address, such as `/GOOK`. Menus, dialogs and editors inside it are not pages, so before 2026-09-27 pressing Back (or swiping back on a phone) threw players out of the whole room. Now each open menu or dialog gets a history entry of its own, and Back closes the top one.

With nothing open, Back in a room shows **Leave game? Are you sure?** with **No** (already focused, so an accidental Enter stays put) and **Yes**. Yes does the same as **Exit Lobby**. Escape and tapping outside the box also mean No.

Outside a room, Back works like any website. The join form is not "in" a room yet, so Back there leaves normally. The offline and "server updated" screens keep the guard, so a brief outage does not cost you your place.

## Rules and numbers

- Menus, Settings, Lobby rules, How to play, the custom Gahook creator, drawing editors, profile editing, the party view and the host's "join as player" form all close on Back.
- Closing something with its own button or Escape removes its history entry, so history never grows.
- Browsers ignore history entries added without a tap, so the "Leave game?" box is not re-armed on its own: a second Back while it is showing leaves the room.
- Routes: `/`, `/information`, `/legal`, and a four-letter room code (also `/host/CODE`, `/player/CODE`, `/CODE/host`, `/CODE/player`).

## Where it lives

| Part | Code |
| --- | --- |
| Back stack (pure rules) | `standalone/public/client/back-stack.ts` — `createBackStack` |
| React wiring and the prompt | `standalone/public/client/history.jsx` — `useBackToClose`, `LeaveGameGuard` |
| Routes | `standalone/public/app.jsx` — `getRoute`, `navigateTo` |
| Tests | `standalone/public/client/back-stack.test.ts`, `standalone/browser-navigation.mjs` |

## Related

- [Rooms and room codes](rooms-and-codes.md), [Preferences and accessibility](preferences-and-accessibility.md)
- [UI shell area guide](../areas/ui-shell.md#the-back-button-contract)

## History

- 2026-09-25 — Tyson reports players leaving the room by pressing Back in a menu.
- 2026-09-27 — Back closes the top overlay, and in a room asks "Leave game?" (`0b193d5`).
