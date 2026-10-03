# Game setup

> Where the host chooses Quiz or Herd, switches Majority Rulez on or off, and decides how long the game is.

**Area:** [game flow](../areas/game-flow.md) · **Status:** live · **Last reviewed:** 2026-10-04

## What it is

The host sets the game up in the lobby, beside the [Lobby rules](lobby-rules.md) button. Settings can only change there. **Begin Game** locks them.

- **Game.** Two cards: **Quiz** ("Answer the room's questions") and **Herd** ("Write the room's answers").
- **Majority Rulez.** A switch that appears for Quiz only. Off is Classic, where the question's writer picks the right answer. On, the most-voted answer wins ([Majority Rulez](majority-rulez.md)).
- **Game length.** One row of buttons. Quiz offers Quick, Standard and Custom. Herd offers Quick, Full room and Custom. The selected button's description sits beside the heading.
- **Number wheel.** Custom shows a wheel for the number: swipe it, tap a number, press the − and + buttons, or use the arrow keys. If the server refuses a value, the wheel scrolls back.

A line underneath shows the plan, for example "5 questions · 5 players". Switching between Quiz and Herd keeps each side's questions for when you switch back. Switching Classic and Majority keeps everything.

## Rules and numbers

| Game | Length | What it means |
| --- | --- | --- |
| Quiz | Quick | One question each, up to 10 rounds |
| Quiz | Standard | One to three each, up to 18 rounds |
| Quiz | Custom | One to five questions per player |
| Herd | Quick | Up to 8 rounds |
| Herd | Full room | One prompt each |
| Herd | Custom | 1 to 20 rounds (starts at 8) |

When more questions are written than fit, they are shared out fairly between authors. See [Quiz · Classic](quiz-classic.md), [Herd](herd.md) and [Writing questions](question-writing.md).

## Where it lives

| Part | Code |
| --- | --- |
| Cards, switch, length | `standalone/public/app.jsx` — `GameFamilySelector`, `MajorityScoringToggle`, `RoundPresetSelector`, `HerdLengthSelector` |
| Wheel | `standalone/public/client/number-wheel.jsx` — `NumberWheel` |
| Server | `standalone/server.js` — `updateHostSettings`, `questionsPerPlayerForPreset`, `QUICK_MAX_ROUNDS` |
| Tests | `standalone/smoke-round-presets.mjs`, `standalone/smoke-mode-settings.mjs` |

## Related

- [How a game works](how-a-game-works.md), [Lobby](lobby.md), [Phases and timers](phases-and-timers.md)

## History

- 2026-09-11 — Two games in the selector, Majority Rulez becomes a switch (`0d80467`).
- 2026-09-11 — Herd games become short, with writing shared evenly (`db54127`).
- 2026-09-29 — One-row game length, number wheel and compact game cards (`51d9dcf`).
