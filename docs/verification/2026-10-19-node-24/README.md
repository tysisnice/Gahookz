# Node 24 becomes the declared runtime (owner decision, 2026-10-19)

- Decision: Tyson, 2026-10-19 — "go with Node 24".
- Branch / commits: `main` directly; configuration and documentation only, no
  game code touched.
- Production touched: **no**. No deploy was asked for or made; the running
  container already runs Node 24, so nothing about the live site changes.

## What the decision settles

`package.json` declared `engines.node` as `>=20.0.0` while CI, the Docker images
and every verified run used Node 24. The floor described a runtime nobody tested
on, and the gap had already produced one concrete confusion: a WIP branch raised
it to `>=24`, the raise was reverted during the 2026-10-18 merge session because
this laptop runs Node 22, and the question went to Tyson
([deploy-safety record](../2026-10-18-deploy-safety/README.md), *Deliberately
not changed*).

The answer is Node 24. The floor now matches the runtime that is actually
tested.

## The change

| File | Before | After |
| --- | --- | --- |
| `package.json` | `"node": ">=20.0.0"` | `"node": ">=24.0.0"` |
| `package-lock.json` (root package entry) | `">=20.0.0"` | `">=24.0.0"` |
| `standalone/smoke-deployment.mjs` | asserts `">=20.0.0"` | asserts `">=24.0.0"`, message updated to name the Docker and CI runtime |

The smoke assertion is what stops the two drifting: it is an exact-equality
check, so either value changing alone fails `standalone:smoke:deployment`, which
runs in the shared chain and in CI. Nothing else in the repository named a
version floor — `Dockerfile` (digest-pinned `node:24-alpine`) and
`.github/workflows/ci.yml` (`NODE_VERSION: "24"`) already said 24, and no
package under `packages/` declares `engines`.

## This laptop still runs Node 22

`/usr/bin/node` is v22.23.1 and it is the only Node installed here, so **local
verification now runs below the declared floor.** That is deliberate, and
recorded rather than hidden:

- there is no `.npmrc`, so `engine-strict` is off and npm warns (`EBADENGINE`)
  rather than refusing; `npm run` does not check `engines` at all, so every
  script still runs;
- the matrix below was run on Node 22 and is green;
- a timing-sensitive failure on this laptop should now be re-checked on Node 24
  before it is believed, because the floor says 24 and CI runs 24.

Installing it needs root, so it is Tyson's and it is in
[the backlog](../../backlog.md): Fedora 44 carries `nodejs24` 24.18.0 in
`updates`, and the only installed packages that require `nodejs22` are its own
subpackages, so a swap has nothing else depending on it. Not run here.

## Documentation corrected

The decision exposed a stale instruction in three places, not just a stale
number. `docs/agents/README.md`, `docs/areas/platform.md` and
`docs/areas/quality.md` all told agents to prefix verification with
`PATH=/usr/bin:$PATH` *to get Node 24* — on this laptop that gives Node 22. The
prefix is still right, because some shells put the Hermes agent's Node 26 first
and a timing-sensitive smoke has failed under 26, but its reason is now stated
correctly: it keeps a stray Node 26 out, it does not produce Node 24. The
`~/.local/opt/node-v24.13.1-linux-x64` path in the agent rules is the desktop's,
and now says so.

Also updated: `docs/operations/runbook.md` (the Node paragraph and the
`node --version` comment, which said "must say v24"),
`docs/operations/dependency-policy.md`, `OPERATIONS-AND-ROADMAP.md` section 5,
`docs/areas/platform.md`'s known-issues bullet, `docs/backlog.md`,
`docs/HANDOFF.md`, `docs/CHANGELOG.md` and `docs/history.md`.

## Commands run

All on `main`, under `flock /tmp/gahookz-verify.lock`, on this laptop's
**Node v22.23.1**:

```bash
npm run standalone:smoke:deployment     # ok: true — the realigned assertion
npm run check                           # typecheck + unit tests + build
npm test                                # shared smoke chain
npm run docs:check
```

Results are recorded in the commit message for the change.

## Installed 2026-10-21

Tyson installed it. `nodejs24` 24.18.0 and `nodejs24-npm` 11.16.0 are present
as `/usr/bin/node-24` and `/usr/bin/npm-24`; `/usr/bin/node` remains 22, which
is how the Fedora packages are meant to coexist, so the laptop now *can* run at
the declared floor but does not do so by default. The gap this record described
is therefore closed by a PATH shim rather than by a swap, and
[the working agreement](../../agents/README.md) carries the recipe plus the
measured reason `npm-24 run` does not achieve it.
