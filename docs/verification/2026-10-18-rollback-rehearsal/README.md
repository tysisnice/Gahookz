# Rollback rehearsal on beta — the plan works, with one surprise

- Date: 2026-10-18. Runbook [section 5](../../operations/runbook.md#5-rollback),
  Option 2, rehearsed on **beta** as that section instructs.
- Production touched: **no.** Only the `gahookz-beta` service was recreated, by
  name, twice. Production and development stayed up throughout (`Up 5 days` and
  `Up 34 minutes` before, during and after).
- First rehearsal ever: the runbook had carried an "Untested plan" warning
  since it was written.

## What was run

```bash
# 0. baseline
curl -fsS http://127.0.0.1:3103/api/health
#   release-1d9bfc818eee7400, revision f15af0b9da5d, activeRooms 0

# 1. roll back
GAHOOKZ_BETA_IMAGE=gahookz:rollback-beta-20261002 \
  docker compose up -d --no-deps --force-recreate --no-build gahookz-beta

# 2. check, including a real game
# 3. restore
docker compose up -d --no-deps --force-recreate --no-build gahookz-beta
```

## Result

| | Before | Rolled back | Restored |
| --- | --- | --- | --- |
| Image | `gahookz:beta-local` | `gahookz:rollback-beta-20261002` | `gahookz:beta-local` |
| Release | `release-1d9bfc818eee7400` | `release-ddc2fd1c843e944e` | `release-1d9bfc818eee7400` |
| Built | 2026-10-01 | **2026-09-12** | 2026-10-01 |
| Revision | `f15af0b9da5d` | **`unknown`** | `f15af0b9da5d` |
| Health | healthy | healthy in ~9 s | healthy in ~20 s |

The rolled-back image was not just up but **playable**: a room was created,
a host and a player joined, and `POST /api/state` returned the lobby with both
of them. `activeRooms` went to 1 and the room ended with the restore, which is
what process-local rooms mean.

Both recreations took seconds and neither touched another service. `--no-deps`
and the service name are what make that safe, given all three services share
the one Compose project.

## The surprise: a rolled-back server cannot tell you what it is

The 2026-10-02 rollback images predate revision stamping, so the rolled-back
beta reported `"revision": "unknown"`. After a real production rollback,
`/api/health` would **not** identify the running code — the usual check
(`curl .../api/health` and compare `revision`) is useless at exactly the moment
it is needed most.

Identify a rolled-back service by its **image tag** and `builtAt` instead:

```bash
docker inspect --format '{{.Config.Image}}' gahookz-prod-gahookz-1
curl -fsS http://127.0.0.1:3102/api/health   # read "builtAt" and "release", not "revision"
```

Rollback images tagged by `docker-deploy.sh` from now on do carry a revision,
because it tags the running production image, which has been stamped since
2026-09-06. Only the three `20261002` images have this blind spot — and they are
the ones a rollback today would use.

## What this changes

- Runbook section 5 loses its "untested" warning for Option 2 and gains the
  identification note above.
- The remaining untested part is **Option 1** (revert and redeploy), which is
  just a normal deploy of a revert commit, and a production rollback itself.
  Beta proves the mechanism, not the production blast radius.
