# Quality — area guide

Verified 2026-10-04 against commit `27da7b6` on branch `agent/docs-core`. Harness
descriptions come from reading each script's source and `package.json`; I did
not run the suites for this guide.

## Purpose

Quality keeps the regression net strong and honest: unit tests, stateful smoke
scripts, simulations, real-browser checks, load and resilience drills, contract
fixtures, and the habit of recording what was and was not verified. Every
harness owns its server lifetime and never targets ports 3101-3103 or a public
domain (rule 3 in `CLAUDE.md`). Each area adds its own cases here; Quality owns
the harnesses and the discipline.

## What players see

Nothing directly; they see the absence of regressions. The net exists because a
green build proves only that the JSX parses, and several shipped defects (a
Pause that answered 500 in every live phase, a mobile layout where a chat
bubble covered a player banner) were invisible to unit tests.

## Code map

| Path | What it is |
| --- | --- |
| `package.json` scripts | Every entry point below |
| `standalone/test-disposable.mjs` | The wrapper that owns the one disposable server |
| `standalone/smoke-*.mjs` (26 files) | Stateful HTTP smoke scripts and source-text checks |
| `standalone/smoke-policy.mjs` | Pure rules about the smoke suite itself (no production-port defaults, skip conflict copies) |
| `standalone/simulate-games.mjs`, `simulate-room-flows.mjs` | Engine replay; whole games over HTTP |
| `standalone/browser-*.mjs` (6 files) | Real Chromium via Puppeteer |
| `standalone/load-harness.mjs`, `load-gahook-storm.mjs` | Load measurement as a client |
| `standalone/drill-resilience.mjs` | Local failure drills |
| `standalone/capture-fixtures.mjs`, `packages/contracts/test/fixtures/` | Synthetic snapshot fixtures |
| `standalone/verify-postgres-outbox.mjs`, `verify-journal-volume.mjs` | Docker-based checks owned with accounts; never part of `npm test` |
| `standalone/render-audio-samples.mjs` | Renders sounds for listening (`npm run audio:samples`) |
| `packages/*/test`, `standalone/server/*.test.mjs`, `standalone/*.test.mjs`, `standalone/public/client/*.test.ts` | 27 unit-test files |
| `docs/verification/` | Evidence records |

## How it works

### The disposable wrapper

`npm run test:disposable -- <command>` (`test-disposable.mjs`) probes
`127.0.0.1:3199` and refuses to start if anything is listening. It then starts
`standalone/server.js` there with a minimal environment: instance id
`disposable-review`, a throwaway career journal in a temp directory,
`GAHOOKZ_DRAIN_TIMEOUT_MS=0`, no database or OAuth credentials, and
`GAHOOKZ_MAX_ACTIVE_ROOMS=64`. The cap is raised because the shared suite runs
25 scripts against one lifetime and would otherwise exhaust the production
default of 32. It waits for `/api/health` to return that instance id, sets
`GAHOOKZ_BASE_URL` and `GAHOOKZ_TEST_BASE_URL`, runs the command, then stops
exactly its own child (SIGTERM, SIGKILL after 5 s) and deletes the scratch
directory. `GAHOOKZ_BROADCAST_FLOOR_MS` and `GAHOOKZ_MAX_ACTIVE_ROOMS` pass
through if set, so a load run can compare builds.

`npm test` is different: it manages its own lifetimes (see below), so never wrap
it. Never start a server by hand, and never `pkill` by pattern.

### The suites

| Command | What it runs | Time |
| --- | --- | --- |
| `npm run check` | `typecheck`, `test:unit`, `build` | about 30 s |
| `npm test` | `test:simulation`, then `standalone:smoke:room-expiry` (own server), then `test:disposable` around the 25 scripts in `standalone:smoke:shared` | about 3 min |
| `npm run test:disposable -- npm run test:rooms` | `simulate-room-flows.mjs` | unmeasured |
| `npm run test:disposable -- npm run test:browser` | `browser-flow.mjs` | unmeasured |
| `npm run test:disposable -- npm run test:browser:<name>` | `desktop-ui`, `mobile`, `arena`, `navigation`, `audio` | unmeasured |
| `npm run test:disposable -- npm run drill:resilience` | `drill-resilience.mjs` | unmeasured |

