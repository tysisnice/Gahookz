# Changelog

User-visible and developer-visible changes, newest first. Every change adds a
line under **Unreleased**; the orchestrator moves them under a dated heading
when the work is merged to `main`. Link the wiki page for details instead of
repeating them here.

## Unreleased

Not on gahookz.com yet; production still runs `74a489949e02`.

### Players
- When a host removes somebody over their profile picture, the picture
  actually goes. It used to be kept in the Banned Players panel on the shared
  screen — the one place everyone in the room is looking — and sent to every
  phone in the room besides. What they drew on the whiteboard stayed too. Both
  are cleared now, and the panel shows their name and an ordinary avatar so the
  host can still unban them
  ([record](verification/2026-10-23-player-media/README.md)).
- "Randomize name & pfp" now reaches everywhere that name and picture had got
  to: the chat, the questions they wrote, their Herd answers and the results
  screen. It used to change their card and leave the rest. It also no longer
  comes back: the picture was being kept in reserve so that switching custom
  profile pictures off and on again would restore it, moderated or not. What
  they wrote and drew still stays — that is what "Remove player media" is for.
- A profile picture you replace is thrown away instead of being kept and served
  for the rest of the room's life.
- Gahookz works on a browser that keeps nothing. With site data blocked — a
  setting, not an account — the game used to invent a new player for every
  single request, so the room could never recognise the same person twice and
  the screen sat on "Joining" for ever. One player per device now, for as long
  as the page is open
  ([record](verification/2026-10-23-session-storage/README.md)).
- A device that had something odd saved from an older version no longer opens
  to a blank page. Whatever is stored is checked before it is used, and
  anything that is not what it claims to be is cleared out rather than handed
  to the screen. A room password saved by an old release is wiped from the
  device while we are there.
- A room that cannot be reached now says so and stops piling up work in the
  background. A phone that loses its connection used to start another request
  for the whole room state every five seconds and never finish any of them —
  eight of them open after a minute, all landing at once when the signal came
  back. One at a time now, given up on after ten seconds
  ([record](verification/2026-10-23-snapshot-adapter/README.md)).
- The shared screen no longer names who wrote each Herd answer while the room is
  still writing. It used to print "Answer by <name>" under every answer, two
  lines below its own promise that answers stay anonymous until the points; now
  it says the writer is hidden until the reveal, and means it. The host can
  still read and remove any answer, and the player wall still shows who owes one
  ([record](verification/2026-10-22-herd-anonymity/README.md)).
- The **Reduce Gahook effects** switch no longer mutes sound anywhere: in the
  join menu and the host's Lobby rules it now sets only reduced motion, as it
  already did in the player Settings dialog. Sound is controlled by the **Mute**
  and **Music** switches alone; muting still counts as reduced effects
  ([record](verification/2026-10-21-reduce-mute-split/README.md)).
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

- **2026-10-23 — player media across every moderation surface (roadmap 2.2).**
  A room copies a player's uploaded picture into about a dozen places. The
  pruner walked one list to decide what to keep and three handlers walked their
  own lists to decide what to clear; the lists had drifted in both directions.
  `server/player-media.mjs` now enumerates the surfaces once — each site
  declaring its owner, its kind (`avatar`, `upload`, `drawing`), and how to
  read, clear and rename it — and `pruneRoomMedia`, `kickPlayer`,
  `randomizePlayerIdentity`, `removeContent` and `updatePlayerProfile` all walk
  that one list. Measured defects closed: a kicked player's picture was
  retained on purpose and broadcast to every client including a guest; their
  whiteboard marks survived; randomize missed chat, Herd answers, the saved
  question bank, the results screen and the hidden copy that a settings toggle
  would restore; a replaced picture was never collected (twelve uploads, twelve
  still served); and the results screen and GET GOT banner were displayed but
  not retained. `bannedPlayers` moves from tolerated to described (58 → 57)
  with its uploaded picture pinned empty. Twelve unit tests (308 → 320), a new
  `standalone:smoke:player-media` in the shared chain, a new
  `test:browser:player-media`, and a `smoke-security` tripwire against a second
  copy of the list. Thirteen mutations, 13 caught — M9 missed first time
  because the rule had two owners
  ([record](verification/2026-10-23-player-media/README.md)).
- **2026-10-23 — device storage becomes a typed boundary (P01 step 6, the
  storage half).** `client/session.ts` owns the credential, the saved join, the
  per-room password and the legacy `?pwd=` link, and is handed a store rather
  than reaching for one, so which store a value lands in is decided in the open
  and a test can supply one that throws. A saved join is rebuilt field by field
  — an unknown key cannot survive a round trip, a `password` left by an older
  release is wiped rather than ignored, and a value that is not a string is
  dropped. Two measured defects fixed: a stored `name` of `12345` threw during
  render and left a blank page, and a browser with site data blocked minted a
  credential per call (1,001 from one tab). A link's password now reaches only
  the room that link named. Nineteen unit tests (289 → 308), a new
  `test:browser:session` suite for all three scenarios, and `smoke-security`
  now enforces that only this module may name the three storage keys
  ([record](verification/2026-10-23-session-storage/README.md)).
