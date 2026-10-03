# How a game works

> One person hosts, everyone else joins with a name and a picture, and the game runs from the lobby to a final scoreboard without anyone needing an account.

**Area:** [game flow](../areas/game-flow.md) · **Status:** live · **Last reviewed:** 2026-10-04

## What it is

Every game follows the same journey.

1. **The host creates a room.** It gets a four-letter code ([Rooms and room codes](rooms-and-codes.md)).
2. **Players join** with the code or a link, a name and a profile picture. No sign-in, ever ([Joining and profiles](joining-and-profiles.md)).
3. **The lobby.** Everyone waits here and the code is shared ([Lobby](lobby.md)). The host sets the [Lobby rules](lobby-rules.md), then picks Quiz or Herd, the Majority Rulez switch and the game length ([Game setup](game-setup.md)), and locks the rules.
4. **Writing.** Each player writes their share of the questions ([Writing questions](question-writing.md)). In Herd, each player writes one prompt, then writes answer options for other players' prompts. The host starts once everyone is ready. If someone is slow, Skip fills the gaps from the built-in catalogue.
5. **Rounds.** Each question has a reading moment, a time to answer (earlier answers score more) and a reveal with the points. Players rate the question Good or Nah. Players can also send [Gahooks](gahooks.md) to each other.
6. **The finale.** The final scoreboard names the winners ([Finale](finale.md)). The host can then bring everyone back to the lobby for another game.

The host can Pause or Skip during a question. The server alone decides the phase, the clock and the points, so every screen agrees.

## Rules and numbers

- Reading 5 seconds, answering 14 seconds, reveal 12 seconds. One question takes at most 31 seconds of timers; real games run longer ([Phases and timers](phases-and-timers.md)).
- When everyone has answered, or everyone has voted Good or Nah, the game moves on early.
- Quiz is Classic (right answers) or Majority Rulez (the most popular answer wins). See [Scoring](scoring.md).
- Players who join during a live question are scored and ranked.

## Where it lives

| Part | Code |
| --- | --- |
| Server | `standalone/server.js` — `lockSetup`, `startGame`, `beginQuestion`, `transitionToReveal` |
| Engine | `packages/game-engine/src/phases.ts` — `PHASE_DURATIONS_MS` |
| Settings | `packages/contracts/src/settings.ts` — `GameSettings` |
| Tests | `standalone/smoke-majority-flow.mjs`, `standalone/smoke-herd-flow.mjs` |

## Related

- [Host and roles](host-and-roles.md), [Quiz · Classic](quiz-classic.md), [Majority Rulez](majority-rulez.md), [Herd](herd.md), [Reveal and results](reveal-and-results.md)

## History

- 2026-09-19 — Quiz and Herd overhaul merged to `main` (`78a1382`).
- 2026-09-29 — Game length row, number wheel and Share Lobby Code arrive (`c14abbc`).
- 2026-09-26 — Rooms wait for a reconnect, and a player is promoted if the host stays away (`0099203`).
