# Platform — area guide

Verified 2026-10-04 against commit `27da7b6` on branch `agent/docs-core`. I did
not run Docker, read `.env`, or touch ports 3101-3103 while writing this; where
a fact depends on the live host's `.env` or Docker state it says "unverified".

## Purpose

Platform turns source into something that runs and keeps it runnable: the
browser build, the development watcher, the Docker image and Compose stack, the
deploy and status scripts, CI, and the rules for where work happens. It owns
`build-client.mjs`, `dev.mjs`, `clean-generated.mjs`, `sync-artifacts.mjs`,
`Dockerfile`, `compose.yaml`, `scripts/`, `deploy/`, `.github/` and
`tsconfig.*`.

Platform never deploys unasked (rule 2 in `CLAUDE.md`), and nothing in this
area may point a stateful test at production (rule 3).

## What players see

Nothing directly. Players see the effects: a new release reaches phones because
the service worker cache name and every `?v=` query change with the release
hash; a deploy that skips the drain ends games in progress; a wrong Compose
project can leave production on old code. `/api/health` reports the browser
`release` and the server `revision`.

## Code map

| Path | What it is |
| --- | --- |
| `standalone/build-client.mjs` | esbuild transform of every browser module, release hash, stamping of the shell |
| `standalone/clean-generated.mjs` | Deletes exactly the generated files, read from the build's own list |
| `standalone/sync-artifacts.mjs` | One definition of a Syncthing artifact (`.sync-conflict-`, `.syncthing.`) |
| `standalone/dev.mjs` | Development watcher: rebuild, restart, reload |
| `Dockerfile` | Four targets: `dependencies`, `production-dependencies`, `development`, `production` (plus a throwaway `browser-build` stage) |
| `compose.yaml` | Services `gahookz-dev`, `gahookz` (production), `gahookz-beta`; external network `gahookz-proxy` |
| `scripts/docker-deploy.sh` | The deploy (also `npm run deploy:docker`, `deploy:fedora`, `update:docker`) |
| `scripts/docker-status.sh`, `scripts/docker-update.sh` | Status report; `update` just runs the deploy script |
| `scripts/agent-worktree.sh` | Gives an agent its own worktree |
| `scripts/check-docs.mjs` | `npm run docs:check` |
| `scripts/render-icons.mjs` | `npm run icons:render`, PNG icons from the one SVG |
| `.github/workflows/ci.yml` | CI: `check`, `smoke`, `image` jobs |
| `.env.example` | Documented environment, safe defaults. Never open `.env`. |
| `deploy/nginx/*.example` | Example proxy configs |
| `tsconfig.base.json`, `tsconfig.{contracts,server,web}.json` | The three strict TypeScript projects behind `npm run typecheck` |

## How it works

### Where things run

| What | Where |
| --- | --- |
| Working repository | `/mnt/storage/syncthing/Store/Projects/gahookz` (Syncthing syncs source only; `.git`, `node_modules` and build output stay on this laptop) |
| Agent worktrees | `~/gahookz-agent-worktrees/<name>`, branch `agent/<name>`, made by `scripts/agent-worktree.sh` |
| Old checkout (backup, read-only) | `/mnt/storage/syncthing/codex/2026-07-01/Gahookz` |
| Containers | Since 2026-10-02 production, beta and dev run from the Store repository (per `CLAUDE.md`; I did not check Docker). `/srv/gahookz` is an older clone and is not the production source. |

| Environment | Port | Source | Notes |
| --- | --- | --- | --- |
| Development | `127.0.0.1:3101` | Store working tree, bind-mounted, hot reload | `dev.gahookz.com`; every save in the Store tree reloads it |
| Production | `127.0.0.1:3102` | immutable image, Compose project `gahookz-prod` | `gahookz.com` |
| Beta | `127.0.0.1:3103` | production target image | `beta.gahookz.com`, two rooms, no database |
| Disposable tests | `127.0.0.1:3199` | started by the test wrapper | the only port tests may use |

Do agent work in a worktree: the Store tree feeds the live dev site. In a
worktree `node_modules` is a symlink to the main checkout; never run
`npm install` there.

### The browser build

`npm run build` runs `build-client.mjs`. It transforms 23 source modules (JSX
and TypeScript) with esbuild (ES2019, minified) into `.js` files beside them,
and rewrites the imports to carry `?v=<release>`. The generated set is the
`generatedFiles` list at the top of the script: `app.js`, 22 `client/*.js`
modules (note `client/audio.js` builds to `client/audio.runtime.js`) and
`release.json`. All are gitignored. `client/audio.js` and
`client/gahook-forms.js` are hand-written sources despite the `.js` name.
`npm run clean:generated` removes exactly the generated list and nothing else.