### What each harness proves, and what it does not

| Harness | Proves | Does not prove |
| --- | --- | --- |
| `test:unit` (27 files) | Pure logic: scoring, game engine phases and replay, Herd engine, contracts and fixtures, admission buckets, route-policy coverage, host-presence decisions, backpressure, transport, career outbox, accounts helpers, content catalogue, music, back-stack, `net.ts` | Anything involving a live server or browser |
| `typecheck` | Strict TypeScript for contracts, server and web `.ts` | `.jsx` is outside strict TypeScript |
| `build` | Every `.jsx` parses and bundles | That the screen renders or behaves |
| Server smoke (`smoke-security`, `roles`, `regressions`, `host-controls`, `room-rules`, `round-presets`, `mode-settings`, `majority-flow`, `herd-flow`, `arena-lifecycle`, `social-media`, `gahooks`, `finals`, `dash`, ...) | Real HTTP behaviour against a real server: access control, headers, snapshots, host controls through every phase, scoring, room rules, chat and media limits | Layout, animation, or anything a browser does |
| `smoke-room-expiry` | Room expiry, the abandon grace, host-away promotion after (not before) the grace, host return cancelling it; spawns its own server on 3199 | Behaviour across a real restart |
| Source-text smoke (`smoke-layout`, `onboarding`, `party-view`, `information`, `pwa`, `deployment`, parts of `desktop-ui`, `finals`, `gahooks`, `dash`, `social-creation`, `herd-flow`) | Structural rules written down: breakpoints exist, copy and controls are declared, shell references share one release, no production-port default, container hardening | That the thing works. See below. |
| `smoke-prompt-library` | The prompt banks are imported and validated rather than counted by regular expression | Quality of the wording |
| `simulate-games` (`test:simulation`) | Thousands of seeded games through the real scoring and assignment code (default 5000, `GAHOOKZ_SIMULATION_GAMES`, 100-25000); invariants hold | The server's phase machine |
| `simulate-room-flows` (`test:rooms`) | Complete games over HTTP for quiz, majority and herd at 4, 8, 12 and 20 players | Browser behaviour |
| `browser-flow` | The real client in Chromium: a room that fills in live, an answer that registers, a reload that reconnects | Pixel layout beyond what it measures |
| `browser-mobile-ui`, `browser-desktop-ui`, `browser-navigation` | Geometry at real viewports: nothing overlaps, tooltips stay on screen, menus sit above the chat button, phone menus open as an overlay; screenshots are saved | Real devices, assistive technology |
| `browser-arena-1v1` | Two browser contexts play a duel; the Gahook button, escalating presses and mini Gahooks render | Feel on a phone |
| `browser-audio-cues` | Behaviour of sound cues and the music switch against the built audio runtime: first snapshot silent, one cheer at game end, mute silences everything | How anything sounds (`audio:samples` renders files for a human) |
| `drill-resilience` | A reader that never drains is cut off; reconnection after a dropped stream; the career journal survives a restart (tested on the outbox module directly); the server reports its drain state | An actual drain or a real database. Drill 4 only reads the drain flag. It needs a disposable server, so wrap it. |
| `load-gahook-storm` / `load-harness` | Fan-out latency and health-probe latency for one room of N players Gahooking at once, as a client over HTTP and SSE (`--players 15`) | Production capacity |
| `capture-fixtures` | Writes synthetic, credential-free snapshots for each role and phase into `packages/contracts/test/fixtures/` | Nothing; it produces inputs |

### Source-text assertions are tripwires

A source-text check reads `.jsx`, `.css` or `.js` and asserts a string is
present. It catches "someone deleted the breakpoint" and "someone put the
production port back as a default". It cannot catch "the button exists but does
nothing". When a refactor legitimately moves code (the reveal moved from
`app.jsx` into its own module), the failing assertion should be updated to read
the whole client, as `smoke-finals` and `smoke-herd-flow` now do. Never weaken
an assertion just to turn the run green. Decide whether the code or the test is
wrong, and say which in the handoff.

