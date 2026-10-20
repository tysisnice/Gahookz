# Verification — dead room-asset exports removed (2026-10-21)

Branch: `agent/remove-dead-room-asset-exports` (from `main` @ `64b96b1`),
worktree `/mnt/storage/syncthing/Store/Projects/gahookz-worktrees/remove-dead-room-asset-exports`.

## What changed

- `standalone/server/room.mjs` — deleted the two exported functions
  `roomAssetChars` and `assertRoomAssetCapacity` (and their bodies). Nothing
  imported them; they were dead exports. `MAX_ROOM_ASSET_CHARS` is kept,
  because `standalone/server/media.mjs` imports it.
- `standalone/room-dead-exports.test.mjs` — new regression guard, in the style
  of `standalone/server-duplicate-keys.test.mjs` (it reads the source and
  asserts). It refuses `server/room.mjs` exporting `roomAssetChars` or
  `assertRoomAssetCapacity`, requires it to still export `MAX_ROOM_ASSET_CHARS`,
  and refuses any file under `standalone/` outside `standalone/legacy/` from
  importing the two names. Picked up by `npm run test:unit` via the
  `standalone/*.test.mjs` glob.
- `docs/areas/systems.md` — the matching "Known issues" bullet removed.
- `docs/backlog.md` — item moved from Engineering P2 to Checked and closed.
- `docs/CHANGELOG.md` — one entry under Unreleased / Developer.

## Why the byte check in `media.mjs` is the real cap

`roomAssetChars` summed the *character length* of stored data URLs across
players, questions and answers, and `assertRoomAssetCapacity` projected a new
value against `MAX_ROOM_ASSET_CHARS` (12,000,000). No route ever called either
function. The limit that actually runs is in `standalone/server/media.mjs`:
`storeRoomAsset` compares the decoded byte count against
`Math.floor(MAX_ROOM_ASSET_CHARS * 0.75)` = 9,000,000 bytes per room (the 0.75
accounts for base64 expansion of a data URL). So `MAX_ROOM_ASSET_CHARS` is the
constant the working cap is derived from and must stay; the two functions that
read it were the dead part.

## Commands and results (run in the worktree, `/usr/bin/node` v22.23.1)

```
$ PATH=/usr/bin:$PATH /usr/bin/node --import tsx --test standalone/room-dead-exports.test.mjs
tests 2, pass 2, fail 0

$ PATH=/usr/bin:$PATH /usr/bin/node --import tsx --test packages/*/test/*.test.ts standalone/server/*.test.mjs standalone/*.test.mjs standalone/public/client/*.test.ts
tests 252, pass 252, fail 0, duration ~2.2 s

$ PATH=/usr/bin:$PATH /usr/bin/node node_modules/typescript/bin/tsc -p tsconfig.server.json
(clean, exit 0) — proves nothing imported the removed exports

$ PATH=/usr/bin:$PATH /usr/bin/node scripts/check-docs.mjs
Documentation check passed (exit 0)
```

Negative control (run by the coding agent in scratch copies): re-adding
`export function roomAssetChars` to a copy of `room.mjs` made the export guard
fail, and re-adding `assertRoomAssetCapacity` to a copy of `media.mjs`'s import
made the import guard fail with `server/media.mjs must not import
assertRoomAssetCapacity`, proving the guard catches the defect rather than
passing vacuously.

## Limits

- No browser or smoke suite was run for this block; the change is a dead-export
  deletion covered by the unit suite, the new guard, and the server typecheck.
- `standalone/legacy/herd/snapshots/` was not touched: its frozen `room.mjs`
  and `media.mjs` keep their own copies of these names, and the guard's import
  scan deliberately skips `standalone/legacy/`.
- Production, beta and port 3102 were not queried or changed. Not merged, not
  pushed, not deployed.
