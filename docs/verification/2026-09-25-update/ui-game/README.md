# ui-game verification (2026-09-25 update)

Screenshots come from `capture-shots.mjs` (disposable server, Majority Rulez room, 4 players, 2 have answered).

| Item | Change | Evidence |
| --- | --- | --- |
| U23 | Pre-reveal `answerSelections` carry only `playerId`/`answeredAt` for other players (all modes, all roles, SSE); own pick keeps `answerId`. Answered avatar row under question; no other avatars on tiles. | `host-*.png` (no tile avatars, "Answered" row), `player-*.png` (only own avatar on own tile); smoke assertions in smoke-majority-flow, smoke-herd-flow, smoke-roles (Classic) incl. reveal shows choices |
| U20 | Skip is a styled button with icon beside Pause/Play, right of the timer bar; top bar no longer holds it | `host-390x844.png`, `host-1280x800.png` |
| U21 | Question/Answers boxes are one compact line each | same |
| U22 | "By <author>" sits right-aligned on the Question chip's row | same |
| U24 | Question text 3rem/2.3/2rem -> 2.6/2/1.75rem (about 12.5-13 %) | `player360-longest.png`: a 64-character prompt takes 4 lines at 360 px |
