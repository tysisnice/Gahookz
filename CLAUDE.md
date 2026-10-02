# Working on Gahookz

Read this first. It is the entry point for anyone — human or coding agent —
picking the project up cold. It is deliberately short; it tells you the rules,
the shape of the system, and which longer document answers which question.

For the owner's approved next implementation work, read
[IMPLEMENTATION-PLAN.md](IMPLEMENTATION-PLAN.md). It contains the required
reading list, ordered tasks, acceptance checks, 40 new prompt drafts and a
session handoff ledger. The plan is partially implemented; read the latest handoff and
PLAN-PROGRESS.md, preserve existing changes, and update the ledger only as
acceptance is verified. It does not authorise
a production deployment.

Gahookz is a dependency-light, real-time Node.js party game with three live
modes (Quiz, Majority Rulz, Herd) and a large social layer. It runs on one
Fedora machine at `gahookz.com`, and real people play on it.

## Non-negotiable rules

These are standing owner decisions, not preferences. Breaking one damages
either live players or the product.

1. **Guest play must never require an account.** Creating a room, joining and
   playing a full game must work with no sign-in. Accounts exist only for
   cosmetic and progression extras: custom Gahooks, career statistics,
   entitlements. Never put a login in the join path.
2. **Never deploy to production without being asked.** Committing and pushing
   is normal work; replacing the production container is not. Friends play on
   `gahookz.com`, and a deploy ends every game in progress.
3. **Never run the stateful smoke suite against production.** It creates and
   mutates real rooms. Use a disposable server (port 3199) and set
   `GAHOOKZ_BASE_URL` / `GAHOOKZ_TEST_BASE_URL`. Port 3102 is production on
   this machine.
4. **Never commit secrets.** No tokens, private keys, room passwords, cookies,
   or public IP addresses in the repository or in any tracked document. Record
   *where* a secret lives, never the secret.
5. **Never `pkill` by pattern to stop a test server.** `pkill -f server.js`
   matches the live production and development containers. Find the listener
   instead:
   `ss -lptnH "sport = :3199" | grep -oP 'pid=\K[0-9]+'`

## The one fact that explains most of the design

> Rooms, players, credentials, timers, chat, drawings and uploaded media exist
> only inside one Node process. Restarting that process ends its rooms. There
> is no persistence or recovery for an active room, and there must never be
> more than one production replica with the current design.

Everything about draining, deploys, and the 32-room cap follows from this.

## Shape of the system

Browsers send JSON `POST /api/*` commands and receive live state over
Server-Sent Events, with a snapshot poll as recovery. There are no WebSockets.
One authoritative Node process serves the API, the SSE stream, room media, the
PWA and the static client.

```
Browser ──HTTPS──> Cloudflare (DNS-only) ──> router ──> Nginx Proxy Manager
                                                              │
                        gahookz.com, www ──> gahookz:3001     │ gahookz-proxy
                        dev.gahookz.com  ──> gahookz-dev:3001 ┘   (docker net)
```

| Environment | Port | Source | Notes |
| --- | --- | --- | --- |
| Development | `127.0.0.1:3101` | bind-mounted checkout, hot reload | `dev.gahookz.com`, behind an access list |
| Beta | `127.0.0.1:3103` | image `gahookz:local` | `beta.gahookz.com`, deliberately capped small |
| Production | `127.0.0.1:3102` | immutable image, Compose project `gahookz-prod` | `gahookz.com`, changed only by a deliberate deploy |

### Where the repository lives (since 2026-09-30)

- **Working repository:** `/mnt/storage/syncthing/Store/Projects/gahookz`.
  Syncthing syncs its source only; `.git`, `node_modules` and build output
  stay local to this laptop (see `Store/.stignore`). Its `origin` is GitHub;
  a second remote, `codex`, points at the old checkout and has pushing
  disabled.
- **Old checkout, kept as a backup:** `/mnt/storage/syncthing/codex/2026-07-01/Gahookz`.
  Do not edit or delete it.
- **The running containers come from the Store repository** (since
  2026-10-02, Tyson-approved redeploy at revision `f15af0b`): production
  (Compose project `gahookz-prod`), beta and dev (project `gahookz`).
  Rollback images: `gahookz:rollback-prod-20261002`,
  `gahookz:rollback-beta-20261002`, `gahookz:rollback-dev-20261002`.
- **Dev bind-mounts the Store working tree**, so saving a file in the Store
  checkout reloads `dev.gahookz.com` at once. Do agent work in the worktrees
  (`~/gahookz-agent-worktrees/`) and merge into Store only when verified.
