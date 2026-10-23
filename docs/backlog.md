# Gahookz backlog

**2026-10-21 audit precedence:** this is the issue inventory; [ROADMAP.md](ROADMAP.md) orders execution and [HANDOFF.md](HANDOFF.md) is the current checkpoint. Dates/line counts below include historical entries. Recheck code before accepting an open/closed claim. Node 24 is installed (`/usr/bin/node-24`; default `/usr/bin/node` remains 22). Static serving now supports ETag/304 revalidation (`serveFile`), so the old no-store-only item below is superseded, not an instruction to apply immutable caching to mutable URLs. The `/information` internal-report decision is already resolved by P11; current content is player guides. Arena is an active separate project, not waiting for Gahookz's completion. Exact pre-reveal privacy rules are documented in the corrected game-flow guide.

Status: 2026-10-07, checked against the code of branch `agent/docs-backlog`
(merged with `orchestrator/2026-09-25-update`). This is the single live list of
open work. One line per item: description, owning area, source. Work in flight
is tracked in the [2026-09-25 update plan](plans/2026-09-25-update.md) (ledger and
briefs: [briefs](plans/2026-09-25-briefs.md)); do not duplicate it here.

Area guides: [systems](areas/systems.md), [platform](areas/platform.md),
[quality](areas/quality.md), [accounts](areas/accounts.md),
[content](areas/content.md), [game-flow](areas/game-flow.md),
[ui-shell](areas/ui-shell.md). Source abbreviations: OPS = [OPERATIONS-AND-ROADMAP.md](../OPERATIONS-AND-ROADMAP.md),
PP = [PLAN-PROGRESS.md](../PLAN-PROGRESS.md), IP = [IMPLEMENTATION-PLAN.md](../IMPLEMENTATION-PLAN.md),
RC = [RELEASE-CANDIDATE.md](../RELEASE-CANDIDATE.md), LEDGER = the ledger in the update plan.

## Engineering P0

- The host can now remove a reported chat message, answer or question from the Reports list (2026-10-19, see [Moderation](wiki/moderation.md)). Still no button: a player's pictures (`kind: "player-media"` is reachable only over the API, and nothing reports a player), and a question already chosen for the round, which can be taken out of the question list but not out of the round it is in.
- Moderation of a player's *media* was closed 2026-10-23 for the controls that do have buttons. Kicking somebody over their picture used to keep that picture, retain it in the pruner on purpose, send it to every client including an unauthenticated guest and print it in the Banned Players panel on the shared screen, while leaving their whiteboard marks in place; "Randomize name & pfp" missed chat, Herd answers, the saved question bank, the results screen and the hidden copy a later settings toggle would restore; and a replaced profile picture was never collected. One enumeration in `standalone/server/player-media.mjs` now serves both the pruner and moderation ([record](verification/2026-10-23-player-media/README.md)). (systems; [moderation](wiki/moderation.md))
- Automated abuse handling for an open anonymous audience: no scanning, appeals, evidence retention or operator console. (systems; OPS section 10 P0)
- Accounts are inert in production (no `DATABASE_URL`, Google client unset); needs the owner to provision both. (accounts; [accounts](areas/accounts.md), OPS section 10)

## Engineering P1

- **Nothing in the repository typechecks the server.** `npm run typecheck` runs
  three `tsc` projects; `tsconfig.server.json` includes
  `standalone/server/**/*.ts` and that directory contains no `.ts` files at all,
  and no project sets `allowJs`. So `server.js`, every `server/*.mjs` and
  `app.jsx` are unchecked: on 2026-10-23 an extraction left a constant
  referenced and undeclared, `npm run typecheck` passed, and every join failed
  at runtime. Measured cost of closing it with `checkJs` and loose strictness:
  **18 of the 25 server modules are already clean**, the other 7 have 38 errors
  between them (`accounts` 12, `career-outbox` 9, `account-room` 8, `social` 5,
  `admission` 3, `host-presence` 1) and `server.js` has 59. The first step --
  a project for the 18 clean modules -- is a config change with no code changes.
  (quality, platform; [record](verification/2026-10-23-gahook-extraction/README.md))

