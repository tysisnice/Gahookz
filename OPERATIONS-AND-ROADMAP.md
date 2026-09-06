# Gahookz operations, maintenance, architecture, and future roadmap

Last audited: 2026-09-06 AEST (second pass, after the first public deploy of
the audit work)
Live production revision at audit: `815c7e494bef`
Live browser release at audit: `release-17037a408d92a05a`

> **Read this first.** This document has been written in layers since
> 2026-07-20 and parts of it were overtaken by later work. Superseded passages
> are marked **Superseded** or struck through inline rather than deleted, so
> the original reasoning stays readable. Two consequences matter when you use
> it:
>
> - **Section 10 is the live backlog. Read it before proposing work.** Several
>   items that read as open have since been completed, and one previously
>   unrecorded defect has been added.
> - Where this document and the code disagree, the code is right. Every claim
>   in section 10 was re-verified against the running system on 2026-09-06;
>   claims elsewhere may not have been.

This is the main owner and maintainer guide. It describes what exists now,
how to work safely, how to bring development and production online, how to
promote a tested change, and how to evolve Gahookz into a typed multi-platform
product.

New contributors and coding agents should start at [`CLAUDE.md`](CLAUDE.md),
which carries the standing rules and the shortest accurate description of the
system, and come here for depth. `PROJECT-MEMORY.md` is the owner's running
narrative log; it is deliberately untracked, so it does not exist in a fresh
clone and nothing here may depend on it.

Do not put credentials, API tokens, public IP addresses, private keys, room
passwords, cookies, or purchase secrets in this repository or its memory file.

## 1. The short version

Gahookz is a dependency-light React/Node party game. Browsers use JSON POST
requests for commands and Server-Sent Events (SSE) for live state. One Node
process serves the API, SSE stream, room media, PWA, and static client.

The live server currently runs two Docker services:

| Public URL | Compose service | Host port | Behaviour |
| --- | --- | ---: | --- |
| `https://dev.gahookz.com` | `gahookz-dev` | `127.0.0.1:3101` | Bind-mounted Syncthing source, automatic rebuild/restart/reload |
| `https://gahookz.com` and `https://www.gahookz.com` | `gahookz` | `127.0.0.1:3102` | Immutable production image, updated only by an intentional deploy |

Nginx Proxy Manager accepts public traffic on ports 80/443 and reaches both
containers on the external Docker network `gahookz-proxy`. The Node ports stay
loopback-only. Cloudflare currently supplies authoritative DNS in DNS-only
mode; it is not a Cloudflare Tunnel deployment.

The most important operational fact is this:

> Rooms, players, credentials, timers, chat, drawings, and uploaded room media
> exist only in one Node process. Restarting or replacing that process ends its
> rooms. Never run more than one production replica with the current design.

The routine commands on the Fedora server are:

```bash
# Development lives in the Syncthing tree.
cd /mnt/storage/syncthing/codex/2026-07-01/Gahookz

# Inspect everything without changing it.
docker compose ps
bash scripts/docker-status.sh
curl -fsS http://127.0.0.1:3101/api/health   # dev
curl -fsS http://127.0.0.1:3102/api/health   # prod

# Start or rebuild development.
docker compose up -d --build gahookz-dev
docker compose logs -f --tail=100 gahookz-dev
```

Production is a **separate clean clone**, and is promoted from there:

```bash
cd /srv/gahookz
git pull

# Optional: let games in progress finish first. Without this the deploy
# replaces the container immediately and ends every active game.
GAHOOKZ_DRAIN_WAIT_SECONDS=300 bash scripts/docker-update.sh

# Or, accepting that active rooms end now:
bash scripts/docker-update.sh
```

`/api/health` reports `revision`, so after a deploy you can confirm which
server code is live rather than inferring it from the browser release hash:

```bash
curl -fsS http://127.0.0.1:3102/api/health | python3 -m json.tool
git -C /srv/gahookz rev-parse --short=12 HEAD    # must match "revision"
```

## 2. Terminology and sources of truth

Use these terms consistently:

- **Source** means the editable repository files.
- **Development** or **dev** means the hot-reloading process at port 3101 and
  `dev.gahookz.com`.
- **Production** or **prod** means the explicitly built image at port 3102 and
  the apex/`www` domains.
- **`main`** means the Git branch. A Syncthing working tree can contain
  uncommitted edits, so “current source” is not automatically “Git main.”
- **Promote** means build the tested source into the production image and
  replace the production container.
- **Browser release** means the `release-...` value produced from files below
  `standalone/public/`.

At the time of this audit, local `main` and `origin/main` both point to
`dd449f26290f`, but the working tree contains pre-existing uncommitted
deployment/build changes. Always run `git status --short --branch` and review
`git diff` before deciding what will be promoted.

**Superseded (2026-09-06).** This target state has been reached. Production
builds from a separate clean clone at `/srv/gahookz`, checked out on `main`,
and only the Syncthing directory feeds hot-reload development. The three points
below are kept because they still describe why the split exists:

1. the Syncthing directory remains the hot-reload development source;
2. a separate clean Git clone is the production release source;
3. only reviewed commits or tags are deployed from that production clone.

Deploying is therefore `git pull` in `/srv/gahookz`, then
`bash scripts/docker-update.sh` from that directory. Running the deploy script
from the Syncthing tree would ship uncommitted work and is no longer the
intended path.

## 3. Current live architecture

```text
Phone/browser/installed PWA
        |
        | HTTPS
        v
Cloudflare authoritative DNS (currently DNS-only)
        |
        v
Home router TCP 80/443 -> Fedora laptop
        |
        v
Nginx Proxy Manager (OpenResty)
        |
        +-- gahookz.com, www.gahookz.com
        |      -> gahookz:3001 on gahookz-proxy
        |
        +-- dev.gahookz.com
               -> gahookz-dev:3001 on gahookz-proxy

Each Node process
  +-- static PWA and browser modules
  +-- POST /api/* commands
  +-- GET /api/state recovery snapshots
  +-- GET /events SSE state stream
  +-- GET /media/<ROOM>/<ID> in-memory media
  +-- Map<roomCode, room> process-local state
```

The app deliberately uses POST plus SSE rather than WebSockets. The client also
polls `/api/state` every 1.8 seconds as recovery. This is simple and works well
through the current proxy, but it increases snapshot traffic and should be
measured before public growth.

### Verified live state on 2026-09-06

The 2026-09-05 audit found and fixed several defects. Recorded here because the
behaviour of the running system changed, not only its code:

- **Rooms leaked.** `resetLobby()` cancelled a room's expiry timer without
  scheduling a replacement, so any room reset with no client connected stayed
  resident for the life of the process and permanently consumed one of the 32
  room slots. Every "New Game" on production burned a slot until restart. This
  is also why the smoke suite could not be run twice against one process.
- **Room passwords did not protect room state.** `verifyRoomPassword()` was
  reached only from `/api/room` and `/api/player/join`. `/api/state` and
  `/api/events/ticket` answered anyone holding the four-letter code, exposing
  player names, scores, the leaderboard and live question content, plus a live
  event stream. Both now go through `roomAccessGranted()`; a verified password
  admits the credential so the browser can read state during the gap between
  opening a room and completing the join form.
- **Bans applied only to joining.** A kicked player kept reading the room in
  real time. The ban is now enforced on reads and on the event stream.
