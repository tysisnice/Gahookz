# Owner's runbook

The day-to-day guide for running Gahookz on the home server: what runs where,
how to look without touching anything, how to test safely, and, only when
Tyson asks, how to deploy and roll back.

Status: skeleton written 2026-10-04. Sections are filled in one at a time; any
section that still says "to be written" is not yet usable.

This is a how-to guide. For why the design is the way it is, see
[production readiness](production-readiness.md) and the
[platform area guide](../areas/platform.md).

## 1. Environments

The one fact behind everything below: rooms, players, timers and uploads live
only inside one Node process. Restarting or replacing a container ends every
game it hosts, and there must never be more than one production replica.

| Environment | Loopback port | Public name | Compose project, service | What it runs |
| --- | --- | --- | --- | --- |
| Development | 3101 | `dev.gahookz.com`, behind a proxy access list | `gahookz`, `gahookz-dev` | The Store working tree, bind-mounted, hot reload. Reports `revision: "unknown"` on purpose. |
| Production | 3102 | `gahookz.com`, `www.gahookz.com` | `gahookz-prod`, `gahookz` | An immutable image, changed only by a deliberate deploy. Cap of 32 rooms. |
| Beta | 3103 | `beta.gahookz.com` | `gahookz`, `gahookz-beta` | A production-target image, capped at two rooms, no database. |
| Disposable tests | 3199 | none | none | Started and stopped by `test:disposable` and `npm test`. The only port tests may use. |

Public traffic reaches Nginx Proxy Manager (a container, not a host Nginx), which
reaches the app containers over the Docker network `gahookz-proxy`. The Node
ports are bound to loopback and are never exposed publicly.

### Where the code lives

| Path | What it is | Use it for |
| --- | --- | --- |
| `/mnt/storage/syncthing/Store/Projects/gahookz` | The working repository. Syncthing syncs the source; `.git`, `node_modules` and build output stay on this laptop. | Production, beta and dev have all run from here since the Tyson-approved redeploy of 2026-10-02 (revision `f15af0b`). |
| `~/gahookz-agent-worktrees/<name>` | One Git worktree per agent, branch `agent/<name>`, made by `scripts/agent-worktree.sh`. | All agent work. |
| `/mnt/storage/syncthing/codex/2026-07-01/Gahookz` | The old checkout. | Read-only backup. Do not edit or delete. |
| `/srv/gahookz` | An older clone (at `81a70d2`). | Nothing. It is **not** the production source. |

Two consequences:

- Dev bind-mounts the Store tree, so **every save in the Store checkout reloads
  `dev.gahookz.com`** for anyone looking at it. Do experiments in a worktree and
  merge into Store only when verified.
- Older documents, including the deploy commands in `CLAUDE.md` and
  `SERVER-COMMANDS.md`, still say `cd /srv/gahookz`. That is stale; use the Store
  repository, as in [section 4](#4-deploy-only-when-tyson-asks).

### Rollback images

The 2026-10-02 move kept one image per environment so it could be undone:

```text
gahookz:rollback-prod-20261002
gahookz:rollback-beta-20261002
gahookz:rollback-dev-20261002
```

They preserve what each environment ran before the move. Rolling back to one has
never been rehearsed; see [section 5](#5-rollback).

## 2. Look without changing anything

To be written.

## 3. Safe test workflow

To be written.

## 4. Deploy (only when Tyson asks)

To be written.

## 5. Rollback

To be written.

## 6. Logs and troubleshooting

To be written.

## 7. Maintenance cadence

To be written.

## 8. Definition of done

To be written.