- Nothing notices an unhealthy container between sessions: Docker does not
  restart on a failing health check, and no alert exists. A development
  container sat up-but-dead for six days in October.
  `scripts/docker-status.sh` now reports it and exits non-zero, but only when
  somebody runs it. (platform;
  [2026-10-18 dev-watcher record](verification/2026-10-18-dev-watcher/README.md))

- Tested rollback: Option 2 (recreate from a kept image) was rehearsed on beta on
  2026-10-18 and works; Option 1 (revert and redeploy) and a production rollback are
  still untested. The three `20261002` rollback images report `revision: unknown`, so
  a service rolled back to one cannot be identified by `/api/health` revision.
  (platform; [rehearsal record](verification/2026-10-18-rollback-rehearsal/README.md))
- Split the monoliths: `server.js` (**5,404** lines as of 2026-10-23, down from 5,671 when the Gahook rules moved into `server/gahook-policy.mjs` and `server/gahook-escalation.mjs`, [record](verification/2026-10-23-gahook-extraction/README.md)), `app.jsx` (5,496), `styles.css` (11,414). The Arena duel's lifecycle is the piece of the Gahook subsystem still in `server.js`: thin decisions, but every one bound to a timer that broadcasts. (platform, ui-shell; OPS section 10, [typescript plan](plans/typescript-migration.md))
- Runtime schemas are described but not enforced. As of 2026-10-22 the public snapshot is described per phase and validated against real responses in tests (`PublicSnapshotSchema`, `smoke-contract-drift`), but the server imports only `HostSettingsRequestSchema` and `normaliseGameSettings`, so nothing validates a payload at runtime. The browser boundary now refuses a snapshot that is not a usable object (2026-10-23, [record](verification/2026-10-23-snapshot-adapter/README.md)), which is a shape check and not the contract: validating against `PublicSnapshotSchema` means either shipping zod to phones or generating a dependency-free guard from it, and that choice has not been made. P01 step 6's own list is complete as of 2026-10-23. (systems; PP P01/P02, [record](verification/2026-10-22-contract-phase-payloads/README.md))
- 56 of the 76 public snapshot fields are listed as tolerated rather than described, `TOLERATED_SNAPSHOT_KEYS` being the honest record of that. `herdAnswerReview` and `ownHerdAssignments` were described on 2026-10-22, which is where the host review's writer names were pinned out. The substantial ones left are `leaderboard`, `questionResults` and `herdPreparation`; the embedded player object is described by four of roughly forty fields. Describe them a family at a time, as consumers need them. (systems; PP P01)
- The engine's phase maths is not what runs: `nextPhase`, `resumeDeadline`, `estimatedDurationMs` are tested but unused; the live machine has its own. (game-flow; [game-flow](areas/game-flow.md))
- Dependency and base-image update cadence: nothing schedules re-resolving the digest or scanning advisories. (platform; OPS section 10, [dependency policy](operations/dependency-policy.md))
- Per-address SSE cap (32) versus a real party behind one address: measure before a large session. (systems; OPS section 10)
- Structured, redacted logging instead of ad hoc console logs. (systems; OPS section 10)
- **Install Node 24 on this laptop** — `engines.node` is `>=24.0.0` since
  2026-10-19 (owner decision), matching CI and the `node:24-alpine` image, but
  the system Node is 22, so local verification still runs below the declared
  floor. Nothing refuses (no `.npmrc`, so npm only warns `EBADENGINE`), but a
  timing-sensitive result cannot be trusted to match production. Needs root, so
  it is Tyson's: Fedora 44 has `nodejs24` 24.18.0 in `updates`, and nothing but
  its own subpackages requires the installed `nodejs22`. (platform;
  [record](verification/2026-10-19-node-24/README.md))