- **GET routes bypassed admission control**, because `assertMutation()` sat
  inside the POST branch. `/api/lobby` was an unthrottled oracle for which of
  the 331,776 room codes were live. `/api/lobby` and `/events` now consume a
  read bucket.
- **Syncthing conflict copies were served**, publishing the previous build of
  the whole application at predictable URLs on the bind-mounted development
  host. They are refused by the static server, excluded from the image build
  context, and removed from the tree.

Guest play was not affected by any of this and must not be: creating a room,
joining and playing a full game still require no account. See
`docs/architecture/0001-long-term-foundation.md`.

Two known gaps remain from this work: the account panel is hidden on
production because `DATABASE_URL`, `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` are unset, so accounts, career statistics and
entitlements are in-memory and lost on restart; and `GAHOOKZ_REQUIRE_POSTGRES`
is still `0` on a public deployment.

### First deploy of the audit work, 2026-09-06

Production was replaced for the first time since 2026-08-26, moving from
`release-d8fe54341e816a6e` (no `revision` field) to
`release-17037a408d92a05a`, revision `815c7e494bef`. It was deployed with
`activeRooms: 0`, so no game was interrupted.

Verified live through the public domain rather than only on loopback:

- `/api/health` reports `revision`, `serverBuiltAt`, `instance`, `draining` and
  `activeRooms`.
- Host-only moderation is enforced: a non-host calling
  `/api/host/remove-content` receives `"Only the host can do that."`
- `/legal` and `/client/legal.js` serve, so the published documents are
  reachable.
- Malformed JSON returns `400 invalid_json` and an oversize body returns `413`,
  not `500`.
- Security headers are present on the public origin: CSP, HSTS,
  `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`,
  `X-Content-Type-Options: nosniff`, a restrictive `Permissions-Policy`, and
  same-origin COOP/CORP.
- Two rooms created for the check expired on their own after roughly four
  minutes, which is the room-leak fix from the first pass working in
  production. Before it, those rooms would have held their slots until restart.
- The container logged `SIGTERM received; refusing new rooms and draining 0
  active room(s)` on replacement, so the drain path runs.

One deployment defect was found and fixed during this deploy. `compose.yaml`
declares `name: gahookz`, which is the *development* project, while production
runs under `gahookz-prod`. The deploy script pinned no project, so run from
`/srv/gahookz` it resolved no container for the `gahookz` service, built the
image, and would then have tried to create a second container that collided on
the published port — failing in a way that looks like a build problem while
production silently stayed on the old code. `/srv/gahookz/.env` now sets
`COMPOSE_PROJECT_NAME=gahookz-prod`, and `scripts/docker-deploy.sh` refuses to
continue when the production port belongs to a Compose project it does not own.

### Verified live state on 2026-07-20

- Both Gahookz containers were healthy and had been running for about four
  hours.
- Production local port 3102, `gahookz.com`, and `www.gahookz.com` returned
  browser release `release-f5e95fed469a8b0e` with production build time
  `2026-07-20T01:03:54.061Z`.
- Development local port 3101 and `dev.gahookz.com` returned the same content
  hash with later dev build time `2026-07-20T01:17:36.990Z`.
- Public HTML returned `Cache-Control: no-store`.
- The public dev reload endpoint returned `text/event-stream` and
  `Cache-Control: no-cache, no-transform`; remaining open until the client
  disconnects is correct behaviour.
- Nginx Proxy Manager, production, and development were all attached to the
  persistent `gahookz-proxy` network with the expected service aliases.
- `npm run build`, syntax checks, Compose validation, and the full 17-command
  smoke suite passed against a disposable server on port 3199.

The release value hashes browser inputs only, so a server-only source change
keeps the same `release-...` value.

**Resolved 2026-09-06.** `/api/health` now also reports `revision`, the Git
short SHA baked into the image at build time, so the running server commit is
directly observable. `scripts/docker-deploy.sh` stamps it from the deploy
source and fails the deploy if the running container reports anything else.

`gahookz-dev` reports `revision: "unknown"`, and that is correct rather than a
fault. The development container bind-mounts a Syncthing-fed tree whose
contents change continuously, so no single commit describes what it is running.
Only the immutable production image has a meaningful revision. Outside a
container the server falls back to reading `.git/HEAD`, so `npm start` in a
checkout does report one.

## 4. Repository and code map

| Path | Responsibility | Maintenance note |
| --- | --- | --- |
| `standalone/server.js` | HTTP routing, room commands, phase state machine, snapshots, SSE, static serving | 4,791 lines (2026-09-06) and still growing; the highest-risk server file |
| `standalone/server/` | Auth mapping, room limits, scoring, Herd ranking, media, social state, presentation, transport | Best first server TypeScript migration units |
| `standalone/public/app.jsx` | Redux state, routes, API client, host/player UI, most game UI | 5,349 lines (2026-09-06) and still growing; split before or during TS migration |
| `standalone/public/client/` | Audio, drawing, custom Gahooks, information, legal, offline Dash, preferences, presentation, QR, social, tutorials | Source files are `.jsx`/`.js`; generated `.js` siblings are ignored |
| `standalone/public/styles.css` | Entire visual system | 10,887 lines (2026-09-06) and still growing; needs component-oriented splitting, not a blind rewrite |
| `standalone/build-client.mjs` | esbuild transforms, content hash, cache-version rewriting | Transforms modules independently; it is not a conventional bundle |
| `standalone/dev.mjs` | Watches client/server source, rebuilds, restarts, and signals browser reload | Watches `standalone/`, not root package/Docker files |
| `standalone/smoke-*.mjs` | Static and stateful smoke coverage | Strong regression net, but not a unit/integration test framework |
| `Dockerfile` | Node 24 Alpine development and production targets | Production is non-root and read-only |
| `compose.yaml` | Dev/prod services, resource limits, loopback ports, shared proxy network | Requires external network `gahookz-proxy` |
| `scripts/docker-deploy.sh` | Build, replace, health-gate, image-ID check | Deploys production only and ends rooms |
| `scripts/docker-status.sh` | Production status, revision, and recent logs | Does not inspect dev or public endpoints |
| `deploy/nginx/` | Host-Nginx example | Live server uses Nginx Proxy Manager instead |
| `standalone/public/client/information.jsx` | Seven product/operations reports at `/information` | Contains roadmap and security observations; decide whether these should remain public |

All three monoliths grew between the 2026-08-10 audit and 2026-09-06, despite
the stated intention to split them. Treat that as the standing maintainability
signal: prefer extracting a vertical slice to adding another branch to
`server.js`, `app.jsx` or `styles.css`.

### Generated files

Do not hand-edit these ignored outputs:

- `standalone/public/app.js`
- `standalone/public/client/*.js` outputs such as `information.js`
- `standalone/public/release.json`

Edit their `.jsx`/source equivalents and run `npm run build`. The tracked
`index.html`, `service-worker.js`, and `vendor-bootstrap.js` contain the current
asset version and can change during a source build.

### Present gameplay/product capabilities

- Account-free four-letter rooms, optional room password, QR/link joining.
- Host and player roles, host-as-player, host transfer, kick/ban, vote kick,
  question approval, pause/skip/reset/new-game controls.
- Quiz, Majority Rulz, and Herd as live modes, plus an implemented but
  currently hidden Oddball mode.
- Quick, Standard, and Custom round presets, Fun/Education prompts, generated
  fallback content, question/prompt creation, drawings, and image upload.
