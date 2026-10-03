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

To be written.

## 5. Rollback

To be written.

## 6. Logs and troubleshooting

To be written.

## 7. Maintenance cadence

To be written.

## 8. Definition of done

To be written.