- Data export (`GET /api/account/export`) is not built; no email-free recovery, Apple sign-in or passkeys. (accounts; [accounts](areas/accounts.md))
- Stage acceptance P01-P12 of the overhaul is still "Partial" apart from P00 (stable option identities, rematch author rotation, party-sized load and reconnect-storm measurements, typed state engine, JSX decomposition, remaining browser matrix). Re-verify per stage before claiming any as done. (quality; PP, IP)

## Engineering P2

- Static files are served `no-store` (`server/transport.mjs`), including hashed assets; long immutable caching would help. (platform; OPS section 10)
- SSE recovery polling: now `POST /api/state` after 25 s of stream silence (the 1.8 s figure in OPS is stale); still needs measured backoff or version-based recovery. (systems; [overview](architecture/overview.md))
- A question in the current round can be taken out of the question list but not out of the round; the host is told to Skip past it. Censoring a live prompt the way a Herd answer is censored would need an owner decision, because it changes what players see mid-round. (game-flow; [2026-10-19 small-fixes record](verification/2026-10-19-small-fixes/README.md))
- `LockedGameRules` in `packages/contracts/src/host-settings.ts` is unused and differs from the stored `room.lockedRules`. (game-flow; [game-flow](areas/game-flow.md))
- `generateRoomCode` UUID fallback can yield digits that `normaliseRoomCode` rejects (unreachable in practice). (systems; [systems](areas/systems.md))
- `browser-mobile-ui` and `browser-desktop-ui` both write into dated historical evidence folders on every run, so a verification run dirties records it is not authoring (and `browser-desktop-ui` adds two screenshots that were never committed). Captures belong in the current update's folder. (quality; [ui-shell](areas/ui-shell.md))
- `docs/agents/{systems,accounts}.md` show `drill:resilience` without `test:disposable`; `browser-flow` has a 60 s launch timeout against 120 s elsewhere; run times of rooms/browser/drill unmeasured; some smokes mix HTTP and source-text assertions. (quality; [quality](areas/quality.md), LEDGER docs-core-a)
- Content: 11 legacy Herd seeds unreachable; only two styles with `fun`/`funny` naming mismatch; names capped at 24 characters inside prompts. (content; [content](areas/content.md))
- Unify prompt libraries and mode terminology so Education fallback and host metrics follow the selected mode. (content; OPS section 10)
- Ownership map in the ui-shell guide omits `history.jsx`, `back-stack.ts`, `QuickMenu`, `useMediaQuery`. (ui-shell; [ui-shell](areas/ui-shell.md))
- Saved Gahooks sit in PostgreSQL rows (about 11 MB worst case per account); move to object storage at scale. Guests have no device library of custom Gahooks. Session cache can honour a removed session for up to 60 s. (accounts; [accounts](areas/accounts.md))
- Bans last only as long as the room, per device key. (systems; [systems](areas/systems.md))

## Product

- Hard-coded "reviewed" and "updated" dates on the legal and information pages. (ui-shell; LEDGER docs-core-b)
- Split the public information reports into maintainable content files. (content; OPS section 10)
- Roadmap and growth proposal awaits decisions; record approved, deferred or rejected as they land. (product; [roadmap-and-growth](product/roadmap-and-growth.md))
- Accounts launch plan (provider, persistence, launch) awaits decisions. (accounts; [accounts-plan](product/accounts-plan.md))
- Deferred scoring alternatives decided after a playtest. (game-flow; [ADR 0003](architecture/0003-scoring-alternatives.md))

## Operations

- Journal-volume replacement probe (`standalone/verify-journal-volume.mjs`) has never been recorded as run; it needs an isolated `gahookz:review-*` image. (accounts, platform; RC, [accounts](areas/accounts.md))
- PostgreSQL probe: passes since the 2026-09-25 accounts work (see Checked and closed), but only against a disposable database; production has none. Run it against the real provisioned database before enabling accounts. (accounts; [accounts record](verification/2026-09-25-update/accounts.md))
- Rollback rehearsal on beta: done 2026-10-18; next one due by 2026-11-18 under the
  runbook's monthly cadence. (platform; [runbook](operations/runbook.md))
