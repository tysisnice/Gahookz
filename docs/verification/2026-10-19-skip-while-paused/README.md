# Verification — skip while paused (2026-10-19, night-shift block)

Branch: `agent/skip-while-paused` (from `main` @ `0291d3e`). Merged to `main`
on 2026-10-19 (night-shift orchestrator block, merge `d1c00fe`); backlog line
removed (`b6e1f3c`). Not pushed.

## Defect

`skipPhase` in `standalone/server.js` never checked `room.paused`, so a host
could press Skip while the game was paused and the phase advanced straight over
the countdown they had deliberately stopped. Listed in
[backlog](../../backlog.md) (Engineering P1, game-flow; LEDGER docs-game-a).

## Fix

`skipPhase` now returns `{ ok: false, error: "Resume the game before skipping." }`
when `room.paused`. The route maps `ok: false` to HTTP 400 (existing
`sendJson(res, result.ok ? 200 : ... : 400, result)` behaviour — same shape as
the lobby-skip refusal).

## Tests added

`standalone/smoke-host-controls.mjs` — new block: build a Herd room, reach
`reading`, pause, then assert:

- Skip while paused answers 400 with a non-empty actionable error;
- the room stays paused and in `reading` after the refused skip;
- after resume, Skip answers 200 `ok: true` again.

## Commands run (all on the worktree, disposable server on 127.0.0.1:3199)

| Command | Result |
| --- | --- |
| `node standalone/test-disposable.mjs npm run standalone:smoke:host-controls` | pass — includes the new paused-skip block |
| `npm run test:unit` | 239 pass / 0 fail |
| `npm run build` then `node standalone/test-disposable.mjs npm run standalone:smoke:regressions` | pass (release `a29f717b49371ad2`) |

No production, beta or port-3102 service was touched; the worktree's dev-server
bind-mount was not running during the block.

## Next step

Merged to `main` and re-verified there (`test:unit` 239/239;
`standalone:smoke:host-controls` via disposable server, 2026-10-19). Deploy
only with Tyson's approval.