- **2026-10-23 — the last request outside the typed boundary (P01 step 6).**
  `POST /api/state` was still fetched inline in `useEvents` with its own
  `fetch`, its own routing and no timeout, so none of it was reachable by a
  test and none of its three callers knew about the others.
  `createSnapshotFetcher` now keeps one request in flight with at most one
  follow-up queued, abandons one nobody answers after ten seconds, dispatches
  nothing after a view is left, and reads the response through the pure
  `describeSnapshotResponse`; a 200 that is not an object is reported instead of
  quietly dropped. Measured in a real browser, a black-holed tab went from eight
  stacked requests in sixty seconds to one. Ten new unit tests (279 → 289), a
  new `test:browser:recovery` suite that is the only check able to see a second
  caller added back into `app.jsx`, and a `smoke-security` tripwire for the same
  seam. `StorageLike` and `ApiCallOptions.signal` are gone: neither was ever
  implemented or passed ([record](verification/2026-10-23-snapshot-adapter/README.md)).
- **2026-10-22 — Herd anonymity is proven at the server, not just the engine.**
  The step that turns an assignment plan into a room's answers is now a named
  module that takes identity from the displayed slot, sorts into display order
  rather than trusting the plan, and refuses a slot that does not exist, two
  writers in one slot or one writer twice; a startup check keeps the writer cap
  within the display table. `smoke-herd-anonymity` plays a real five-player game
  and attacks it over HTTP ([record](verification/2026-10-22-herd-anonymity/README.md)).
- **2026-10-22 — the Herd attack fixtures are bounded against measured chance.**
  Replaying the old circular formula now has to score below `1/n + 0.08` rather
  than a round `0.6`, and two further attacks were added: whether the first
  displayed slot says who has written least, and whether writers who share two
  prompts keep their order. Each records what the rejected design scores, so a
  future reader can see the assertion is not vacuous.
- **2026-10-22 — the public snapshot is described per phase.** `PublicSnapshotSchema`
  discriminates on `phase`, pinning when answers are listed, when their text is
  filled in and when the key, the Herd authors and the author points appear, plus
  the rules a game was locked into, the Quiz key versus the Majority prediction,
  and tie reasons that may not explain themselves untruthfully.
- **2026-10-22 — the fixture corpus is evidence again.** It had drifted fifteen
  server fields behind, claimed a building phase it never captured, recorded the
  host's own view as a spectator's, and contained no authored question at all.
  Captures now play real games through all three modes, every fixture is checked
  against the phase and role its name claims, and the new `smoke-contract-drift`
  suite notices drift from the live server in either direction.
- **2026-10-22 — Node 24.22.0 is the default runtime** on the laptop; the PATH
  shim the agent guide described is no longer needed.
- The role and phase privacy contract is executable instead of described:
  `standalone/smoke-privacy-contract.mjs` (in the shared smoke chain) refuses
  every one of the twenty `/api/host/*` routes for an ordinary player, a
  stranger, a caller with no credential and a player who also claims
  `role: "host"`, and proves that no payload another writer, a party screen
  or a stranger can obtain carries a writer's Herd answer before the reveal —
  in the snapshot **and** in a real event-stream frame. Nothing about the game
  changed; the rules were already right and almost untested
  ([record](verification/2026-10-21-privacy-moderation-contract/README.md)).
- `publicHerdAssignments` set `namedPlayerNames` twice in the host's Herd
  review payload. The dead line is gone, and the duplicate-key guard no longer
  looks at one function's own `return {`: it scans every object literal in
  every source file under `standalone/` and `packages/`, which is how this one
  was found two objects deep inside a `.map`.
- Documentation has a single current execution index again:
  [`docs/ROADMAP.md`](ROADMAP.md) orders the work, and
  [`docs/COORDINATION.md`](COORDINATION.md) records the session/owner-feedback
  contract Tyson approved on 2026-10-21. The older layered plans keep their
  detail but no longer compete as next-task lists, and four stale claims are
  corrected in place: Node 20, the pre-reveal privacy rules, `no-store`-only
  static caching and the `/information` internal-report question.
- Node 24 is installed on the laptop (`/usr/bin/node-24`, `/usr/bin/npm-24`,
  alongside 22). Verification needs an explicit PATH shim: `npm-24 run <script>`
  hands lifecycle scripts Node 22, because npm puts its own interpreter's
  directory on their PATH. The recipe and the measurement are in
  [the working agreement](agents/README.md).
- `/worktrees/` is ignored by git and excluded from the Docker build context, so
  an isolated worktree created inside the project (as the coordination contract
  asks) cannot be committed or shipped by accident.
- `assertRoomAssetCapacity` and `roomAssetChars` in `standalone/server/room.mjs`
  were dead exports nothing imported; they are removed, `MAX_ROOM_ASSET_CHARS`
  stays as the cap `standalone/server/media.mjs` uses, and
  `standalone/room-dead-exports.test.mjs` now guards against their return
  ([record](verification/2026-10-21-remove-dead-room-exports/README.md)).
- `publicMajorityResults` in `standalone/server.js` set `unanimous` twice; the
  dead second key is removed, and `standalone/server-duplicate-keys.test.mjs`
  now refuses any repeated key in that function's returned object.
- Stale deploy documentation corrected: the runbook's "Known issue: the image
  check" described the retired hard-coded `gahookz:local` comparison (fixed
  2026-10-18), four entries in `docs/areas/platform.md`'s Known issues were
  already fixed or no longer true (`dev.mjs` now watches
  `client/host-presence.jsx` and `client/legal.jsx`; `.env.example` lists the
  tunables; `CLAUDE.md` no longer says `cd /srv/gahookz`), and the rollback
  Option 2 heading now reflects its successful beta rehearsal.
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