### The host and the lock

The machine has two cores and little free memory and also serves the live game,
so every heavy job runs as `flock /tmp/gahookz-verify.lock <command>` with
`PATH=/usr/bin:$PATH` for Node 24. Chromium is the sensitive part. A cold
start on this host has taken 43 s against Puppeteer's 30 s default, and a warm
start takes 2 s. `browser-mobile-ui`, `desktop-ui`, `navigation`, `arena` and
`audio` launch with a 120 s timeout. `browser-flow` launches with 60 s and
retries once, because a stray browser from an earlier run can stall the
debugger socket. A browser timeout under load is a harness problem; re-run it
alone before concluding anything.

### Evidence conventions in `docs/verification/`

Each piece of work leaves a record: `docs/verification/<date>-<topic>/` with a
`README.md` (scope, branch, exact commands, what was and was not touched),
screenshots, and `raw/` command output. The 2026-09-25 update uses one folder
with a record per area (`<area>.md`) and evidence beside it (`<area>/`).
Records are append-only. Failures and retries stay in the record; a later green
run does not erase an earlier failure.

Some browser scripts write screenshots to fixed folders: `browser-arena-1v1` and
`browser-navigation` write into `2026-09-25-update/`, `browser-mobile-ui` writes
its lobby-setup shots there but its main shots into `2026-09-19-mobile-ui`, and
`browser-desktop-ui` writes into `2026-09-19-desktop-ui`. Commit re-captures only inside the current update's
folder, and restore the historical ones with `git checkout -- docs/verification/2026-09-19-*`.

## Invariants

- Every harness uses a disposable server on 3199 or owns its own; never 3101,
  3102 or 3103, never a public domain. The browser, load, drill and fixture
  scripts refuse production ports or `gahookz.com` outright (checked by reading
  their guards; `browser-audio-cues` uses no server).
- No smoke file may default `BASE_URL` to port 3102 (`smoke-deployment` fails
  the suite if one does).
- A failing test is never "fixed" by weakening it.
- The wrapper supplies no database or OAuth credentials, so nothing in
  `npm test` exercises PostgreSQL or Google sign-in; the `verify-*` scripts
  cover the outbox separately.
- Evidence is append-only; historical folders are restored, not rewritten.

## Tests

```bash
PATH=/usr/bin:$PATH flock /tmp/gahookz-verify.lock npm run check
PATH=/usr/bin:$PATH flock /tmp/gahookz-verify.lock npm test
PATH=/usr/bin:$PATH flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run test:rooms
PATH=/usr/bin:$PATH flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run test:browser
PATH=/usr/bin:$PATH flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run drill:resilience
```

One heavy job at a time. Run the focused script for the area you touched while
iterating (for example `npm run test:disposable -- npm run standalone:smoke:security`).

## Common changes

- **Add a smoke script:** name it `smoke-<topic>.mjs`, default its URL to
  `http://127.0.0.1:3199`, add an `npm` entry, and append it to
  `standalone:smoke:shared` so `npm test` runs it.
- **Add a case for a new endpoint:** include the forbidden case (a non-host key,
  a banned key, a wrong password), not only the happy path.
- **Add a browser check:** launch Chromium with a 120 s timeout, refuse
  non-disposable URLs, write screenshots into the current update's folder.
- **Record a run:** put exact commands and results in the area record under
  `docs/verification/`, including failures and the retry that followed.

## Known issues

- `docs/agents/systems.md` and the systems verify list show `drill:resilience`
  without the disposable wrapper; the script needs a server on 3199 and does
  not start one.
- `browser-flow` keeps a 60 s launch timeout with one retry while the other
  browser scripts use 120 s.
- Run times for `test:rooms`, the browser suites and the drill are unmeasured here.
- Several smoke scripts are mixed: HTTP assertions beside source-text ones. A
  failure message does not always say which kind it was.

Live backlog: [`../backlog.md`](../backlog.md).
