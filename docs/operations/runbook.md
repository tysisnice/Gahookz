# Owner's runbook

The day-to-day guide for running Gahookz on the home server: what runs where,
how to look without touching anything, how to test safely, and, only when
Tyson asks, how to deploy and roll back.

Status: skeleton written 2026-10-04. Sections are filled in one at a time; any
section that still says "to be written" is not yet usable.

This is a how-to guide. For why the design is the way it is, see
[production readiness](production-readiness.md) and the
[platform area guide](../areas/platform.md).

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
reaches the app containers over the Docker network `gahookz-proxy`. The Node
ports are bound to loopback and are never exposed publicly.

### Where the code lives

| Path | What it is | Use it for |
| --- | --- | --- |
| `/mnt/storage/syncthing/Store/Projects/gahookz` | The working repository. Syncthing syncs the source; `.git`, `node_modules` and build output stay on this laptop. | Production, beta and dev have all run from here since the Tyson-approved redeploy of 2026-10-02 (revision `f15af0b`). |
| `~/gahookz-agent-worktrees/<name>` | One Git worktree per agent, branch `agent/<name>`, made by `scripts/agent-worktree.sh`. | All agent work. |
| `/mnt/storage/syncthing/codex/2026-07-01/Gahookz` | The old checkout. | Read-only backup. Do not edit or delete. |
| `/srv/gahookz` | An older clone (at `81a70d2`). | Nothing. It is **not** the production source. |

Two consequences:

- Dev bind-mounts the Store tree, so **every save in the Store checkout reloads
  `dev.gahookz.com`** for anyone looking at it. Do experiments in a worktree and
  merge into Store only when verified.
