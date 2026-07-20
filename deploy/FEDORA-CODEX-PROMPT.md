# Prompt to use with Codex on the Fedora server

Copy the text below into Codex on the Fedora laptop after replacing the project path if necessary.

---

I have the Gahookz project at `/mnt/gahookz/Gahookz` on this Fedora KDE laptop. Docker Engine, the Docker Compose plugin, and host-installed Nginx are already set up. I want `gahookz.com` and `www.gahookz.com` to serve this game securely.

Please inspect `DEPLOY-FEDORA.md`, `Dockerfile`, `compose.yaml`, `.env.example`, and `deploy/nginx/gahookz.conf.example`, then deploy and verify them. Use the existing files instead of redesigning the app. Run the safe local checks and `bash scripts/docker-deploy.sh`; confirm `http://127.0.0.1:3102/api/health` succeeds. Then install or merge the supplied Nginx configuration, keep port 3102 bound only to localhost, enable the Fedora SELinux reverse-proxy boolean, test Nginx, and reload it. Check that only HTTP/HTTPS are opened in firewalld. If DNS and router forwarding already reach this laptop, use Certbot's Nginx plugin for `gahookz.com` and `www.gahookz.com`, then verify the public HTTPS health URL and the game page.

Ask before making sudo-level changes or changing DNS/router settings. Do not expose port 3102, do not create multiple production Gahookz replicas, and do not claim success until both the container health check and the public HTTPS check pass. Remember that live rooms are in memory and restarting the container ends them. If public access is blocked by DNS, port forwarding, a changing public IP, or CGNAT, identify the exact blocker and give me the shortest next action; suggest Cloudflare Tunnel if direct inbound ports are impossible.

At the end, give me the exact status, the public URL, the commands for logs/status/update, and any step that still needs me to act in Cloudflare or on the router.

---
