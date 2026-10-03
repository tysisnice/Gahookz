# Owner's runbook

The day-to-day guide for running Gahookz on the home server. Written 2026-10-04 from
`CLAUDE.md`, the [platform guide](../areas/platform.md), the deploy and status scripts,
`package.json` and `compose.yaml`. Docker, `.env` and ports 3101 to 3103 were not
touched while writing it; whatever depends on them says "unverified". For why the
design is this way, see [production readiness](production-readiness.md).

## 1. Environments

The one fact behind everything below: rooms, players, timers and uploads live
only inside one Node process. Restarting or replacing a container ends every
game it hosts, and there must never be more than one production replica.

| Environment | Loopback port | Public name | Compose project, service | What it runs |
| --- | --- | --- | --- | --- |
| Development | 3101 | `dev.gahookz.com`, behind a proxy access list | `gahookz`, `gahookz-dev` | The Store working tree, bind-mounted, hot reload. Reports `revision: "unknown"` on purpose. |
| Production | 3102 | `gahookz.com`, `www.gahookz.com` | `gahookz-prod`, `gahookz` | An immutable image, changed only by a deliberate deploy. Cap of 32 rooms. |
| Beta | 3103 | `beta.gahookz.com` | `gahookz`, `gahookz-beta` | A production-target image, capped at two rooms, no database. |
| Disposable tests | 3199 | none | none | Started and stopped by `test:disposable` and `npm test`. The only port tests may use. |

Public traffic reaches Nginx Proxy Manager (a container, not a host Nginx), which
reaches the app containers over the Docker network `gahookz-proxy`. The Node ports
stay on loopback.

### Where the code lives

| Path | What it is |
| --- | --- |
| `/mnt/storage/syncthing/Store/Projects/gahookz` | The working repository (Syncthing syncs source only; `.git`, `node_modules` and builds stay on this laptop). Production, beta and dev have all run from here since the Tyson-approved redeploy of 2026-10-02 (revision `f15af0b`). |
| `~/gahookz-agent-worktrees/<name>` | One worktree per agent, branch `agent/<name>`. All agent work happens here. |
| `/mnt/storage/syncthing/codex/2026-07-01/Gahookz` | The old checkout. Read-only backup; do not edit or delete. |
| `/srv/gahookz` | An older clone (at `81a70d2`). **Not** the production source. |

