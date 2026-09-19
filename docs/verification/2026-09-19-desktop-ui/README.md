# Desktop UI changes — verification record

Scope: `DESKTOP-UI-PLAN.md`, derived from `/Vault/Desktop UI changes.md`.
Branch `overhaul/quiz-herd-p00-p12`, on top of the 37 uncommitted review
repairs already in the tree. `/Vault` was read only. No production, beta or
port 3102 process was queried or changed. Every stateful run below owns a
disposable server on `127.0.0.1:3199` through
`npm run test:disposable -- <command>`.

Failures are preserved. Where a run failed and a later run passed, both are
recorded, in order.

## Progress

| Stage | Status | Notes |
| --- | --- | --- |
| A — host skip/pause "Server error" | **Done** | Root cause reproduced at HEAD and fixed; regression tests added. |
| B — shared toggle + info tooltip | **Done** | `client/controls.jsx`: `ToggleSwitch`, `InfoTip`. |
| C — custom Gahooks | **Done** | Two slots for everyone, poses under the canvas, button icons. |
| D — menus | **Done** | Order, removals, one-line totals, toggles, height cap, player Settings. |
| E — lobby painting | **Done** | Painting moved to the player wall; erase-on-Gahook already existed. |
| F — assorted fixes | **Done** | Summary contrast/margins and lobby-only placement; equal-size centred tutorials. |
| G — herd | **Done** | Submit-all answers, restored roster, readable colours, reworked results. |
| H — quiz | **Done** | Matched answer phase, narrow-layout fix, shared 950px width, −1s spotlight. |
| V — browser verification | **Done** | Real Chromium at 1440/1024/820; full suite green. |

---

## Stage A — host Skip and Pause answered "Server error"

### What was actually wrong

The plan's stated root cause (`LIVE_GAME_PHASES` missing the Herd phases, at
`standalone/server.js:127` and `skipPhase` at `:4535`) is **not** what produced
the "Server error" toast in `Pasted image 20260919084239.png`. That toast is a
500, and `"Server error"` appears exactly once in the codebase — in the
unhandled-exception branch of the request handler (`standalone/server.js:486`).
Neither a missing `skipPhase` branch nor a phase-list refusal can produce a
500; both return a normal `{ ok: … }` body.

The real cause is a `const` shadowing an import inside `setGamePaused`:

```js
room.pausedRemainingMs = remainingMs(room.phaseEndsAt, now);   // imported helper
…
const remainingMs = Math.max(0, Number(room.pausedRemainingMs || 0));  // same scope
```

`const` hoists into a temporal dead zone covering the whole function body, so
the earlier call throws `ReferenceError: Cannot access 'remainingMs' before
initialization` before it can ever reach the declaration. Every pause, in every
phase, was a 500.

Reproduced against a **clean detached worktree of `HEAD` (e31cdc8)** — the
commit beta runs — in `/tmp/gahookz-head`, on a disposable 3199 server, then
the worktree was removed. Raw output:
[`stage-a-reproduction-at-HEAD.log`](stage-a-reproduction-at-HEAD.log).

```
 "label": "reading",
 "skip":  { "status": 200, "data": { "ok": true } },
 "pause": { "status": 500, "data": { "ok": false, "error": "Server error" } }
```

```
Unhandled request error ReferenceError: Cannot access 'remainingMs' before initialization
    at setGamePaused (file:///tmp/gahookz-head/standalone/server.js:4411:30)
    at handleRoomAction (file:///tmp/gahookz-head/standalone/server.js:852:12)
```

**That specific line was already repaired in the uncommitted working tree**
(renamed to `resumeRemainingMs`) by the earlier review-repair session — this is
the "Pause defect repaired" entry under P09 in `PLAN-PROGRESS.md`. Nothing
asserted a status code anywhere, so the repair was unproven and could have been
lost again silently. It is now locked by a test.

The plan *was* right that there is a second, separate defect. Probing the
working tree before any change:

| Phase | Skip | Pause |
| --- | --- | --- |
| `building` | `200 {ok:true}` — **no state change** | `400` generic message |
| `herd-writing` | `200 {ok:true}` — **no state change** | `400` generic message |
| `reading` / `answering` / `reveal` | works | works (already repaired) |

So in Herd the host pressed Skip during answer writing, got a success reply,
and the room did not move. `skipPhase` matched no branch, returned `undefined`,
and the route replied `{ ok: true }` regardless.

### The fix

`LIVE_GAME_PHASES` was **left alone**. It also gates `/api/player/poke`,
per-question Gahook accounting and snapshot shaping in eleven places, so
widening it to cover `herd-writing` would have changed who may Gahook whom.
Skip and Pause got their own explicit lists instead, in a new pure module:

- `standalone/server/phase-controls.mjs` — `PAUSABLE_PHASES`,
  `SKIPPABLE_PHASES`, `skipDecision(phase)`, `pauseDecision(phase)`.
- `standalone/server.js` — `skipPhase` now returns a result (the route returns
  it rather than hard-coding `{ ok: true }`), and `herd-writing` / `building`
  resolve to force-start, which is already the "start now with what we have"
  path and fills unwritten Herd answers with generated ones.
- A refused pause now names the phase the host is looking at rather than
  talking about "a question" that is not on screen.

After the fix, same probe:

| Phase | Skip | Pause |
| --- | --- | --- |
| `building` | `200` → `herd-writing` | `400` "waits for players, not a timer. Use Skip" |
| `herd-writing` | `200` → `reading`, answers filled | `400` same |
| `reading` | `200` → `answering` | `200 {paused:true}` |
| `answering` | `200` → `reveal` | `200 {paused:true}` |
| `reveal` | `200` → `reading` | `200 {paused:true}` |

### Tests added

- `standalone/server/phase-controls.test.mjs` — 6 unit tests in `npm run check`,
  covering every phase in `ALL_PHASES` for both controls.
- `standalone/smoke-host-controls.mjs` — HTTP-level, asserts the **status code**
  in every Herd phase. This is the one that actually catches the 500; a
  body-only assertion passes while the server is throwing. Registered as
  `standalone:smoke:host-controls` and added to `standalone:smoke:shared`.

```
$ npm run test:disposable -- npm run standalone:smoke:host-controls
{
  "ok": true,
  "baseUrl": "http://127.0.0.1:3199",
  "pausedPhases": [ "reading", "answering", "reveal" ],
  "skippedSetupPhase": "herd-writing"
}
```

Full output: [`stage-a-host-controls.log`](stage-a-host-controls.log).

One intermediate failure, kept: the first version of that smoke asserted filled
answer text while the room was in `reading`, where the server withholds answer
text by design (`publicQuestion`, `showAnswerText`). The assertion was moved one
skip later, into `answering`. The test was wrong, not the server.

```
AssertionError [ERR_ASSERTION]: Skipping Herd writing must fill unwritten answers
    at standalone/smoke-host-controls.mjs:120:3
```

### `npm run check` after stage A

```
ℹ tests 183
ℹ pass 183
ℹ fail 0
Built standalone browser modules for release-4a97d7b7c3b5edca
```

Full output: [`stage-a-check.log`](stage-a-check.log). The baseline in the plan
is 177; the six added are the new `phase-controls` unit tests.

### Outstanding for stage A

- Pause during `herd-writing` is still refused. That is deliberate: the phase
  has `phaseEndsAt = null`, so there is no countdown to hold, and no client
  screen renders a pause button there (`HostHerdPreparation` and
  `PlayerHerdPreparation` do not use `HostTopBar`). If Tyson wants Pause to
  mean "stop accepting answers" during Herd writing, that is a new feature, not
  a bug fix, and needs his decision.
- The browser half of this is stage V: host Skip and Pause pressed by hand in
  every Herd phase.

## Autonomous continuation — F–H and V

Read this record first, then the entire plan and `/Vault/Desktop UI changes.md`.
Opened the 13 F–H reference PNGs read-only. Initial screenshot lookup omitted a
leading zero and failed; corrected paths were opened successfully. No deployment,
production/beta access, stash, reset, clean or commit was performed.

