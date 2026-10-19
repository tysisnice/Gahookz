# Handoff — state of the project

**Written 2026-10-18, updated 2026-10-19 by Claude Code (executor session).** Read this, then
[`CLAUDE.md`](../CLAUDE.md). This is the short version: where things stand, what
is half-finished, what to do next. The detailed history is
[`docs/history.md`](history.md) and the ledger in
[`IMPLEMENTATION-PLAN.md`](../IMPLEMENTATION-PLAN.md) section 8; the live list of
open work is [`docs/backlog.md`](backlog.md).

## In one paragraph

Production runs `74a489949e02`, deployed 2026-10-18, which closed the 48-commit
gap the previous handoff led with: everything Tyson asked for on 8 October is
live, along with a host-Gahook security fix, the Herd rotation work and the
development-watcher repair. The rollback plan has been rehearsed for the first
time, and every suite passes on this laptop — including the browser suites,
which could not run here at all until Chromium was installed.

Since then `main` has moved ahead of production, and **nothing is
half-finished**: both decisions that were waiting on Tyson were answered on
2026-10-19 (**forget GET GOT during live rounds**, **Node 24** as the declared
runtime), and `agent/small-fixes` is finished and merged. So the obvious next
thing is to ask whether to deploy; nothing waiting is urgent.

## The live services

Checked 2026-10-18 15:58 AEDT, straight after the deploy:

| | Revision | Notes |
| --- | --- | --- |
| `main` | `74a4899` plus the commits listed below | Everything in *What shipped* is verified against `74a4899` |
| Production (gahookz.com, :3102) | `74a489949e02` | Deployed 2026-10-18. **`main` has moved ahead of it:** the paused-skip refusal (`d1c00fe`) and the whole 2026-10-19 batch below are not live. Nothing in them is urgent or risky; a deploy needs Tyson's word. Rollback target `gahookz:rollback-prod-20261018-1556` |
| Beta (:3103) | `f15af0b9da5d` | Older by design; used for the rollback rehearsal and restored |
| Development (:3101) | bind-mounts the Store tree | So dev *is* current |

All three run under the **one** Compose project `gahookz-prod`, so a bare
`docker compose up -d` in the repository recreates production too. Always name
the service and pass `--no-deps`.

## What happened on 2026-10-18

Five branches that had been sitting unmerged since 11–17 October were verified
and merged, two defects were found on the way in, and a six-day outage was
found and fixed. Each has a record under `docs/verification/`:

- **[Host Gahook claim gate](verification/2026-10-18-host-poke-claim/README.md)** —
  a host who created a room but never joined it could Gahook a live round
  without the per-question limit, up to GET GOT. Fixed, with a regression smoke.
  This was also the cause of the long-running `smoke-gahooks` failure.
- **[The development watcher](verification/2026-10-18-dev-watcher/README.md)** —
  `dev.gahookz.com` had been dead for six days behind a container reporting
  "Up", because the watcher would not restart a server that exited *cleanly*.
  The trigger was a host-side `pkill -f server.js` that also restarted
  production and beta twice, ending any games in progress. Fixed three ways:
  the watcher, `scripts/docker-status.sh` (it only ever looked at production),
  and `scripts/stop-test-server.sh` as the safe way to stop a test server.
- **[Deploy safety](verification/2026-10-18-deploy-safety/README.md)** — the
  deploy script refuses, rather than warns and proceeds, wherever it would end
  a game nobody agreed to end, and cancels an abandoned drain.
  `npm run test:deploy-script` holds each decision against a stubbed Docker.
- **[Rollback rehearsal](verification/2026-10-18-rollback-rehearsal/README.md)** —
  Option 2 works on beta. It also showed that the 2026-10-02 rollback images
  report `revision: unknown`, so a rolled-back service must be identified by
  image tag and `builtAt`.
- **[The deploy itself](verification/2026-10-18-deploy/README.md)**.
- **Herd rotation (P06 step 2)** — questions and authors now rotate by stable
  ID across rematches, with nine 2/3/5-player boundary fixtures
  (`npm run test:herd-boundaries`). The author ordering was wrong in the branch
  and is fixed (`e1ae787`).

## What happened on 2026-10-19

- **Both owner decisions answered** and recorded where the findings live: live
  GET GOT is left as it is, and Node 24 is the declared runtime
  ([node 24 record](verification/2026-10-19-node-24/README.md)).
- **`agent/small-fixes` is finished and merged**, with every item in it done and
  three proved in a real browser
  ([record](verification/2026-10-19-small-fixes/README.md)): the Install app
  button, "Game guides" linking `/information` from inside the game for the
  first time, `/host` and `/play` as entry points, two first-paint modules
  missing from the PWA shell cache, the host-away notice covering the lobby
  banner, host removal of a reported answer or question, and a disconnected Herd
  writer no longer blocking Start. Skip's paused rule moved into
  `skipDecision(phase, { paused })`.
