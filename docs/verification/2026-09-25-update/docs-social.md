# docs-social — stale or wrong statements found (2026-10-07)

Run: `docs-steward` agent, branch `agent/docs-social`, commit base `30ba1ce`.
Scope: `docs/areas/social.md` and the seven Gahook wiki pages. Old documents were
not edited by this pass; each item is recorded for the owner of that file.

## Reproduced runtime finding

With the room's Gahook effects set to **Off**, in the reading phase, on a
disposable server (`npm run test:disposable`, probe script kept outside the repo):

- `/api/player/poke` answered "The host has turned Gahook effects off for this game."
- `/api/player/round-poke` answered `ok` (a normal Gahook was sent).
- `/api/host/poke` answered `ok`.
- No score moved (scoring needs Chaos).

`gahookEffectsAllowed` is checked only in the dispatcher branch for
`/api/player/poke`. The browser uses `round-poke` during a question, so "Off"
does not stop in-round Gahooks. No test covers it (`smoke-room-rules.mjs` tries
only `/api/player/poke`). Not fixed (documentation-only pass).

## Statements in old documents

| File | Statement | Correction |
| --- | --- | --- |
| `docs/wiki/lobby-rules.md` | "**Off:** no Gahook interruptions during a round." and "The server enforces every rule, for example 'The host has turned Gahook effects off for this game.'" | True only for `/api/player/poke`; `round-poke` (used in reading and answering) and `/api/host/poke` still send under Off (see above). |
| `docs/architecture/overview.md`, "Rules" step 3 | "In a live game the host may have turned Gahook effects off, which refuses the request." | Same: it refuses only `/api/player/poke`, not `round-poke` or `host/poke`. |
| `README.md`, Arena paragraph (around "The lobby's Gahook Arena is a tap tug of war") | "A lead of **five taps** wins (for example, 11–6)" | `ARENA_LEAD_TO_WIN` is 6, and the last two points at leads 4 and 5 cost two presses each (`standalone/server/arena.mjs`, since 2026-09-26). Presses and points differ, so "taps" is also misleading. |
| `README.md`, same paragraph | "`standalone:smoke:gahooks` checks scoring and spectator state" | Spectator state is in `smoke-arena-lifecycle.mjs`/`browser-arena-1v1.mjs`; `smoke-gahooks.mjs` covers Gahook scoring, spam, counters and finale pokes. Unverified in detail. |
| `ARENA-1V1-PLAN.md` ("Existing mechanics") | "`finishGahookDuel(..., "five-ahead")`", "`duel.leadToWin \|\| 5`", "first to lead by 5 taps", and line numbers such as `server.js:1398` | The reason string is now `"lead"`; the fallback is `6`; the lead is 6; line numbers have moved. Historical plan: the banner should say so. |

## Statements in code comments (not documents)

- `standalone/public/client/gahook-forms.js` says Airhorn Capy was replaced by Sad
  Pig "on 2026-09-25". 2026-09-25 is the request date; the change landed on
  2026-09-30 (`77534e0`). Not changed.
- `standalone/public/app.jsx` enables chat and lobby paint in `herd-writing`, but
  `standalone/server/social.mjs` allows only `lobby` and `building`
  (`WAITING_PHASES`), so sends fail with "available while the room is waiting".
- `/api/player/shame-poke` is still served but the browser calls `final-poke`.
- `GahookDash` has a `roomMode`, and the server a `/api/player/dash` route, but no
  screen mounts room mode.

**Fixed 2026-10-07 by the orchestrator:** every in-round Gahook route now honours Off (`EFFECT_GATED_GAHOOK_ROUTES` in `server.js`), so the `lobby-rules.md` and `overview.md` statements above are now true.