**Release hash.** `sourceAssetVersion` hashes every file under
`standalone/public` except generated files, Syncthing artifacts and `*.test.ts`,
and yields `release-<16 hex>`. It does not cover server code, so a server-only
change does not move it. The server revision is separate (below).

**The three stamped shell files.** `index.html`, `service-worker.js` and
`vendor-bootstrap.js` are *tracked* and contain the release in
`gahookz-shell-<release>` and `?v=<release>`. The build rewrites them in place.
Before hashing, the same patterns are replaced by `ASSET_VERSION`, so stamping
does not change the hash it stamps. Consequence: whenever browser source
changes you must run `npm run build` and commit those three files. CI fails the
`check` job if rebuilding changes them, because a stale stamp means the release
hash no longer describes what is served (the 2026-08-26 mixed-deployment
incident). The build also refuses an empty shell file.

### The development watcher

`npm run dev` runs `standalone/dev.mjs`: a first build, the server under
`node --import tsx` with `GAHOOKZ_DEV_RELOAD=1` on port 3101 (or `PORT`), and
file watchers. A change to a listed browser source or shell file queues a rebuild
(90 ms debounce) and then `POST /__dev/reload`, which makes connected browsers
reload over `/__dev/events`. A change under `standalone/server/`, the
`packages/{accounts,contracts,game-engine}/src` folders, or `server.js` restarts
the server process. Two sources are missing from its watch lists, so editing
only `client/host-presence.jsx` or `client/legal.jsx` does not rebuild until
another watched file changes (see Known issues).

### Docker targets

The base image is `node:24-alpine`, pinned by digest. The server runs as the
non-root `node` user with a health check on `/api/health`.

| Target | Contents | Command |
| --- | --- | --- |
| `development` | dev dependencies, copies of `packages`, `infra`, `standalone`; Compose bind-mounts `standalone` (writable), `packages` and `infra` (read-only) over them | `npm run dev` |
| `production` | production dependencies, server code, `packages`, `infra/postgres`, and browser assets built from source in a throwaway stage | `node standalone/server.js` |

The production image never contains checked-in generated bundles. It runs the
server without `--import tsx`, relying on Node 24 loading the `.ts` sources
under `packages/` directly; CI's "Production image serves a healthy release"
step proves this works. Build args `GAHOOKZ_REVISION` and `GAHOOKZ_BUILT_AT`
become the `revision` and `serverBuiltAt` in `/api/health`.

### Compose services

`compose.yaml` declares `name: gahookz`, which is the *development* project.

| Service | Port variable (default) | Notes |
| --- | --- | --- |
| `gahookz-dev` | `GAHOOKZ_DEV_PORT` (3101) | development target, bind mounts, `stop_grace_period` 15 s |
| `gahookz` (production) | `GAHOOKZ_PROD_PORT` (3102) | production target, read-only root, `career-data` volume for the career journal, `GAHOOKZ_TRUST_PROXY=1`, `GAHOOKZ_HTTPS=1`, `GAHOOKZ_DRAIN_TIMEOUT_MS` 30000, `stop_grace_period` 45 s |
| `gahookz-beta` | `GAHOOKZ_BETA_PORT` (3103) | production target, `GAHOOKZ_MAX_ACTIVE_ROOMS` from `GAHOOKZ_BETA_MAX_ROOMS` (2), `DATABASE_URL` empty, 512 MB and 1 CPU |

All three bind to `GAHOOKZ_BIND_ADDRESS` (default loopback), join the external
network `gahookz-proxy`, drop all capabilities, set `no-new-privileges`, and cap
processes (128), memory (default 1 GB) and CPU (default 2). Production sets
`COMPOSE_PROJECT_NAME=gahookz-prod` in its checkout's `.env` (unverified; never
read). The stop grace period must exceed the drain timeout or the runtime sends
SIGKILL mid-drain.

### The deploy, status and update scripts

`scripts/docker-deploy.sh` (only when asked): creates `.env` from the example if
absent; stamps `GAHOOKZ_REVISION` (12-character commit, `-dirty` if uncommitted)
and `GAHOOKZ_BUILT_AT`; validates Compose; refuses if the production port belongs to a
Compose project it does not own (and says which `COMPOSE_PROJECT_NAME` to set);
builds the `gahookz` service; when `GAHOOKZ_DRAIN_WAIT_SECONDS` is above 0 and
`GAHOOKZ_METRICS_TOKEN` is set, calls `POST /api/drain` and waits up to that many
seconds for `activeRooms` to reach 0; then force-recreates only the `gahookz`
service and waits for healthy, the expected image and a matching `revision`.
Without a drain wait it warns that active games will end.
`docker-status.sh` prints Compose status, health, release, revision, instance,
draining state, active rooms and recent logs. `docker-update.sh` calls the
deploy script.

