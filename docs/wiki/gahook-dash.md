# Gahook Dash

> A one-button runner you can play when the server is down.

**Area:** [social](../areas/social.md) · **Status:** live (offline screen only) · **Last reviewed:** 2026-10-07

## What it is

When the browser cannot reach the server, the offline screen says "No lobby, still Gahooky." and offers Gahook Dash. Your chosen [character](gahook-characters.md) runs along the ground; other characters and flying birds come at you. **Tap** for a hop, **hold** for a full jump (Space or Arrow Up also work when the game is focused). Hit something and you get a Gahook jump scare and a crash. A score counter and your best score show above the track.

The game is played offline: nothing is sent to the server. When the server returns, the screen says "Gahookz is back online" with a button to rejoin ([Install and offline](install-and-offline.md)).

## Rules and numbers

- Score grows 12 points a second. Speed is `275 + 0.72 x score` pixels a second, capped at 540. Obstacles come faster as the score rises.
- Your best score is stored in this browser only (`gahookz-offline-high-score`).
- You can switch character on the screen; the choice is shared with the Gahook picker.
- **Room mode is dormant.** The server still has a Dash route (lobby and question-writing only, score clamped to 0 to 999,999) and public player fields for a room scoreboard, and the game component has a room mode, but no screen uses it today.

## Where it lives

| Part | Code |
| --- | --- |
| Server (room route, unused by screens) | `standalone/server.js` — `updatePlayerDash` |
| Browser | `standalone/public/client/offline.jsx` — `GahookDash`, `OfflineExperience`, `updateOfflineGame` |
| Tests | `standalone/smoke-dash.mjs` |

## Related

- [Gahook characters](gahook-characters.md), [Install and offline](install-and-offline.md), [Live connection](live-connection.md)

## History

- 2026-07-20 — Gahook Dash and its room fields exist from the first commit (`dd449f2`).
- 2026-09-30 — Sad Pig gets a Dash sprite and replaces the capybara (`77534e0`).
