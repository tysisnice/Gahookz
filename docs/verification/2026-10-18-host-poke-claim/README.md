# Host Gahook claim gate: a host who never joined could spam a live round

- Branch / commits: `agent/host-poke-claim-fix`, `c02437c`…`ca0b74d`, merged to
  `main` 2026-10-18. Cleanup commit follows in the same merge.
- Production touched: **no**. Verified against disposable servers on
  `127.0.0.1:3199` only.

## The defect

`/api/host/poke` in `standalone/server.js` applied the per-question claim gate
only when the host was **also a joined player**:

```js
const hostPlayer = getPlayerByCredential(room, room.hostKey);
if (hostPlayer && LIVE_GAME_PHASES.includes(room.phase)) { …claim gate… }
```

A host who created the room but never joined the lobby has no `hostPlayer`, so
in `reading`, `answering` and `reveal` the whole gate was skipped: no
one-Gahook-per-question claim, no connected-target check, no self-target check.
Such a host could Gahook one connected player without limit, driving them
through Ultimate Gahook and into GET GOT during live play.

Hosting without joining is a normal way to play — the host screen on a TV with
everyone on phones — so this was reachable in an ordinary room, not a contrived
one.

## The fix

During a live phase, a host who is not a joined player is refused:

> Join the game before Gahooking during a round.

Non-live phases (`lobby`, `building`, `finished`) keep the ungated host Gahook,
which is where the lobby spectacle lives. A joined host is unchanged: one claim
per question, released if the poke itself fails.

## The regression test

`standalone/smoke-host-poke-claim.mjs`, in the shared smoke chain as
`standalone:smoke:host-poke-claim`. It covers both halves over real HTTP:

- an unjoined host's live-phase poke is refused every time, and the target's
  Gahook state does not move;
- a joined host's first live-phase poke succeeds and the second during the same
  question is refused with the already-used error.

Result: `{ "ok": true, "unjoinedHostLivePoke": "refused", "joinedHostClaimGate": "one per question" }`.

## Why `smoke-gahooks` moved its spam assertions to the lobby

`smoke-gahooks` drove Ultimate Gahook and GET GOT by spamming `/api/host/poke`
as an unjoined host in a live round — that is, **through this hole**. With the
hole closed those assertions cannot run in a live phase, so they now run in the
lobby, where GET GOT carries no score penalty. That is a real loss of coverage
and it is recorded here rather than hidden: the live-phase GET GOT penalty of
−1,000 points is no longer asserted anywhere.

## The finding that loss exposes: live GET GOT is unreachable

Walking the gate arithmetic, in a live phase:

- every sender — player or joined host — is limited to one Gahook per question
  (`claimQuestionGahookUse`, key `question:<index>:<senderId>`);
- Ultimate needs Gahooks on one target with no gap over
  `ULTIMATE_GAHOOK_SPAM_IDLE_MS` (1.2 s) sustained past
  `ULTIMATE_GAHOOK_BASE_THRESHOLD_MS` (5 s) — so about five different senders
  ganging up inside one question. Hard, but a big party can do it;
- GET GOT needs `ULTIMATE_GAHOOK_MAX_STACK` (50) Gahooks in that unbroken
  streak. The room cap is 32 players, each with one claim per question, and the
  streak breaks after 1.2 s of quiet — far shorter than a question change.

So GET GOT can only be built in the phases without a claim gate, and
`applyGetGot` only charges the −1,000 points when the phase **is** live. The
penalty, and the "GET GOT costs 1,000" line the lobby rules show players, are
therefore unreachable in practice. The old smoke passed only because the
bug gave it a way in.

It is a design question, not a bug to patch quietly, so no behaviour was
changed here.

### Owner decision, 2026-10-19: leave it

Tyson's decision is to **forget about GET GOT during live rounds.** Live-phase
GET GOT is not to be made reachable, the −1,000 penalty is neither restored nor
removed, and no live-phase test coverage is to be written for it. The lobby
assertions `smoke-gahooks` moved to stay exactly as they are, so the coverage
loss recorded above is accepted rather than repaid. Nothing in the game changed
when this was decided.

For anyone reading this record later:

- The arithmetic above still holds — a live round cannot build fifty Gahooks in
  one unbroken streak — and that is now the intended state, not a gap to close.
- `applyGetGot`'s live-phase penalty branch is therefore unreachable in
  practice. Leave it in place: removing it would edit `pokePlayer`'s hottest
  path for no player-visible gain, and it records what the number was. If the
  Gahook subsystem is extracted out of `server.js`, carry it across unchanged
  and repeat this note there.
- One loose end, player-facing and so not mine to change: the lobby rules still
  show players the "GET GOT costs 1,000" line, for a penalty only the lobby can
  build and the lobby never charges. Flagged here; no copy was touched.

## Removed in cleanup

The four investigation probes (`probe-gahook-spam.mjs`,
`probe-gahook-spam-live.mjs`, `probe-gahook-spam-lobby.mjs`,
`probe-lobby-poke-latency.mjs`) and the root `BRIEF-host-poke-claim-fix.md`
were deleted from `main`: the regression smoke now covers what they proved.
They remain on branch `agent/host-poke-claim-fix` at `ca0b74d` if a future
investigation wants them. The `GAHOOKZ_DEBUG_SPAM` tracing they relied on is
kept, routed through one `debugGahook()` helper instead of four inline
`console.log` calls in the server's hottest file.

## Commands run

```bash
npm run check                                                     # 227/227 unit, typecheck, build
npm run test:disposable -- npm run standalone:smoke:host-poke-claim
npm run test:disposable -- npm run standalone:smoke:gahooks
```

`standalone:smoke:gahooks` had been failing on `main` since at least
2026-10-11 ("Expected time-threshold Ultimate Gahook"); the night-shift log
reproduced it on unmodified `fa830fa` and called it pre-existing. It was the
same defect seen from the other side, and it passes now.