### CI

`.github/workflows/ci.yml` runs on pushes and pull requests to `main`, on Node 24:

| Job | What it checks |
| --- | --- |
| `check` | `npm run typecheck`, `npm run test:unit`, `npm run build`; the three shell files are unchanged by the build; no generated browser file is tracked; no Syncthing conflict copy is tracked |
| `smoke` | `npm test`, then installs Chromium and runs `test:browser` and `test:rooms` through `test:disposable` |
| `image` | `docker compose config`, builds the development and production targets, runs the production image and requires `"ok":true` and `"schemaVersion":1` from `/api/health`, no Syncthing artifacts in `/app`, user `node` |

CI does not run `npm run docs:check`.

### Environment, the lock and Node 24

`.env.example` documents every variable Compose reads for the stack: ports,
resource caps, proxy and HTTPS flags, public origin, database and OAuth
placeholders, instance id, metrics token, the two room-lifetime variables and
the beta settings. It contains only placeholders. `.env` is untracked and must
never be read or committed.

Every build or test run holds the shared lock so only one heavy job runs on this
two-core machine, and port 3199 is never contested:
`flock /tmp/gahookz-verify.lock <command>`. Use Node 24 by prefixing
`PATH=/usr/bin:$PATH` (some shells put Node 26 first; a timing-sensitive smoke
failed there and passed under 24). Runtime dependencies are `pg` and `tsx`;
React and Redux are vendored under `standalone/public/vendor`.

## Invariants

- Production changes only by a deliberate, requested deploy, with a drain wait.
- Never run docker, tests or the stateful suite against ports 3101-3103.
- Generated browser files stay untracked; the three shell files stay tracked,
  stamped and committed in step with browser source.
- `.dockerignore`, `tsconfig.web.json` and CI refuse Syncthing artifacts the same
  way `sync-artifacts.mjs` does; change all together.
- Everything under `packages/` is loaded directly by plain `node` in the
  production image, so it must stay within erasable TypeScript (no constructor
  parameter properties, enums or namespaces) or the server fails at startup.
- Environment variables that change behaviour are documented in `.env.example`
  with safe defaults.
- Never `pkill` by pattern; find the listener with
  `ss -lptnH "sport = :3199" | grep -oP 'pid=\K[0-9]+'`.

## Tests

```bash
PATH=/usr/bin:$PATH flock /tmp/gahookz-verify.lock npm run check
PATH=/usr/bin:$PATH flock /tmp/gahookz-verify.lock npm run standalone:smoke:deployment
PATH=/usr/bin:$PATH flock /tmp/gahookz-verify.lock npm run docs:check
PATH=/usr/bin:$PATH flock /tmp/gahookz-verify.lock npm run icons:render -- --check
```

`smoke-deployment.mjs` is a source-text tripwire over `Dockerfile`,
`.dockerignore`, `compose.yaml`, the nginx example, `.env.example`,
`docker-deploy.sh`, `dev.mjs`, `server.js` and `package.json`; changing any of
them on purpose means updating its assertions in the same commit. It needs no
server and no Docker.

## Common changes

- **Add a browser module:** add it to `generatedFiles`, add a `transformFile`
  call, add its import rewrite to the importing module, add it to `dev.mjs`
  `buildSources`, run `npm run build` and commit the stamped shell files.
- **Add an environment variable:** read it once and clamp it, pass it through
  `compose.yaml`, document it in `.env.example`, and note it in the owning guide.
- **Change the base image:** re-resolve the digest, rebuild, run the full smoke
  suite before any deploy.
- **Regenerate icons:** edit the SVG, run `npm run icons:render` under the lock,
  commit the SVG and PNGs.

## Known issues

- `dev.mjs` does not watch `client/host-presence.jsx` or `client/legal.jsx`.
- `docker-deploy.sh` checks the running image against `gahookz:local`, while the
  Compose default for production is `gahookz:prod-local`; the check passes only
  if the host's `.env` sets `GAHOOKZ_PROD_IMAGE=gahookz:local` (unverified).
- `.env.example` does not list `GAHOOKZ_DRAIN_TIMEOUT_MS`,
  `GAHOOKZ_MAX_ACTIVE_ROOMS`, `GAHOOKZ_BROADCAST_FLOOR_MS`, `GAHOOKZ_PROD_IMAGE` or
  `GAHOOKZ_BETA_IMAGE`.
- `CLAUDE.md` deploy and status commands still say `cd /srv/gahookz`, which the
  same file says is not the production source.
- `package.json` allows Node `>=20` while CI, Docker and the verified runtime are Node 24.

Live backlog: [`../backlog.md`](../backlog.md).
