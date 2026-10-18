# A deploy can no longer end a game nobody agreed to end

- Branch: `agent/deploy-safety` (WIP `58e8ba6` from 2026-10-09, finished and
  merged 2026-10-18).
- Production touched: **no.** Nothing was deployed, built or recreated. Every
  case below ran against stub `docker` and `curl` commands on `PATH`; a case
  that reached real Docker would have failed, because the stub was the only
  `docker` available.

## Why

Rooms live in one Node process, so replacing the production container ends
every game it is hosting. The old script knew that and said so — and then did
it anyway. Three paths ended games after only a warning:

1. no `GAHOOKZ_DRAIN_WAIT_SECONDS` → "Replacing production immediately. Active
   games will end." and it replaced;
2. a drain wait that expired with rooms still playing → it proceeded;
3. no `GAHOOKZ_METRICS_TOKEN` → it could not drain, so it replaced undrained.

And a fourth made things worse after an abort: a drain the script had started
stayed on, so production refused **every new room** until someone restarted it
or posted `/api/drain {"active":false}` by hand.

## What it does now

Each of those refuses instead, and says what to do:

| Situation | Before | Now |
| --- | --- | --- |
| Rooms active, no drain window | Replaced | Refuses; names the two ways past |
| Drain wait expires, rooms left | Replaced | Refuses, **and cancels the drain** |
| Aborted or interrupted mid-drain | Left draining | `trap` cancels it |
| No metrics token, rooms active | Replaced undrained | Refuses |
| No metrics token, no rooms | Replaced | Proceeds, saying so |
| Anything above, forced | — | `GAHOOKZ_FORCE_REPLACE=1`, states that games will end |

Also: the running image is tagged `gahookz:rollback-prod-<date>-<time>` before
the build, with the restore command printed; `env_value` reads settings the way
Compose does (environment wins over `.env`); and the post-deploy image check
uses `GAHOOKZ_PROD_IMAGE` rather than the retired `gahookz:local`.

Two gaps in the 2026-10-09 WIP were closed on the way in. It claimed a drain
was active before the node had accepted one, so a failed drain request made the
exit path warn about cancelling a drain that never existed. And the
no-drain-window path — the one somebody in a hurry takes — still replaced
production without looking at `activeRooms` at all.

## The test

`scripts/docker-deploy.test.sh`, `npm run test:deploy-script`, and a CI step in
the job that needs no Docker. It copies the real script into a throwaway
directory, puts a stub `docker` and `curl` first on `PATH`, and asserts on what
the script said, what exit status it gave, whether it would have replaced
production, and whether it cancelled its drain.

```
ok   a quiet room is replaced without a drain window
ok   games in progress and no drain window: refuses
ok   games in progress, forced: replaces and says so
ok   a drain wait that expires with rooms left: refuses
ok   a drain that empties the server: proceeds
ok   a drain the node refuses is reported, not assumed
ok   another Compose project owns the port: refuses
ok   an unhealthy replacement is reported

8 passed, 0 failed
```

**Non-vacuity:** the same eight cases against the pre-hardening script give
**2 passed, 6 failed** — including both refusal cases, which it fails by
replacing production.

## Deliberately not changed

`engines.node` stays `>=20.0.0`. The WIP raised it to `>=24`, which is the
runtime CI and Docker use, but this laptop's Node is 22, so the floor would
describe a runtime local verification does not have. `smoke-deployment`'s
matching assertion was left alone with it, so the two cannot drift. The
decision is Tyson's: install Node 24 on the laptop, or keep the floor at 20 and
accept that local runs and CI differ. It is in
[`docs/backlog.md`](../../backlog.md) and in the platform guide's known issues.

## Commands run

```bash
bash -n scripts/docker-deploy.sh scripts/docker-deploy.test.sh
npm run test:deploy-script          # 8 passed, 0 failed
npm run check                       # typecheck, unit tests, build
npm test                            # shared smoke chain, including smoke-deployment
npm run docs:check
```

## Still open before a deploy

**A rollback has never been rehearsed.** The runbook's section 5 has never been
executed, and the script now tags a rollback image on every deploy, which makes
rehearsing it cheap. That is the next step, on **beta**, with
`gahookz:rollback-beta-20261002` — before production is deployed.
