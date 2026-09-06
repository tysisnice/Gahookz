# Run Gahookz on a Fedora laptop with Docker and Nginx

> **This is a build-from-scratch recipe, not a description of the live server.**
> Reviewed 2026-09-06. It remains a valid way to stand a new machine up, but the
> machine currently serving `gahookz.com` differs in three ways:
>
> - The proxy is **Nginx Proxy Manager running as a container**, not the host
>   `nginx` service used below. Host `nginx` is not installed.
> - There is **no `cloudflared`** and no Cloudflare Tunnel. Cloudflare provides
>   authoritative DNS in DNS-only mode.
> - The paths are `/srv/gahookz` (production clone, deploy from here) and
>   `/mnt/storage/syncthing/codex/2026-07-01/Gahookz` (Syncthing tree,
>   development only). `/mnt/gahookz/Gahookz` below is illustrative.
>
> For day-to-day operation of the live server use `SERVER-COMMANDS.md`.


For the short day-to-day command list, see `SERVER-COMMANDS.md`.

This setup assumes Docker Engine, the Docker Compose plugin, and Nginx are already installed. Nginx runs directly on Fedora and sends requests to a loopback-only Docker port.

## What this deployment does

- Runs one hardened Node container with a health check and automatic restart.
- Builds the browser bundle from the current JSX source inside Docker, then
  verifies that the running container uses the image that was just built.
- Exposes production Gahookz only at `127.0.0.1:3102`; the public never connects to this port directly.
- Uses Nginx for the public HTTP/HTTPS connection and disables buffering for live Server-Sent Events.
- Rotates Docker logs and caps the container at 1 GB of RAM by default.
- Keeps live rooms in memory. A container restart ends active rooms, so deploy updates between games.

The application currently has no database or persistent player accounts. It therefore does not need a data volume. The project source may live on the external HDD; after the image is built, Docker stores and runs the image from Docker's configured data root.

## 1. Put the project in a stable folder

Find the external drive and its mount point:

```bash
lsblk -f
```

A path such as `/mnt/gahookz/Gahookz` is easier to manage than a removable desktop path under `/run/media`. Make sure the drive is mounted before trying to build an update. If the drive is NTFS or exFAT, run the scripts with `bash` as shown below because executable permission bits may not persist.

Do not copy `node_modules`; the production image does not use it. The folder containing `Dockerfile`, `compose.yaml`, and `standalone/` is the project root.

## 2. Start the container

From the project root:

```bash
cd /mnt/gahookz/Gahookz
cp -n .env.example .env
bash scripts/docker-deploy.sh
curl --fail http://127.0.0.1:3102/api/health
```

The expected health response starts with `{"ok":true`. Leave `GAHOOKZ_BIND_ADDRESS=127.0.0.1` in `.env`; Nginx is the only service that should reach the app port.

Useful commands:

```bash
bash scripts/docker-status.sh
docker compose logs -f gahookz
docker compose restart gahookz
docker compose down
```

## 3. Connect host Nginx

Copy the supplied configuration and test it:

```bash
sudo cp deploy/nginx/gahookz.conf.example /etc/nginx/conf.d/gahookz.conf
sudo setsebool -P httpd_can_network_connect 1
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
curl --fail -H 'Host: gahookz.com' http://127.0.0.1/api/health
```

The SELinux setting allows Nginx to proxy to the local container port. If the domain changes, edit both `server_name` values in `/etc/nginx/conf.d/gahookz.conf` before reloading Nginx.

This configuration assumes Nginx is installed on the Fedora host. If Nginx itself is another Docker container, it cannot use the host's `127.0.0.1`; put both services on one Docker network and proxy to `gahookz:3001` instead.

## 4. Allow public web traffic

Open only HTTP and HTTPS in Fedora's firewall:

```bash
sudo firewall-cmd --permanent --zone=public --add-service=http
sudo firewall-cmd --permanent --zone=public --add-service=https
sudo firewall-cmd --reload
```

Do not open port 3102. On your router, forward TCP ports 80 and 443 to the Fedora laptop's reserved LAN address. Reserve that LAN address in the router so it does not change.

If the router's WAN address does not match the public address reported by an IP-checking service, the connection may be behind CGNAT. Ordinary port forwarding will not work through CGNAT; use a Cloudflare Tunnel or ask the ISP for a public IPv4 address.

## 5. Point the domain and add HTTPS

In Cloudflare DNS, create or update:

- `A` record, name `@`, content set to the home's public IPv4 address.
- `CNAME` record, name `www`, target `gahookz.com`.

For initial troubleshooting, DNS-only makes it easier to confirm the origin. Once HTTPS works, Cloudflare recommends proxying web records. If the public IP changes periodically, configure a trusted Cloudflare DDNS updater or use Cloudflare Tunnel.

With ports 80 and 443 reaching the laptop, install/use Certbot's Nginx plugin and request the certificate:

```bash
sudo dnf install certbot python3-certbot-nginx
sudo certbot --nginx -d gahookz.com -d www.gahookz.com
sudo nginx -t
sudo systemctl reload nginx
curl --fail https://gahookz.com/api/health
```

If Cloudflare proxying is enabled, set Cloudflare SSL/TLS mode to **Full (strict)** after the origin certificate is valid.

## 6. Make the laptop behave like a server

- Enable Docker and Nginx at boot: `sudo systemctl enable --now docker nginx`.
- In KDE Power Management, disable automatic sleep while plugged in.
- Configure lid-close behavior so closing the laptop does not suspend it.
- Use Ethernet where possible.
- Keep the external drive mounted for builds and updates. The already-created container can restart without the source folder, because there are no source bind mounts.

## Updating Gahookz

Replace or pull the project files, then run the update script. Docker compiles
the current browser source as part of the image build, so no separate frontend
build is required on the Fedora laptop:

```bash
# On the live server this is /srv/gahookz, the clean production clone --
# never the Syncthing tree, which can hold uncommitted work.
cd /srv/gahookz
git status --porcelain          # must be empty
git pull --ff-only origin main
GAHOOKZ_DRAIN_WAIT_SECONDS=300 bash scripts/docker-update.sh
curl --fail https://gahookz.com/api/health
```

The health response includes a content-derived release value such as
`release-2a67cd619da22f85`. Check the same value at the origin and public site:

```bash
bash scripts/docker-status.sh
curl -fsS http://127.0.0.1:3102/api/health
curl -fsS https://gahookz.com/api/health
```

If those two health responses show the same release, Nginx and the public domain
are serving the newly built container. Each source release gets new asset URLs
and a new service-worker cache, preventing an older browser bundle from being
reused after the update.

An update recreates the single app container and therefore ends live rooms. Do not scale this service to multiple replicas: its rooms and authentication state are process-local.

## Quick fault checks

```bash
docker compose ps
docker compose logs --tail=100 gahookz
curl -v http://127.0.0.1:3102/api/health
sudo nginx -t
curl -v -H 'Host: gahookz.com' http://127.0.0.1/api/health
sudo journalctl -u nginx -n 100 --no-pager
sudo firewall-cmd --list-services
```

Interpretation:

- First `curl` fails: app container/build problem.
- First succeeds but Host-header `curl` fails: Nginx or SELinux problem.
- Both local checks succeed but the domain fails: DNS, router forwarding, ISP/CGNAT, or TLS problem.
