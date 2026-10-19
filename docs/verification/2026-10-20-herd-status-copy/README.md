# Verification — 2026-10-20 — Herd status copy (P06 step 2, final piece)

- **Branch:** `agent/herd-status-copy` (from `main` @ `987772b`), worktree
  `~/gahookz-worktrees/...` actual path:
  `/mnt/storage/syncthing/Store/Projects/gahookz-herd-status-copy`.
  Commit `e45480b`. Not merged, not pushed, not deployed.
- **What changed:** `standalone/public/app.jsx` only (17 insertions, 2 deletions) —
  the client-side waiting/duration/carryover status copy that PLAN-PROGRESS
  "Next work" item 5 and the 2026-10-18 handoff left open from P06 step 2:
  1. Host Herd panel: the not-ready line is now live progress from
     `lobby.herdPreparation` — `N/M answers written · waiting for <names>`
     (max 3 names, then `+ K more`), or `— waiting for writers to ready up`
     when everything is written but writers have not readied. New helper
     `herdWritingStatusText` beside `herdProgressText`. Ready-state copy
     unchanged.
  2. Player Herd view: `role="status"` line `X of Y answers written` under the
     Herd workshop banner, only when preparation data exists.
  3. Game-length InfoTip: the estimate now says `About N minute(s) of live
     play — writing and chatting add to it.` (the estimate is phase maths
     only; the copy no longer implies whole-session accuracy).
     `formatDurationEstimate` itself unchanged.
  4. Finished screen: when `unusedQuestionCount > 0`, a note that the
     unanswered questions carry over to the next game (matches
     `resetLobby`/`reuseUnusedQuestions` behaviour).
- **Build hash:** the worktree build produced
  `release-2d4ac000cb3ed0e2`; the generated `index.html`,
  `service-worker.js` and `vendor-bootstrap.js` hash rewrites were reverted
  before committing, so the commit contains only `app.jsx` (matching how
  `main` commits app.jsx without generated artifacts).
- **Verification (run in the worktree, under the shared verify lock):**
  - `npm run build` → `Built standalone browser modules for release-2d4ac000cb3ed0e2`
  - `npm run test:unit` → 248 tests, 248 pass, 0 fail
  - `git diff` reviewed line by line; no server, packages, docs or test files
    touched; no old copy strings are asserted by any test or smoke
    (`grep` across `standalone/*.mjs` found only the unrelated
    `smoke-mode-settings.mjs` "unused questions carried into a new game"
    scenario name, which still holds).
- **Production touched:** no. No container, port 3101/3102/3103, or tunnel
  changed. `main` untouched.
- **Next exact task:** orchestrator/Tyson review and merge
  `agent/herd-status-copy`; a browser smoke pass over the Herd writing phase
  copy would be a nice-to-have at merge time. Deploy remains gated on Tyson.