- Speed-based Quiz scoring; authored-answer plus prediction scoring in Herd.
- Gahooks, Counter/Ultimate variants, point stealing, custom animated Gahooks,
  uploaded/recorded audio, finale congratulations/boos.
- Waiting-room chat, collaborative whiteboard, and room-based Gahook Dash.
- PWA installation, offline shell, offline Dash, reduced effects, mute controls,
  tutorials, responsive host/player/party views.

### Hard limits and lifecycle

- 20 players per room.
- 32 active rooms per Node process.
- Approximately 9 MB of decoded in-memory media per room, derived from the
  12,000,000-character cap.
- JSON request bodies are capped at 8,000,000 characters; Nginx permits 10 MB.
- Chat retains 60 messages, whiteboard retains 160 strokes, and social actions
  have local per-room rate limits.
- A room with no valid live host/player client expires after five minutes until
  a host has connected; after the established host disconnects and no valid
  room client remains, the room can expire immediately.
- Process restart means total room loss. There is no backup or recovery path
  for an active room.

## 5. Development environments

### Option A: local Node development

Use this on a normal development computer. Node 20+ is declared, but Node 24 is
the closest match to the Docker runtime.

```bash
git status --short --branch
npm ci
npm run dev
```

Open `http://127.0.0.1:3101`. If Docker dev already owns that port, choose a
different one:

```bash
HOST=127.0.0.1 PORT=3198 npm run dev
```

The watcher performs an initial browser build, starts the Node server, rebuilds
client source, restarts for server source changes, and reloads connected
browsers. Do not copy `node_modules` between operating systems because esbuild
contains a platform-specific binary; use `npm ci` on each machine.

For temporary LAN testing only:

```bash
HOST=0.0.0.0 PORT=3198 npm run dev
```

Do not leave an unauthenticated LAN bind running unnecessarily.

### Option B: server Docker hot-reload development

This is the current `dev.gahookz.com` environment.

First confirm the external proxy network exists:

```bash
docker network inspect gahookz-proxy >/dev/null
```

On a genuinely new server, create it only after choosing this architecture:

```bash
docker network create gahookz-proxy
```

Nginx Proxy Manager must also be attached through its persistent Compose or
Portainer definition. A one-off `docker network connect` is not durable.

Start or recreate development:

```bash
cd /mnt/storage/syncthing/codex/2026-07-01/Gahookz
cp -n .env.example .env
chmod 600 .env
docker compose config --quiet
docker compose up -d --build gahookz-dev
docker compose logs -f --tail=100 gahookz-dev
```

Verify local and public routing:

```bash
curl -fsS http://127.0.0.1:3101/api/health
curl -fsS https://dev.gahookz.com/api/health
```

The whole `standalone/` directory is bind-mounted. These changes hot reload:

- client `.jsx`/`.js`, shell files, manifest, and styles;
- `standalone/server.js` and files in `standalone/server/`.

These changes require rebuilding the dev image:

- `package.json` or `package-lock.json`;
- `Dockerfile` or `compose.yaml`;
- Node/base-image or installed dependency changes.

```bash
docker compose up -d --build gahookz-dev
```

The public dev domain immediately exposes synced saved source. Before sharing
the product broadly, protect it with Cloudflare Access, an Nginx Proxy Manager
access list, or a VPN. It is currently a developer convenience, not a staging
environment with approval gates.

### Syncthing and Git rules

- Never sync `.git/`. Each machine needs its own Git metadata.
- Keep `.env`, `work/`, and secrets machine-local.
- `PROJECT-MEMORY.md` is intentionally ignored by Git and shared by Syncthing.
- Do not edit the same file on both synced machines simultaneously.
- Resolve Syncthing conflict copies before building or committing.
- A synced save updates dev even if it has not been committed. Production
  should eventually deploy only from the separate clean clone.

## 6. Safe change and test workflow

### Before editing

```bash
git status --short --branch
git diff
git log -1 --oneline
node --version
npm --version
```

Preserve unexpected changes. If the branch is clean and this machine is the
chosen Git authority, update it with:

```bash
git pull --ff-only
npm ci
```

Do not run `git reset --hard`, discard files, or overwrite Syncthing conflicts
as a routine cleanup step.

### During development

1. Make one coherent change.
2. Watch `gahookz-dev` logs for rebuild or restart failures.
3. Test host and player flows in separate browser profiles/devices.
4. Verify the mobile layout and reduced-motion path where relevant.
5. Run the narrowest applicable smoke command.
6. Run build and full regression tests before promotion.

### Isolated full-suite test

Many smoke scripts create rooms, players, media, scores and timers, so the
suite must never run against live production. Since 2026-09-06 both base-URL
variables default to the disposable port 3199, so an unconfigured run fails to
connect instead of reaching a real game, and `standalone/smoke-deployment.mjs`
fails the build if any smoke file goes back to defaulting to 3102. Set the
variables explicitly anyway:

Terminal 1:

```bash
npm run build
HOST=127.0.0.1 PORT=3199 npm start
```

Terminal 2:

```bash
GAHOOKZ_BASE_URL=http://127.0.0.1:3199 \
GAHOOKZ_TEST_BASE_URL=http://127.0.0.1:3199 \
GAHOOKZ_TEST_REQUIRE_SERVER=1 \
npm test
```

Stop Terminal 1 with Ctrl+C and confirm the graceful shutdown message. Both
environment variable names are set because older smoke scripts use
`GAHOOKZ_BASE_URL` while PWA/information scripts use `GAHOOKZ_TEST_BASE_URL`.

Also run:

```bash
docker compose config --quiet
node --check standalone/server.js
```

### Commit and review

```bash
git status
git diff
git add <only-the-intended-files>
git diff --cached
git commit -m "Describe the behaviour change"
git push
```

Record meaningful deployment/architecture changes in `PROJECT-MEMORY.md`, but
never store secrets there.

## 7. Promote development to production

### Current working-directory workflow

This is how production works today. It is valid but can deploy uncommitted
Syncthing source, so inspect carefully.

Preflight:

```bash
cd /mnt/storage/syncthing/codex/2026-07-01/Gahookz
git status --short --branch
git diff --stat
docker compose ps
curl -fsS http://127.0.0.1:3101/api/health
```

Confirm all of the following before continuing:

- the intended code is present and dev was manually exercised;
- the build and full smoke suite passed against disposable/dev, not prod;
- no production game is active or users were given a maintenance warning;
- the external drive/source folder is mounted and readable;
- the current diff contains no accidental/conflicted/secret files.

Deploy:

```bash
bash scripts/docker-update.sh
```

That script validates Compose, builds the production target with a fresh
browser build, force-recreates only `gahookz`, waits for Docker health, checks
that the running container uses the newly built image, and reports its browser
release. It does not update Git or download source.

Post-deploy verification:

```bash
bash scripts/docker-status.sh
curl -fsS http://127.0.0.1:3102/api/health
curl -fsS https://gahookz.com/api/health
curl -fsS https://www.gahookz.com/api/health
```

Check that local and both public production responses match. Then perform a
short real browser test: create room, join, receive SSE state, submit a basic
action, and close the test room. Do not assume the release value proves a
server-only change; also confirm the Docker image ID/log start time until a
commit revision is added to health.

`docker compose restart gahookz` restarts the old installed image. It does not
deploy source edits. `docker compose up -d gahookz` may also reuse an existing
image unless a build was explicitly requested. Use the script for releases.

### Recommended clean production-clone workflow

