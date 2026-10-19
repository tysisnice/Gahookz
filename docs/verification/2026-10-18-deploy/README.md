# Production deploy, 2026-10-18

- Asked for by Tyson on 2026-10-18, after the deploy script was hardened and a
  rollback was rehearsed on beta. Production had been running a build from
  2026-10-08 made from a tree with uncommitted changes, **48 commits** behind
  `main`.
- Run from `/mnt/storage/syncthing/Store/Projects/gahookz` on the laptop with
  `GAHOOKZ_DRAIN_WAIT_SECONDS=300 bash scripts/docker-deploy.sh`.

## Before

| | |
| --- | --- |
| `main` | `74a489949e02`, clean tree, pushed to `origin` |
| Production revision | `abc6392241ce-dirty`, built 2026-10-08T11:48Z |
| Active rooms | 0 on all three services |
| Compose project owning :3102 | `gahookz-prod`, container `8d432714b8bb` |
| `GAHOOKZ_METRICS_TOKEN` | **not set** (see below) |
| Rollback images | 3 (`rollback-{prod,beta,dev}-20261002`) |

## What the script did

```
Building revision 74a489949e02.
Rollback target: gahookz:rollback-prod-20261018-1556
  Restore with: GAHOOKZ_PROD_IMAGE=gahookz:rollback-prod-20261018-1556 docker compose up -d --force-recreate --no-build gahookz
Image gahookz:prod-local Built
No GAHOOKZ_METRICS_TOKEN in .env, so the node cannot be drained first.
No rooms are active; proceeding.
Container gahookz-prod-gahookz-1 Recreated / Started
Gahookz release-a29f717b49371ad2 (revision 74a489949e02) is healthy at http://127.0.0.1:3102/api/health
```

The drain window was never used: without the metrics token the script cannot
ask the node to stop accepting rooms, so it read `activeRooms` from the
published port instead and would have **refused** if anyone had been playing.
That check happens after the build and immediately before the replacement, so
the window between checking and replacing is seconds. This is the behaviour the
2026-10-18 hardening added; the old script would have replaced production
regardless.

## After

| | |
| --- | --- |
| `https://gahookz.com/api/health` | `ok: true`, `revision: 74a489949e02`, `draining: false` |
| Local `:3102` | same revision, `builtAt 2026-10-18T04:57:32Z`, instance `prod-1` |
| `GET https://gahookz.com/` | 200 |
| Beta, development | untouched: up 1 hour and 2 hours, both healthy |
| Rollback target | `gahookz:rollback-prod-20261018-1556` (the image that was running) |

The revision matches `git rev-parse --short=12 HEAD` exactly — no `-dirty`
suffix, unlike the build it replaced.

**The features are in the served bundle, not just the process.** The live
`app.js` contains "Report a problem", "Reports" and the "Mini" Gahook rule, and
`client/report.js` returns 200. So the work Tyson asked for on 8 October — the
Report button and host Reports list, Gahook effects Off and Mini, Classic Quiz
showing picks, picture-only Herd answers, chat and drawing during Herd writing,
the narrower question column — is what `gahookz.com` now serves.

## Verified before deploying

On `74a4899`: `npm run check` (typecheck, 233 unit tests, build); `npm test`
(25 smoke scripts, 15,000 seeded games); `npm run test:deploy-script` (8 cases);
`test:disposable` for `test:rooms` (12 games), `test:herd-boundaries` (9 games),
`test:browser`, `test:browser:navigation`, `test:browser:herd-writing`,
`test:browser:mobile`; `npm run docs:check`. All green.

## Follow-up

Set `GAHOOKZ_METRICS_TOKEN` in `.env` so the next deploy can drain gracefully
instead of relying on nobody playing. It only takes effect on the deploy
*after* it is added, because the drain is requested of the container that is
already running.
