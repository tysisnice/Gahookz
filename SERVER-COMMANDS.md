# Gahookz server commands

These commands assume the project is stored at `/mnt/gahookz/Gahookz` and
Docker, Nginx, and Cloudflared are already installed on the Fedora server.

## Update to the newest project copy

First replace or synchronise `/mnt/storage/syncthing/codex/2026-07-01/Gahookz` with the newest Gahookz
project files. The Docker update command cannot download changes from another
computer by itself.

Then run:

```bash
cd /mnt/storage/syncthing/codex/2026-07-01/Gahookz
bash scripts/docker-update.sh
bash scripts/docker-status.sh
curl -fsS http://127.0.0.1:3102/api/health; echo
curl -fsS https://gahookz.com/api/health; echo
```

The local and public health responses must show the same `release-...` value.
The update rebuilds the browser client from the current JSX source inside
Docker, creates a content-based release ID, force-recreates the container, and
checks that the running container uses the image that was just built.

Updating ends active rooms because rooms are stored in memory.

## Everyday commands

Run these from `/mnt/gahookz/Gahookz`.

```bash
# Is Gahookz running, and which release is live?
bash scripts/docker-status.sh

# Follow app logs. Press Ctrl+C to stop watching.
docker compose logs -f --tail=100 gahookz

# Restart the same installed release.
docker compose restart gahookz

# Stop the app.
docker compose stop gahookz

# Start the already-built app.
docker compose up -d gahookz

# Start or inspect the hot-reloading development app on port 3101.
docker compose up -d gahookz-dev
docker compose logs -f --tail=100 gahookz-dev

# Rebuild and install the current project files as a new release.
bash scripts/docker-update.sh
```

`docker compose restart` does not install changed source files. Use
`docker-update.sh` after copying a new project version onto the server.

## Nginx and Cloudflare Tunnel

```bash
# Check and reload Nginx after configuration changes.
sudo nginx -t
sudo systemctl reload nginx

# Check the tunnel.
sudo systemctl --no-pager --full status cloudflared

# Restart the tunnel.
sudo systemctl restart cloudflared

# Follow tunnel logs. Press Ctrl+C to stop watching.
sudo journalctl -u cloudflared -f
```

## Quick fault check

```bash
cd /mnt/gahookz/Gahookz
docker compose ps
curl -fsS http://127.0.0.1:3102/api/health; echo
sudo nginx -t
curl -fsS -H 'Host: gahookz.com' http://127.0.0.1/api/health; echo
sudo systemctl is-active cloudflared
curl -fsS https://gahookz.com/api/health; echo
```

- If port 3102 fails, check the production container and app logs.
- If port 3102 succeeds but the Host-header request fails, check Nginx and
  Fedora's SELinux proxy setting.
- If both local requests succeed but the public request fails, check the
  Cloudflare Tunnel service and its logs.
