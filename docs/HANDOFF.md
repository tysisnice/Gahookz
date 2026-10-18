# Handoff — state of the project

**Written 2026-10-10 by Claude Code (orchestrator session of 7–9 October).**
Read this, then [`CLAUDE.md`](../CLAUDE.md) and the ledger in
[`docs/plans/2026-09-25-update.md`](plans/2026-09-25-update.md). This file is the
short version: where the project stands, what is half-finished, and what to do
next. The ledger is the detailed history; the backlog is
[`docs/backlog.md`](backlog.md).

## In one paragraph

Tyson's 25 September update is **built, merged, verified and pushed**: `main` is
`976627e`, every suite passes, and `npm run docs:check` is clean. The follow-up
batch he approved on 9 October (make deploys safe, then a small bug batch) was
**started and stopped at a usage limit**; both halves are saved as WIP branches
that are not verified and not merged. **Production is running older code than
`main`, from a tree that had uncommitted changes** — see below, it is the most
important thing on this page.

## The live services do not match `main`

Checked 2026-10-10 20:43 AEDT:

| | Revision | Notes |
| --- | --- | --- |
| `main` | `976627e` | Everything below is verified against this |
| Production (gahookz.com, :3102) | `abc6392241ce-dirty` | An **ancestor of `main`, 28 commits behind**, built 2026-10-08 23:59 from a tree with uncommitted changes |
| Beta (:3103) | `f15af0b9da5d` | Older still |
| Development (:3101) | bind-mounts the Store tree | So dev *is* current |

Production therefore **does not have** the work Tyson asked for on 8 October:
Classic Quiz showing picks again, Gahook effects Off/Mini, the Report button and
host Reports list, image-only Herd answers, chat and painting during Herd
writing, the narrower lobby column, the own-answer tile fix, or the Herd
moderation fix. Dev has all of it.

