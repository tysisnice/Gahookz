# UI shell — tooltips, top bar, layering, menus, Back button (U1, U16, U12, U10, S2)

Agent branch `agent/ui-shell` (`83360b4`, `0b193d5`, plus the menu work the
orchestrator committed after the agent's run ended). The agent did not reach
its write-up; this record is the orchestrator's, from the code and the checks
below.

## What changed

- **U1 tooltips.** `InfoTip` (`client/controls.jsx`) positions its bubble
  with `placeTipBubble`, which keeps it at least 8 px inside the viewport at
  any width, whichever edge its (i) sits near.
- **U16 top bar.** The phase and room-code pills are at most 28 px tall with
  11–13 px text.
- **U12 layering.** One z-index scale as CSS custom properties at the top of
  `styles.css`: `--z-chat` 40 < `--z-notice` 44 (host presence) <
  `--z-popover` 48 < `--z-menu` 50 < `--z-modal` 60 < `--z-gahook` 70 <
  `--z-arena-reactions` 88 < `--z-arena` 94 < `--z-confirm` 96 <
  `--z-toast` 100. Menus and dialogs now sit above the chat button.
- **U10 menus.** `QuickMenu` (`client/controls.jsx`) replaces the three
  `<details>` menus: a dropdown on wide screens and a modal sheet on phones
  (`QUICK_MENU_SHEET_QUERY` = `(max-width: 720px), (max-height: 560px)`),
  with scroll lock, internal scrolling, focus in and back out, and closing by
  Back, Escape, backdrop and its close button.
- **S2 Back button.** `client/back-stack.ts` (unit-tested in
  `back-stack.test.ts`) and `client/history.jsx`: `useBackToClose(open,
  onClose)` gives every in-room overlay one history entry, so Back closes the
  top overlay; `LeaveGameGuard` answers Back in a room with nothing open by
  asking **"Leave game?" / "Are you sure?"** with No and Yes. Yes leaves as
  Exit Lobby does; No stays and restores the guard entry. Wired into the
  menus, Settings, Lobby rules, How to play, the custom Gahook creator,
  drawing editors and profile editing.

## Verification

| Command (under the verification lock, disposable servers only) | Result |
| --- | --- |
| `npm run test:disposable -- npm run test:browser:navigation` | exit 0 — 16 checks: tooltips at 320/360/390/1280, pill sizes, one guard entry per room, Back closes one layer at a time, Leave game? No/Yes/Escape, reload, welcome screen and `/information` unaffected, phone sheet above the chat (hit-tested), desktop dropdown, host menu, Lobby rules focus return |
| `npm run test:disposable -- bash -c "…layout && …pwa && …desktop-ui && …onboarding && …social-creation && …host-controls"` | exit 0 |
| `npm run test:disposable -- npm run test:browser:mobile` | first run timed out (30 s) waiting for the first phone lobby right after the heavy smoke batch; rerun exit 0. Recorded as a load-sensitive wait on this two-core host |
| `npm run check` | 205 of 206 passed in this worktree; the failure was the career-outbox fake-timer race, fixed on the integration branch in `57c4585` |

Screenshots: [phone menu sheet](ui-shell/player-menu-sheet-390.jpg),
[host menu sheet](ui-shell/host-menu-sheet-390.jpg),
[desktop dropdown](ui-shell/player-menu-dropdown-1280.jpg),
[Leave game? on a phone](ui-shell/leave-game-390.jpg),
[tooltip at 320 px](ui-shell/tooltip-majority-320.jpg),
[top bar](ui-shell/topbar-390.jpg).