Audit: A's explicit phase policy and TDZ repair remain. B's shared controls,
C's two slots, D's menu changes and E's paint surface remain. Contrary to the
old progress table, F's summary contrast/margins, lobby-only placement and
centered/equal-width tutorial styles were already present; retained them.

Changes: one action submits all Herd drafts, retains drafts on partial failure,
and readies the writer only after all submissions succeed. Progress is above
answers; the player roster is restored. Desktop question/roster columns share
space, with two banner columns from nine players. Narrow screens stack. Blank
Gahook labels were caused by `actionLabel=""` overriding the default; empty
labels now fall back to Gahook. Results use dark text, explicit vote/author
points, no purple favourite-count bar, and no personal breakdown for spectators.
The engine awards authors `500 * votes / eligible players`, so corrected the
old misleading “500 for every vote” copy. Quiz spotlight is 3500ms (was 4500ms);
the overall 12s reveal still leaves the remaining time for question feedback.
Feedback and leaderboards share a 950px maximum. Reduced-effects finale card
pseudo-elements are hidden instead of freezing their animated overlay.

Commands and preserved outputs:

- `npm run test:disposable -- npm run standalone:smoke:herd-flow` →
  `resume-herd-flow.log`, passed (five rounds, real votes and authored scores).
- `npm run test:simulation` → `resume-simulation.log`, passed.
- `npm run check` → `resume-fgh-check.log`, then `resume-fgh-check-2.log`;
  both passed 183/183 and built successfully.
- `npm run test:disposable -- npm run test:browser` →
  `resume-browser-1.log`, passed 22 browser checks.
- `npm run test:disposable -- node standalone/browser-desktop-ui.mjs` →
  `resume-layout-1.log`, `resume-layout-2.log`: failed waiting for tutorial.
  Harness selected the first `.how-to-play-button`, inside a closed menu.
  Hit-testing confirmed unrelated content at its bounding-box center. Scoped
  selector to the visible `.room-status-copy` button. Failure PNGs retained.

Final layout/full-suite results follow below.
- `resume-layout-3.log`: real browser failure in reveal, Resume disappeared
  after Pause. `phaseEndsAt` is null while paused, and `useRevealIntro` interpreted
  that as the end of the spotlight. Fixed it to use `pausedRemainingMs`, and kept
  the host control available through both reveal halves. Earlier HTTP coverage
  did not detect this UI defect. `resume-pause-build.log` records the rebuild.
- `resume-layout-4.log`: passed Quiz and Herd, 3/12 players,
  1440×1000, 1024×1000, 820×1000. Real browser taps submit Herd answers,
  answer a live question, and pause/resume/skip each timed phase. Geometry
  assertions check question/banner proportions and feedback/leaderboard widths.
  Screenshots reviewed against the Vault references. Visual inspection caught
  two additional inherited light-text problems: tutorial summary and Herd score
  labels. Explicit dark colours added before the final checks.
- `npm run check` → `resume-final-check.log`, passed 183/183,
  build `release-3cc121929ed1e79e`.
- `npm test` → `resume-npm-test.log`, failed at onboarding's exact old Quick
  copy assertion. Audit found its next assertion also required drawing on chat,
  directly contradicting stage E. Updated those two source smoke expectations
  to the new fair-selection wording and lobby paint surface; the targeted
  `node standalone/smoke-onboarding.mjs` passed. Full rerun saved separately.

---

## Resumed session — completing stage V

The previous session was interrupted mid-run (its agent exhausted its usage
allowance) while re-running the full smoke suite. That rerun,
`resume-npm-test-2.log`, is truncated where the process was killed and proves
nothing; it is kept as the record of the interruption. This section completes
stage V.

### The full suite had not actually passed, and it took four runs to make it