I did not deploy and did not build that image; the session's permission settings
refuse production deploys. Whoever deploys next should read
[the runbook, section 4](operations/runbook.md#4-deploy-only-when-tyson-asks)
first — **ideally after merging `agent/deploy-safety`**, which exists precisely
because the current script can end live games.

### Compose projects changed on 10 October

At about 13:31 AEDT on 2026-10-10 all three services were recreated under the
**single Compose project `gahookz-prod`** (`docker compose ls` shows
`gahookz-prod running(3)`), working directory
`/mnt/storage/syncthing/Store/Projects/gahookz`, with
`COMPOSE_PROJECT_NAME=gahookz-prod` in that folder's `.env`. Until then dev and
beta ran under the separate project `gahookz`. Container names are now
`gahookz-prod-gahookz-1` (production), `gahookz-prod-gahookz-beta-1`,
`gahookz-prod-gahookz-dev-1`.

**The hazard:** with one project and one `.env`, a bare `docker compose up -d`
in that directory brings up *all three*, production included. Documents that
describe two projects (`CLAUDE.md`, `SERVER-COMMANDS.md`, parts of the runbook)
are now out of date and should be corrected. I did not change any container.

## Half-finished work

Both branches are pushed to the Store repository and exist on the desktop.
Neither is verified; neither is merged. Resume each in its own worktree.

### `agent/deploy-safety` — WIP `58e8ba6`

Hardening `scripts/docker-deploy.sh` so a deploy can never silently end games.
**Appears done in the diff** (unverified): reads `activeRooms` from
`/api/health` and refuses without the metrics token; `trap`s that cancel the
drain on exit/interrupt; `GAHOOKZ_FORCE_REPLACE=1` escape hatch; uses
`GAHOOKZ_PROD_IMAGE` (default `gahookz:prod-local`) for the post-deploy image
check instead of the wrong `gahookz:local`; auto-tags
`gahookz:rollback-prod-<date>`; the five missing names added to `.env.example`;
`engines.node` raised to `>=24`.
**Still to do:** `scripts/docker-deploy.test.sh` (the stubbed `docker`/`curl`
test — not written); update runbook section 4 and `docs/areas/platform.md`;
run `bash -n`, the stub test and `npm run check`. Also fold in the Compose
single-project change above.

### `agent/small-fixes` — WIP `7e629d1`

**Done in the diff** (unverified): item 1, skipping while paused is refused
server-side and the Skip button is disabled with a tooltip; item 2, a
disconnected Herd writer no longer blocks Start (`fillUnwrittenHerdAnswers`
fills only absent writers' answers, the same way force-start does), with
`smoke-host-controls` extended.
**Not started:** install-app menu item (`usePwaInstall`); removing non-chat
subjects from the host Reports list (note `herd-answer` removal now needs
`questionId`); host-away notice overlapping the lobby banner; `/host` and
`/play` routes; `client/legal.js` missing from `SHELL_ASSETS`; an in-room link
to `/information`. The full brief is in the ledger's *Next step*.

## What to do next, in Tyson's order

1. Finish and merge **`agent/deploy-safety`**; correct the Compose-project
   documents while you are there.
2. **Rehearse a rollback on beta** (runbook section 5, Option 2, with
   `gahookz:rollback-beta-20261002`), then restore beta. Nobody has ever tested
   a rollback.
3. **Deploy production** — Tyson approved this on 8 October ("deploy whenever").
   Tag a rollback image first; the hardened script does it for you.
4. Finish **`agent/small-fixes`** and run the full matrix.
5. Then the rest of [`docs/backlog.md`](backlog.md): splitting `server.js`
   (~5,600 lines), `app.jsx` (~5,500) and `styles.css` (~11,500) is the item
   that most slows everything else down; see
   [the TypeScript plan](plans/typescript-migration.md).

Open questions for Tyson live in the vault, not here:
`Store/Gahookz questions.md`, `Store/Gahookz decisions explained.md` and
`Store/Gahookz todo for Tyson.md`.

## How to verify (desktop)

The laptop has two cores and runs the live game; tests time out there. Since
2026-10-07 agent work runs on Tyson's desktop, which reaches the laptop over the
direct cable as `ssh haukeye-laptop`:

- Orchestrator checkout `~/gahookz-dev` (remote `laptop`; `origin` is GitHub,
  pushing disabled); worktrees `~/gahookz-agent-worktrees/<name>`.
- Node 24 at `~/.local/opt/node-v24.13.1-linux-x64/bin` — put it first on
  `PATH`, the desktop's system Node is 22.
- Shared agent rules: `~/gahookz-agent-rules.md`. Screenshots Tyson sent:
  `~/gahookz-screenshots/`.
- Merge on the desktop → push to the laptop as `agent/orchestrator` →
  fast-forward the Store repository → push GitHub `main` from the laptop.
- Full matrix: `npm run check`, `npm test`, then `test:disposable` for
  `test:rooms`, `test:browser`, `test:browser:desktop-ui`, `mobile`,
  `navigation`, `herd-writing`, `herd-report`, `audio`, `arena`. Plus
  `npm run docs:check`.

**Never edit `~/Documents/Sync/Store` on the desktop** — it is the Syncthing
copy of the live tree, and dev reloads from it.

## Traps that cost this session time

- **`styles.css` merges.** Two branches appending rules conflict, and a
  union-merge once dropped a closing brace, silently disabling every rule after
  it. There is now a test that every stylesheet closes its braces — keep it.
- **The three stamped shell files** (`index.html`, `service-worker.js`,
  `vendor-bootstrap.js`) conflict on nearly every merge. Resolve with
  `git checkout --theirs` then `npm run build`, never by hand. The laptop's dev
  container rewrites them in the Store tree, so `git checkout --` them there
  before a fast-forward.
- **`node_modules` is a symlink in worktrees.** Never `git add -A`; never
  `npm ci` inside a worktree (it once broke every agent's tests at once).
- **Browser suites overwrite dated evidence.** `git checkout --
  docs/verification/2026-09-19-*` before committing.
- **Two orchestrators at once.** On 8 October a laptop session and this one
  built the same feature twice. Check `pgrep -af claude` on the laptop and
  `git log` on both sides before starting.
- **The laptop's 8 TB USB drive disconnected** on 2026-10-08 17:58 and came
  back as a different device; the dev container kept the dead mount and served
  a white screen until it was restarted. If dev 404s everything, check
  `docker exec … ls standalone/public` for I/O errors first.
