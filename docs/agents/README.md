# Agent working agreement

Gahookz is maintained by a small team of coding agents, coordinated by an
orchestrator and supervised by the owner, Tyson. This file is the contract
every agent follows. Each role has a short profile beside it; the profile says
*what* you own, this file says *how* everyone works.

## Roles

| Profile | Owns | Typical work |
| --- | --- | --- |
| [orchestrator](orchestrator.md) | the plan, dispatch, merging, final verification, reports | turning Tyson's notes into briefs; integrating agent branches |
| [ui-shell](ui-shell.md) | UI 1 — frame, navigation, menus, dialogs, tooltips, design tokens, PWA | layering bugs, back-button behaviour, new overlay types |
| [ui-lobby](ui-lobby.md) | UI 2 — welcome, join, profile, lobby, rules, game setup, question/answer creation, drawing | mobile layout of setup screens, pickers, forms |
| [ui-game](ui-game.md) | UI 3 — live rounds, host controls, reveal, leaderboard, finale, party screen | in-round layout, reveal presentation, vote privacy in the UI |
| [game-flow](game-flow.md) | phases, modes, rules, timers, scoring, question selection | new rules, pacing, scoring changes with fixtures |
| [social](social.md) | Gahooks, forms, custom Gahooks, 1v1 arena, chat, whiteboard, Dash | arena rules, new Gahook behaviour |
| [systems](systems.md) | rooms, lifecycle, HTTP/SSE, admission, auth, media, moderation, health | room expiry, reconnects, rate limits, security fixes |
| [content](content.md) | prompt catalogue, suggestions, autofill | new prompts, prompt styles, content checks |
| [audio-art](audio-art.md) | music, sound effects, character art, tutorial art, icons | new Gahook characters, sound design, illustrations |
| [accounts](accounts.md) | sign-in, career stats, entitlements, PostgreSQL | account features, persistence, privacy |
| [platform](platform.md) | build, dev server, Docker, CI, deploy tooling, hosting | build changes, CI, release tooling (never a live deploy unasked) |
| [quality](quality.md) | test harnesses, fixtures, browser checks | new coverage, flaky test repair, regression triage |
| [docs-steward](docs-steward.md) | `docs/`, the wiki, CLAUDE.md/README accuracy | keeping every document true after a change |

Area knowledge lives in [`docs/areas/`](../areas/README.md); the ownership map
there decides which role edits which file.

## Before you start

1. Read [`CLAUDE.md`](../../CLAUDE.md) completely. Its five rules are absolute:
   guest play needs no account, never deploy unasked, never run stateful tests
   against production, never commit secrets, never `pkill` by pattern.
2. Read this file, your profile, your area guide, and the wiki pages for the
   features you will touch ([wiki index](../wiki/README.md)).
3. Run `git status --short` and `git log --oneline -5`. If the tree contains
   changes you did not expect, **stop and report** rather than reverting,
   stashing or committing somebody else's work.
4. Read the code you will change, including its callers. Function names are
   more reliable than line numbers.

## Where to work

The main checkout lives in a Syncthing folder that is **bind-mounted into the
development container**: saving a file there hot-reloads `dev.gahookz.com`.
That is useful for the orchestrator and for Tyson's review, and dangerous for
several agents at once.

- When an orchestrator runs agents in parallel, each agent gets its own
  worktree outside the Syncthing folder:

  ```bash
  bash scripts/agent-worktree.sh <name>     # → ~/gahookz-worktrees/<name>, branch agent/<name>
  ```

  Work only inside the path you were given. `node_modules` is a symlink to the
  main checkout; do not run `npm install` or `npm ci` in a worktree.
- A single agent working alone may work in the main checkout on a feature
  branch, knowing every save reloads dev.
- Commit locally on your branch when a coherent slice is verified. **Never
  push, never merge into `main`, never force-push.** The orchestrator merges.

## Verifying — one heavy job at a time

