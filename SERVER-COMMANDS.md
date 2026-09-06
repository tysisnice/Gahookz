# Gahookz server commands

The short runbook for the Fedora machine that hosts Gahookz. For the reasoning
behind any of it, see `OPERATIONS-AND-ROADMAP.md`; for the standing rules, see
`CLAUDE.md`.

> **Rewritten 2026-09-06.** The previous version of this file described a
> Cloudflare Tunnel, a host Nginx service, and a project at `/mnt/gahookz`.
> None of those exist on this machine, and it also told you to deploy
> production from the Syncthing tree, which ships uncommitted work. Everything
> below was verified against the running server.

## The two trees

| Path | What it is | Deploy from here? |
| --- | --- | --- |
| `/mnt/storage/syncthing/codex/2026-07-01/Gahookz` | Syncthing working tree. Feeds the hot-reload development container. May contain uncommitted edits. | **No.** |
| `/srv/gahookz` | Clean Git clone on `main`. The production release source. | **Yes.** |

Production runs under the Compose project `gahookz-prod`; development runs
under `gahookz`. `/srv/gahookz/.env` sets `COMPOSE_PROJECT_NAME=gahookz-prod`,
which is what makes a deploy from that directory target the right container.

## Look without changing anything

```bash
cd /srv/gahookz
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
cd /srv/gahookz
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
cd /mnt/storage/syncthing/codex/2026-07-01/Gahookz
docker compose up -d --build gahookz-dev
docker compose logs -f --tail=100 gahookz-dev
```

The development container bind-mounts the Syncthing tree and rebuilds on
change. It reports `revision: "unknown"` on purpose: the tree changes
continuously, so no single commit describes it.

`dev.gahookz.com` is behind an Nginx Proxy Manager access list and prompts for
credentials from outside the LAN.

## Everyday container commands

```bash
cd /srv/gahookz

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