Choose a stable server path such as `<PRODUCTION_CLONE>` and keep it separate
from Syncthing. Do this during planned maintenance because the existing
production Compose project must be taken over deliberately.

Initial setup:

```bash
git clone git@github.com:tysisnice/Gahookz.git <PRODUCTION_CLONE>
cd <PRODUCTION_CLONE>
cp .env.example .env
chmod 600 .env
printf '\nCOMPOSE_PROJECT_NAME=gahookz-prod\n' >> .env
git switch main
git pull --ff-only
docker network inspect gahookz-proxy >/dev/null
bash scripts/docker-deploy.sh
```

**Set the Compose project explicitly.** `compose.yaml` declares
`name: gahookz`, but that is the *development* project — the hot-reload stack
started from the Syncthing tree already owns it. On this server production runs
under `gahookz-prod`, so the production clone's `.env` must contain:

```bash
COMPOSE_PROJECT_NAME=gahookz-prod
```

Without it, a deploy from the production clone resolves no container for the
`gahookz` service, builds the image, and then tries to create a second
container that collides on the published port — which fails while leaving
production on the old code. `scripts/docker-deploy.sh` now refuses to continue
in that state and names the project to set, but the variable is what makes the
deploy correct. Confirm before deploying:

```bash
docker compose ps -q gahookz    # must print the live production container id
```

Routine update after this migration:

```bash
ssh <FEDORA_SERVER> 'cd <PRODUCTION_CLONE> && test -z "$(git status --porcelain)" && git pull --ff-only origin main && bash scripts/docker-update.sh'
```

The `git status --porcelain` output must be empty. For stronger release control,
deploy an annotated version tag or exact reviewed commit instead of whatever
happens to be newest on `main`.

### Rollback today

There is no one-command or immutable-image rollback. `gahookz:local` is
overwritten on each build. Treat that as an operational gap.

From a clean production clone, rebuild a known-good commit:

```bash
cd <PRODUCTION_CLONE>
git fetch --tags origin
git switch --detach <KNOWN_GOOD_COMMIT_OR_TAG>
bash scripts/docker-update.sh
git switch main
```

Switching the files back to `main` does not alter the running known-good image;
the next deploy will. Record the rolled-back revision. A rollback also replaces
the process and cannot restore rooms lost during the failed release.

Future deployment work should tag images with Git SHA, retain at least the last
three healthy images, record browser and server revisions, and add an explicit
`scripts/docker-rollback.sh <revision>` with health verification.

## 8. Bring production online from cold or after failure

### Existing server, containers already created

```bash
sudo systemctl is-active docker
docker compose ps
docker compose up -d gahookz
curl -fsS http://127.0.0.1:3102/api/health
curl -fsS https://gahookz.com/api/health
```

The service uses `restart: unless-stopped`, so it normally returns after Docker
starts. The immutable production image can run without the source drive after
creation, but do not perform Compose operations or builds until the expected
project path is mounted.

### First deployment on a new server

1. Install/enable Docker Engine and Compose.
2. create the local `.env` from `.env.example`; keep the bind address
   `127.0.0.1` and mode 600;
3. create/reuse `gahookz-proxy` and attach the reverse proxy persistently;
4. build/start dev if wanted;
5. run `bash scripts/docker-deploy.sh` for production;
6. configure two reverse-proxy hosts;
7. configure DNS and certificates;
8. verify local origin, proxy origin, public HTTPS, SSE, and another unrelated
   hosted app.

Nginx Proxy Manager production host:

| Field | Value |
| --- | --- |
| Domain names | `gahookz.com`, `www.gahookz.com` |
| Scheme | `http` |
| Forward host | `gahookz` |
| Forward port | `3001` |
| Certificate | Valid certificate for apex and `www`; Force SSL |

Development host:

| Field | Value |
| --- | --- |
| Domain names | `dev.gahookz.com` |
| Scheme | `http` |
| Forward host | `gahookz-dev` |
| Forward port | `3001` |
| Certificate | Valid certificate for dev; Force SSL |

Both proxy hosts need a 10 MB request limit, original/forwarded headers, and
SSE-safe settings equivalent to:

```nginx
proxy_http_version 1.1;
proxy_buffering off;
proxy_cache off;
proxy_read_timeout 1h;
proxy_send_timeout 1m;
gzip off;
```

Expose/router-forward only TCP 80 and 443. Never publicly expose 3101/3102.
Current direct-DNS ingress is working. Use a named Cloudflare Tunnel only if
direct ingress becomes impossible; do not run direct and tunnel ingress without
a deliberate reason.

### Complete public verification

```bash
docker compose ps
curl -fsS http://127.0.0.1:3101/api/health
curl -fsS http://127.0.0.1:3102/api/health
curl -fsS https://dev.gahookz.com/api/health
curl -fsS https://gahookz.com/api/health
curl -fsS https://www.gahookz.com/api/health
```

Also verify:

- certificate names and expiry;
- HTML `no-store` and SSE `no-cache, no-transform` headers;
- the SSE request remains open instead of returning a gateway timeout;
- production public/local release and build time match;
- dev and production are different processes;
- public 3101/3102 are closed;
- an unrelated Nginx Proxy Manager app still works;
- external-network access if LAN hairpin routing makes the local result unclear.

## 9. Logs, monitoring, and troubleshooting

### Routine commands

```bash
docker compose ps
bash scripts/docker-status.sh
docker compose logs -f --tail=100 gahookz
docker compose logs -f --tail=100 gahookz-dev
docker stats --no-stream gahookz-gahookz-1 gahookz-gahookz-dev-1
```

Docker rotates each service log at 10 MB with three files. Resource defaults
are 1 GB memory, 2 CPUs, 128 processes, and a 768 MB V8 old-space cap.

### Fault isolation

| Symptom | First checks | Likely layer |
| --- | --- | --- |
| Port 3102 health fails | `docker compose ps`; prod logs | app, image, Docker |
| 3102 works; public apex fails | NPM logs/host/certificate; DNS; router | proxy/TLS/ingress |
| Page loads; room stops updating | `/events` headers and open connection; proxy buffering/timeouts | SSE/proxy |
| Dev source does not update | dev logs; bind mount; watcher source list | Syncthing/watch/build |
| Root package change ignored by dev | rebuild `gahookz-dev` | image dependencies |
| New build looks old | compare health, page source asset query, service worker cache | release/cache |
| Production changed unexpectedly | image/container creation time; shell history; source diff | release process |
| Memory climbs | active rooms/media; container stats | process-local state/media |
| Deploy succeeds but revision is unclear | image ID and startup log | browser-only release ID |

Do not solve an SSE issue by enabling caching, increasing replicas, or removing
room affinity. Do not solve a dev problem by rebuilding production.

### Monitoring backlog

Add, in this order:

1. structured JSON logs with request ID, room ID hash, command, status, latency,
   and error class—but never credentials, passwords, content, or media;
2. `/health/live` for process health and `/health/ready` for readiness/draining;
3. private metrics for active rooms, authenticated SSE clients, command rate,
   request latency, event-loop lag, memory/media bytes, rejected payloads, and
   process restarts;
4. external probes for all public health endpoints, TLS expiry, and an SSE
   connection check;
5. alerts with a quiet maintenance mode;
6. a status page after traffic warrants it.

## 10. Current risks and priority maintenance backlog