The server machine has two CPU cores, little free memory, and runs the live
game. Every build or test run must hold the shared lock so that only one runs
at a time across all agents, and so the disposable port 3199 is never
contested:

```bash
flock /tmp/gahookz-verify.lock npm run check                                   # typecheck + unit tests + build (~30 s)
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run standalone:smoke:<name>
flock /tmp/gahookz-verify.lock npm test                                        # full stateful suite (~3 min)
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run test:browser # headless Chromium
```

- Never start a server by hand for tests and never wrap `npm test` in
  `test:disposable`; it manages its own servers.
- Never point a test at port 3101, 3102, 3103 or any public domain.
- Run the focused suites for your area while iterating. Run `npm run check`
  and the smoke scripts for every file you touched before you hand off. The
  orchestrator runs the full matrix after merging.
- A layout change is not verified by a build. Take screenshots at a phone size
  (390×844 and 360×740) and at desktop size with the Puppeteer that is already
  installed, against a disposable server, and look at them. Save the ones that
  prove your change under `docs/verification/<date>-<topic>/`.

## Changing the code

- `app.jsx` (5,500 lines), `server.js` (5,400) and `styles.css` (10,700) are
  shared by several areas. Make targeted edits to the components your area
  owns; never reformat, reorder or rewrite them wholesale. New self-contained
  features belong in a new module (`client/<feature>.jsx`, `client/<feature>.css`,
  `server/<feature>.mjs`) that the monolith imports.
- Match the surrounding style: plain React function components, the existing
  Redux-style reducer, server authority for anything that affects scoring,
  privacy or other players. Keep comments at the density of the code around
  them and explain *why*, not *what*.
- Generated browser files are gitignored build products
  (`standalone/public/app.js`, `client/*.js` except the hand-written
  `audio.js` and `gahook-forms.js`, `release.json`). Edit the source and run
  the build. Clean with `npm run clean:generated`, never with a glob.
- The build rewrites the release hash inside the tracked `index.html`,
  `service-worker.js` and `vendor-bootstrap.js`. CI requires them to match the
  committed source, so commit them after a final build. Conflicts in those
  three files are resolved by rebuilding, not by hand.
- Many smoke scripts assert on source text. When you legitimately change the
  code they describe, update the assertion to describe the new behaviour.
  Never delete or weaken a check just to get a pass; if a behavioural test
  fails, the code is wrong until proven otherwise.
- Guest play stays account-free, room state stays server-authoritative, and
  hidden information (answers, votes, authors, keys) must not reach a client
  before the reveal — enforce it on the server, not by hiding it in the UI.
- Crossing into another area is allowed when a feature genuinely needs it.
  Keep the edit minimal and list it under *Cross-area edits* in your handoff.

## Documentation is part of the change

A change is not finished until the documents describe it:

- Update your area guide if a file, invariant, rule or command changed.
- Update the feature's [wiki page](../wiki/README.md) (numbers, rules, where
  it lives) and add one line to its *History*.
- Add a line to [`docs/CHANGELOG.md`](../CHANGELOG.md) under *Unreleased*.
- Never document a plan as if it were shipped behaviour.

## Handoff

Finish every session with this block, in your final message and — for work
that spans sessions — in the relevant plan or verification README:

```text
Agent / branch / worktree:
What changed (user-visible):
Files changed and why:
Cross-area edits:
Tests run (exact commands and results):
Screenshots / evidence paths:
Docs updated:
Decisions and interpretations (anything the brief left open):
Known issues / follow-ups:
Production touched: no
```

## Stop and ask instead of guessing when

- a change would require credentials, a database, an account, a purchase or
  anything outside this machine;
- a brief conflicts with a rule in `CLAUDE.md` or with a test that encodes a
  deliberate owner decision;
- you would have to revert or overwrite work you did not write;
- an unrelated test fails in a way you cannot explain.

Report precisely what blocked you and what you already verified. Preserving
the state of the work is always better than improvising around a rule.
