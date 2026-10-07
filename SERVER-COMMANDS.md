# Gahookz server commands

The short runbook for the Fedora machine that hosts Gahookz. For the reasoning
behind any of it, see `OPERATIONS-AND-ROADMAP.md`; for the standing rules, see
`CLAUDE.md`.

> **Rewritten 2026-09-06.** The previous version of this file described a
> Cloudflare Tunnel, a host Nginx service, and a project at `/mnt/gahookz`.
> None of those exist on this machine, and it also told you to deploy
> production from the Syncthing tree, which ships uncommitted work. Everything
> below was verified against the running server.

## The trees

> **Updated 2026-10-02.** The working repository is
> `/mnt/storage/syncthing/Store/Projects/gahookz`, and since a Tyson-approved
> redeploy on 2026-10-02 (revision `f15af0b`) production, beta and dev all
> run from it. See `CLAUDE.md`, "Where the repository lives".

| Path | What it is | Deploy from here? |
| --- | --- | --- |
| `/mnt/storage/syncthing/Store/Projects/gahookz` | The working repository (source synced by Syncthing; `.git` local). Production (`gahookz-prod`), beta and dev (`gahookz`) run from here; dev bind-mounts this tree. | **Yes — but only when Tyson asks for a deploy.** |
| `/mnt/storage/syncthing/codex/2026-07-01/Gahookz` | The old working tree, kept as an untouched backup. | **No.** |
| `/srv/gahookz` | Older clean clone, at `81a70d2`; not the production source. | **No.** |

Rollback images from the 2026-10-02 move: `gahookz:rollback-prod-20261002`,
`gahookz:rollback-beta-20261002`, `gahookz:rollback-dev-20261002`.

Production runs under the Compose project `gahookz-prod`; development and
beta run under `gahookz`. All three were started from the Store repository on
2026-10-02. Before any deploy (only when Tyson asks), confirm from the Store
repository that `docker compose ps -q gahookz` prints the production container,
as `docs/operations/runbook.md` section 4 describes; the deploy script refuses
to continue when the production port belongs to a project it does not own.

## Look without changing anything

```bash
cd /mnt/storage/syncthing/Store/Projects/gahookz
bash scripts/docker-status.sh          # container, health, release, revision
docker compose ps

curl -fsS http://127.0.0.1:3102/api/health; echo    # production, loopback
curl -fsS http://127.0.0.1:3101/api/health; echo    # development, loopback
curl -fsS https://gahookz.com/api/health; echo      # production, public
```

`release-...` hashes only the browser files under `standalone/public`, so a
server-only change does not move it. `revision` is the Git short SHA baked into
the image and is the reliable answer to "what code is running".

## Deploy production

Only when you have been asked to. This ends every game in progress unless you
give it a drain window.

```bash
cd /mnt/storage/syncthing/Store/Projects/gahookz
git status --porcelain                 # must be empty
git pull --ff-only origin main

# Let games in progress finish first (recommended):
GAHOOKZ_DRAIN_WAIT_SECONDS=300 bash scripts/docker-deploy.sh

# Or replace immediately, accepting that active games end now:
bash scripts/docker-deploy.sh
```

`scripts/docker-update.sh` is a thin wrapper around the same script.

The deploy validates Compose, refuses to run if the production port belongs to
a Compose project it does not own, builds the image, optionally drains,
recreates the container, waits for health, and fails unless the running server
reports the revision that was just built.

Check who is playing before you start:

```bash
curl -fsS http://127.0.0.1:3102/api/ready; echo     # look at activeRooms
```

## Development

```bash
cd /mnt/storage/syncthing/Store/Projects/gahookz
docker compose logs -f --tail=100 gahookz-dev
```

The development container bind-mounts the Store working tree and rebuilds on
change, so every save there reloads `dev.gahookz.com`. Agents work in their
worktrees and the orchestrator merges verified work into Store. It reports `revision: "unknown"` on purpose: the tree changes
continuously, so no single commit describes it.

`dev.gahookz.com` is behind an Nginx Proxy Manager access list and prompts for
credentials from outside the LAN.

## Everyday container commands

```bash
cd /mnt/storage/syncthing/Store/Projects/gahookz

docker compose logs -f --tail=100 gahookz    # follow production logs
docker compose restart gahookz               # restart the SAME image; ends rooms
docker compose stop gahookz
docker compose up -d gahookz                 # start the already-built image
```

`docker compose restart` does not install changed source. Use the deploy script.

## The proxy

Public traffic reaches Nginx Proxy Manager, a container, not a host Nginx
service. There is no `cloudflared` on this machine; Cloudflare provides
authoritative DNS in DNS-only mode.

```bash
docker ps --filter name=nginx-proxy-manager
docker logs --tail=100 nginx-proxy-manager
cd /srv/docker/nginx-proxy-manager && docker compose restart
```

Both app containers and the proxy share the external Docker network
`gahookz-proxy`. The Node ports stay bound to `127.0.0.1`.

Never `cat` the proxy's data directory indiscriminately — it contains
`keys.json`, the JWT signing key.

## Quick fault check

Work outwards from the container.

```bash
curl -fsS http://127.0.0.1:3102/api/health; echo        # 1. the app itself
docker ps --filter name=gahookz --format '{{.Names}}\t{{.Status}}'
docker logs --tail=100 gahookz-prod-gahookz-1           # 2. app logs
docker network inspect gahookz-proxy | grep -A2 Name    # 3. proxy can reach it
curl -fsS https://gahookz.com/api/health; echo          # 4. the public path
```

- Loopback fails: the container or the app. Read its logs.
- Loopback works, public fails: the proxy, DNS, or the router. Check
  `nginx-proxy-manager` logs and that both containers are on `gahookz-proxy`.
- Both work but players report problems: check `activeRooms` against the
  32-room cap, and remember a restart ends every room.

## Stopping a test server

Never `pkill -f server.js` — it matches the live containers. Stop by port:

```bash
kill "$(ss -lptnH 'sport = :3199' | grep -oP 'pid=\K[0-9]+')"
```