Every item in this section was re-checked against the running system on
2026-09-06. Items are grouped by whether they are **closed**, **open**, or a
**decision** somebody has to make. An item is only listed as closed with the
evidence that closed it, so a future reader can re-test rather than trust.

The single most important thing to know before planning work: the first audit
pass closed far more than the previous version of this section admitted, and it
opened one new defect that had not been recorded anywhere.

### Closed since the 2026-08-10 audit

- **Rooms leaked.** `resetLobby()` cancelled a room's expiry without scheduling
  a replacement. Fixed, covered by `standalone/smoke-room-expiry.mjs`, and
  confirmed in production on 2026-09-06 when two check rooms expired on their
  own.
- **Room passwords did not protect room state.** `/api/state` and
  `/api/events/ticket` answered anyone holding the four-letter code. Both now
  go through `roomAccessGranted()`.
- **Bans applied only to joining.** Enforced on reads and on the event stream.
- **GET routes bypassed admission control.** `/api/lobby` and `/events` now
  consume a read bucket, so the room-code enumeration oracle is throttled.
- **Syncthing conflict copies were served.** Refused by the static server,
  excluded from the build context, and gated in CI.
- **Moderation.** `POST /api/host/remove-content` removes a chat message, a
  Herd answer, everything one player uploaded, or a submitted question.
  `POST /api/player/report` reaches the host privately. Kicking a player now
  blanks their Herd answers instead of leaving them live. Host-only enforcement
  verified on production.
- **Legal and privacy documents.** `/legal` publishes community rules, terms,
  a privacy notice and a takedown route, linked from the welcome footer. They
  state that play never requires an account. **They have not been reviewed by a
  lawyer**, and say so; see the decision list below.
- **Herd self-voting.** The server refuses a self-vote and the snapshot carries
  a per-viewer `ownAnswer` flag so the client can disable the tile.
- **Credential transport.** Bearer keys are no longer placed in query strings.
  `GET /api/state` returns `405` by design — room state is a POST — and
  `/events` authenticates with a short-lived, single-use ticket. This closes the
  proxy/access-log exposure this section previously listed as P0.
- **Password links.** Room passwords are never written into a share URL.
  `buildWelcomePath()` emits only `room` and a `locked=1` flag; a legacy
  `?pwd=`/`?pw=` link is consumed once, stripped from the address bar with
  `history.replaceState`, and held in tab-scoped `sessionStorage`.
  `saveJoinSession()` strips the password before writing to `localStorage`, and
  the origin sends `Referrer-Policy: no-referrer`.
- **Abuse and DoS basics.** `standalone/server/admission.mjs` enforces token
  buckets for global mutations, per-actor mutations, room creation, event
  tickets, and unauthenticated reads, and caps SSE connections in total
  (1024), per address (32) and per room (64). The previous claim that room
  creation and guest SSE were unbounded is wrong.
- **Security headers.** CSP, HSTS, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`,
  `Permissions-Policy` and same-origin COOP/CORP are set in
  `standalone/server/transport.mjs` and verified live on `gahookz.com`.
- **Client error codes.** Malformed JSON returns `400 invalid_json` and an
  oversize body returns `413`, not `500`.
- **Server revision in health.** `/api/health` reports `revision`,
  `serverBuiltAt`, `instance`, `draining` and `activeRooms`.
  `scripts/docker-status.sh` prints the revision too.
- **CI.** `.github/workflows/ci.yml` runs `check`, `smoke` and `image` on every
  push and pull request to `main`.
- **Graceful draining.** `POST /api/drain` plus a SIGTERM drain bounded by
  `GAHOOKZ_DRAIN_TIMEOUT_MS`. Observed working during the 2026-09-06 deploy.
- **Deploying into the wrong Compose project.** Found and fixed during the
  2026-09-06 deploy; see section 3.
- **Smoke suite defaulted to the production port.** Sixteen files defaulted to
  `http://127.0.0.1:3102`, which on this host is production, and `README.md`
  actively instructed running the stateful suite there. The default is now the
  disposable port 3199, and `standalone/smoke-deployment.mjs` fails the build if
  any smoke file defaults to 3102 again.
- **Room password derivation.** This section previously claimed salted SHA-256.
  That is wrong: `hashRoomPassword()` uses `scrypt`
  (`standalone/server.js:3186`). No work is needed.

### P0 open — before broad public acquisition

- **Herd authorship is deterministic and therefore not anonymous.** *(New,
  found 2026-09-06.)* `buildHerdAssignmentPlan()` assigns answer slots by
  `playerIds[(anchor + firstOffset + answerIndex) % playerIds.length]`, where
  `anchor` is the index of the question's author. The colour slot is a pure
  function of the question author's position, fixed for the whole game because
  the player order is shuffled only once per game
  (`standalone/server.js:3827`). In a five-player fixture, a one-line formula
  predicted all twenty answer authors. Because authors are revealed at reveal
  time, **one reveal round de-anonymises every remaining round**: red is always
  the player after the question's author. This undermines the core premise of
  the mode. The fix direction is to randomise the slot order per question
  rather than per game, so the mapping does not persist; treat the existing
  `packages/game-engine` tests as the place to pin the new behaviour.
- **Herd fairness items not yet addressed.** Circular prediction scoring,
  hidden tie-breaks, and large-room overload at 20 players. The self-vote and
  anonymity items are tracked separately above.
- **Automated abuse handling.** Host controls now exist, but there is no
  automated scanning, appeals process, evidence retention, or operator console.
  Those are gates for an open anonymous audience, not for invited play.
- **Accounts are inert in production.** `DATABASE_URL`, `GOOGLE_CLIENT_ID` and
  `GOOGLE_CLIENT_SECRET` are unset, so accounts, career statistics and
  entitlements are in-memory and lost on restart, and the account panel is
  hidden. `GAHOOKZ_REQUIRE_POSTGRES` is still `0` on a public deployment. This
  needs the owner to provision PostgreSQL and a Google OAuth client. Guest play
  is unaffected and must stay that way.

### P1 open — reliability and maintainability

- **Split the three monoliths.** `server.js` (4,791), `app.jsx` (5,349) and
  `styles.css` (10,887) all grew since August. This is now the main brake on
  UI work.
- **Runtime request validation.** TypeScript types do not validate network
  input. Schemas are still absent at the HTTP/SSE boundary.
- **Tested rollback.** Images are immutable and tagged, but no rollback has
  been rehearsed. Keep the previous image digest and practise the restore
  before it is needed under pressure.
- **Dependency and base-image update cadence.** The Node base image is pinned
  by digest, which is correct, but nothing schedules re-resolving it or scans
  dependencies for advisories.
- **Per-address SSE cap versus a real party.** The cap is 32 connections per
  address. A single-household 20-player game plus a host screen, spare tabs and
  reconnects sits uncomfortably close to it, and every player at one party
  shares a public address through the proxy. Measure before a large session
  rather than raising it blindly.
- **Structured logging.** Console logs are ad hoc and go to bounded Docker JSON
  files. Replace with structured redacted events before high traffic.

### P2 open — efficiency and product polish

- **Static caching.** Every static file is served `no-store`, including
  content-hashed assets, and caching relies entirely on the service worker.
  Serving immutable hashed assets with long cache headers is a cheap win.
- **1.8-second full-snapshot polling.** `standalone/public/app.jsx` polls
  `/api/state` as SSE recovery. It is the dominant load term and should become
  measured backoff or version-based recovery once SSE reliability is proven.
