# Gahookz 1v1 (Gahook Arena) changes — implementation plan

Source: `/Vault/Gahookz 1v1 changes.md` (2 screenshots, both present in
`/Vault/Archive/attachments/`). Repo: `/mnt/storage/syncthing/codex/2026-07-01/Gahookz`,
branch `overhaul/quiz-herd-p00-p12`.

Tyson's framing: *"I love the gahookz 1v1. Please fix it up a little... Make this
little 1v1 feel very responsive and fun."* Feel is the acceptance criterion.
Favour snappy, immediate feedback over added complexity.

## Ground rules

- **Never touch production or beta.** Stateful runs use a disposable server via
  `npm run test:disposable -- <command>`. Never run `scripts/docker-deploy.sh`.
- `/Vault` is **read-only**.
- The tree carries uncommitted work from earlier agents. **Do not revert, stash,
  reset or commit other people's changes.** If `git status` surprises you, stop.
- A passing build does not prove browser feel. You must play it.

## Existing mechanics — read before changing anything

Already located for you:

- `standalone/server/arena.mjs:46` — `tapArena(duel, playerId, targetId, now, ...)`
  is the authoritative tap handler.
- `standalone/server.js:1398` — `tapGahookDuel` wraps it; win resolves via
  `finishGahookDuel(..., "five-ahead")`.
- `standalone/public/client/arena.jsx` — the whole client arena UI. Win
  condition is `duel.leadToWin || 5`; 45-second timer; rope/knot visual.
- Endpoints: `/api/player/duel-challenge`, `duel-accept`, `duel-tap`,
  `duel-react` (server.js:764–782). Lobby duels gate on `lobbyArenaEnabled`.
- `counterPokeFromPlayer` (server.js:770) and `COUNTER_GAHOOK_OVERLAY_MS` /
  `duelChallengeUntil` (server.js:1268) already implement a counter-poke window
  that can raise a duel challenge. Item 5 extends this — read it first.

It is a tug-of-war: first to lead by 5 taps within 45 seconds.

---

## Item 1 — Tap animation

After pressing the button, play a **very quick 0.2s animation of the button
being Gahooked** before the next button appears.

Must not add perceived input latency. Fire the animation optimistically on the
client at press time; do not wait for the server round-trip. Respect
reduce-Gahook-effects / reduced-motion preferences — degrade to an instant
state change rather than removing feedback entirely.

## Item 2 — Escalating presses near the win

Currently every tap counts as one. Change to:

- Player is **1 tug from winning** (lead 4 of 5) → that next point requires
  **3 button presses**.
- Player is **2 from winning** (lead 3 of 5) → requires **2 presses**.
- Otherwise → 1 press, unchanged.

This is a rubber-band mechanic: closing out a win gets harder, keeping matches
tense. Implement it **server-side** in `tapArena` so it cannot be bypassed by a
client, and surface the remaining presses in the UI so the player understands
why their tap did not advance the rope (otherwise it reads as a bug).

Update the existing "ONE MORE PULL!" copy and the `arena-instruction` /
`aria-valuetext` strings so they stay truthful.

## Item 3 — Mini Gahook

Reference: `Pasted image 20260919084603.png` — the overlay the host currently
sees when Gahooked. Tyson calls this a **mini Gahook**.

- **Each button press sends a mini Gahook to the opponent.**
- When a player inside a 1v1 gets Gahooked, they receive this mini Gahook
  (not the full-screen treatment).
- When a **non-participating** player Gahooks someone who is in a 1v1 from the
  lobby, that Gahooked player also gets mini Gahooked.

Watch the volume: at 1 mini Gahook per tap this can fire many times per second.
It must stay readable and must not tank frame rate or spam the event stream —
throttle/coalesce visuals if needed, and check it against SSE backpressure
(`standalone/server/sse-backpressure.mjs`).

## Item 4 — Challenge from the player banner menu

Give players the option to challenge each other to a Gahook 1v1 from the **menu
on the player banner**. Reuse the existing `/api/player/duel-challenge` path and
its anti-spam guard (server.js:1305 deliberately prevents duel-prompt spam —
do not weaken it).

## Item 5 — Counter-Gahook → challenge, and challenge notifications

- If a player gets **counter Gahooked**, they can press that button to send a
  Gahook 1v1 challenge to the other player. The `duelChallengeUntil` window at
  server.js:1268 already exists for this — extend rather than reinvent.
- A 1v1 challenge must appear as a **notification to the challenged player**.
  It needs to be noticeable without hijacking their screen mid-round.

## Item 6 — Gahook button looks wrong for some characters

The Gahook button renders oddly for some characters — **the monkey** is called
out specifically. Inspect per-character asset sizing/aspect handling and fix so
every character renders correctly in the button. Check all characters, not just
the monkey.

---

## Verification

```bash
npm run check    # must stay 177 passed, 0 failed
npm run test:disposable -- npm run standalone:smoke:arena
npm run test:disposable -- npm run test:browser
```

Add unit tests for item 2's press-count rule — including the boundary where a
lead changes hands mid-sequence (partial presses must not carry over to a
different point in a way that lets someone bank progress unfairly). Decide and
document what happens to partial presses when the opponent scores.

Then **actually play a duel in the browser** with two distinct contexts (browser
tabs in one profile share a device credential — use separate contexts for
separate players). Confirm the 0.2s animation feels immediate, escalating
presses read as intentional, and mini Gahooks land without lag.

## Reporting

Write evidence to `docs/verification/2026-09-19-arena-1v1/README.md`: exact
commands, raw output, and **preserve failures** — never overwrite a failed run
with a passing rerun.

Item 3's mini-Gahook volume and item 2's partial-press edge case are the two
places where a wrong guess causes real problems. If either is unclear after
inspection, write the question down for Tyson rather than assuming.