- `/srv/gahookz`: files removed 2026-10-08 (its `.env` files backed up to `~/.config/gahookz/` on the laptop); the empty directory needs `sudo rmdir`. (platform)
- Phone Syncthing can delete files in the Store working copy (happened 2026-09-30); make the phone receive-only or ignore `Projects/`. (platform; LEDGER)

## Human and device testing

- Observed play sessions at 4, 8, 12 and 20 players, with accessibility testing, before adding live-round features. (quality; OPS section 10)
- Real-device matrix (phones, TV, screen reader, 320 px and short landscape dialogs); human timing and content sessions for P04-P12. (quality; PP, IP)
- Party-sized load: shared-NAT capacity, reconnect storms, 20-player Herd. (systems; PP P08, IP)

## Owner decisions

- **Should the Ultimate Gahook threshold have a ceiling?** Each Ultimate a
  player triggers makes their next one a second harder, with no cap and no
  reset inside a game or a lobby, while the streak clock is reset by the very
  Ultimate or GET GOT that produced it. Measured in one lobby on 2026-10-23:
  thresholds 5,000 → 6,000 → 7,000 → 8,000 ms, and after that twenty seconds of
  unbroken Gahooks produced no further Ultimate. A cap or a per-round reset is
  one line; it changes how the game feels, so it is not an engineering call.
  (social; [record](verification/2026-10-23-gahook-extraction/README.md))
- **Should a host Gahook spend the victim's Counter Gahook streak?** It does,
  invisibly: a Gahook from a host who has not joined as a player clears the
  streak, so nine from one player plus one from the host means the tenth earns
  nothing. Counting the streak only for Gahooks that have a sender, and leaving
  it untouched otherwise, is also one line. (social; same record)
- **With Gahook effects off, should the Arena's challenge overlay still
  appear?** It does, deliberately: that overlay is the only way a challenge is
  announced and the Arena has its own switch. But it is a full-screen
  interruption in a room where the host asked for none, and the host could turn
  the Arena off instead. (social; same record)
- Herd author-points denominator: with self-votes refused an author reaches at most (n-1)/n of the maximum; change needs before/after fixtures. (game-flow; OPS section 10)
- Is `/information` public product content or an internal report? (ui-shell; OPS section 10, [internal-reports](product/internal-reports.md))
- Legal review of `/legal` (privacy notice especially) by a lawyer before any public campaign; unreviewed today. (product; OPS section 10)
- Accounts: sign-in provider, PostgreSQL hosting, launch date. (accounts; [accounts-plan](product/accounts-plan.md))
- Roadmap, growth and monetisation direction. (product; [roadmap-and-growth](product/roadmap-and-growth.md))
- Resume the separate Arena project once the update is verified on `main` (priority set 2026-10-04). (arena; LEDGER)

## Checked and closed