- **Unify prompt libraries and mode terminology** so Education fallback
  generation and host metrics match the selected mode.
- **Split the public information reports** into maintainable data/content files.
- **Observed user testing** at 4, 8, 12 and 20 players, plus accessibility
  testing, before adding more live-round features.

### Decisions the owner needs to make

These are not engineering tasks; they need a call.

- **Herd author-points denominator.** Now that self-voting is refused, an
  author can reach at most `(n-1)/n` of the authored maximum — about 80% in a
  five-player room. It applies uniformly, so nobody is disadvantaged, and
  scoring was deliberately left untouched. Changing it is a scoring decision
  and needs before/after fixtures.
- **Is `/information` public product content or an internal report?** It
  currently publishes operational limits and unresolved findings on the
  production domain.
- **Legal review.** The `/legal` documents are honest and plain-language, and
  are appropriate for friends-and-family use. They have not been reviewed by a
  lawyer. Get them reviewed before any public campaign, particularly the
  privacy notice, once Google accounts are live and email addresses are held
  under Australian Privacy Act obligations.
- **Rotate the Nginx Proxy Manager JWT signing key.** Its `keys.json` was
  exposed to a terminal during the 2026-09-05 session. Rotation means deleting
  `keys.json` and restarting the container, which invalidates existing NPM
  admin sessions.

## 11. Target architecture for persistence and multiple platforms

Do not begin by rewriting everything. Preserve the existing protocol and user
experience, introduce typed boundaries, then move state deliberately.

Recommended eventual npm-workspace layout:

```text
apps/
  web/                 React TypeScript PWA and shared party UI
  server/              Node TypeScript HTTP/SSE game service
  desktop/             Electron host/TV shell for Steam
  mobile/              Capacitor iOS/Android wrapper and native adapters
packages/
  contracts/           runtime schemas plus shared request/snapshot types
  game-engine/         pure commands, transitions, scoring, and timers
  client-data/         typed API/SSE client, sessions, store
  ui/                  reusable responsive components and design tokens
  content/             prompt libraries and content metadata
  entitlements/        product IDs and platform-neutral unlock rules
infra/
  docker/
  nginx/
docs/
```

npm workspaces are sufficient; introducing a different package manager and a
monorepo build orchestrator at the same time would add migration work without
solving the primary risks.

### Backend evolution

1. Extract a pure `game-engine` whose input is `(roomState, command, now, rng)`
   and whose output is `(nextState, events/effects)`. No HTTP, SSE, timers,
   filesystem, or global Maps inside it.
2. Define versioned runtime schemas for every command and public snapshot.
3. Keep one authoritative room worker initially, with explicit room affinity.
4. Add PostgreSQL for accounts, entitlements, prompt packs, moderation/audit
   records, consent, and aggregate product data.
5. Add object storage for user media with validation, expiry, and moderation.
6. Add Redis only when needed for ephemeral room snapshots/TTL, coordination,
   rate limits, and pub/sub. Do not move everything to Redis by default.
7. Add a drain/migration strategy before multiple game nodes. A load balancer
   must route a room consistently, or room state must be shared transactionally.
8. Keep guest room play account-free. Require accounts only for durable creator
   libraries, purchase recovery, cross-device unlocks, or moderation needs.

SSE can remain the server-to-client transport across web, Electron, and
Capacitor. Consider WebSockets only if measured bidirectional latency, stream
token renewal, or platform limitations justify the extra operational surface.

## 12. TypeScript refactor execution plan

### Non-negotiable migration rules

- Preserve behaviour. Never combine a file conversion with gameplay redesign.
- Keep production deployable after every task.
- One task should touch a small, named file set and end with passing checks.
- Do not use broad `any`, `@ts-ignore`, or disabled strictness as “completion.”
  A temporary boundary may use `unknown` plus validation and a tracked follow-up.
- Do not hand-edit generated browser `.js` or `release.json` files.
- Define network/runtime schemas before trusting static types.
- Convert pure leaves first; convert `server.js` and `app.jsx` last.
- Split giant files in behaviour-preserving commits before changing their
  internal design.
- Keep the current smoke suite as the compatibility oracle.

TypeScript's migration guidance explicitly supports mixed JavaScript and
TypeScript through `allowJs`, which makes an incremental conversion practical:
<https://www.typescriptlang.org/docs/handbook/migrating-from-javascript.html>.

### Proposed compiler/build policy

- `strict: true` for every new `.ts`/`.tsx` file from day one.
- `noEmit` typecheck config plus esbuild for browser emission.
- Separate source and output paths; never overwrite source.
- `module`/`moduleResolution` aligned with modern Node ESM.
- DOM types only in web/client packages; Node types only in server/tooling.
- A small global declaration file for existing `window.ReactDOM`, clock offset,
  refresh callback, and install prompt globals.
- Pin TypeScript and all build tooling in `package-lock.json`.
- Add `npm run typecheck`, then make `npm run check` run typecheck, build, static
  checks, and appropriate unit tests.

### Task ledger for a small coding model

Each ID is one bounded task. Do not skip its dependencies. Update the checkbox
only after its acceptance commands pass and a human/model review confirms no
behaviour drift.

| ID | Depends on | Task | Allowed scope | Acceptance |
| --- | --- | --- | --- | --- |
| TS-00 | — | Record baseline and test commands | docs/package scripts only | Current build and full disposable smoke suite pass |
| TS-01 | TS-00 | Add pinned TypeScript, React/Node typings, strict base configs, `typecheck` | `package*.json`, `tsconfig*.json`, declarations | `npm ci`; `npm run typecheck`; `npm run build` |
| TS-02 | TS-01 | Add npm workspaces skeleton without moving runtime code | root package files, empty package manifests | Existing dev/build/start/test commands still work |
| TS-03 | TS-02 | Define shared enums/IDs/base DTOs | `packages/contracts` only | Contract unit tests and typecheck pass |
| TS-04 | TS-03 | Add runtime schemas for health, errors, room command envelope, snapshot base | contracts plus focused tests | Invalid fixtures reject; valid captured fixtures parse |
| TS-05 | TS-01 | Convert pure scoring and Herd ranking modules | `scoring`, `herd-ranking`, tests | Existing ranking smoke plus new unit tests pass |
| TS-06 | TS-05 | Convert room/gameplay/presentation pure helpers | named server leaf modules/tests | Typecheck and related smoke tests pass |
| TS-07 | TS-04 | Convert transport and introduce typed response helpers | transport/router boundary only | malformed, oversized, success, and SSE tests pass |
| TS-08 | TS-06, TS-07 | Convert auth, media, social, custom-Gahook modules one at a time | one module plus its tests per commit | role/social/media smoke tests pass after each module |
| TS-09 | TS-04 | Create typed client API and SSE adapter | new `client-data` package; minimal app call-site bridge | state fixture parsing, reconnect, timeout tests pass |
| TS-10 | TS-01 | Convert small client leaves | preferences, forms, QR, then presentation/tutorial/drawing | build and relevant static smoke tests after each file |
| TS-11 | TS-09, TS-10 | Extract Redux state/actions/reducer from `app.jsx` and type them | new store files plus mechanical app imports | all optimistic update smoke paths pass |
| TS-12 | TS-10 | Split UI components from `app.jsx` by feature without redesign | one feature folder per commit | visual/static smoke plus manual host/player check |
| TS-13 | TS-08 | Extract typed server route table/command handlers from `server.js` | router/actions modules; server entry bridge | full API smoke suite passes |
| TS-14 | TS-13 | Extract room creation/lifecycle and phase engine | game-engine modules plus deterministic tests | timer/phase/disconnect/pause tests and full smoke pass |
| TS-15 | TS-11, TS-12 | Rename remaining client source to `.tsx`; eliminate migration declarations | web source/build config | strict typecheck has no suppressions; full smoke passes |
| TS-16 | TS-14 | Rename server entry to `.ts`; compile/run built output | server source/build/Docker/scripts | local and Docker health, graceful shutdown, full smoke pass |
| TS-17 | TS-15, TS-16 | Move runtime code into final workspace layout | mechanical paths/build/Compose only | clean `npm ci`; check; Docker builds; full smoke pass |
| TS-18 | TS-17 | Enforce CI and strict-quality budgets | CI/config/docs | clean clone passes; generated outputs not committed |

