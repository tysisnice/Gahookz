# Verification — Reduce Gahook effects split from mute (2026-10-21)

Branch: `agent/reduce-mute-split` (worktree `~/gahookz-worktrees/reduce-mute-split`,
from `main` @ `92bd7f9`). Closes the backlog P2 line
"'Reduce Gahook effects' also mutes sound in the Lobby rules and join menu."

## What changed

- `standalone/public/app.jsx` — `useReducedEffects()` setter now calls only
  `setEffectsReducedPreference(next)`; the `setEffectsMuted(next)` call is
  removed (and the now-unused `setEffectsMuted` import with it). Getter
  semantics unchanged: `reduced = muted || reducedPreferred`, so mute still
  counts as reduced effects. `client/preferences.jsx` untouched.
- `standalone/public/app.jsx` — `PlayerSettingsDialog`: the Reduce switch help
  no longer claims "the sound is muted"; it now says sound is untouched and
  belongs to the Mute and Music switches.
- `standalone/smoke-party-view.mjs` — the reduction-control assertion no longer
  mentions muting, and a new `assertNotIncludes` on the `useReducedEffects`
  function section refuses `setEffectsMuted`.
- New regression guard `standalone/reduce-mute-split.test.mjs`: slices the
  `useReducedEffects` section out of `app.jsx`, requires
  `setEffectsReducedPreference` and refuses `setEffectsMuted`.
- Docs: changelog line under Unreleased → Players; backlog P2 line moved to
  Checked and closed; known-issue bullets removed from
  `docs/areas/audio-art.md` and `docs/areas/ui-shell.md`;
  `docs/wiki/preferences-and-accessibility.md` now says Reduce is reduce
  everywhere, mute is its own switch, mute still counts as reduced.

## Commands run (all in the worktree; no server started)

| # | Command | Result |
| --- | --- | --- |
| 1 | `node --test standalone/reduce-mute-split.test.mjs` | 1 pass / 0 fail |
| 2 | Negative control: `setEffectsMuted(next);` re-added to the setter — `node --test standalone/reduce-mute-split.test.mjs` | 0 pass / 1 fail (exit 1, "useReducedEffects must not call setEffectsMuted") |
| 2 | Negative control: same re-added line — `node standalone/smoke-party-view.mjs` | fail (exit 1, "The shared reduction hook must not mute sound … (unexpected setEffectsMuted)") |
| 2 | Line removed again — both commands re-run | guard 1 pass / 0 fail; smoke exit 0 |
| 3 | `node standalone/smoke-party-view.mjs` | pass (exit 0, `ok: true`) |
| 4 | `npm run test:unit` | 250 pass / 0 fail (249 before the new guard) |
| 5 | `node standalone/build-client.mjs` | success (exit 0, release `2e544d33f0fabce4`) |

Also run per CLAUDE.md: `npm run typecheck` — exit 0.

## Production

No production, beta or port-3102 service was touched; no deploy, no test
server, no stateful smoke suite run.

## Generated shell hashes

`node standalone/build-client.mjs` regenerated the tracked stamped shell files
(`index.html`, `service-worker.js`, `vendor-bootstrap.js`) for release
`2e544d33f0fabce4`, because `app.jsx` changed. This is the same deterministic
churn pattern recorded on main in `9125a7a`; the tree matches its own build
output.
