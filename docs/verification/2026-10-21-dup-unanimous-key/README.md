# Verification — duplicate `unanimous` key removed (2026-10-21)

Branch: `agent/dup-unanimous-key` (from `main` @ `b9547ca`), worktree
`/mnt/storage/syncthing/Store/Projects/gahookz-dup-unanimous`.

## What changed

- `standalone/server.js` — `publicMajorityResults` set `unanimous` twice (the
  second occurrence sat after `authorBonusValue` and silently shadowed the
  first). The dead second key is deleted; one `unanimous:` remains.
- `standalone/server-duplicate-keys.test.mjs` — new regression guard: slices
  the `publicMajorityResults` function body by brace counting (strings and
  comments stripped) and asserts no top-level key of the returned object
  appears twice. Picked up by `npm run test:unit` via the
  `standalone/*.test.mjs` glob.
- `docs/backlog.md` — item moved from Engineering P2 to Checked and closed.
- `docs/CHANGELOG.md` — one entry under Unreleased / Developer.

## Commands and results (run in the worktree, Node v26.7.0)

```
$ node --check standalone/server.js
(clean)
$ node --import tsx --test standalone/server-duplicate-keys.test.mjs
tests 1, pass 1, fail 0
$ npm run test:unit
tests 249, pass 249, fail 0, duration ~1.0 s
```

Negative control (run by the coding agent in a scratch copy): re-adding the
duplicate made the guard fail with
`duplicate keys in publicMajorityResults: unanimous`, proving it catches the
defect rather than passing vacuously.

## Limits

- No browser or smoke suite was run for this block; the change is a dead-key
  deletion inside an existing object literal, covered by the unit suite and
  the new guard.
- Production, beta and port 3102 were not queried or changed. `/Vault` was
  read-only. Not merged, not pushed, not deployed.
