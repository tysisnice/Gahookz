# Changelog

User-visible and developer-visible changes, newest first. Every change adds a
line under **Unreleased**; the orchestrator moves them under a dated heading
when the work is merged to `main`. Link the wiki page for details instead of
repeating them here.

## Unreleased — 2026-09-25 update

### Developer
- Project divided into eleven [areas](areas/README.md) with an agent
  [profile](agents/README.md) each; parallel agents work in worktrees
  (`scripts/agent-worktree.sh`) and serialise builds with a shared lock.
- `standalone/public/client/controls.js` is now ignored like every other
  generated browser module; `docs/archive/` and `.claude/agents/` are tracked.
- Fixed a lost closing brace in `styles.css` (the `agent/lobby-creation`
  merge dropped it after `.question-copy-head .question-author-line span`),
  which nested the last ~330 lines of the stylesheet inside that rule so none
  of them applied. New `npm run test:browser:herd-writing` covers Herd answer
  writing, voting and the reveal.
- `smoke-social-creation` asserted on chat drawing code that moved to the
  lobby wall on 2026-09-19; the three stale assertions now describe the wall.

### Players
- Tapping anywhere off the lobby wall finishes drawing, as the Done button
  does ([Lobby painting](wiki/lobby-painting.md)).
- Herd: while writing answers, each player's progress ("0/4 answered", then
  "Done") sits in their player card instead of a separate list, and every
  answer can carry an uploaded or drawn picture, shown in the vote and at the
  reveal ([Herd](wiki/herd.md)).

## 2026-09-19 — Quiz/Herd overhaul (P00–P12), desktop and mobile UI, arena 1v1, hosting

Merged to `main` as `78a1382` and running in production as `e3b6dde`. See the
[implementation plan](../IMPLEMENTATION-PLAN.md) and the
[verification records](verification/) for that work.