Dev bind-mounts the Store tree, so **every save in the Store checkout reloads
`dev.gahookz.com`**. Experiment in a worktree and merge into Store only when verified.
The deploy commands in `CLAUDE.md` and `SERVER-COMMANDS.md` still say
`cd /srv/gahookz`; that is stale, so use the Store repository ([section 4](#4-deploy-only-when-tyson-asks)).

Rollback images kept by the 2026-10-02 move, one per environment (never rehearsed, see
[section 5](#5-rollback)): `gahookz:rollback-prod-20261002`, `gahookz:rollback-beta-20261002`
and `gahookz:rollback-dev-20261002`.

## 2. Look without changing anything

Everything here is a read-only `GET` or a log read. It is safe at any time,
including mid-game.

### Is it up, and what is running?

```bash
cd /mnt/storage/syncthing/Store/Projects/gahookz

curl -fsS http://127.0.0.1:3102/api/health; echo     # production, loopback
curl -fsS http://127.0.0.1:3102/api/ready; echo      # is production taking new rooms?
curl -fsS https://gahookz.com/api/health; echo       # production, the public path
curl -fsS http://127.0.0.1:3103/api/health; echo     # beta
curl -fsS http://127.0.0.1:3101/api/health; echo     # development
git rev-parse --short=12 HEAD                        # compare with "revision" from production
```

In `/api/health`, `revision` is the Git commit baked into the image (12 characters,
`-dirty` if the tree had uncommitted changes; development says `unknown`) and is the
reliable answer to "what server code is live". `release` hashes the browser files
only, so a server-only change does not move it. `activeRooms` is how many games a
restart would end, and `draining` is `true` once the server refuses new rooms.

`/api/ready` returns HTTP 200 normally and 503 when the server is draining, shutting
down, or at its room cap (`roomCapacity`). A 503 is not a crash.

Before anything that restarts a container, read `activeRooms`.

### Containers and the status script

```bash
docker ps --filter name=gahookz --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'
docker compose ls                      # which Compose projects exist
bash scripts/docker-status.sh          # same as: npm run status:docker
```

`scripts/docker-status.sh` prints `docker compose ps`, container health, release,
revision, draining state, active rooms and the last 40 log lines of the `gahookz`
service. It reports whichever Compose project the directory resolves to; which one
that is for the Store tree, where dev and production share a checkout, is unverified.
Check that it lists the production container (typically `gahookz-prod-gahookz-1`);
if not, use `docker ps` and the `curl` calls above, and read the project warning in
[section 4](#4-deploy-only-when-tyson-asks).

### Logs

```bash
docker logs --tail=100 gahookz-prod-gahookz-1       # production
docker logs --tail=100 gahookz-gahookz-beta-1       # beta
docker logs --tail=100 gahookz-gahookz-dev-1        # development
```

Container names are `<project>-<service>-1`; confirm them against `docker ps`. Add `-f`
to follow. `/api/metrics` needs a bearer token held in the host's `.env`; never paste it
anywhere. Troubleshooting is in [section 6](#6-logs-and-troubleshooting).

## 3. Safe test workflow

The stateful smoke suite creates and mutates real rooms. Never point it, or any
test, at ports 3101 to 3103 or a public domain. Tests use **port 3199 only**, on a
server that `npm test` and `npm run test:disposable` start and stop themselves.

### Work in a worktree

The Store tree feeds `dev.gahookz.com`, so experiment elsewhere. A worktree's
`node_modules` is a symlink to the main checkout; never run `npm install` or `npm ci`
there. More in the [testing wiki page](../wiki/testing.md).

```bash
cd /mnt/storage/syncthing/Store/Projects/gahookz
bash scripts/agent-worktree.sh <name>            # new branch agent/<name> in ~/gahookz-agent-worktrees/<name>
bash scripts/agent-worktree.sh --reuse <name>    # attach an existing agent/<name> branch
```

### Run the checks

Every build or test holds one shared lock: the machine has two cores and runs the
live game. Use Node 24; some shells put a newer Node first on `PATH`, and a
timing-sensitive smoke has failed under Node 26 and passed under 24.

```bash
cd ~/gahookz-agent-worktrees/<name>
export PATH=/usr/bin:$PATH; node --version                        # must say v24

flock /tmp/gahookz-verify.lock npm run check                      # typecheck + unit tests + build, about 30 s
flock /tmp/gahookz-verify.lock npm test                           # full stateful suite, about 3 min
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run test:rooms
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run test:browser
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run standalone:smoke:<smoke>
flock /tmp/gahookz-verify.lock npm run docs:check
```

- Run the stateful batches one after another. Never start a server by hand, and never
  wrap `npm test` in `test:disposable`: it manages its own servers.
- `test:disposable` refuses an occupied port 3199; leave unfamiliar listeners alone. To
  stop a stray test server of your own, find its pid with
  `ss -lptnH "sport = :3199" | grep -oP 'pid=\K[0-9]+'`. Never `pkill -f server.js`: that
  pattern matches the live containers.
- A build rewrites three tracked shell files (`index.html`, `service-worker.js`,
  `vendor-bootstrap.js`); commit them after the final build or CI fails. Generated `.js`
  files are gitignored; remove them with `npm run clean:generated`.
- Browser checks re-capture screenshots into `docs/verification/`. Commit only the
  current update's folder and restore dated ones (`git checkout -- docs/verification/<folder>`).
- A layout change is not verified by a build: screenshot it at 390x844, 360x740 and
  desktop size against a disposable server, and look at the pictures.

## 4. Deploy (only when Tyson asks)

Replacing the production container ends every game in progress. Deploy only when
asked, and give it a drain window.

1. **Commit and push first.** The work is merged into `main` and pushed, the
   [section 3](#3-safe-test-workflow) checks passed, and `git status --porcelain` is
   empty. The script stamps `-dirty` rather than refusing, so a dirty tree ships
   uncommitted work.
2. **Check who is playing** (`activeRooms`, [section 2](#2-look-without-changing-anything)) and warn players.
3. **Tag the running image** so there is something to roll back to ([section 5](#5-rollback)).
4. **Confirm the Compose project.** The script runs `docker compose` in its own
   directory. Production must resolve to `gahookz-prod`, dev to `gahookz`, and both now
   come from the Store tree. This must print the live production container id:

   ```bash
   docker compose ps -q gahookz
   ```

   If it prints nothing, or the script stops with "Port 3102 is published by Compose
   project ... which this deploy does not own", stop and fix the project name first: a
   wrong project builds an image, fails on the busy port, and leaves production on old
   code beside a broken container. How one `.env` serves both projects is unverified.

### Run it

```bash
cd /mnt/storage/syncthing/Store/Projects/gahookz
git branch --show-current                      # main
git pull --ff-only origin main
GAHOOKZ_DRAIN_WAIT_SECONDS=300 bash scripts/docker-deploy.sh   # same as: npm run deploy:docker
```

The script stamps the 12-character revision, validates Compose, builds the `gahookz`
image, drains, force-recreates **only** the `gahookz` service (dev and beta are
untouched) and waits for a healthy container reporting the expected revision. Without
`GAHOOKZ_DRAIN_WAIT_SECONDS` it replaces production at once and says so. Watch for:

- **No drain without a token.** The drain needs `GAHOOKZ_METRICS_TOKEN` in the host's
  `.env`. If the script prints "No GAHOOKZ_METRICS_TOKEN in .env, so the node cannot be
  drained first." it then replaces production anyway, ending games.
- **The wait is a limit.** After 300 s it proceeds even if rooms remain, ending them.
- **Aborting mid-wait leaves drain on.** Production refuses new rooms until it restarts
  or drain is cancelled with `POST /api/drain` `{"active":false}` (bearer token needed).

### Confirm what is live

```bash
git rev-parse --short=12 HEAD
curl -fsS https://gahookz.com/api/health; echo      # "revision" must match, "draining" false
bash scripts/docker-status.sh
```

Then, by hand in a browser (not a script), create a room, join from a phone, watch the
lobby update and close it. Record the revision, time, result and rollback target in the
plan ledger.

### Known issue: the image check

The script compares the running container's image with `gahookz:local`, but the
Compose default for production is `gahookz:prod-local` (`GAHOOKZ_PROD_IMAGE`). The check
passes only if the host's `.env` sets `GAHOOKZ_PROD_IMAGE=gahookz:local` (unverified).
It runs after the new container is up, so a failure ("does not use the image that was
just built", or `No such image: gahookz:local`) does not mean production is down: read
`/api/health` first. Note that `docker compose restart gahookz` restarts the old image
and never deploys source changes.

## 5. Rollback

> **Untested plan.** The rollback images exist, but no rollback has ever been
> rehearsed. Check each step as you go. It replaces the process, so it ends live games.

### Before every deploy: keep a known-good image

Builds overwrite the production image tag, so label what is running first. This adds a
tag and changes nothing live:

```bash
prod=$(docker ps -q --filter name=gahookz-prod-gahookz); echo "$prod"   # must print one container id
docker tag "$(docker inspect --format '{{.Image}}' "$prod")" "gahookz:rollback-prod-$(date +%Y%m%d)"
docker image ls 'gahookz:rollback-*'
```

### Option 1: revert and redeploy (preferred)

On a branch, `git revert <bad-commit>`, run the [section 3](#3-safe-test-workflow)
checks, merge and push, then do a normal [deploy](#4-deploy-only-when-tyson-asks). Do not
`git switch` the Store tree to an old commit: dev bind-mounts it, and Syncthing would
copy the old source to the other machines.

### Option 2: recreate production from a kept image (fastest, untested)

For when production is broken and a revert is too slow. A variable on the command line
overrides `.env` for that one command, so `.env` is never edited:

```bash
cd /mnt/storage/syncthing/Store/Projects/gahookz
docker compose ps -q gahookz           # must print the production container id
GAHOOKZ_PROD_IMAGE=gahookz:rollback-prod-20261002 \
  docker compose up -d --force-recreate --no-build gahookz
curl -fsS http://127.0.0.1:3102/api/health; echo
```

Expect the old image's revision, which will not match `git rev-parse HEAD`. The override
lasts for that command only; the next `docker compose up` or deploy returns to the
default tag. The 20261002 images hold what ran before the move to the Store tree, so use
one only if nothing newer was tagged.

**Rehearse it on beta first.** Beta is capped at two rooms and nobody depends on it. Run
the Option 2 steps once with `GAHOOKZ_BETA_IMAGE=gahookz:rollback-beta-20261002`, service
`gahookz-beta` and port 3103, and write down what actually happened here.

## 6. Logs and troubleshooting

App logs are in [section 2](#2-look-without-changing-anything); Docker keeps three 10 MB
files per service. Also useful:

```bash
docker stats --no-stream                       # memory and CPU per container
docker logs --tail=100 nginx-proxy-manager     # the proxy
```

Work outwards from the container: the app on loopback, its logs, the proxy, then the
public path.

| Symptom | Check first | Likely layer |
| --- | --- | --- |
| Loopback `/api/health` fails | `docker ps`, the app logs | app, image, Docker |
| Loopback works, public fails | proxy logs; both containers on `gahookz-proxy`; DNS; router | proxy, TLS, ingress |
| Page loads, room stops updating | the `/events` request stays open; proxy buffering and timeouts | SSE or proxy |
| New build looks old | compare `release` in health with the page's asset query and the service worker cache | release or browser cache |
| `/api/ready` returns 503 | `draining`, `activeRooms` against `roomCapacity` | drain left on, or the 32-room cap |
| Production changed unexpectedly | container creation time, `revision`, shell history | release process |
| Memory climbs | `activeRooms` and `docker stats` | process-local rooms and media |
| Dev ignores a source change | dev logs; `client/host-presence.jsx` and `client/legal.jsx` are not watched | dev watcher |

- Do not fix an SSE problem by enabling caching, adding replicas or removing room
  affinity, and do not fix a dev problem by rebuilding production.
- Restarting a container ends its rooms. The proxy also fronts other apps: restart it
  (`cd /srv/docker/nginx-proxy-manager && docker compose restart`) only when it is the
  fault, and never `cat` its data directory, which holds its signing key.
- Docker restarts production after a reboot (`restart: unless-stopped`). By hand:
  `docker compose up -d gahookz`, then check health.

## 7. Maintenance cadence

| When | Do |
| --- | --- |
| Every change | Check `git status` and Syncthing state; run the focused tests and the build; keep generated and secret files out of Git; update the docs ([section 8](#8-definition-of-done)). |
| Every production release | Name the exact revision; warn players; tag the running image ([section 5](#5-rollback)); deploy through the script with a drain window; check local and public health and a real browser room; record revision, time, result and rollback target. |
| Weekly while testing | Read the app and proxy logs and the restart counts; check disk, memory and Syncthing conflict copies (`*.sync-conflict-*`); check health and TLS; triage abuse reports and dependency alerts. |
| Monthly | Review Node, npm, esbuild, TypeScript and base-image updates on a branch ([dependency policy](dependency-policy.md)); run the full browser and device matrix; rehearse the rollback on beta; review DNS, dynamic DNS and certificate renewal; prune old image tags only after confirming a rollback image exists. |
| Before a public campaign | Load, moderation, privacy, legal, accessibility, monitoring, rollback and support gates all signed off ([production readiness](production-readiness.md)). "It works for friends" is evidence, not the gate. |

## 8. Definition of done

A change is not done because it compiled. It is done when:

1. The intended behaviour, and what it does not change, is written down.
2. The diff is scoped to one purpose and reviewed, and contains no conflicted, generated or secret files.
3. Types and contracts are updated where the change touches them.
4. `npm run check`, the focused smoke scripts and, after merging, the full stateful suite pass on a disposable server, never on 3101 to 3103.
5. Anything visual was looked at on a phone and a desktop size, not just built.
6. Privacy, moderation, guest play (no account needed to join) and compatibility effects were considered.
7. The area guide, the feature's wiki page and `docs/CHANGELOG.md` describe the change, and `npm run docs:check` passes.
8. Production was deployed only when Tyson asked, with a drain window, and local and public health plus a real browser room were checked.
9. A rollback target and the remaining risks are recorded in the handoff.