### Detailed task instructions

#### TS-00 through TS-04: establish boundaries

Capture representative public snapshots for lobby, building, reading,
answering, Herd ranking, reveal, and finished. Scrub credentials/content. Add
runtime schemas with explicit schema versions. Avoid generating a single huge
`Room` interface from current mutable server internals; define separate:

- private authoritative `RoomState`;
- role-filtered `PublicSnapshot`;
- discriminated `GameCommand` union;
- endpoint success/error results;
- identifiers such as `RoomCode`, `PlayerId`, `Credential`, `QuestionId`, and
  `MediaUrl` (branded types where useful).

#### TS-05 through TS-08: server leaves

For each module:

1. rename one file;
2. type exported inputs/outputs;
3. replace implicit nullable access with explicit unions;
4. add focused tests for its invariants;
5. update imports/build only as required;
6. run typecheck, unit test, relevant smoke, then full build;
7. commit before starting the next module.

Do not redesign scoring while converting it. Fairness changes get later product
tasks with before/after fixtures and explicit approval.

#### TS-09 through TS-12: client seams and decomposition

Create one typed network adapter so components stop calling a loosely typed
global `api()` helper. Parse every snapshot at the boundary. Use discriminated
Redux actions and typed selectors. Then split UI by feature:

```text
features/welcome/
features/room/
features/host/
features/player/
features/quiz/
features/herd/
features/gahooks/
features/finale/
```

Move JSX mechanically first. Do not restyle, rename copy, or change the Redux
state shape in the same commit.

#### TS-13 through TS-17: authoritative engine and final layout

Replace the long `if (pathname === ...)` chain with a typed route table while
preserving all URLs. Extract side effects from transitions:

```text
command + current room + clock + RNG
              |
              v
       pure transition function
              |
              +-- next room state
              +-- schedule/cancel timer effects
              +-- broadcast/media/audit effects
```

Use an injectable clock and deterministic random source in tests. The Node
adapter owns actual timers and SSE clients. This boundary is what later enables
room persistence, multiple hosts/platforms, replay tests, and graceful drains.

### Required acceptance gate after every TypeScript phase

```bash
npm ci
npm run typecheck
npm run build
docker compose config --quiet
```

Run focused tests for the changed area and the full disposable smoke suite at
phase boundaries. Before production, build both Docker targets and verify dev
and prod health without targeting active production rooms.

### Prompt template for Qwen 35B/Hermes or another small model

```text
You are implementing exactly task <TS-ID> from OPERATIONS-AND-ROADMAP.md.

Read PROJECT-MEMORY.md, OPERATIONS-AND-ROADMAP.md sections 4, 6, 10, and 12,
then inspect git status and every file in the task's Allowed scope. Do not start
another task. Preserve all existing behaviour and public URLs.

Rules:
1. Do not overwrite unrelated or pre-existing changes.
2. Do not edit ignored generated browser JS or release.json.
3. Do not combine TypeScript conversion with product/scoring/UI redesign.
4. Prefer unknown plus runtime validation over any.
5. Keep the patch small. If a required change falls outside Allowed scope,
   stop and explain the dependency instead of expanding silently.
6. Run the exact Acceptance commands plus the relevant smoke test.
7. Never run stateful tests against port 3102 or gahookz.com.
8. Never deploy, restart production, or change infrastructure in this task.

At the end report:
- files changed and why;
- types/contracts introduced;
- commands run and whether each passed;
- remaining errors, suppressions, assumptions, and the next task ID.
```

## 13. Steam desktop plan

The Steam product should initially be a polished host/party-screen edition,
not a forked game server. Web/mobile players still join its normal online room.

Electron is the recommended first shell because it keeps the implementation in
JavaScript/TypeScript and ships a consistent Chromium renderer. It costs more
disk/RAM than Tauri, but is easier for a small web-focused team and small coding
models. Electron's official distribution guide recommends Electron Forge:
<https://www.electronjs.org/docs/latest/tutorial/application-distribution>.

### Steam phases

1. **Desktop proof:** Electron opens the local built web client, supports
   fullscreen/windowed display, controller/keyboard navigation, QR display,
   audio-device selection, reconnect, and safe external-link handling.
2. **Security hardening:** context isolation on, Node integration off in the
   renderer, narrow typed preload bridge, navigation allowlist, CSP, signed
   packages, crash logs with consent.
3. **Host experience:** large-screen layout, room presets, moderation queue,
   “leave room running” confirmations, network diagnosis, and display-safe
   handling of private credentials.
4. **Steam plumbing:** onboard in Steamworks, create app/depot/build scripts,
   upload an internal branch, and let Steam update the binary. Valve documents
   partner onboarding, SDK, builds, store presence, and release review at
   <https://partner.steamgames.com/doc/gettingstarted> and build upload/branches
   at <https://partner.steamgames.com/doc/sdk/uploading>.
5. **Optional integrations:** achievements for non-competitive milestones,
   rich presence, friend invites, and cloud settings. Add only after the base
   host works; do not make web/mobile cross-play depend on Steam identity.
6. **Release:** private alpha, public demo/festival if useful, store/build
   review, accessibility/controller matrix, then low one-time-price launch.

Do not bundle production secrets or a privileged server in the Steam client.
Treat every desktop renderer as an untrusted public client. Use Steam identity
only through a server-verified token when durable accounts/entitlements exist.

## 14. Mobile plan

The existing PWA is phase zero and should remain the broadest player client.
After the TypeScript/client split, use Capacitor for the first store apps. It is
designed to add native iOS/Android containers to a web-first application while
exposing native plugin APIs: <https://capacitorjs.com/docs>.

### Mobile phases

1. Make the PWA excellent: iOS/Android browser matrix, install guidance,
   camera/file permissions, audio unlock, safe areas, keyboard avoidance,
   reconnect, background/foreground restoration, and low-memory media tests.
2. Create `apps/mobile` as a thin Capacitor shell around the shared web build.
3. Add only valuable native adapters: camera/photo picker, share sheet, haptics,
   microphone permission/recording, status/navigation bars, deep links, secure
   purchase tokens, and crash reporting.
4. Use remote room APIs, but package enough static UI for startup/offline Dash.
   Define a client/server compatibility range before shipping store versions
   that cannot update instantly.
5. Run TestFlight/internal Play testing, then closed groups, then store review.
6. Consider React Native or a custom native UI only if profiling proves the
   shared web UI cannot meet interaction/accessibility goals. Do not maintain
   three independent game UIs without evidence.

