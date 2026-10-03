# Testing

> A set of checks that protects live players: fast unit tests, stateful smoke scripts and real-browser runs, all aimed at a throwaway server.

**Area:** [Quality](../areas/quality.md) · **Status:** live · **Last reviewed:** 2026-10-04

## What it is

Real people play Gahookz, so every change is checked before it ships. There
are four layers. **Unit tests** check pure logic (scoring, the Herd engine,
limits). **Smoke scripts** drive a real server over HTTP and assert that access
control, host controls, scoring and limits behave. **Simulations** play
thousands of seeded games and whole rooms. **Browser scripts** open real
Chromium at phone and desktop sizes and check layout, navigation and sound.

A green build only proves the pages parse. Some smoke checks read source text
and are only tripwires; they cannot show that a button works. If a test fails,
the code is wrong until proven otherwise. Never weaken a check to get green.

## Rules and numbers

Run everything under the shared lock, with Node 24:

```bash
PATH=/usr/bin:$PATH flock /tmp/gahookz-verify.lock npm run check
PATH=/usr/bin:$PATH flock /tmp/gahookz-verify.lock npm test
PATH=/usr/bin:$PATH flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run test:rooms
PATH=/usr/bin:$PATH flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run test:browser
```

- `npm run check` is typecheck, unit tests and build (about 30 seconds).
- `npm test` is the simulation, the room-expiry script (which starts its own
  server) and about 25 smoke scripts (about 3 minutes). Never wrap it.
- `test:disposable` starts a throwaway server on port 3199, refuses if the port
  is busy, uses a temporary journal with no database or sign-in credentials, and
  stops only its own process.
- Never test against ports 3101, 3102 or 3103, or a public domain. Never `pkill`
  by pattern. One heavy job at a time: the machine has two cores and serves the
  live game.
- A browser timeout under load is a harness problem; re-run it alone first.
- Docs have their own check: `npm run docs:check` (links resolve, every wiki page is indexed).
- Evidence goes in `docs/verification/<date>-<topic>/`. Records are append-only.

## Where it lives

| Part | Code |
| --- | --- |
| Disposable wrapper | `standalone/test-disposable.mjs` |
| Smoke scripts | `standalone/smoke-*.mjs`, rules in `smoke-policy.mjs` |
| Simulations | `standalone/simulate-games.mjs`, `simulate-room-flows.mjs` |
| Browser checks | `standalone/browser-*.mjs` |
| Drills and load | `standalone/drill-resilience.mjs`, `load-harness.mjs`, `load-gahook-storm.mjs` |
| Unit tests | `packages/*/test`, `standalone/server/*.test.mjs`, `standalone/public/client/*.test.ts` |
| CI | `.github/workflows/ci.yml` (check, smoke, image) |

## Related

- [Hosting and deploys](hosting-and-deploys.md)
- [Security and limits](security-and-limits.md)
- [Quality area guide](../areas/quality.md)

## History

- 2026-08-26 — First security smoke script.
- 2026-09-08 — One baseline and a rule against production-port defaults (P00).
- 2026-09-12 — Real-browser harness and resilience drill (P12).
- 2026-09-19 — `test:disposable` wrapper added with the release-candidate overhaul.
- 2026-10-04 — Page written from the code.
