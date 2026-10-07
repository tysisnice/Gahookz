# Gahookz backlog

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

- No browser control reports content: `/api/player/report` and `/api/host/remove-content` exist and are tested, but nothing under `standalone/public` calls them, while `client/legal.jsx` tells players to "use the report button". (ui-shell, systems; LEDGER docs-core-b)
- Automated abuse handling for an open anonymous audience: no scanning, appeals, evidence retention or operator console. (systems; OPS section 10 P0)
- Accounts are inert in production (no `DATABASE_URL`, Google client unset); needs the owner to provision both. (accounts; [accounts](areas/accounts.md), OPS section 10)

## Engineering P1

- `docker-deploy.sh` replaces production anyway when `GAHOOKZ_METRICS_TOKEN` is missing or the drain wait expires, and an abort mid-wait leaves production draining. (platform; LEDGER docs-runbook, `scripts/docker-deploy.sh`)
- `docker-deploy.sh` checks the running image against `gahookz:local` while compose defaults production to `gahookz:prod-local`. (platform; [platform](areas/platform.md))
- `skipPhase` in `standalone/server.js` never checks `room.paused`, so a host can skip while paused. (game-flow; LEDGER docs-game-a)
- A disconnected Herd writer blocks Start (Skip or force-start get past it). (game-flow; LEDGER docs-game-a)
- No install button: `usePwaInstall` in `client/offline.jsx` is exported but used nowhere. (ui-shell; LEDGER docs-core-b)
- Tested rollback: rollback images exist (2026-10-02) but no rollback has been rehearsed; runbook says "revert and redeploy" first. (platform; OPS section 10, [runbook](operations/runbook.md))
- Split the monoliths: `server.js` (5,612 lines), `app.jsx` (5,496), `styles.css` (11,414). (platform, ui-shell; OPS section 10, [typescript plan](plans/typescript-migration.md))
- Runtime schemas at the HTTP/SSE boundary are only partly present (`packages/contracts/src/schemas.ts`); full role-filtered payload validation is open. (systems; PP P01/P02)
- The engine's phase maths is not what runs: `nextPhase`, `resumeDeadline`, `estimatedDurationMs` are tested but unused; the live machine has its own. (game-flow; [game-flow](areas/game-flow.md))
- Dependency and base-image update cadence: nothing schedules re-resolving the digest or scanning advisories. (platform; OPS section 10, [dependency policy](operations/dependency-policy.md))
- Per-address SSE cap (32) versus a real party behind one address: measure before a large session. (systems; OPS section 10)
- Structured, redacted logging instead of ad hoc console logs. (systems; OPS section 10)
- `package.json` allows Node `>=20` while CI, Docker and the verified runtime are Node 24. (platform; [platform](areas/platform.md))
- `.env.example` omits `GAHOOKZ_DRAIN_TIMEOUT_MS`, `GAHOOKZ_MAX_ACTIVE_ROOMS`, `GAHOOKZ_BROADCAST_FLOOR_MS`, `GAHOOKZ_PROD_IMAGE`, `GAHOOKZ_BETA_IMAGE`. (platform; LEDGER docs-core-a)
- Data export (`GET /api/account/export`) is not built; no email-free recovery, Apple sign-in or passkeys. (accounts; [accounts](areas/accounts.md))
- Stage acceptance P01-P12 of the overhaul is still "Partial" apart from P00 (stable option identities, rematch author rotation, party-sized load and reconnect-storm measurements, typed state engine, JSX decomposition, remaining browser matrix). Re-verify per stage before claiming any as done. (quality; PP, IP)

## Engineering P2

