# Gahookz

Gahookz is a dependency-light, real-time Node.js party game with three active
modes: classic Quiz, opinion-led Majority Rulz, and the collaborative Herd.
The authoritative server provides the browser app and JSON API, while
Server-Sent Events keep each room in sync.

Next-session implementation roadmap: [IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md)
contains the approved overhaul, host Lobby rules menu, unified Quiz/Majority
settings, 40 new prompt drafts, required reading and staged acceptance checks.
These are planned changes, not a description of already-shipped features.

Active rooms, credentials, chat, drawings, and uploaded room media are held in
the owning Node process, so restarting it ends those rooms. Optional accounts,
career statistics, entitlements, and cloud custom-Gahook slots use PostgreSQL
in production. Guest play remains account-free and the server refuses a public
deployment without PostgreSQL when `GAHOOKZ_REQUIRE_POSTGRES=1`.

## Requirements

- Node.js 20 or newer and npm for local development (the pinned `tsx` runtime
  loads the incrementally migrated TypeScript modules)
- Docker Engine with the Docker Compose plugin for the two-container setup
- Nginx on the server when exposing the app through a domain

## Local development

Install the pinned dependencies and start the watcher:

```bash
npm ci
npm run dev
```

Open <http://127.0.0.1:3101>. Changes to client files are rebuilt and reload
connected browsers; server changes restart the development process.

To produce and run a local production build without Docker:

```bash
npm run build
HOST=127.0.0.1 PORT=3199 npm start
```

Port 3199 is used throughout this repository for throwaway servers. On the
deployment host 3102 belongs to the live production container, so keeping
scratch processes off it avoids both a port clash and a misdirected test run.

The generated browser modules and `release.json` are deliberately ignored by
Git. Run `npm run build` before `npm start` in a fresh clone. Docker builds
generate these files inside the image automatically.

## Docker development and production

Compose runs two isolated application processes:

| Service | Local URL | Purpose |
| --- | --- | --- |
| `gahookz-dev` | <http://127.0.0.1:3101> | Bind-mounted source with rebuild, server restart, and browser reload |
| `gahookz` | <http://127.0.0.1:3102> | Immutable, minified production image running as a non-root user |

Create the local environment file, then build and start both services:

```bash
cp -n .env.example .env
docker compose up -d --build gahookz-dev gahookz
docker compose ps
curl -fsS http://127.0.0.1:3101/api/health
curl -fsS http://127.0.0.1:3102/api/health
```

Follow development rebuilds with:

```bash
docker compose logs -f --tail=100 gahookz-dev
```

Changes under `standalone/` are bind-mounted into the development container.
The production service is unchanged until it is explicitly rebuilt:

```bash
bash scripts/docker-update.sh
```

Host ports, bind address, memory, and CPU limits can be changed in `.env`.
The supplied defaults bind both app ports to `127.0.0.1`; keep that setting on
the server and put Nginx in front of the containers.

## Tests

Start with the checks that need no server:

```bash
npm run check      # strict TypeScript, unit tests, and the browser build
```

Most smoke tests drive a running app. They create and mutate real rooms, so
point them at a **disposable** server on port 3199 — never at port 3102, which
is production on the deployment host, and never at a public domain.

Start the throwaway server in one terminal:

```bash
npm run build
HOST=127.0.0.1 PORT=3199 npm start
```

Run the suite in a second terminal:

```bash
export GAHOOKZ_BASE_URL=http://127.0.0.1:3199
export GAHOOKZ_TEST_BASE_URL=http://127.0.0.1:3199
npm test
```

Both variables already default to port 3199, so an unconfigured run fails to
connect rather than quietly reaching a live game. Stop the throwaway server by
port rather than by process name, because a pattern such as `pkill -f
server.js` also matches the running containers:

```bash
kill "$(ss -lptnH 'sport = :3199' | grep -oP 'pid=\K[0-9]+')"
```

