# Hosting adaptions — investigation record

Scope: `HOSTING-PLAN.md`, derived from `/Vault/Hosting adaptions.md`. Branch
`overhaul/quiz-herd-p00-p12`, on top of the uncommitted work already in the
tree. `/Vault` was read only. No production, beta or port 3102 process was
queried or changed, and `scripts/docker-deploy.sh` was never run. Every
measurement below owns a disposable server on `127.0.0.1:3199` through
`npm run test:disposable -- <command>`.

Failures are preserved. Raw output lives in [`raw/`](raw/).

Tyson asked "Does that make sense?" — the short answer is in
[The recommendation](#the-recommendation). It is not the option he listed
first, and the reasoning is set out in full rather than asserted.

## Progress

| Stage | Status | Notes |
| --- | --- | --- |
| 1 — measure the laptop | **Done** | 15-player Gahook storm measured; breaking point found. |
| 2 — assess hosting on a player's device | **Done (assessment only)** | Not feasible as asked. No code written, by instruction. |
| 3 — assess hosting on the desktop | **Done (assessment only)** | Procedure documented. Nothing deployed, by instruction. |
| 4 — make 15 players work as built | **Done** | Broadcast coalescing and shared snapshot parts; before/after measured. |

---

## Stage 1 — What the laptop actually does

### The machine under test

```
AMD A9-9420 RADEON R5 — 2 cores
7391 MB RAM total, ~1991 MB available
load average 2.59 at the time of measurement
```

This is the laptop that serves `gahookz.com` today, and the plan's concern
about it is well founded.

### The scenario

`standalone/load-gahook-storm.mjs` drives the exact case Tyson named: one room,
fifteen players, every one of them Gahooking a random other player at a fixed
rate, over real HTTP and real SSE on their own loopback source addresses. It
does not import the server, so the numbers are what a client sees rather than
an in-process estimate.

Two figures matter more than the rest:

- **Fan-out latency** — press to every other player's stream carrying it. This
  is what "lag" means in Tyson's sentence.
- **Health-probe latency** — an idle request every 100ms throughout. When the
  event loop saturates this degrades first, and it is the honest measure of
  whether the process is keeping up.

### Important caveat on every number below

The harness runs **on the same two-core laptop as the server**. Its own CPU
cost is recorded (`harness CPU % of one core: p50=35.29 … max=83`) and it
competes with the server for two cores. In real play the fifteen clients are
fifteen phones and the laptop does server work only. **Every latency below is
therefore pessimistic** — a floor on how good it gets, not a ceiling on how bad.
This is stated because it would be easy to read these numbers as worse than the
situation they describe.

---

## The recommendation

**Do not host on a player's device. It cannot work as described.** A browser
tab cannot accept inbound connections, so "host it on that player's device" is
not a configuration change — it is a different product, and every version of it
either leaves the laptop doing as much work, requires an install, or hands a
player the ability to cheat. Stage 2 sets this out in full.

**Do not move to the desktop either, for now.** After stage 4 the laptop serves
**fifteen players Gahooking each other at p95 62ms fan-out, using a quarter of
one core** — and it holds a full twenty-player room at three times that Gahook
rate without noticing. The requirement Tyson actually named is met on the
hardware he already has. Moving would trade an always-on machine for a
sometimes-on one and buy nothing that has been shown to be needed.

**The real limit is not players, it is concurrent rooms.** The laptop handles
one busy room easily and four at once badly. The configured cap is thirty-two.
That is the honest finding, and it is a different problem from the one the
request was about — see [the room cap](#the-cap-that-is-actually-wrong).

---

## Stage 2 — Hosting on the creating player's device

**Verdict: not feasible as asked.** This is not a pessimistic reading of a hard
problem; it is a property of how browsers work.

### The blocking fact

A web page cannot accept inbound connections. There is no browser API that
opens a listening TCP socket, and there is no way for fourteen other phones to
send `POST /api/room/answer` to a tab. Gahookz is built on exactly that shape:
JSON commands over HTTP plus a server-pushed SSE stream. "Host the game on that
player's device" is therefore not a configuration change or a port move — every
byte of the transport would have to be replaced.

### The three ways it could be made to work, and what each costs

**WebRTC data channels.** The only peer transport a browser really has. A star
topology with the creating player at the centre would carry gameplay traffic
between devices. What it does not remove is the server:

- A **signalling** service must still run somewhere to introduce peers. That is
  the laptop.
- **NAT traversal** fails for a meaningful share of real networks — the exact
  mixed-carrier situation a party of phones is. The fallback is a **TURN
  relay**, which forwards every byte, on a machine. That is the laptop again,
  now doing *more* work than it does today, because relaying media-style
  traffic is not cheaper than serving SSE.
- Reconnection, room codes, late joins and the 32-room cap all have to be
  rebuilt against a transport with no server to be authoritative.

So in the common case it moves compute off the laptop, and in the bad case it
moves *more* work onto it. The bad case is not rare.

**A native or Electron host application.** Technically the cleanest — a real
process can listen. It also ends guest play as it exists: the host would have
to download, install and run a program, and open a port through their router.
The standing rule that creating a room and playing must work with no sign-in
and no install is a deliberate owner decision, and this breaks the spirit of it
squarely.

**Browser-as-authority, laptop-as-relay.** The middle option, and the one that
sounds most attractive until it is examined. The laptop keeps every connection
and keeps forwarding every message; only the *game logic* moves into one
player's tab. Measured against stage 1 that is close to worthless: the cost on
this machine is connection handling and snapshot fan-out, not rule evaluation.
It moves the cheap half.

### The part that is not about performance

The server is currently authoritative for **scoring, anonymity and anti-cheat**.
Moving authority into a player's browser hands that player's device the answer
key, the authorship of anonymous answers, and the score arithmetic — for a
game whose entire social premise is that nobody knows who wrote what until the
reveal. The privacy work in P02 depends on server authority. A player-hosted
authority is not a performance trade; it is a correctness and fairness trade,
against the one player with the most incentive to take it.

### Conclusion

No WebRTC work was begun, as the plan directs. The honest summary for Tyson:
the idea makes sense as an instinct — *"stop making my weak laptop do all the
work"* is a completely reasonable thing to want — but browsers cannot host,
and every route that fakes it either leaves the laptop doing as much work,
requires an install, or hands a player the ability to cheat. Stage 4 addresses
the instinct directly instead, by making the work the laptop does much smaller.

---

## Stage 3 — Hosting on the desktop

**Verdict: viable, genuinely simple, and not currently justified.**

Unlike option A this changes nothing architecturally. One Node process still
owns every room; it just runs on better hardware. That is precisely what makes
it the pragmatic fallback.

### What would actually have to change

| Concern | Change |
| --- | --- |
| Where the process runs | `compose.yaml` unchanged; the prod service is brought up on the desktop with `COMPOSE_PROJECT_NAME=gahookz-prod`. |
| Bind address | `GAHOOKZ_BIND_ADDRESS` / `GAHOOKZ_PROD_PORT` already exist as variables; production binds `127.0.0.1:3102` today. |
| Proxy routing | Nginx Proxy Manager runs on the laptop and reaches the container over the `gahookz-proxy` Docker network. Across machines that network no longer spans the two hosts, so the proxy target becomes the desktop's address on the direct link (`10.77.0.1`) and the desktop must expose the port to that interface rather than to loopback only. |
| Account data | The `career-data` volume holds it. It lives on whichever machine runs the container, so it **moves with the service** and must be copied, not recreated — it is the only persistent state in the system. |
| Journal / database | `GAHOOKZ_DATABASE_URL` is external and unset in this tree; nothing was configured or requested. |

### The tradeoff Tyson must weigh

**The laptop is always on. The desktop is not.** Today a game works because the
machine serving it never went to sleep. After a move, every game depends on the
desktop being awake, and `~/bin/haukeye-desktop wake` is a manual step someone
has to remember before friends try to play. That is a real availability cost,
paid on every single game, in exchange for headroom that stage 4 suggests is
not currently needed.

There is also a second, quieter cost: the room state lives **only** in the Node
process. Moving the service means ending every game in progress, exactly as a
deploy does.

### Status

The desktop was confirmed reachable (`haukeye-desktop status` → `desktop is
UP`). **Its CPU and RAM were not measured**, because the standing instruction
is to control that machine only through `status`, `wake` and `poweroff` and not
to improvise ssh at it. This is a deliberate gap, and it does not weaken the
recommendation: the conclusion below turns on the laptop being sufficient, not
on how much faster the desktop is.

**Nothing was deployed, configured or started.** This section is a procedure,
not an action, as the plan requires.

---

## Stage 4 — Making 15 players work on the current architecture

This is the requirement, and it is met.

### What was wrong

Every Gahook called `broadcastState(room, { immediate: true })`, and every one
of those built and serialised **one complete snapshot per connected client**.
Fifteen people Gahooking at four per second is sixty fan-outs per second, each
rebuilding the same player list, the same ranked scoreboard and the same chat
history sixteen times over. The cost scaled with how hard players hammered the
button, which is precisely the wrong thing for it to scale with.

The snapshot itself made it worse. Measured before any change
([`raw/snapshot-anatomy-before.txt`](raw/snapshot-anatomy-before.txt)), a
15-player lobby snapshot was 36,585 bytes of which **94% was the same player
data three times** — `players`, `leaderboard` and `winners` are all
player-shaped, and final placements were being published in every phase rather
than only when they were a result.

### The two changes

1. **Shared snapshot parts** (`sharedSnapshotParts`, `standalone/server.js`).
   One scratch object per flush holds the parts derived from the room alone —
   player list, placements, chat, strokes, results, settings. Nothing mutates
   the room between the writes of a single flush, so computing them once and
   handing them to every client is exactly equivalent to computing them
   sixteen times, and not sixteen times as slow.
2. **An immediate-broadcast floor** (`IMMEDIATE_BROADCAST_FLOOR_MS`, default
   50ms, `GAHOOKZ_BROADCAST_FLOOR_MS`). A Gahook in a quiet room still goes out
   on the same tick — "immediate" still means immediate for the thing a player
   just did. What it no longer means is one full fan-out per Gahook when the
   whole room is Gahooking at once. Past the floor the room falls back to a
   scheduled flush carrying the same state a few milliseconds later.

The second is the important one architecturally: **it bounds server work by
time rather than by how fast clients press buttons.** There is no Gahook rate
limit in the lobby — `pokeFromPlayer` only claims a per-question Gahook budget
during `reading`/`answering`/`reveal`, so lobby Gahooking is unbounded by
design. The floor means that no longer matters.

### Before and after, measured on one build

Both runs are the same commit, the same machine and the same scenario; only
`GAHOOKZ_BROADCAST_FLOOR_MS` differs. Measuring it this way rather than against
an older build removes the question of what else changed in between.

```bash
GAHOOKZ_BROADCAST_FLOOR_MS=0 npm run test:disposable -- \
  node standalone/load-gahook-storm.mjs --players 15 --duration 30 --rate 4 \
  --label uncoalesced-15p-4hz --out docs/verification/2026-09-19-hosting/raw/uncoalesced-15p-4hz.json

npm run test:disposable -- \
  node standalone/load-gahook-storm.mjs --players 15 --duration 30 --rate 4 \
  --label coalesced-15p-4hz --out docs/verification/2026-09-19-hosting/raw/coalesced-15p-4hz.json
```

| 15 players, 4 Gahooks/s each | Uncoalesced | **Coalesced** | Change |
| --- | --- | --- | --- |
| fan-out p50 | 16 ms | **37 ms** | +21 ms |
| fan-out p95 | 282 ms | **62 ms** | **4.5× better** |
| fan-out p99 | 435 ms | **72 ms** | **6× better** |
| fan-out max | 615 ms | **108 ms** | **5.7× better** |
| Gahook POST p95 | 310 ms | **18 ms** | **17× better** |
| health probe p95 | 140 ms | **9 ms** | **15× better** |
| SSE bytes / 30s | 754 MB | **258 MB** | **66% less** |
| frames per Gahook | 16.18 | **5.29** | **67% less** |
| CPU seconds | 12.0 | **6.99** | **42% less** |
| peak RSS | 113 MB | **102 MB** | 10% less |

Raw: [`uncoalesced-15p-4hz.txt`](raw/uncoalesced-15p-4hz.txt),
[`coalesced-15p-4hz.txt`](raw/coalesced-15p-4hz.txt).

The p50 rising by 21ms is the floor doing its job and is the intended trade: a
median Gahook now waits up to 50ms for its flush. Nobody perceives 37ms. What
they would perceive is the 282ms *p95* — the laggy ones — and those are gone.

### The honest cost: coalescing merges some Gahooks

Fan-out **coverage falls from 100% to 90.7%**. This is not measurement noise and
it should not be glossed over. `latestPokeId` is one field per player, so when
two Gahooks land on the *same target* inside one 50ms window, only the later one
appears in the snapshot and the earlier one's animation is never shown.

At sixty Gahooks per second across a room this is the right trade — no human
perceives sixty distinct animations a second, and the alternative is the 282ms
p95 above. It is recorded here because it is a real behaviour change, not a
free win. If Tyson ever wants every single Gahook to land visibly, the fix is a
per-target queue rather than a single latest-poke field, and it is a larger
piece of work.

### Where it actually breaks

Pushed past the requirement, on the same laptop:

| Scenario | Gahooks/s | fan-out p95 | health p95 | CPU (1 core) | Verdict |
| --- | --- | --- | --- | --- | --- |
| 1 room, 15 players, 4/s | 60 | **62 ms** | 9 ms | 24% | comfortable |
| 1 room, 20 players, 4/s | 79 | **82 ms** | 23 ms | 32% | comfortable |
| 1 room, 20 players, 12/s | 233 | **78 ms** | 47 ms | 40% | comfortable |
| 4 rooms, 60 players | 211 | **496 ms** | 348 ms | 52% | degraded |
| 8 rooms, 120 players | 261 | **1020 ms** | 1133 ms | 67%+ | unusable |

Raw: [`breaking-20p-4hz.txt`](raw/breaking-20p-4hz.txt),
[`breaking-20p-12hz.txt`](raw/breaking-20p-12hz.txt),
[`breaking-4rooms-60p.txt`](raw/breaking-4rooms-60p.txt),
[`breaking-8rooms-120p.txt`](raw/breaking-8rooms-120p.txt).

Two things stand out.

**Tripling the Gahook rate in one room changes almost nothing** — 233/s is as
cheap as 79/s, because the floor caps flushes per room per second regardless of
how hard anybody presses. The Gahook storm Tyson was worried about is no longer
the expensive case. That is the clearest evidence the right fix was made.

**Rooms are what cost.** Each room flushes on its own timer, so four busy rooms
is four times the work with no sharing between them. Every process survived —
nothing crashed, no connection was dropped for backpressure, RSS stayed flat
near 100MB with no growth — but at four concurrent busy rooms the lag is
perceptible and at eight it is unusable.

### The cap that is actually wrong

`MAX_PLAYERS_PER_ROOM = 20` is **genuinely supportable**: a full twenty-player
room measured p95 82ms. No change recommended.

`MAX_ACTIVE_ROOMS` defaults to **32**, and the measurements say this laptop
comfortably serves about **three** concurrent busy rooms. The cap is not a
capacity statement today — it is roughly ten times what the hardware can do,
and the failure mode when it is reached is every room getting slow at once
rather than a new room being refused.

This is a recommendation, not a change: `MAX_ACTIVE_ROOMS` is
env-configurable (`GAHOOKZ_MAX_ACTIVE_ROOMS`), and lowering it on production is
an operational decision that is Tyson's to make. Nothing was changed. It is
worth saying that in practice this has never bitten — the rooms are friends'
games, not thirty-two simultaneous parties — so this is a latent mismatch
rather than a live problem.

### Verification

```
npm run check   →  tests 186, pass 186, fail 0, release-f05cb407bb761323
```

The 186 is 183 plus three new Gahook Arena tests added under the separate
1v1 plan; no test was removed to reach it.

### A note on the earlier baseline

Two earlier runs are preserved in `raw/` from before this session
([`baseline-15p-4hz.txt`](raw/baseline-15p-4hz.txt), and
[`baseline-15p-4hz.attempt1-FAILED-port-in-use.txt`](raw/baseline-15p-4hz.attempt1-FAILED-port-in-use.txt),
which failed because 3199 was already occupied and is kept as a failure). They
measured a different build, so they are not used for the before/after above —
the controlled A/B on one commit is better evidence. They are consistent with
it: that build showed p95 468ms and 979MB, in the same region as the
uncoalesced run here.