- Static files are served `no-store` (`server/transport.mjs`), including hashed assets; long immutable caching would help. (platform; OPS section 10)
- SSE recovery polling: now `POST /api/state` after 25 s of stream silence (the 1.8 s figure in OPS is stale); still needs measured backoff or version-based recovery. (systems; [overview](architecture/overview.md))
- `LockedGameRules` in `packages/contracts/src/host-settings.ts` is unused and differs from the stored `room.lockedRules`. (game-flow; [game-flow](areas/game-flow.md))
- `assertRoomAssetCapacity` and `roomAssetChars` in `server/room.mjs` are unused. (systems; [systems](areas/systems.md))
- `generateRoomCode` UUID fallback can yield digits that `normaliseRoomCode` rejects (unreachable in practice). (systems; [systems](areas/systems.md))
- Host-away notice overlaps the lobby status banner. (ui-shell; [ui-shell](areas/ui-shell.md), [systems](areas/systems.md))
- `/host` and `/play` are served `index.html` but `getRoute` reads them as room codes `HOST` and `PLAY`. (ui-shell; [ui-shell](areas/ui-shell.md))
- `client/legal.js` is built but missing from `SHELL_ASSETS`, so it is cached only after its first online load. (ui-shell; [ui-shell](areas/ui-shell.md))
- "Reduce Gahook effects" also mutes sound in the Lobby rules and join menu. (ui-shell; [ui-shell](areas/ui-shell.md))
- `browser-mobile-ui` rewrites a dated historical evidence folder on every run. (quality; [ui-shell](areas/ui-shell.md))
- `docs/agents/{systems,accounts}.md` show `drill:resilience` without `test:disposable`; `browser-flow` has a 60 s launch timeout against 120 s elsewhere; run times of rooms/browser/drill unmeasured; some smokes mix HTTP and source-text assertions. (quality; [quality](areas/quality.md), LEDGER docs-core-a)
- Content: 11 legacy Herd seeds unreachable; only two styles with `fun`/`funny` naming mismatch; names capped at 24 characters inside prompts. (content; [content](areas/content.md))
- Unify prompt libraries and mode terminology so Education fallback and host metrics follow the selected mode. (content; OPS section 10)
- `publicMajorityResults` sets `unanimous` twice. (game-flow; LEDGER docs-game-a)
- Ownership map in the ui-shell guide omits `history.jsx`, `back-stack.ts`, `QuickMenu`, `useMediaQuery`. (ui-shell; [ui-shell](areas/ui-shell.md))
- Saved Gahooks sit in PostgreSQL rows (about 11 MB worst case per account); move to object storage at scale. Guests have no device library of custom Gahooks. Session cache can honour a removed session for up to 60 s. (accounts; [accounts](areas/accounts.md))
- Bans last only as long as the room, per device key. (systems; [systems](areas/systems.md))

## Product

- Hard-coded "reviewed" and "updated" dates on legal and information pages; no in-app link to `/information`. (ui-shell; LEDGER docs-core-b)
- Split the public information reports into maintainable content files. (content; OPS section 10)
- Roadmap and growth proposal awaits decisions; record approved, deferred or rejected as they land. (product; [roadmap-and-growth](product/roadmap-and-growth.md))
- Accounts launch plan (provider, persistence, launch) awaits decisions. (accounts; [accounts-plan](product/accounts-plan.md))
- Deferred scoring alternatives decided after a playtest. (game-flow; [ADR 0003](architecture/0003-scoring-alternatives.md))

## Operations

- Journal-volume replacement probe (`standalone/verify-journal-volume.mjs`) has never been recorded as run; it needs an isolated `gahookz:review-*` image. (accounts, platform; RC, [accounts](areas/accounts.md))
- PostgreSQL probe: passes since the 2026-09-25 accounts work (see Checked and closed), but only against a disposable database; production has none. Run it against the real provisioned database before enabling accounts. (accounts; [accounts record](verification/2026-09-25-update/accounts.md))
- Rollback rehearsal on beta (monthly cadence in the runbook, never done). (platform; [runbook](operations/runbook.md))
- `/srv/gahookz` is a stale clone (`81a70d2`), not production; production, beta and dev run from the Store repository since 2026-10-02. The documents were corrected on 2026-10-07; Tyson may want to remove the clone. (platform; [docs audit](verification/2026-09-25-update/docs-audit.md))
- Rotate the Nginx Proxy Manager JWT signing key (`keys.json` was exposed to a terminal on 2026-09-05). (platform; OPS section 10)
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
