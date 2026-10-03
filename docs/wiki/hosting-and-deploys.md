# Hosting and deploys

> Gahookz runs as one Node process in a container on a single machine, and a new release replaces it only when Tyson asks.

**Area:** [Platform](../areas/platform.md) · **Status:** live · **Last reviewed:** 2026-10-04

## What it is

The whole game is one Node process. It serves the pages, the commands, the
live streams and room media. Because rooms exist only in that process,
**replacing the container ends every game in progress**. For the same reason
there must be only one production copy.

Three copies of the game run on one Fedora machine, in Docker:

| Environment | Address | Notes |
| --- | --- | --- |
| Production | `gahookz.com`, loopback port 3102 | Immutable image, Compose project `gahookz-prod` |
| Beta | `beta.gahookz.com`, port 3103 | Deliberately small: two rooms, no database |
| Development | `dev.gahookz.com`, port 3101 | Bind-mounts the working tree, reloads on every save, behind an access list |

Browsers reach them through Cloudflare (DNS only), the home router and Nginx
Proxy Manager. Tests may use only port 3199.

**Where the code is.** The working repository is the Store folder
(`/mnt/storage/syncthing/Store/Projects/gahookz`). Since 2026-10-02 all three
containers run from it (production was redeployed at Tyson's request). The old
checkout under the `codex` folder is a read-only backup, and `/srv/gahookz` is an
older clone that is no longer the production source. Agents work in
`~/gahookz-agent-worktrees/` and never edit the Store tree directly.

## Rules and numbers

- **Deploys happen only when Tyson asks.** Committing and pushing is normal;
  replacing the production container is not.
- `scripts/docker-deploy.sh` stamps the commit into the image, optionally drains
  first (`GAHOOKZ_DRAIN_WAIT_SECONDS`, for example 300), recreates only the
  production service, and fails unless the running container reports that
  commit. Without a drain wait it warns that games will end.
- The container waits up to 30 seconds for rooms to finish on shutdown and is
  given 45 seconds before being killed.
- `GET /api/health` reports `revision`. The development container reports
  `unknown` on purpose.
- Rollback images from 2026-10-02 are kept for production, beta and dev.
- Never run the stateful smoke tests against these addresses.

## Where it lives

| Part | Code |
| --- | --- |
| Image build | `Dockerfile` |
| Services, ports, limits | `compose.yaml` |
| Deploy, status and update scripts | `scripts/docker-deploy.sh`, `docker-status.sh`, `docker-update.sh` |
| Drain, health, metrics | `standalone/server.js` |
| CI | `.github/workflows/ci.yml` |
| Server set-up | `DEPLOY-FEDORA.md`, `SERVER-COMMANDS.md` |

## Related

- [Testing](testing.md)
- [Live connection](live-connection.md)
- [Platform area guide](../areas/platform.md)

## History

- 2026-07-20 — First version online on the laptop.
- 2026-09-06 — Revision stamp, pinned base image and drain before deploy.
- 2026-09-12 — Public beta site added.
- 2026-09-19 — Production runs `e3b6dde` after the Quiz/Herd overhaul.
- 2026-10-02 — All three containers redeployed from the Store repository at `f15af0b`.