The store app must not simply be an unrestricted remote website wrapper. Give
it native value, robust offline/recovery behaviour, store-compliant privacy
disclosures, and complete review/demo instructions.

## 15. Monetisation and entitlements

The product principle from the information report is sound: sell expression
and convenience, never competitive power.

### Recommended offer order

1. Keep joining and core Quiz/Herd hosting free on the web.
2. Add a clearly priced, permanent **Supporter Pack** with cosmetic Gahook
   forms/effects, profile cosmetics, and creator convenience.
3. Sell the Steam host edition for a modest one-time price, including its
   standard desktop cosmetics and large-screen features.
4. Offer curated Family, Education, Workplace, and seasonal prompt packs only
   after moderation/editorial tooling exists.
5. Add direct non-consumable cosmetic packs if demand is proven.
6. Avoid subscriptions until there is continuing hosted value that customers
   can understand, such as organisation libraries, moderation/admin, scheduled
   events, or regularly delivered curated content.

Never sell stronger Gahooks, score boosts, host priority, room queue priority,
loot boxes, random paid rewards, energy, or interruptive in-room ads.

### Entitlement architecture

- Define stable product IDs in `packages/entitlements`; do not scatter store
  SKUs through UI code.
- Keep guests account-free. Offer account linking only for purchase recovery
  and cross-device/cross-platform ownership.
- Store verified transactions and resulting entitlements server-side in
  PostgreSQL. Never trust a client “purchased” flag.
- Implement platform adapters for web checkout, Steam ownership/DLC, Apple
  StoreKit, and Google Play Billing. Normalize them into the same entitlement
  records, including refund/revocation status.
- Decide and document cross-platform grants. A sensible policy is to honor a
  durable cosmetic entitlement everywhere after account linking where store
  rules permit, without requiring an account to play.
- Provide restore-purchases, refund/revocation handling, parental controls,
  receipts, support tools, and auditable product configuration.

Apple's current guidelines generally require in-app purchase to unlock digital
features/content and describe conditions for multiplatform access; they vary by
storefront and should be rechecked at implementation time:
<https://developer.apple.com/app-store/review/guidelines/>. Google Play's
current payments policy likewise generally requires Play Billing for in-app
digital features/goods, subject to listed exceptions:
<https://support.google.com/googleplay/android-developer/answer/9858738>.
Do not design one hard-coded global checkout flow based on today's regional
exceptions.

### Metrics without surveillance

Collect aggregate, consent-aware product events needed to improve the funnel:

- room created;
- join succeeded/failed by reason;
- setup locked;
- content creation completed/abandoned;
- round and game completed;
- reconnect/failure reason;
- offer viewed, purchase started/completed/restored/refunded.

Do not collect room answers, chat, drawings, audio, precise location, address
books, or credentials for analytics. Define retention and deletion before
turning analytics on.

## 16. Sequenced product roadmap

### Stage A: harden invited production (now — most of the way through)

- ~~Protect dev~~ **done** (Nginx Proxy Manager access list).
- ~~Add revision metadata~~ **done** (`/api/health` reports `revision`).
- ~~CI~~ **done** (`.github/workflows/ci.yml`).
- ~~Live-content moderation~~ **done** (host remove-content, private reports).
- ~~Publish legal/community basics~~ **done** (`/legal`), though a lawyer has
  not reviewed them.
- Monitoring: **partial.** `/api/metrics` exposes gauges behind a bearer token,
  but nothing scrapes them and no alerting exists.
- Immutable rollback: **partial.** Images are immutable and tagged; no rollback
  has been rehearsed.
- P0 anonymity/fairness: **not met.** Self-voting is fixed, but Herd authorship
  is deterministic and one reveal round de-anonymises the rest of the game. See
  section 10.
- Choose whether `/information` reports stay public: **open decision.**
- Observe fresh groups and fix onboarding/pacing/accessibility failures:
  **not started.**

Exit gate: a failed release can be detected and rolled back; hosts can moderate;
three uncoached groups finish both core modes; no critical security P0 remains.

**Stage A is not complete.** The two things standing between here and the exit
gate are the Herd anonymity defect and a rehearsed rollback; the group-testing
item needs real players rather than engineering.

### Stage B: TypeScript and modular core

- Complete TS-00 through TS-18 without redesigning gameplay.
- Add runtime contracts and pure game-engine tests.
- Split app/server/style monoliths and enforce CI.

Exit gate: clean clone typechecks/builds/tests; all protocol input is validated;
game transitions are deterministic and transport-independent.

### Stage C: durable identity and paid foundations

- PostgreSQL, object storage, moderation records, entitlement service, optional
  accounts, privacy/retention tools, store-neutral product catalog.
- Keep live rooms on one node until persistence/affinity is explicitly ready.

Exit gate: purchase restore/refund tests pass; guest play remains frictionless;
backups and deletion are tested.

### Stage D: PWA polish and mobile wrappers

- Finish mobile web quality, then Capacitor closed tests.
- Native share/camera/audio/deep links, compatibility/version gates, store
  purchase adapters, privacy disclosures.

Exit gate: representative iOS/Android complete games, restore purchases, recover
from background/network loss, and pass accessibility/store review checklists.

### Stage E: Steam host edition

- Electron Forge shell, large-screen/controller experience, moderation,
  Steamworks internal branch, optional verified identity/entitlements.

Exit gate: signed packages, clean install/update/uninstall, controller and
display matrix, cross-play with web/mobile, Steam review-ready build/store page.

### Stage F: measured scale

- Load tests, room affinity, drain support, shared ephemeral state where needed,
  autoscaling only after correctness, regional strategy only after demand.

Exit gate: node loss and deploy scenarios are rehearsed; no room can split
between authorities; monitoring proves capacity and recovery.

## 17. Maintenance cadence

### Every change

- inspect Git/Syncthing state;
- run focused tests and build;
- keep generated/secret files out of Git;
- update memory if architecture/operations changed.

### Every production release

- identify exact source revision;
- announce room-ending maintenance;
- preserve known-good rollback;
- deploy through the script;
- verify local/public health, SSE, browser flow, logs, and unrelated proxy app;
- record revision, time, result, and rollback target.

### Weekly while actively testing

- inspect container/NPM logs and restart counts;
- check disk/memory and Syncthing conflicts;
- verify production/dev health and TLS;
- triage abuse reports and dependency/security alerts.

### Monthly

- review Node/npm/esbuild/TypeScript/container updates in a branch;
- run full browser/device/accessibility matrix;
- test rollback and restore procedures;
- review DNS/DDNS and certificate renewal;
- prune obsolete local release artifacts only after confirming a recovery copy.

### Before any public campaign or store release

- load, moderation, privacy, legal, accessibility, purchase/refund, monitoring,
  rollback, support, and platform-policy gates must all be explicitly signed
  off. “The game works for friends” is necessary evidence, not the whole launch
  gate.

## 18. Definition of done for future maintainers

A change is not complete because it compiled. It is complete when:

1. intended behaviour and non-goals are written;
2. the diff is scoped and reviewed;
3. type/runtime contracts are updated where applicable;
4. focused and regression tests pass in a safe environment;
5. dev/manual UX was checked on relevant form factors;
6. operational, privacy, moderation, and compatibility effects are considered;
7. docs/memory are updated if commands or architecture changed;
8. production was deployed only with authorization and no active-room surprise;
9. local/public health and real browser behaviour were verified;
10. a known rollback and remaining risks are recorded.