- The shared screen named every Herd writer before the vote. During `herd-writing` the host screen — the one the whole room watches — rendered every answer with "Answer by <name>" underneath, from `herdAnswerReview`, two lines below its own statement that "Answers stay anonymous during voting." The 2026-10-21 privacy work had checked that non-hosts cannot obtain that payload, which is a different question from whether the host should show it to the room. Closed 2026-10-22: `answerAuthor` is no longer sent in the host's review list, the contract now forbids the field there and requires it in a writer's own list, and `smoke-herd-anonymity` fails if it returns ([record](verification/2026-10-22-herd-anonymity/README.md)). (systems; PP P02)
- Nothing proved the server spent the per-prompt display permutation the engine generated. `standalone/server.js` read `ANSWER_META[assignment.displayIndex]` inline, and every engine test would still have passed had it read `answerIndex` — with the author leak back in production and no failing test anywhere. Closed 2026-10-22: the step is a named module with nine unit tests built on a plan where rotation and slots disagree on every writer, and a startup check keeps the writer cap within the display table, so a raised cap fails at boot instead of producing an answer with no id ([record](verification/2026-10-22-herd-anonymity/README.md)). (quality; PP P02)
- The contract fixture corpus had quietly stopped being evidence. The server had been sending fifteen snapshot fields no fixture contained (`gameFamily`, `quizScoring`, `lockedRules`, `settingsRevision` and more), both `building.*` fixtures held `lobby` snapshots so the building phase was never covered, `lobby.spectator` was captured with the host's own credential and recorded `isHost: true`, and no captured player had ever submitted a question — so the test claiming an author can see their own answer key was guarded by `if (own?.length)` and never ran. All four were invisible and three were asserted by passing tests. Closed 2026-10-22: the capture plays real games through all three modes, every fixture is checked against the phase and role its name claims, and `smoke-contract-drift` fails when the corpus drifts from the live server in either direction ([record](verification/2026-10-22-contract-phase-payloads/README.md)). (quality; PP P01)
- Nothing described what a snapshot may contain in a given phase: the schema pinned eleven of seventy-six fields, `currentQuestion` was `z.unknown()`, and every snapshot carries the same keys in every phase, so key presence could not express the rules that matter. Closed 2026-10-22 — `PublicSnapshotSchema` discriminates on `phase` and pins the three gates `publicQuestion` implements, with the answer key explicitly `null` before the reveal and the withheld fields pinned as absent rather than falsy ([record](verification/2026-10-22-contract-phase-payloads/README.md)). (systems; PP P01)
- Host authority was effectively untested: two of the twenty `/api/host/*` routes had a refusal case and nothing inspected an SSE frame at all. Closed 2026-10-21 — `standalone/smoke-privacy-contract.mjs` refuses every host route for four kinds of impostor and checks a real event frame, with the route list imported from `server/route-policy.mjs` so a new route joins the matrix by existing ([record](verification/2026-10-21-privacy-moderation-contract/README.md)). (quality; PP P01/P02)
- The duplicate-key guard only saw one named function's own `return {`: a second live duplicate (`namedPlayerNames` in `publicHerdAssignments`, two objects deep inside a `.map`) was invisible to it. Fixed 2026-10-21 — the dead line is gone and `standalone/server-duplicate-keys.test.mjs` now scans every object literal in every source file under `standalone/` and `packages/`, generated and vendor files excluded, with the scanner tested in both directions ([record](verification/2026-10-21-privacy-moderation-contract/README.md)). (systems; [systems](areas/systems.md))
- Local verification ran below the declared `engines.node` floor: closed
  2026-10-21 — Tyson installed `nodejs24` 24.18.0 and `nodejs24-npm` 11.16.0,
  which coexist with 22 as `/usr/bin/node-24` and `/usr/bin/npm-24`. A run only
  reaches 24 through an explicit PATH shim: `npm-24 run <script>` puts its own
  interpreter's directory (`/usr/bin`, where `node` is 22) on the PATH for
  lifecycle scripts, so the scripts get 22 — measured, not assumed. Recipe in
  [the working agreement](agents/README.md). (platform;
  [record](verification/2026-10-19-node-24/README.md))
- `assertRoomAssetCapacity` and `roomAssetChars` in `server/room.mjs` were dead exports nothing imported (the working cap is the byte check in `server/media.mjs`): removed 2026-10-21, keeping `MAX_ROOM_ASSET_CHARS`, with the regression guard `standalone/room-dead-exports.test.mjs` refusing their return and refusing any live file under `standalone/` from importing them ([record](verification/2026-10-21-remove-dead-room-exports/README.md)). (systems; [systems](areas/systems.md))
- "Reduce Gahook effects" also muted sound in the Lobby rules and join menu: fixed 2026-10-21 — `useReducedEffects` in `app.jsx` now sets only the reduced-effects preference, with the regression guard `standalone/reduce-mute-split.test.mjs` refusing any `setEffectsMuted` call in that hook ([record](verification/2026-10-21-reduce-mute-split/README.md)). (ui-shell; [ui-shell](areas/ui-shell.md))
- `publicMajorityResults` set `unanimous` twice: the dead second key is removed (fixed 2026-10-21), with the regression test `standalone/server-duplicate-keys.test.mjs` refusing any repeated key in that function's returned object. (game-flow; LEDGER docs-game-a)

