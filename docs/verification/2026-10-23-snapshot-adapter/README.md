# The last request outside the adapter — P01 step 6

Date: 2026-10-23. Branch `agent/snapshot-adapter`, worktree
`Projects/gahookz/worktrees/snapshot-adapter`, from `main` at `9818947`.
Requested by Tyson: "go ahead with P01 step 6". No deploy, no container or
infrastructure change.

## What step 6 asks for

> Extract API, session storage, SSE, server-clock offset and snapshot dispatch
> into a typed browser adapter. Initially preserve network cadence; P08
> optimises it. Support timeouts, cancellation, credential redaction, one
> subscription per view, stale response/version rejection, and safe
> unknown/malformed data handling.

## What was already true, and what was not

`standalone/public/client/net.ts` has existed since September and `app.jsx`
imports it: commands go through `createApiClient` (POST only, abortable
timeout), the live stream through `createLiveConnection` ("exactly one stream"
with tests behind it), ordering through `createSnapshotGate`, version rejection
through `describeSnapshotCompatibility`, clock skew through `nextClockOffset`,
and credential redaction through `redactCredentials`. Twenty-one unit tests
covered them.

Two things in step 6's list were not there at all.

- **Snapshot dispatch.** `/api/state` — the room's whole state, and the one
  request every reconnect depends on — was still fetched inline in the
  `useEvents` effect with its own `fetch`, its own headers, its own routing and
  no timeout. It was the only request in the client that did not go through the
  boundary, and the one place where no test could reach the decisions.
- **Session storage.** Still `app.jsx`'s: `gahookz-client-key`,
  `gahookz-last-join`, the per-room `sessionStorage` password and the `?pwd=`
  scrub. `net.ts` declared a `StorageLike` interface for it that nothing ever
  implemented or used.

This slice does the snapshot dispatch and deletes the unused interface rather
than leaving a type that implies work that has not happened. Storage is named
in **Next** below, not claimed here.

## The defect this found

Three callers ask for a snapshot — the recovery poll after 25 seconds of
silence (checked every 5), every settled command via
`window.gahookzRefreshSnapshot`, and a tab becoming visible — and none of them
knew about the others. Nothing waited for a reply and nothing timed out, so a
request that was never answered did not stop the next one being sent.

A black-holed connection is the ordinary case for this, not an exotic one: a
phone that has lost signal, a captive portal, a proxy holding the socket open.
It is worse than an outright failure because nothing ever rejects.

Measured in a real browser — the real client, in a real room, against the
disposable server, with every `/api/state`, ticket and `/events` request held
open and never answered:

| Client | Window | Requests started | Peak open at once | Still open at the end | Abandoned |
| --- | --- | --- | --- | --- | --- |
| `main` at `9818947` | 60s | 8 | **8** | 8 | 0 |
| this branch | 60s | 5 | **1** | 1 | 4 |
| `main` at `9818947` | 40s | 4 | **4** | 4 | 0 |
| this branch | 40s | 3 | **1** | 1 | 2 |

One more every five seconds, for as long as the room stays open, per tab. Ten
minutes of a dead connection is about 115 requests from one phone; a 20-player
room is some 2,300. They are not free when the network returns either — they
all land at once, and each one serialises a whole room snapshot.