- `/srv/gahookz`, which older documents call the production clone, is at
  `81a70d2` and is not the production source.

## Where the code lives

| Path | What it is |
| --- | --- |
| `standalone/server.js` | HTTP routing, room commands, phase machine, snapshots, SSE, static serving. The highest-risk file. |
| `standalone/server/*.mjs` | Extracted server features: auth, admission, scoring, media, social, transport, accounts. |
| `standalone/public/app.jsx` | Browser app: state, routes, API client, host and player UI. |
| `standalone/public/client/*.jsx` | Feature modules: drawing, social, offline Dash, tutorials, legal, information. |
| `standalone/public/styles.css` | The entire visual system. |
| `packages/` | Typed contracts, account helpers, and the pure Herd engine. |
| `standalone/smoke-*.mjs` | The regression net. Strong, and the reason changes here are safe. |

Three files are oversized and still growing: `server.js`, `app.jsx` and
`styles.css`. Prefer extracting a vertical slice over adding to them.

## Verifying a change

Run all three before claiming anything works.

```bash
npm run typecheck        # strict TS across contracts, server, web
npm run test:unit        # node:test unit tests
npm run build            # browser build; also proves the JSX parses
```

Then run the stateful batches sequentially. Each owns a **disposable** server:

```bash
npm test
npm run test:disposable -- npm run test:rooms
npm run test:disposable -- npm run test:browser
```

Do not start a server before `npm test` or wrap it in `test:disposable`: it
already manages expiry and shared-suite lifetimes. The wrapper for the other
commands refuses an occupied 127.0.0.1:3199, sets both test URLs, supplies a
temporary journal without database/OAuth credentials, and stops its exact
child on completion or test failure. Leave unfamiliar listeners and the real
dev/beta/prod containers alone. CI runs the same isolated batches.

## Deploying, when you have been asked to

```bash
cd /srv/gahookz
git pull --ff-only origin main
GAHOOKZ_DRAIN_WAIT_SECONDS=300 bash scripts/docker-deploy.sh
```

The drain window lets games in progress finish; without it the deploy ends
them immediately and says so. The script refuses to continue if the production
port belongs to a Compose project it does not own, stamps the Git revision into
the image, and fails if the running container reports a different one.

Confirm what is actually live — the browser `release-...` hash covers only
`standalone/public`, so a server-only change does not move it:

```bash
curl -fsS https://gahookz.com/api/health   # check "revision"
bash scripts/docker-status.sh              # from /srv/gahookz
```

## Which document answers what

| Question | Document |
| --- | --- |
| How do I run, test, or lay out the project? | `README.md` |
| What approved work should the next session implement, and in what order? | `IMPLEMENTATION-PLAN.md` |
| How does any of this work, what is broken, what is next? | `OPERATIONS-AND-ROADMAP.md` |
| What are the production constraints and launch gates? | `docs/operations/production-readiness.md` |
| Why is the architecture like this? | `docs/architecture/0001-long-term-foundation.md` |
| How do I set a server up from nothing? | `DEPLOY-FEDORA.md` |
| What are the day-to-day server commands? | `SERVER-COMMANDS.md` |

`OPERATIONS-AND-ROADMAP.md` section 10 is the live backlog. Read it before
proposing work, because several items that look open have already been done.

Some files are intentionally untracked and will not exist in a fresh clone:
`PROJECT-MEMORY.md` (the owner's running narrative log), `git.md`, and
`LAPTOP-DEPLOY-PROMPT.md`. Never make a tracked document depend on them, and
never assume they are present.

## Traps that have already caught someone

- **Generated browser output is gitignored.** `standalone/public/app.js`,
  `client/*.js` and `release.json` are build products. Edit the `.jsx`/`.js`
  source and run `npm run build`. Docker builds them inside the image.
- **Room codes are letters only.** A code containing digits is rejected and the
  server generates its own, which silently invalidates a hand-written test.
- **`GET /api/state` returns 405 by design.** Room state is a POST, so
  credentials stay out of query strings and proxy logs. `/events` uses a
  short-lived single-use ticket for the same reason.
- **The Compose project name matters.** `compose.yaml` declares
  `name: gahookz`, which is the *development* project. Production sets
  `COMPOSE_PROJECT_NAME=gahookz-prod` in `/srv/gahookz/.env`.
- **The development container reports `revision: "unknown"`.** That is correct:
  it bind-mounts a continuously changing tree, so no single commit describes it.
- **Syncthing conflict copies** (`*.sync-conflict-*`) must never be committed or
  served; the static server, the image build context and CI all refuse them.