- Six long-standing shell and moderation items, all on 2026-10-19
  ([record](verification/2026-10-19-small-fixes/README.md)): the install button
  (`usePwaInstall` is called at last), `/host` and `/play` being read as the room
  codes `HOST` and `PLAY`, `client/legal.js` and `client/report.js` missing from
  `SHELL_ASSETS`, the host-away notice covering the lobby status banner, no
  in-app link to `/information`, and the host having no button for a reported
  answer or question. A disconnected Herd writer no longer blocks Start either.

- **GET GOT during live rounds: decided 2026-10-19 — leave it.** Tyson's
  decision is to forget about live-phase GET GOT, so its unreachability is not a
  bug to chase: no work on making the −1,000 penalty reachable, no live-phase
  test coverage for it, and the lobby-based assertions in `smoke-gahooks` stay
  as they are. Nothing in the game changed when this was decided
  ([record](verification/2026-10-18-host-poke-claim/README.md)).

- `docker-deploy.sh` replacing production when it could not drain, when the
  drain wait expired, or when no token was configured, and leaving production
  draining after an abort: all four refuse or clean up now, with a stubbed test
  (2026-10-18, [record](verification/2026-10-18-deploy-safety/README.md)).

- `dev.gahookz.com` dead for six days behind an "Up" container, and production
  and beta restarted twice by a host-side `pkill -f server.js`: the watcher now
  replaces any server that goes away, `scripts/docker-status.sh` covers every
  service, and `scripts/stop-test-server.sh` is the safe way to stop a test
  server (2026-10-18,
  [record](verification/2026-10-18-dev-watcher/README.md)).
- `.env.example` documents `GAHOOKZ_DRAIN_TIMEOUT_MS`, `GAHOOKZ_MAX_ACTIVE_ROOMS`,
  `GAHOOKZ_BROADCAST_FLOOR_MS`, `GAHOOKZ_PROD_IMAGE`, `GAHOOKZ_BETA_IMAGE`,
  `GAHOOKZ_DRAIN_WAIT_SECONDS` and `GAHOOKZ_FORCE_REPLACE` (2026-10-18).
- `docker-deploy.sh` checked the running image against `gahookz:local` while
  compose defaults production to `gahookz:prod-local`: fixed 2026-10-18, with
  four offline checks in `smoke-deployment`.

- A host who created a room but never joined it could Gahook a live round
  without the per-question claim gate, up to GET GOT: fixed 2026-10-18
  (`ca0b74d`), regression smoke `standalone:smoke:host-poke-claim`. The same
  defect was the long-running `smoke-gahooks` "time-threshold Ultimate"
  failure, now green
  ([record](verification/2026-10-18-host-poke-claim/README.md)).

- Nginx Proxy Manager JWT signing key rotated 2026-10-09 (new key pair; all sites checked).

- Herd authorship was a pure function of the question author's position: `packages/game-engine/src/herd.ts` now assigns answers least-loaded with a shuffled remainder.
- Other players' picks visible before the reveal: fixed in every mode by U23 (`79d1f8b`, merged 2026-10-07).
- Privacy text said rooms end "a few minutes" after everyone leaves: now "about a minute" (`09b0a1c`).
- Gahook effects Off let in-round Gahooks through (`round-poke`, `host/poke`): every in-round route is gated (`05379cf`) and the buttons are hidden (`7769cd0`).
- "Saved dialog closes" browser-flow failure: the rules dialog showed its previous draft for one frame; fixed (`2026-10-07`).
- `dev.mjs` not watching `client/host-presence.jsx` and `client/legal.jsx`: both are in its watch list now.
- `CLAUDE.md` deploy and status commands pointing at `/srv/gahookz`: it now uses the Store path and calls `/srv/gahookz` stale.
- PostgreSQL probe failing with 57P01 (PP, RC): fixed in the accounts work (A8, A11).
- Smoke suite defaulting to production port, room password derivation claim, and the other items OPS section 10 lists as closed: unchanged; trust that list only with its evidence.
- Host-succession tie bug (`chooseHostSuccessor`): fixed in `30ba1ce`.
