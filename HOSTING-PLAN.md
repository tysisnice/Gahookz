# Hosting adaptions — investigation and implementation plan

Source: `/Vault/Hosting adaptions.md`. Repo:
`/mnt/storage/syncthing/codex/2026-07-01/Gahookz`, branch `overhaul/quiz-herd-p00-p12`.

Tyson's request, in full:

> Inspect how Gahookz is hosted. Try to make it so that when a game is created,
> it is hosted on that players device. This is so my cheap laptop doesn't get
> overwhelmed. If that doesn't work then see if you can host it on my desktops
> RAM and CPU instead. Does that make sense? Whatever the case, make sure that
> the game can handle having 15 players all gahooking each other with minimal to
> no lag or crashes.

**This is an investigation task before it is an implementation task.** The
non-negotiable requirement is the last sentence: 15 players Gahooking each other
without lag or crashes. The two hosting options are Tyson's suggested means, in
his stated order of preference — not requirements in themselves.

## Ground rules

- **Never touch production or beta.** Never run `scripts/docker-deploy.sh`.
  Never deploy. This plan produces analysis, a measurement, and at most a local
  implementation — no operational change.
- `/Vault` is **read-only**.
- The tree carries uncommitted work from other agents. **Do not revert, stash,
  reset or commit their changes.**
- Do not ask Tyson for production credentials or a database to do local work.

## Facts already established

- **Current architecture:** single Node HTTP server, `standalone/server.js:281`
  (`http.createServer`), listening at `server.listen(PORT, HOST)` (line 499).
  State is in-process, per-room, in memory. Realtime transport is **SSE**
  (`writeSseState`, `standalone/server/sse-backpressure.mjs`) — server-push over
  plain HTTP, not WebSockets, not peer-to-peer.
- **Limits:** `MAX_PLAYERS_PER_ROOM = 20` (`standalone/server/room.mjs:1`), room
  cap 32 by default, `MAX_ACTIVE_ROOMS` env-configurable.
- **Laptop (current host):** 2 CPU cores, 7.2GB RAM with only ~2.1GB available.
  This is genuinely constrained — Tyson's concern is well founded.
- **Desktop:** currently up; reachable over a private direct Ethernet link. Its
  Hermes gateway is stopped and masked; control it only via `~/bin/haukeye-desktop`
  (`status`, `wake`, `poweroff`). Do **not** improvise ssh or systemctl at it.
- **No load testing exists.** There is no load, perf, bench or stress script in
  `standalone/`. The wider plan's own ledger admits capacity is unverified.

## Stage 1 — Measure first (do this before proposing anything)

You cannot know whether the laptop is actually overwhelmed until you measure it.
Build a load harness and get real numbers.

- Write a load script that drives **15 concurrent simulated players** through a
  full game on a **disposable** server (127.0.0.1:3199), including a burst of
  everyone Gahooking each other — the specific scenario Tyson named.
- Record: CPU per core, RSS, SSE event-stream count and backpressure counters,
  p50/p95/p99 request latency, dropped connections, and whether it crashes.
- Run it on this laptop, since that is the machine in question.
- Then push past 15 to find the actual breaking point.

Write results to `docs/verification/2026-09-19-hosting/README.md` with raw
output. **This measurement is the deliverable of stage 1** and is valuable even
if no architecture changes.

## Stage 2 — Assess option A: host on the creating player's device

Tyson's first preference. Assess it honestly against how browsers work.

A browser tab **cannot accept inbound HTTP connections** from other players'
devices. The current SSE server model cannot simply be relocated into a player's
browser. Genuine peer hosting would require either:

- **WebRTC** data channels with a mesh or star topology, plus a signalling
  server (which still has to run somewhere — likely the laptop), NAT traversal,
  and probably TURN relays when NAT traversal fails; or
- players installing a native/Electron host application; or
- one player's browser acting as authoritative game logic while the laptop stays
  the network relay — which moves compute but not connection handling.

Evaluate each. State plainly what it would cost and what would break: the server
is currently authoritative for scoring, anonymity and anti-cheat, and a
player-hosted authority hands the host player the ability to see or alter
things they should not — the privacy work in P02 depends on server authority.

**Do not begin a WebRTC rewrite.** Produce the assessment, then stop and let
Tyson decide. This is a large architectural change to a project whose existing
overhaul is already only partially complete.

## Stage 3 — Assess option B: host on the desktop

Tyson's stated fallback, and almost certainly the pragmatic answer.

The desktop has far more CPU and RAM than the laptop, is already up, and is
already linked privately to the laptop. Moving the Node server there is a
**deployment/configuration change, not a rewrite** — the architecture is
unchanged, which is exactly why it is attractive.

Assess and document:
- What actually has to change (host/port binding, proxy routing through Nginx
  Proxy Manager, which machine holds the journal volume and account data).
- The tradeoff Tyson must know: the desktop is not always on, and the laptop is.
  Games would depend on the desktop being awake. `~/bin/haukeye-desktop wake`
  exists, but a dependency on it is a real availability cost.
- Whether stage 1's numbers even justify moving. **If the laptop comfortably
  handles 15 players, say so** — the simplest honest outcome is "no move needed".

Prepare the configuration and document the procedure. **Do not execute any
deployment.** Operational changes are owner-led and need a separate explicit
request.

## Stage 4 — Make 15 players work on current architecture

Regardless of stages 2 and 3, this is the actual requirement and it can proceed
now. Using stage 1's measurements, fix what the numbers expose:

- Tune SSE broadcast efficiency — look for per-player work that should be
  computed once per room and shared.
- Check Gahook-storm handling specifically: many simultaneous pokes are the
  named worst case. Verify coalescing and rate limits hold up.
- Confirm `MAX_PLAYERS_PER_ROOM = 20` is genuinely supportable, or recommend a
  lower honest cap.
- Fix any crash or unbounded growth the load test finds.

Re-run the load test after each change and record the before/after numbers.

## Verification

```bash
npm run check    # must stay 177 passed, 0 failed
npm test
npm run test:disposable -- <your load script>
```

## Reporting

`docs/verification/2026-09-19-hosting/README.md` must contain: the measured
baseline, the breaking point, option A's honest feasibility assessment, option
B's procedure and tradeoffs, a clear recommendation, and any optimisation
before/after numbers. **Preserve failures.**

Tyson asked "Does that make sense?" — he is inviting a technical opinion, so
give him a real one. If option A is impractical, say so directly and explain
why in plain language. Do not quietly build the wrong thing because it was
listed first, and do not overstate what you verified.
