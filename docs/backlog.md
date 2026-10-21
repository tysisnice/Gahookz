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
- Automated abuse handling for an open anonymous audience: no scanning, appeals, evidence retention or operator console. (systems; OPS section 10 P0)
- Accounts are inert in production (no `DATABASE_URL`, Google client unset); needs the owner to provision both. (accounts; [accounts](areas/accounts.md), OPS section 10)

## Engineering P1

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
- Split the monoliths: `server.js` (5,612 lines), `app.jsx` (5,496), `styles.css` (11,414). (platform, ui-shell; OPS section 10, [typescript plan](plans/typescript-migration.md))
- Runtime schemas at the HTTP/SSE boundary are only partly present (`packages/contracts/src/schemas.ts`); full role-filtered payload validation is open. (systems; PP P01/P02)
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

- Herd author-points denominator: with self-votes refused an author reaches at most (n-1)/n of the maximum; change needs before/after fixtures. (game-flow; OPS section 10)
- Is `/information` public product content or an internal report? (ui-shell; OPS section 10, [internal-reports](product/internal-reports.md))
- Legal review of `/legal` (privacy notice especially) by a lawyer before any public campaign; unreviewed today. (product; OPS section 10)
- Accounts: sign-in provider, PostgreSQL hosting, launch date. (accounts; [accounts-plan](product/accounts-plan.md))
- Roadmap, growth and monetisation direction. (product; [roadmap-and-growth](product/roadmap-and-growth.md))
- Resume the separate Arena project once the update is verified on `main` (priority set 2026-10-04). (arena; LEDGER)

## Checked and closed

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