- **Nothing is half-finished.** There is no WIP branch to pick up.

## What to do next

1. **Ask Tyson whether to deploy.** `main` now carries player-visible changes
   production has never run (the whole 2026-10-19 batch, plus the paused-skip
   refusal). Nothing is urgent and nothing is risky, but the gap will keep
   growing. Never deploy unasked (`CLAUDE.md` rule 2).
2. **Nothing is blocked on a decision.** The only thing left for Tyson is
   installing Node 24 (below).
3. **Split the monoliths.** `server.js` (5,650 lines), `app.jsx` (5,496),
   `styles.css` (11,414) are the item that most slows everything else down.
   `standalone/server/question-selection.mjs` is the pattern that works:
   extract a vertical slice, inject the rules it needs, unit test it. The
   Gahook subsystem (`pokePlayer`, the spam window, Ultimate, GET GOT, counter
   Gahooks, the duel) is the most self-contained next candidate. See
   [the TypeScript plan](plans/typescript-migration.md).
4. Then the rest of [`docs/backlog.md`](backlog.md).

## Waiting on Tyson

- **Install Node 24 on this laptop.** Decided 2026-10-19: `engines.node` is now
  `>=24.0.0`, matching CI and the `node:24-alpine` image, but the system Node is
  still 22, so local verification runs below the declared floor. Nothing refuses
  — there is no `.npmrc`, so npm only warns — but a timing-sensitive result
  cannot be trusted to match production until it is installed. It needs your
  password: Fedora 44 has `nodejs24` (24.18.0) in `updates`, and nothing but its
  own subpackages requires the installed `nodejs22`
  ([record](verification/2026-10-19-node-24/README.md)).
- Plus the longer-standing ones in the backlog's *Owner decisions* section:
  accounts, audience and monetisation, the Herd author-points denominator.

Answered on 2026-10-19, for the record:

- **GET GOT during live rounds: leave it.** No work on making the −1,000 penalty
  reachable and no live-phase test coverage for it; the lobby assertions stay as
  they are ([record](verification/2026-10-18-host-poke-claim/README.md)).
- **Node version: Node 24.** The floor is raised and every document that
  described the old `>=20` state is updated
  ([record](verification/2026-10-19-node-24/README.md)).

Two operational suggestions, neither urgent:

- **`GAHOOKZ_METRICS_TOKEN` is not set in `.env`**, so no deploy can drain.
  Today's deploy was safe because the hardened script checks `activeRooms` and
  refuses if anyone is playing — but a graceful drain needs the token, and it
  only takes effect on the deploy *after* it is added.
- **Nothing watches health between sessions.** Docker will not restart an
  unhealthy container. `scripts/docker-status.sh` now reports every service and
  exits non-zero, which is enough for a small timer to call and report through
  Hermes.

## How to verify (this laptop)

The previous handoff said tests time out here and must run on the desktop. That
is stale: this machine has twelve cores and 15 GB, and the full matrix takes
about four minutes.

```bash
cd /mnt/storage/syncthing/Store/Projects/gahookz
npm run check                    # typecheck, unit tests, build
npm test                         # shared smoke chain, owns its own servers
npm run test:deploy-script       # deploy decisions, stubbed docker, no containers
npm run test:disposable -- npm run test:rooms
npm run test:disposable -- npm run test:herd-boundaries
npm run test:disposable -- npm run test:browser          # and :navigation, :mobile, :herd-writing
npm run docs:check
```

Chromium for the browser suites lives in `~/.cache/puppeteer` (installed
2026-10-18 with `npx puppeteer browsers install chrome`); without it every
browser suite fails at launch rather than failing a check.

## Traps that have already caught someone

- **`pkill -f server.js` reaches inside the containers.** It has taken
  production down twice. Use `bash scripts/stop-test-server.sh 3199`.
- **One Compose project.** Name the service and pass `--no-deps`.
- **`styles.css` merges.** Two branches appending rules conflict, and a
  union-merge once dropped a closing brace, silently disabling every rule after
  it. There is a test that every stylesheet closes its braces — keep it.
- **The three stamped shell files** (`index.html`, `service-worker.js`,
  `vendor-bootstrap.js`) conflict on nearly every merge. Resolve with
  `git checkout --theirs` then `npm run build`, never by hand.
- **`node_modules` is a symlink in worktrees.** Never `git add -A` blindly;
  never `npm ci` inside a worktree.
- **Browser suites can overwrite dated evidence.** Check `git status` before
  committing and restore dated folders.
- **Two orchestrators at once.** On 8 October two sessions built the same
  feature twice. Check `pgrep -af claude` and `git log` before starting.
- **Keep progress in the repository, not the vault.** A vault copy of the plan
  drifted from this one and two finished branches were lost because nothing
  here recorded them. The vault file is now a pointer.
