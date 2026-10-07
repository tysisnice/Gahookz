# Gahook Arena (1v1)

> A 45-second tap tug-of-war between two players while the room waits.

**Area:** [social](../areas/social.md) · **Status:** live · **Last reviewed:** 2026-10-07

## What it is

Any player can challenge another from the player's menu, or fire back after a [Counter Gahook](gahooks.md) (a short window opens for it). The challenged player has 6.5 seconds to accept. After a 2.4-second countdown a Gahook button appears at a random spot on each screen; tapping it pulls the rope your way. Everyone else watches the score, and may throw Gahooks at the duellists, which appear as tappable minis on their screens: tap one to throw it back at the sender.

When it ends, the rest of the room has **10 seconds** to Congratulate the winner or Boo the loser.

## Rules and numbers

- **Win:** first to a **6-point lead**. If 45 seconds pass without one, it is a draw.
- **Closing pulls:** points at leads 0 to 3 cost one press. The last two (leads 4 and 5) cost **two presses each**. If the opponent scores in between, your half-charged point is dropped.
- The Arena is a lobby side-game (lobby and building phases). One duel per room; a challenger waits 6.5 s between challenges.
- It awards **no points** ([Scoring](scoring.md)).
- If a duellist leaves mid-match, the other wins. A pending challenge simply disappears. Starting the game, resetting the lobby or the host switching "lobby duels" off cancels a duel without a winner or forfeit.
- Players the host has banned cannot be challenged. The two duellists cannot react to their own match.

## Where it lives

| Part | Code |
| --- | --- |
| Rules | `standalone/server/arena.mjs` — `tapArena`, `pressesRequiredAtLead`, `ARENA_LEAD_TO_WIN` |
| Lifecycle | `standalone/server.js` — `challengeGahookDuel`, `acceptGahookDuel`, `tapGahookDuel`, `reactToGahookArena`, `finishGahookDuel` |
| Browser | `standalone/public/client/arena.jsx` — `ArenaOverlay`, `TapMatch`, `ArenaSpectator`; `app.jsx` — `GahookArenaCrowdControls` |
| Tests | `standalone/server/arena.test.mjs`, `standalone/smoke-arena-lifecycle.mjs`, `standalone/browser-arena-1v1.mjs` |

## Related

- [Gahooks](gahooks.md), [Lobby rules](lobby-rules.md) (the duels switch), [Lobby](lobby.md)

## History

- 2026-08-26 — The duel arrives with the counter Gahook as its way in (`178d56b`).
- 2026-09-12 — Challenge from the player menu, so the Arena is findable (`d0a7f5b`).
- 2026-09-19 — Tap-target arena merged to `main` (`78a1382`).
- 2026-09-26 — Lead to win raised from 5 to 6, two-press closing pulls replace the three-press pull, thrown minis become tappable (`6c852a7`).
