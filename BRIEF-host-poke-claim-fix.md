# Task: close the null-hostPlayer host-poke abuse vector

Context: this branch continues the investigation recorded in the probes
`standalone/probe-gahook-spam.mjs`, `probe-gahook-spam-live.mjs` and
`probe-gahook-spam-lobby.mjs` (read them first). Verified finding: in
`standalone/server.js` the `/api/host/poke` route (~line 937) only applies the
per-question claim gate when `hostPlayer = getPlayerByCredential(room, room.hostKey)`
is non-null AND the phase is in `LIVE_GAME_PHASES` (`reading`, `answering`, `reveal`).
When the host created the room but never joined the lobby, `hostPlayer` is null,
the claim gate is skipped entirely, and the host can poke a connected player an
unlimited number of times during a live phase, driving them to `ultimate` with no
per-question Gahook limit. That is the abuse vector to close.

## Required change (server)

In the `/api/host/poke` branch of `standalone/server.js`:

1. When `room.phase` is in `LIVE_GAME_PHASES` and `hostPlayer` is null (host not
   joined), REJECT the poke with `{ ok: false, error: "Join the game before Gahooking during a round." }`
   before calling `pokePlayer`. Do not change behaviour for non-live phases
   (lobby/building/finished host pokes keep working as today).
2. Keep the existing claim-gate behaviour for a joined host exactly as-is
   (one claim per question, release on failure, self-target and disconnected-target
   errors unchanged).
3. Fix the misleading debug label: the `GAHOOKZ_DEBUG_SPAM` else-branch logs
   `claimOk: "n/a (phase not live)"` even when the phase IS live and the real
   reason is that the host is not joined. Make the label reflect the actual reason
   (e.g. `"n/a (host not joined)"` vs `"n/a (phase not live)"`).

## Required change (regression test)

Add `standalone/smoke-host-poke-claim.mjs`, following the style of
`standalone/smoke-host-controls.mjs` (HTTP against `GAHOOKZ_BASE_URL`, assert both
status code and body). It must cover:

A. Host creates a room, players join, game starts, the host NEVER joins the
   lobby: a `/api/host/poke` during a live phase returns a non-2xx status with
   `ok: false` and a non-empty error, and the target's `gahookSpamCount` (or the
   state snapshot equivalent) does not increase. Repeat a few times — every poke
   must be refused.
B. Host joins the lobby: the first live-phase poke on a target succeeds
   (`ok: true`), and a second poke on any target during the same question is
   refused with the "already used your Gahook for this question" error.

Wire the new script into the disposable harness the same way the other smoke
scripts are wired (check `package.json` scripts and how `standalone/test-disposable.mjs`
is used; add a `standalone:smoke:host-poke-claim` script and include it in the
shared smoke chain only if that is a clean one-line addition consistent with the
existing pattern).

## MANDATORY verification (do not finish until this passes)

Run, from this directory:

    node standalone/test-disposable.mjs node standalone/smoke-host-poke-claim.mjs

It must exit 0 with the assertions passing. If it fails, fix and re-run until it
passes. Also run `node --check standalone/server.js` and
`node --check standalone/smoke-host-poke-claim.mjs`.

Summarise the change and paste the final passing test output when done.
