# Changelog

User-visible and developer-visible changes, newest first. Every change adds a
line under **Unreleased**; the orchestrator moves them under a dated heading
when the work is merged to `main`. Link the wiki page for details instead of
repeating them here.

## Unreleased

Not on gahookz.com yet; production still runs `74a489949e02`.

### Players
- During Herd writing, the host panel now shows how far the room has got —
  "N/M answers written · waiting for <names>" — and players see a room progress
  line under the workshop banner. The game-length estimate now says it covers
  live play only, and the finished screen notes that unanswered questions carry
  over to the next game (merge `233f8cc`,
  [record](verification/2026-10-20-herd-status-copy/README.md)).
- Pressing **Skip** while the game is paused no longer jumps the phase. The host
  is asked to resume first, so a deliberately stopped countdown stays stopped
  (merge `d1c00fe`,
  [record](verification/2026-10-19-skip-while-paused/README.md)). The Skip button
  is also greyed out while the game is paused, with a tooltip saying why.
- **Install app** is a button in the game at last, in the welcome footer and in
  every in-room menu, instead of something only a browser's own menu could do.
  It appears only when the browser offers an install.
- **Game guides** opens the `/information` guides from any in-room menu, in a
  new tab so nobody loses their seat. Until now nothing in the game linked that
  page at all.
- `gahookz.com/play` and `gahookz.com/host` now open the welcome screen, on the
  Join and Host side respectively, with a room word ready for a host. They used
  to be read as the room codes PLAY and HOST, so they landed on a room that did
  not exist. A room really coded `HOST` is unaffected: its link is upper case.
- A host who drops out no longer covers the line telling everyone else what the
  room is doing: the "host disconnected" notice moves the room banner down
  while it is up, and the measured overlap was 52 pixels.
- The host can **remove a reported answer or question** straight from the
  Reports list, not just a chat message. A question that is already in the round
  being played comes out of the question list and says so, rather than reporting
  a success that changes nothing on screen.
- An installed app opens offline again even on a cold start: two modules the
  first screen needs (`client/legal.js`, `client/report.js`) were missing from
  the shell cache.
- A player who closes their browser mid-Herd no longer blocks Start for
  everybody else. Their unwritten answers are filled the way force-start fills
  them; a connected writer who has not finished still holds the room.

### Developer
- **Node 24 is the declared runtime.** `engines.node` is `>=24.0.0`, matching
  CI and the `node:24-alpine` image instead of trailing four majors behind it,
  with `smoke-deployment`'s assertion moved in step so the two cannot drift.
  Every document that described the old `>=20` state is corrected, including
  three places that told agents `PATH=/usr/bin:$PATH` would give them Node 24 on
  this laptop — it gives 22 ([record](verification/2026-10-19-node-24/README.md)).
- Live-phase GET GOT is settled as intended behaviour, not a gap: the owner
  decision is to leave it, so its unreachable −1,000 penalty stays in place
  untouched and gets no live-phase coverage. Recorded where the finding lives
  ([record](verification/2026-10-18-host-poke-claim/README.md)).

## 2026-10-18 — deployed to gahookz.com as revision `74a489949e02`

Everything below went live in [that deploy](verification/2026-10-18-deploy/README.md),
which closed a 48-commit gap between production and `main`. Add new entries under a
fresh **Unreleased** heading above this one.

### Developer
- The rollback plan is no longer theoretical: Option 2 was rehearsed on beta,
  which came up on the 2026-09-12 image in about nine seconds, hosted a real
  room, and was restored just as quickly with production untouched. It also
  exposed that the 2026-10-02 rollback images predate revision stamping and
  report `revision: unknown`, so a rolled-back service must be identified by
  image tag and `builtAt`
  ([record](verification/2026-10-18-rollback-rehearsal/README.md)).
- A deploy can no longer end a game nobody agreed to end. `docker-deploy.sh`
  refuses, instead of warning and proceeding, when rooms are active with no
  drain window, when the drain wait expires with rooms left, or when it has no
  token to drain with; an abandoned or interrupted drain is now cancelled, so
  production cannot be left refusing every new room. It also tags its own
  rollback image. `npm run test:deploy-script` holds each decision as a case
  against a stubbed Docker — six of its eight cases fail against the old script
  ([record](verification/2026-10-18-deploy-safety/README.md)).
- The development watcher now replaces a server that exits for any reason, not
  only a crashing one. A clean exit was excluded, so one stray `pkill -f
  server.js` left `dev.gahookz.com` dead for six days with the container still
  reporting "Up"; the same kill restarted production and beta twice, ending any
  games in progress. `scripts/docker-status.sh` now reports every service and
  exits non-zero on anything unhealthy, `scripts/stop-test-server.sh` stops one
  test port safely, and `npm run drill:dev-restart` reproduces the outage
  ([record](verification/2026-10-18-dev-watcher/README.md)).
- Herd question rotation by stable ID across rematches, with the selection
  policy extracted to `standalone/server/question-selection.mjs` so it is
  testable without the HTTP server (P06 step 2), plus nine 2/3/5-player
  boundary fixtures over real HTTP (`npm run test:herd-boundaries`). The author
  ordering was fixed on merge: it compared each author's *first-listed*
  question instead of their least-played one, which decided whose material a
  capped game dropped.
- `scripts/docker-deploy.sh` verifies the image Compose will actually run
  (`GAHOOKZ_PROD_IMAGE`, default `gahookz:prod-local`) instead of the retired
  hard-coded `gahookz:local`, so the post-deploy image check can pass.
- A host who created a room but never joined it bypassed the per-question
  Gahook claim gate during a live round and could spam one player into GET
  GOT; live-phase host Gahooks now require a joined host, covered by
  `standalone:smoke:host-poke-claim`
  ([record](verification/2026-10-18-host-poke-claim/README.md)). This also
  clears the long-running `smoke-gahooks` time-threshold failure, which was
  the same defect seen from the test's side.
- Project divided into eleven [areas](areas/README.md) with an agent
  [profile](agents/README.md) each; parallel agents work in worktrees
  (`scripts/agent-worktree.sh`) and serialise builds with a shared lock.
- `standalone/public/client/controls.js` is now ignored like every other
  generated browser module; `docs/archive/` and `.claude/agents/` are tracked.
- Fixed a lost closing brace in `styles.css` (the `agent/lobby-creation`
  merge dropped it after `.question-copy-head .question-author-line span`),
  which nested the last ~330 lines of the stylesheet inside that rule so none
  of them applied. New `npm run test:browser:herd-writing` covers Herd answer
  writing, voting and the reveal.
- `smoke-social-creation` asserted on chat drawing code that moved to the
  lobby wall on 2026-09-19; the three stale assertions now describe the wall.

### Players
- Tapping anywhere off the lobby wall finishes drawing, as the Done button
  does ([Lobby painting](wiki/lobby-painting.md)).
- Herd: while writing answers, each player's progress ("0/4 answered", then
  "Done") sits in their player card instead of a separate list, and every
  answer can carry an uploaded or drawn picture, shown in the vote and at the
  reveal ([Herd](wiki/herd.md)).

## 2026-09-19 — Quiz/Herd overhaul (P00–P12), desktop and mobile UI, arena 1v1, hosting

Merged to `main` as `78a1382` and running in production as `e3b6dde`. See the
[implementation plan](../IMPLEMENTATION-PLAN.md) and the
[verification records](verification/) for that work.
