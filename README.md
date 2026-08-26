# Gahookz

Gahookz is a dependency-light, real-time Node.js party game with three active
modes: classic Quiz, opinion-led Majority Rulz, and the collaborative Herd.
The authoritative server provides the browser app and JSON API, while
Server-Sent Events keep each room in sync.

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
HOST=127.0.0.1 PORT=3102 npm start
```

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

Most smoke tests exercise a running app on port 3102. Start a disposable local
production process in one terminal:

```bash
npm run build
HOST=127.0.0.1 PORT=3102 npm start
```

Then run the full suite in a second terminal:

```bash
npm test
```

Run strict TypeScript checks, unit tests, and the production browser build with:

```bash
npm run check
```

Alternatively, run the suite while the Docker production service is available
on its default port. The individual smoke commands are listed in `package.json`
and can be run with names such as `npm run standalone:smoke:deployment`.

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
