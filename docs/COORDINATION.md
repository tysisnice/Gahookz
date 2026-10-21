# Session coordination and owner feedback

Tyson authorized this workflow on 2026-10-21. It applies to the existing tmux `gahookz` session; do not start a duplicate orchestrator.

## One authority per kind of information

- **Execution order:** `docs/ROADMAP.md`.
- **Detailed approved requirements and acceptance:** `IMPLEMENTATION-PLAN.md`; `PLAN-PROGRESS.md` tracks incomplete stages. Historical ledgers remain evidence, not a competing next-task list.
- **Current session handoff:** `docs/HANDOFF.md` (now, next, blockers, exact verification and live/source distinction).
- **Issues:** `docs/backlog.md`; close only with evidence, keep unknowns explicit.
- **Owner-readable view:** `/Vault/Assistant/Projects/Gahookz/Roadmap.md` is a summarized view with an absolute repository reference, not a fork of the implementation plan.
- **Communication:** reports in `/mnt/storage/syncthing/Store/User`, plus a canonical Vault report/task. Do not put normal owner requests in unrelated Store-root notes or scattered project-root to-do lists.

## Working boundaries

New project work, worktrees and evidence belong inside `/mnt/storage/syncthing/Store/Projects/gahookz` (e.g. `worktrees/<branch-name>`). Keep nested worktrees and their dependency symlinks out of commits; stage named files only. Existing worktrees outside the project remain preserved until an explicit safe relocation. Never delete/prune worktrees, branches or stashes as tidying. The dev container bind-mounts the main checkout: isolated work first, verified integration second. No deploy, service/container restart, proxy/DNS/certificate/credential change without current-chat approval.

## At every stop

Update the handoff and current roadmap checkboxes with verified facts: task ID/owner, branch/worktree/commit, what passed or failed, remaining acceptance, and the next concrete slice. A stopped session, idle prompt, test monitor, usage limit and user-input wait are different states; name the actual one.

## Coder bot

Keep one or more genuinely independent, bounded tasks ready (tests, evidence-path cleanup, content checks or local docs corrections). Include exact files, isolated `coder/*` branch/worktree inside this project, acceptance command, scope limits and a stop condition. Coordinator routes through `taskctl.py` and the coder profile; merely queueing a note does not launch work. Never treat a plan/log as a tested implementation. Claude reviews the diff and reruns relevant tests before integrating. No overlapping ownership of the same files and no recursive uncontrolled spawning. If no useful independent task exists, say so rather than invent busywork.

## Six-hour coordinator pass

At 02:00, 08:00, 14:00 and 20:00 Australia/Melbourne, coordinator:

1. Read its current profile README, shared policy, and the current Gahookz coordination/check-in note.
2. Read canonical Vault task state with `python3 /Vault/.haukeye/scripts/taskctl.py list`, plus Store/User reports and any new feedback. Resolve existing project tasks before creating duplicates.
3. Capture tmux and git; compare work with ROADMAP/HANDOFF. Do not interrupt an active turn, submit an unrelated typed draft or change Tyson's session settings.
4. Keep approved work moving when genuinely idle; resume quota stops only after reset; report errors instead of blindly retrying. Ask for stale records to be updated.
5. Translate real owner blockers into one coherent Vault Review task with `Todo: false`, concise Summary and the precise decision/test. Separate current blockers from optional later choices. Never infer operational approval from a tick alone.
6. Write a compact combined **Gahookz report** with `## Gahookz` and `## Arena`: current task → next task → roadmap link. If nothing needs Tyson, keep each section one or two sentences, no repeated warning wall or notification task.
7. Retain detailed evidence in the repo/Vault output. Publish the canonical report to the login-protected reports hub where available; report an actual publishing failure honestly.

## Owner report checkbox and replies

Store/User report frontmatter has `Todo: false`, `Report-ID`, and a link/path to the canonical Vault report and any Review task. Tyson can add a response and tick Todo. That checkbox requests **feedback pickup/read acknowledgment**; it does not approve a deploy, purchase, secret change or task completion by itself.

The coordinator records report/feedback hashes and the last processed state in its own workspace. On each pass it reads checked/new replies, preserves them verbatim, routes any actual instructions into the existing canonical Vault task (or one new coherent task if absent), and delivers project instructions to idle Claude. Deduplicate by Report-ID plus feedback hash. Do not overwrite user replies or reset their checkbox. Unchanged checked reports are only acknowledged once. In canonical Vault Review: unchanged checked Todo means completion request; changed text plus checked Todo means resume under Task Protocol. Do not give the Store copy a competing execution lifecycle.

Use ordinary absolute paths for Store artifacts; never Obsidian wikilinks that create fake Store folders inside `/Vault`.