Individual smoke commands are listed in `package.json` and can be run by name,
such as `npm run standalone:smoke:deployment`. `npm run standalone:smoke:room-expiry`
starts and stops its own server and needs no setup.

The lobby's Gahook Arena is a tap tug of war. Counter a Gahook, challenge back,
and accept to start. After the countdown, each competitor chases one Gahook
button around the lower half of their screen. A lead of **five taps** wins
(for example, 11–6); 45 seconds without that lead is a draw. Everyone in the
room sees the tug bar, tap totals and profile-picture pulses. The existing
Gahook forms and ten-second crowd celebration remain available.

Arena rules live in `standalone/server/arena.mjs`, with the interaction and
styles in `standalone/public/client/arena.jsx` and `arena.css`. Targets are
issued privately in a small buffer so the next one appears immediately; the
server validates ordered, single-use tokens and safely acknowledges retries.
The unit suite includes 2,000 seeded arena races. `standalone:smoke:gahooks`
checks scoring and spectator state; `standalone:smoke:arena` checks challenge
expiry, the actual 45-second draw deadline, result cleanup, removal of a
competitor and cancellation when the main game starts (about one minute).

`npm run test:rooms` drives twelve complete games against the same disposable
server: each mode at 4, 8, 12 and 20 players, from setup through voting, results
and reset. It uses host skip to accelerate phase timers and records Herd's
answer-writing workloads. This checks lifecycle correctness, not real-world
network capacity or whether people enjoy the pacing.

The same three jobs run in CI on every push and pull request to `main`
(`.github/workflows/ci.yml`).

## Project layout

- `standalone/server.js` contains the HTTP/API/SSE process and static server.
- `standalone/server/` contains the separated server-side features.
- `standalone/public/` contains browser source, styles, PWA files, and assets.
- `standalone/legacy/` preserves retired modes outside the live build.
- `standalone/build-client.mjs` builds and versions the browser modules.
- `standalone/dev.mjs` watches, rebuilds, restarts, and reloads development.
- `packages/` contains typed contracts, account-stat helpers, and the pure Herd
  assignment/scoring engine.
- `infra/postgres/` contains the production account schema.
- `docs/architecture/` and `docs/operations/` contain current decisions and
  production constraints.
- `Dockerfile` defines separate development and production image targets.
- `compose.yaml` maps internal port 3001 to host ports 3101 and 3102.
- `deploy/nginx/` contains the example reverse-proxy configuration.
- `scripts/` contains production deploy, update, and status helpers.

## Server documentation

- [`CLAUDE.md`](CLAUDE.md) is the entry point for new contributors and coding
  agents: the standing rules, the shape of the system, how to verify a change,
  and which document answers which question. Read it first.
- [`docs/architecture/0001-long-term-foundation.md`](docs/architecture/0001-long-term-foundation.md)
  records the TypeScript, CSS, server-authority, persistence, and identity
  decisions.
- [`docs/operations/production-readiness.md`](docs/operations/production-readiness.md)
  documents affinity, security controls, database setup, observability, and
  remaining launch gates.

- [`OPERATIONS-AND-ROADMAP.md`](OPERATIONS-AND-ROADMAP.md) is the complete
  owner runbook, architecture/risk audit, production promotion guide,
  TypeScript execution plan, and Steam/mobile/monetisation roadmap.
- [`DEPLOY-FEDORA.md`](DEPLOY-FEDORA.md) covers the full Fedora, Docker, Nginx,
  DNS, firewall, and TLS setup.
- [`SERVER-COMMANDS.md`](SERVER-COMMANDS.md) is the short server runbook.
- [`deploy/nginx/gahookz.conf.example`](deploy/nginx/gahookz.conf.example) is the
  supplied Nginx configuration.

The local `git.md` file contains the first-time GitHub setup and everyday Git
workflow. It is intentionally ignored so machine-specific notes never appear
in the public repository.