- Older documents, including the deploy commands in `CLAUDE.md` and
  `SERVER-COMMANDS.md`, still say `cd /srv/gahookz`. That is stale; use the Store
  repository, as in [section 4](#4-deploy-only-when-tyson-asks).

### Rollback images

The 2026-10-02 move kept one image per environment so it could be undone:

```text
gahookz:rollback-prod-20261002
gahookz:rollback-beta-20261002
gahookz:rollback-dev-20261002
```

They preserve what each environment ran before the move. Rolling back to one has
never been rehearsed; see [section 5](#5-rollback).

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
```

The fields that matter in `/api/health`:

| Field | Meaning |
| --- | --- |
| `ok` | The process is up. |
| `revision` | The Git commit baked into the image (12 characters, `-dirty` if the tree had uncommitted changes). This is the reliable answer to "what server code is live". Development reports `unknown`. |
| `release` | A hash of the browser files only (`release-<16 hex>`). A server-only change does not move it. |
| `builtAt`, `serverBuiltAt` | When the browser files and the image were built. |
| `activeRooms` | Rooms alive right now. This is how many games a restart would end. |
| `draining` | `true` once the server has been told to refuse new rooms (see [section 4](#4-deploy-only-when-tyson-asks)). |
| `instance` | The instance id, to tell processes apart. |

`/api/ready` returns HTTP 200 normally and 503 when the server is draining, shutting
down, or at its room cap (`roomCapacity`). A 503 is not a crash.

Compare the live revision with the checkout:

```bash
git rev-parse --short=12 HEAD
curl -fsS http://127.0.0.1:3102/api/health | grep -o '"revision":"[^"]*"'
```

Before anything that restarts a container, read `activeRooms`: if it is above 0,
people are playing.

### Containers and the status script

```bash
docker ps --filter name=gahookz --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'
docker compose ls                      # which Compose projects exist
bash scripts/docker-status.sh          # same as: npm run status:docker
```

`scripts/docker-status.sh` prints `docker compose ps`, the container health, the
running release and revision, the instance, the draining state, the active room
count and the last 40 log lines for the `gahookz` service. It reports whichever
Compose project the directory resolves to. Which project that is for the Store
tree, given that dev and production share one checkout, is unverified: check that
the container it lists is the production one (typically `gahookz-prod-gahookz-1`).
If it is not, rely on `docker ps` and the `curl` calls above, and see the project
warning in [section 4](#4-deploy-only-when-tyson-asks).

### Logs

```bash
docker logs --tail=100 gahookz-prod-gahookz-1       # production
docker logs --tail=100 gahookz-gahookz-beta-1       # beta
docker logs --tail=100 gahookz-gahookz-dev-1        # development
```

Container names are `<project>-<service>-1`, so confirm them against `docker ps`.
More on reading them in [section 6](#6-logs-and-troubleshooting).

The metrics endpoint `/api/metrics` needs a bearer token held in the host's `.env`.
Do not paste that token into documents or chat.

## 3. Safe test workflow

The stateful smoke suite creates and mutates real rooms. Never point it, or any
test, at ports 3101 to 3103 or a public domain. Tests use **port 3199 only**, on a
server that `npm test` and `npm run test:disposable` start and stop themselves.

### Work in a worktree

The Store tree feeds `dev.gahookz.com`, so do experiments elsewhere:

```bash
cd /mnt/storage/syncthing/Store/Projects/gahookz
bash scripts/agent-worktree.sh <name>            # new branch agent/<name> in ~/gahookz-agent-worktrees/<name>
bash scripts/agent-worktree.sh --reuse <name>    # attach an existing agent/<name> branch
```

`node_modules` in a worktree is a symlink to the main checkout. Never run `npm install`
or `npm ci` there.

### Run the checks

Every build or test holds one shared lock, because the machine has two cores and
runs the live game. Use Node 24: some shells put a newer Node first on `PATH`, and a
timing-sensitive smoke has failed under Node 26 and passed under 24.

```bash
cd ~/gahookz-agent-worktrees/<name>
export PATH=/usr/bin:$PATH; node --version                        # must say v24

flock /tmp/gahookz-verify.lock npm run check                      # typecheck + unit tests + build, about 30 s
flock /tmp/gahookz-verify.lock npm test                           # full stateful suite, about 3 min
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run test:rooms
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run test:browser
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run standalone:smoke:<name>
flock /tmp/gahookz-verify.lock npm run docs:check
```

- Run the stateful batches one after another. Do not start a server by hand, and do
  not wrap `npm test` in `test:disposable`: it manages its own servers.
- `test:disposable` refuses an occupied port 3199. If something else holds it, leave it
  alone. To stop a stray test server, find the listener, never `pkill -f server.js`
  (that pattern matches the live containers):

  ```bash
  ss -lptnH "sport = :3199" | grep -oP 'pid=\K[0-9]+'
  ```

- A build rewrites three tracked shell files (`index.html`, `service-worker.js`,
  `vendor-bootstrap.js`). Commit them after the final build; CI fails if they are stale.
  Generated `.js` files are gitignored; clean them with `npm run clean:generated`.
- Browser checks re-capture screenshots into `docs/verification/`. Keep re-captures
  only in the current update's folder and restore dated historical folders with
  `git checkout -- docs/verification/<dated-folder>`.
- A layout change is not verified by a build. Screenshot it at 390x844, 360x740 and
  desktop size against a disposable server, and look at the pictures.
- Optional, no server needed: `docker compose config --quiet` validates the Compose files.

More: [testing wiki page](../wiki/testing.md), [platform guide](../areas/platform.md).

## 4. Deploy (only when Tyson asks)

Replacing the production container ends every game in progress. Deploy only when
asked, and give it a drain window.

1. **Commit and push first.** The work is merged into `main` and pushed, the checks in
   [section 3](#3-safe-test-workflow) passed, and `git status --porcelain` is empty.
   The script stamps a `-dirty` revision rather than refusing, so a dirty tree
   would ship uncommitted work.
2. **Check who is playing** (`activeRooms`, see [section 2](#2-look-without-changing-anything)) and warn the players.
3. **Tag the running image** so there is something to roll back to ([section 5](#5-rollback)).
4. **Confirm the Compose project.** The script runs `docker compose` in its own
   directory. Production must resolve to project `gahookz-prod`, while dev uses
   `gahookz`, and both now come from the Store tree:

   ```bash
   docker compose ps -q gahookz      # must print the live production container id
   ```

   If it prints nothing, or the script stops with "Port 3102 is published by
   Compose project ... which this deploy does not own", stop and fix the project
   name first. A wrong project builds an image and then fails on the busy port,
   leaving production on old code with a broken container beside it. How one
   `.env` serves both projects here is unverified; never read `.env` to find out.

### Run it

```bash
cd /mnt/storage/syncthing/Store/Projects/gahookz
git branch --show-current                      # main
git pull --ff-only origin main

GAHOOKZ_DRAIN_WAIT_SECONDS=300 bash scripts/docker-deploy.sh   # same as: npm run deploy:docker
```

The script stamps the 12-character revision, validates Compose, builds the `gahookz`
image, drains, force-recreates **only** the `gahookz` service (dev and beta are
untouched) and waits for a healthy container reporting the expected revision.
Without `GAHOOKZ_DRAIN_WAIT_SECONDS` it replaces production at once and says so.

Watch the output:

- The drain needs `GAHOOKZ_METRICS_TOKEN` in the host's `.env`. Without it the script
  prints "No GAHOOKZ_METRICS_TOKEN in .env, so the node cannot be drained first." and
  then replaces production anyway, ending games.
- After the wait (here 300 s) it proceeds even if rooms remain, ending them.
- If you abort during the wait, production stays in drain mode and refuses new
  rooms until it is restarted or drain is cancelled with `POST /api/drain`
  `{"active":false}` (bearer token required).

### Confirm what is live

```bash
git rev-parse --short=12 HEAD
curl -fsS https://gahookz.com/api/health; echo      # "revision" must match, "draining" false
bash scripts/docker-status.sh
```

Then check by hand in a browser (not a script): create a room, join from a phone,
watch the lobby update, close it. Record the revision, time, result and rollback
target in the plan ledger.

### Known issue: the image check

The script compares the running container's image with `gahookz:local`, while the
Compose default for production is `gahookz:prod-local` (`GAHOOKZ_PROD_IMAGE`). The
check passes only if the host's `.env` sets `GAHOOKZ_PROD_IMAGE=gahookz:local`
(unverified). The check runs after the new container is up, so a failure there
("does not use the image that was just built", or `No such image: gahookz:local`)
does not mean production is down: read `/api/health` before reacting. `docker compose restart gahookz` restarts the old image and never
deploys source changes.

## 5. Rollback

> **Untested plan.** The rollback images exist, but no rollback has ever been
> rehearsed. Treat every step as a plan to be checked as you go. A rollback also
> replaces the process, so it ends the games the failed release was hosting.

### Before every deploy: keep a known-good image

Builds overwrite the production image tag, so tag what is running first. This only
adds a label and changes nothing live:

```bash
prod=$(docker ps -q --filter name=gahookz-prod-gahookz); echo "$prod"   # must print one container id
docker tag "$(docker inspect --format '{{.Image}}' "$prod")" "gahookz:rollback-prod-$(date +%Y%m%d)"
docker image ls 'gahookz:rollback-*'
```

### Option 1: revert and redeploy (preferred)

Uses only the tooling that is documented above. On a branch, `git revert <bad-commit>`,
run the [section 3](#3-safe-test-workflow) checks, merge and push, then do a normal
[deploy](#4-deploy-only-when-tyson-asks). Do not `git switch` the Store tree to an old
commit: dev bind-mounts it, so dev would change and Syncthing would copy the old
source to the other machines.

### Option 2: recreate production from a kept image (fastest, untested)

When production is broken and a revert is too slow. A variable on the command line
overrides `.env` for that one command, so `.env` is never edited:

```bash
cd /mnt/storage/syncthing/Store/Projects/gahookz
docker compose ps -q gahookz           # must print the production container id (project check)
GAHOOKZ_PROD_IMAGE=gahookz:rollback-prod-20261002 \
  docker compose up -d --force-recreate --no-build gahookz
curl -fsS http://127.0.0.1:3102/api/health; echo
```

Expect the old image's revision, which will not match `git rev-parse HEAD`. The
override lasts for that command only: the next `docker compose up` or deploy returns
to the default tag. The 20261002 image is what ran *before* the move to the Store
tree, so use it only if nothing newer was tagged.

### Rehearse it on beta first

Beta is capped at two rooms and nobody depends on it. Do the Option 2 steps once with
`GAHOOKZ_BETA_IMAGE=gahookz:rollback-beta-20261002`, service `gahookz-beta`, port 3103,
and write down what actually happened here.

## 6. Logs and troubleshooting

Docker keeps three 10 MB log files per service. Follow a log with `-f`:

```bash
docker logs -f --tail=100 gahookz-prod-gahookz-1
docker stats --no-stream                       # memory and CPU per container
docker logs --tail=100 nginx-proxy-manager     # the proxy
```

Work outwards from the container: the app on loopback, then its logs, then the proxy,
then the public path.

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

- Do not fix an SSE problem by enabling caching, adding replicas or removing room affinity.
- Do not fix a dev problem by rebuilding production.
- Restarting a container ends its rooms. The proxy also fronts other apps: restart
  it (`cd /srv/docker/nginx-proxy-manager && docker compose restart`) only when it is
  the fault, and do not `cat` its data directory, which holds its signing key.
- Docker starts production again after a reboot (`restart: unless-stopped`). To bring
  it up by hand: `docker compose up -d gahookz`, then check health.

## 7. Maintenance cadence

To be written.

## 8. Definition of done

To be written.