The screen was not broken while this happened (the client already showed "the
room is taking longer than expected"), which is exactly why nobody saw it.

## Changes

| Change | Where |
| --- | --- |
| `createSnapshotFetcher` — one request in flight, at most one follow-up queued, a timeout that frees the slot, nothing dispatched after `dispose()` | `standalone/public/client/net.ts` |
| `describeSnapshotResponse(status, ok, body)` — the five routing decisions (apply, room gone, banned, locked, refused) as a pure function, plus `unreachable` for a 200 that is not a snapshot | same |
| `SNAPSHOT_TIMEOUT_MS = 10_000`, reasoned from the 15s keepalive and the 25s silence threshold | same |
| Dead declarations removed: `StorageLike` (never implemented) and `ApiCallOptions.signal` (never passed, and did nothing when it was) | same |
| The inline `/api/state` fetch replaced by the fetcher; `snapshots.dispose()` added to the effect teardown | `standalone/public/app.jsx` |
| Ten unit tests (21 → 31 in this file; 279 → 289 overall) | `standalone/public/client/net.test.ts` |
| `browser-recovery-storm.mjs` — the real client, a black-holed room, peak concurrency asserted at 1 | `standalone/browser-recovery-storm.mjs`, `npm run test:browser:recovery` |
| Room-affinity tripwire follows the header to its new home, plus a new one: no client source but `net.ts` may `fetch("/api/state")` | `standalone/smoke-security.mjs` |

### Decisions worth knowing

**At most one follow-up, not zero.** A trigger means "the room changed, look
again", so dropping every overlapping ask could leave the last change unseen.
One follow-up is enough, because a snapshot is the whole room state and a later
one supersedes it.

**Cadence on a healthy connection is unchanged**, which step 6 requires and P08
owns. Replies normally arrive in milliseconds, so nothing overlaps and nothing
is collapsed; `browser-flow`'s existing check — *0 recovery polls over 32
seconds of a quiet host lobby* — still passes. What changed is the failure path,
where concurrency is now bounded by one.

**A 200 that is not an object is now reported instead of applied.** It used to
be handed to the snapshot gate, which correctly refused to dispatch it — and
the room then sat there with no explanation, because nothing had failed loudly.
A proxy error page, a truncated body or a stray array now produces the same
actionable message as an unreachable server.

**A failed or aborted fetch no longer forwards the browser's own wording.** The
old code passed the thrown value to `connectionMessage`, so a player could read
"Failed to fetch" on a room that would not open. The fetcher reports
`{ kind: "unreachable" }` and the message is the one written for players.

## Non-vacuity: eleven mutations, applied one at a time

Each was applied to real source, run, and restored by `cp` from a verified
copy; `md5sum -c` confirms the tree is back. Every one is caught.

| # | Mutation | Caught by |
| --- | --- | --- |
| M1 | No concurrency check: every ask starts a request | *however many callers ask at once, one request is in flight*; *…exactly one follow-up* |
| M2 | Overlapping asks dropped instead of queueing one follow-up | *…answered by exactly one follow-up* |
| M3 | No timeout: the slot is held until the network answers | *a request nobody answers is given up on* |
| M4 | The abort timer is left behind on a settled request | *an answered request leaves no abort timer behind* |
| M5 | A late answer is dispatched after `dispose()` | *an answer that arrives after the room is left is never dispatched* |
| M6 | The thrown fetch error is forwarded to the player | *a failed request never shows the player a browser-authored message* |
| M7 | The credential moved to the query string | *the snapshot request carries the credential in a POST body, never a URL* (and `smoke-security`'s `/api/state?` rule) |
| M8 | A lock checked before a ban | *a room that has gone, a ban and a lock are told apart* |
| M9 | Every refusal reported immediately | *the server's considered refusal is immediate, a bad second is not* |
| M10 | Any 200 body applied as a snapshot | *a 200 that is not a snapshot is reported, not quietly dropped* |
| M11 | A second `fetch("/api/state")` added back into `app.jsx` | `smoke-security`: *Room snapshots must be fetched through client/net.ts* |

M1 is the one worth recording honestly. The first version of the module checked
`active > 0` in **two** places — the public `refresh()` and the private `run()`
— so removing either left the invariant held by the other and the mutation
passed every test. That is a redundant rule, not a defended one. `run()` now
owns the decision alone and `refresh()` is a thin entry point, which is both
simpler and what makes M1 fail.

The browser suite was proved the same way, by running it against `main`'s
client: it fails with *"requests stacked up: 4 were open at once"*. The unit
tests cannot see a bypass in `app.jsx` and the browser suite is not in the
gating chain, so the source tripwire (M11) covers that seam in `npm test`.

## Gates

Node 24.22.0 throughout.

| Gate | Result |
| --- | --- |
| `npm run typecheck` | clean, strict |
| `npm run test:unit` | **289/289** (279 before) |
| `npm run build` | `release-551bb2eef6cd0b69` |
| `npm test` (full chain, disposable 3199) | exit 0 |
| `npm run test:browser` | every check, including *0 recovery polls over 32 seconds* of a quiet host lobby |
| `npm run test:browser:recovery` | 4 checks, new |
| `npm run docs:check` | 113 files (`docs/verification/` is outside the link scan, so a new record does not change the count) |

## Limits

- **Step 6 is not finished.** Session storage is still in `app.jsx`, and
  nothing in the browser validates a snapshot against the contracts: the
  fetcher enforces "a usable object", not a described payload. Those are the
  two pieces left, and the backlog says so.
- **The browser suite is not in `npm test`.** No browser suite is; they need
  Chromium and 40 seconds. It is a deliberate separate run, which is why the
  source tripwire exists as well.
- **The 10-second timeout is reasoned, not measured against a real slow
  network.** The reasoning is in the code: the keepalive is 15s and recovery
  starts at 25s of silence, so a snapshot still unanswered at 10s has already
  lost its race with the next attempt. A measurement of real-world snapshot
  latency belongs to P08, which owns cadence.
- **One copy string is now reachable where it was not.** A room that cannot be
  reached shows `connectionMessage`'s existing fallback, "Could not reach this
  room. Check the server, then retry." — written for an operator more than a
  player. The wording is pre-existing and unchanged here; it is queued as a
  copy task rather than rewritten inside an engineering slice.
- **Nothing was deployed.** Production is still `74a489949e02`.
