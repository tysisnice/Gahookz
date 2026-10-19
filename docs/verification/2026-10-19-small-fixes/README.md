# `agent/small-fixes` finished: seven shell and moderation items (2026-10-19)

- Branch: `agent/small-fixes`, resumed from the WIP checkpoint `7e629d1` ("agent
  stopped at the usage limit"), `main` merged in, then finished.
- Production touched: **no**. Every run used a disposable server on
  `127.0.0.1:3199`.
- No deploy. `main` now carries player-visible changes production has never run.

## What the branch already had, and what it cost to pick up

Two items were in the WIP diff and unverified. Both verify green now, but
merging `main` first turned up a trap worth recording: the night-shift block of
2026-10-19 had implemented the **same** server-side paused-skip refusal on its
own branch (`d1c00fe`). Git merged both insertions cleanly because they sat at
different lines, so `skipPhase` ended up checking `room.paused` **twice** — once
before the phase decision and once after. A textually clean merge is not a
semantically clean one.

The duplicate is gone and the rule moved to where the rest of the Skip policy
lives:

```js
export function skipDecision(phase, { paused = false } = {}) {
  const decision = decideByPhase(phase);
  if (decision.ok && paused) {
    return { ok: false, action: "none", error: "Resume the game before skipping." };
  }
  return decision;
}
```

The phase is decided first, so a phase that was never skippable keeps its own
reason: a host whose game has finished is told it has finished, not told to
resume it. (Unreachable today, because `finishGameNow` clears `paused`, but it
is the honest ordering.) The two smoke blocks that had grown in parallel were
merged into one — `main`'s was stronger, so the branch's was dropped and the two
assertions it had that `main`'s lacked were moved across.

## The seven items

| Item | What was wrong | What it does now |
| --- | --- | --- |
| Install app | `usePwaInstall` had been exported and called by nothing since the offline work, so the app could only be installed from a browser's own menu | `InstallAppButton` in the welcome footer and all three menus, rendering nothing until the browser offers an install |
| Link to `/information` | Nothing in the game linked the page at all | "Game guides" in the host, player and join menus, opening a new tab so nobody loses their seat |
| `/host` and `/play` | `serveStatic` served `index.html` for both, then `getRoute` read them as the room codes `HOST` and `PLAY`, so `gahookz.com/play` landed on a room that does not exist | Entry points: `/host` opens the welcome screen with Host chosen and a room word ready, `/play` with Join chosen |
| Shell cache | `client/legal.js` **and** `client/report.js` were missing from `SHELL_ASSETS` while `app.jsx` imported both at the top level, so a cold offline launch died on an import | Both added, and `smoke-pwa` now walks the bundle's static import graph so the next omission fails a test |
| Host-away notice | The fixed notice stack is pinned under the top bar, which is exactly where the room status banner starts, so it covered the line telling players what the room was doing | The layer measures itself and publishes `--host-notice-space`; the banner reserves that much while a notice is up |
| Host removal from Reports | Only chat had a button; answers and questions worked over the API only | "Remove answer" and "Remove question" beside "Remove message" |
| Disconnected Herd writer | `getStartCheck` counted every eligible writer, connected or not, so one closed browser held the room | Only connected writers gate Start; an absent writer's blanks are filled with exactly the filler force-start uses |

## Two things that needed a judgement call

**The welcome screen does not link the guides.** `smoke-onboarding` has asserted
`!welcome.includes('href="/information"')` — "Welcome should no longer send
players to the reports page" — since 2026-07-20, when `/information` carried the
product roadmap, launch checklist, monetisation model and operations notes. That
material moved into the repository in September and the page holds three player
guides now, so the reason for the assertion is gone. The assertion was left
standing anyway and the link added to the in-room menus only, which is what the
backlog item asked for ("in-room link to `/information`"). **Putting it on the
welcome screen is Tyson's call**, and it belongs with the open owner question of
what that page is for. One line of `WelcomeScreen` and one assertion to retire.

**`/host` and `/play` are matched in lower case.** `/information` and `/legal`
are matched case-insensitively because neither can collide with a room code.
`HOST` and `PLAY` are both legal four-letter codes, and `buildRoomPath` writes
room links in upper case, so `/HOST` still opens the room coded HOST while
`/host` is an entry point. `browser-navigation` creates a room coded `HOST` and
proves it still loads.

## The in-play question: a worse defect than the one reported

The backlog said answers and questions had no browser button. Adding one exposed
something else. `removeStoredQuestions(..., { includeSelected: false })` leaves
`room.quizQuestions` alone on purpose — the phase machine indexes it, so
splicing an entry out mid-game would skip or repeat a round — but the same
question object is usually in its author's pool as well. So removing the question
a player had just reported **took it out of the pool, answered a plain
`ok: true`, and left it on everybody's screen.** The host pressed Remove on the
thing they were looking at and nothing appeared to happen.

It now still comes out of the pool, and says what is left to do:

```json
{ "ok": true, "removed": 1, "stillInPlay": true,
  "notice": "Taken out of the question list. It is in this round, so Skip to move past it." }
```

The browser shows that notice and **leaves the report open** as the reminder,
instead of dismissing it as it does for a removal that fully worked. Censoring a
live prompt the way a Herd answer is censored would change what players see
mid-round, so it is in the backlog as an owner decision rather than done here.

## Tests, and what fails without the fix

Non-vacuity was checked for each new assertion, not assumed.

| Test | Proof it bites |
| --- | --- |
| `standalone/server/phase-controls.test.mjs` — paused refusal across every pausable phase, the ordering, and that an unpaused room's decisions are unchanged | Run against `main`'s `phase-controls.mjs` in isolation: **8 pass, 1 fail** |
| `standalone/public/client/report-subjects.test.ts` — 6 tests over `canRemoveSubject` and `removalRequestFor`, including the last-colon split and a malformed report | New module; the split is the logic that would silently blank one colour in every prompt |
| `standalone/smoke-pwa.mjs` — walks the built bundle's import graph and requires every module in `SHELL_ASSETS` | Before the fix: `The first paint imports modules the service worker never caches: legal.js, report.js` |
| `standalone/smoke-herd-flow.mjs` — an in-play question reports `stillInPlay` and a notice naming Skip | Before the fix the same call answered a bare `ok: true` |
| `standalone/browser-navigation.mjs` — the host-away notice sits above the banner, and the banner moves down | With the CSS neutralised: notice `69.8–132.1`, banner top `80` — a **52 px** overlap, measured |
| `standalone/browser-navigation.mjs` — `/play` and `/host` choose Join and Host, `/HOST` still opens the room coded HOST, Install app appears once `gahookz-install-ready` fires | `/play` used to render `RoomLoading` for a room named PLAY |
| `standalone/smoke-layout.mjs` — both halves of the notice reservation | The custom property did not exist |

Two existing source-text assertions broke honestly, because `WelcomeScreen`
takes an intent now. Neither was weakened:

- `smoke-onboarding`'s `useState("join")` became assertions on the default
  (`{ intent = "join" }`) **and** the mapping, which is stricter than the
  literal it replaced, plus one that the welcome screen offers installing
  exactly once.
- `smoke-regressions`' `welcomePrefill.code || ""` guarded something real: a
  player sent back from a room that no longer exists must keep the code they
  followed, and no Join code may be invented. The new literal keeps that order
  and names the one case that does fill the field — `/host`, which exists to
  make a room.

## Commands run

Full matrix on the branch, under `flock /tmp/gahookz-verify.lock`, Node v22.23.1
(the declared floor is 24; see [the Node 24 record](../2026-10-19-node-24/README.md)):

```bash
npm run check                                             # typecheck + unit tests + build
npm test                                                  # shared smoke chain
npm run test:deploy-script
npm run test:disposable -- npm run test:rooms
npm run test:disposable -- npm run test:herd-boundaries
npm run test:disposable -- npm run test:browser
npm run test:disposable -- npm run test:browser:navigation
npm run test:disposable -- npm run test:browser:mobile
npm run test:disposable -- npm run test:browser:desktop-ui
npm run test:disposable -- npm run test:browser:herd-writing
npm run test:disposable -- npm run test:browser:herd-report
npm run test:disposable -- npm run test:browser:audio
npm run test:disposable -- npm run test:browser:arena
npm run docs:check
```

Counts and the final result are in the merge commit message. The browser suites
re-capture screenshots into `docs/verification/2026-09-25-update/ui-shell/`;
those are a dated historical record, so they were restored rather than committed
(the menus genuinely look different now — they have two more items).