| Log | Exit | Result |
| --- | --- | --- |
| [resume-npm-test-2.log](resume-npm-test-2.log) | — | Truncated by the interruption. Not a result. |
| [resume-npm-test-3.log](resume-npm-test-3.log) | **1** | Failed at `smoke-party-view`: `scoringLabelFor(lobby)` missing |
| [resume-npm-test-4.log](resume-npm-test-4.log) | **1** | Got further; failed at `smoke-social-media`: room limit reached |
| [resume-npm-test-5.log](resume-npm-test-5.log) | **1** | Got further still; failed at `smoke-social-creation`: chat drawing surface |
| [final-npm-test.log](../2026-09-19-arena-1v1/final-npm-test.log) | **1** | Failed at `smoke-onboarding`: chat drawing heading |
| [final-npm-test-2.log](../2026-09-19-arena-1v1/final-npm-test-2.log) | **0** | Full suite green |

Three of these were **stale assertions describing the UI the plan asked to
change**, and one was a test-harness capacity limit. None was a product defect,
but each is recorded because "the suite is green" was not true until it was.

### The stale assertions, and why changing them is not cheating

Each of these encoded a requirement the plan explicitly superseded. In every
case the *intent* was preserved and re-pointed at where the behaviour now
lives, rather than deleted.

**1. `scoringLabelFor(lobby)` in `HostLobby`** — stage D says "remove all text
under the Begin Game button". The removed line was exactly that:
`<p className="start-scoring-summary">Playing <strong>{scoringLabelFor(lobby)}</strong>…`.
The host must still be able to see which scoring rule is in force, and now does
so through the control that sets it. The assertion became
`scoring={scoringOf(lobby)}` — proving the Majority toggle reflects the room's
real scoring rather than merely existing, since an unbound toggle would read
"off" in a Majority room — plus a new `assertNotIncludes` on
`start-scoring-summary` so the removed text cannot creep back.

**2. `EffectsPreferenceButtons` in `PlayerQuickMenu`** — stage D moved these
behind a Settings door styled like the host's Lobby rules dialog. The
reachability requirement is unchanged, so the assertion now follows the whole
chain: the menu offers Settings, mounts `PlayerSettingsDialog`, and that dialog
really does carry both accessibility controls wired to their preference
setters.

**3. Chat drawing surface** (`smoke-social-creation`, `smoke-onboarding`) —
stage E moved painting off the chat and onto the player wall. The assertions now
check `LobbyPaintLayer`, `.lobby-paint__canvas`, `Erase mine`, `hasOwnStrokes`
and `profilePaintColor`, **plus** a negative assertion that
`social-chat__drawing` is gone, so the chat cannot silently regrow a canvas.

While fixing the last of these I found the chat's screen-reader heading still
said `Room messages and drawings`. That is now simply untrue — telling a
screen-reader user about a surface they cannot reach is a worse bug than the
stale wording looks — so it was corrected to `Room messages`.

### The room-limit failure was real, and was the new tests' fault

```
Error: /api/room: The server has reached its active room limit. Try again shortly.
SIGTERM received; refusing new rooms and draining 32 active room(s).
```

`standalone:smoke:shared` runs twenty-five scripts against **one** server
lifetime, and each leaves its rooms behind. The two smoke scripts added by this
plan (`host-controls`, `desktop-ui`) pushed the run past the production cap of
32 partway through, and everything after it failed to create a room at all.

This is a property of the harness, not of the server, so it was fixed in the
harness: `standalone/test-disposable.mjs` now sets
`GAHOOKZ_MAX_ACTIVE_ROOMS=64` for the server it owns. **Production is
untouched** — it reads the same variable, is not given one, and keeps the
default 32. The wrapper also now forwards `GAHOOKZ_BROADCAST_FLOOR_MS` and an
explicit `GAHOOKZ_MAX_ACTIVE_ROOMS` when a caller sets them, which is what let
the hosting work measure a before/after on a single build.

### Final state

```
npm run check  →  tests 186, pass 186, fail 0   (183 + 3 new Gahook Arena tests)
npm test       →  exit 0, all 25 shared smoke scripts
```

Stages F–H were audited as present and were retained; the browser-layout work
recorded above (`resume-layout-4.log`) stands. What this session added is the
proof that the whole suite passes alongside it.
