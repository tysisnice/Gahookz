# Handoff — state of the project

## Current checkpoint — executor session, 2026-10-23 (session storage)

**Current.** The other half of **P01 step 6** on branch
`agent/session-storage` (worktree `Projects/gahookz/worktrees/session-storage`):
device storage
([record](verification/2026-10-23-session-storage/README.md)). The snapshot
half landed earlier today and is the checkpoint below.

Storage was the last item in step 6's list still sitting untyped in `app.jsx`:
the credential that *is* this player, the saved join, the per-room password and
the `?pwd=` link an older release used to write. It is data this code did not
write — another release wrote some of it, the person can edit all of it, and a
browser may answer every read with an exception — and nothing checked any of
it. Measured on the real client, two defects:

- **A stored `name` of `12345` rendered a blank page.** `w.trim is not a
  function` during render: no join form, no message, no way back but clearing
  site data. One value in `localStorage`, and that device is out of the game.
- **Guest play was impossible with site data blocked.** `getClientKey()` caught
  the storage failure and returned a *fresh* random key — and it is called on
  every render and every command, so each call was a different person. One tab
  sent **1,001 distinct player keys** in a few seconds, the room accepted one
  of them, and the screen sat on "Joining" for ever. A browser setting is not
  an account, and CLAUDE.md's first rule says guest play must work.

Both are fixed in `client/session.ts`, which is handed a store rather than
reaching for one, so what lands where is decided in daylight and a test can
supply a store that throws. A saved join is rebuilt field by field from the
five fields the app can use, so an unknown key cannot survive a round trip, a
value that is not a string is dropped, a picture that is not a `data:` image is
dropped, and a `password` an older release stored durably is **wiped** rather
than stepped over. The credential is kept in memory when the browser will not
keep it. A legacy link's password now reaches only the room that link named,
with the room code coming from the router rather than a second reading of the
path.

Same browser, same three scenarios: 1,001 keys → **1**, blank page → a join
form and a lobby, and the `?pwd=` scrub unchanged and now guarded.

Verified on **Node 24.22.0**: `npm run check` (308/308 unit, up from 289;
strict TypeScript; build `release-eb981898735f10fb`), the full `npm test` chain
exit 0, `npm run test:browser` 18 checks, `test:browser:navigation` green
(it covers `/host` and `/play` versus `/HOST`, which this touches), the new
`npm run test:browser:session` 7 checks, and `docs:check` 113 files. Ten
mutations, all caught; the browser suite fails against `main` with exactly the
measured blank page.

**Next.** Roadmap section 2 continues, and nothing below needs an owner
decision:

1. **Section 2, item 2's remaining half** — player media across every
   moderation surface. The identity work is done; media is not.
2. Then section 3's characterized Gahook extraction.
3. P01 steps 4 and 7 remain open: staged schema migration, and the build/dev
   wiring plus per-endpoint request validation. This slice exercised the
   build-wiring part of step 7 for one new module (build list, versioned
   import, dev watcher, generated-file exclusion, offline cache) without
   claiming the step.

**Limits — and what needs Tyson.**

- **Nothing was deployed.** Production is still `74a489949e02`. Today's two
  slices both change client behaviour for players whose connection or browser
  is unusual, so they are worth a deploy when you want one — a deploy is a
  separate current-chat approval.
- **Private browsing on a real iPhone is still unproven.** The blocked-storage
  case is simulated by making every write throw. Only a device can settle what
  iOS Safari does now; it belongs with the other human evidence.
- **The schemas still do not run in the browser.** Both boundaries now handle
  unknown data as *shape*, not as `PublicSnapshotSchema`. Validating against
  the contract means either shipping zod to phones or generating a
  dependency-free guard from it; that choice is in the backlog, unmade.
- **`CLAUDE.md` is still unmerged.** `84a8032` on `coordinator/audit-20261021`
  adds the coordination links; the file is protected, so it stays for Tyson. No
  work depends on it.
- **The Node 24.22 image pin is still waiting on you.** `1282bce` is unblocked,
  but it changes the digest production builds from, so it wants a rebuild plus
  a full smoke run as its own slice.
- Still open from before: whether the shared screen should show the *text* of
  unvoted Herd answers, the welcome-screen guides link, and whether a host may
  censor a live prompt mid-round.

## Earlier checkpoint — executor session, 2026-10-23 (snapshot adapter)

**Current.** Roadmap section 2, item 1 continued on branch
`agent/snapshot-adapter` (worktree `Projects/gahookz/worktrees/snapshot-adapter`):
**P01 step 6**, the typed browser adapter
([record](verification/2026-10-23-snapshot-adapter/README.md)).

Most of step 6 landed in September. What had never moved was the request the
whole room depends on: `POST /api/state` was still fetched inline in
`useEvents`, with its own `fetch`, its own headers, its own routing and no
timeout — the only request in the client outside the boundary, and the one
place where no test could reach the decisions.

Three callers ask for a snapshot — the recovery poll after 25 seconds of
silence, every settled command, and a tab becoming visible — and none of them
knew about the others. Nothing waited and nothing timed out, so **a request
that was never answered did not stop the next one being sent.** Measured in a
real browser, in a real room, with the connection black-holed: eight snapshot
requests started in sixty seconds, all eight still open at the end, one more
every five seconds for as long as the room stayed open. Ten minutes of lost
signal is about 115 from one phone, a 20-player room some 2,300, and they all
land at once when the network returns, each serialising a whole room. The
screen was not broken while this happened, which is why nobody saw it.

Now: one request in flight, at most one follow-up queued behind it (a trigger
means "look again", so dropping every overlapping ask could leave the last
change unseen), a 10-second timeout that frees the slot, nothing dispatched
after a view is left, and the five routing decisions — apply, room gone,
banned, locked, refused — as a pure tested function. Same browser, same
black hole: **one**. A 200 that is not an object is now reported instead of
being quietly dropped by the gate, and a failed fetch no longer puts the
browser's own "Failed to fetch" on a player's screen.

Two dead declarations went with it: `StorageLike`, which nothing ever
implemented, and `ApiCallOptions.signal`, which nothing ever passed and which
did nothing when it was.

Eleven mutations, each applied to real source and restored by checksum; all
eleven caught. One is worth reading: the first version checked the concurrency
rule in **two** places, so removing either left the invariant held by the other
and the mutation passed everything. A redundant rule is not a defended one, so
`run()` now owns the decision alone. The new browser suite was proved the same
way, against `main`'s client, where it fails with *"requests stacked up: 4 were
open at once"*.

Verified on **Node 24.22.0**: `npm run check` (289/289 unit, up from 279;
strict TypeScript; build `release-551bb2eef6cd0b69`), the full `npm test` chain
exit 0, `npm run test:browser` green including its existing *0 recovery polls
over 32 seconds of a quiet host lobby* — the healthy-path cadence step 6 asks
to leave alone — the new `npm run test:browser:recovery`, and `docs:check` 113
files.

**Next.** Roadmap section 2 continues, and nothing below needs an owner
decision:

1. **The rest of P01 step 6** — session storage. `gahookz-client-key` (the
   `playerKey`), `gahookz-last-join`, the per-room `sessionStorage` password and
   the `?pwd=` scrub are still untyped and untested in `app.jsx`, and that is
   where a credential leak would happen: `getSavedJoin` already strips a
   `password` key that an older version wrote durably, which is a migration
   nobody can see fail.
2. **Section 2, item 2's remaining half** — player media across every
   moderation surface. The identity work is done; media is not.
3. Then section 3's characterized Gahook extraction.

**Limits — and what needs Tyson.**

- **Nothing was deployed.** Production is still `74a489949e02`. A deploy is a
  separate current-chat approval. This slice changes client behaviour on a dead
  connection, so it is worth a deploy eventually, not urgently.
- **Step 6 is not finished and is not claimed.** Session storage is still in
  `app.jsx`, and what the browser enforces is "a usable object", not a
  described payload. Validating against `PublicSnapshotSchema` in the browser
  means either shipping zod to phones or generating a dependency-free guard
  from it — a real choice, now written into the backlog rather than assumed.
- **The browser suite is not in `npm test`.** No browser suite is; they need
  Chromium and 40 seconds. A `smoke-security` tripwire covers the same seam in
  the gating chain.
- **One copy string is now reachable where it was not.** A room that cannot be
  reached shows "Could not reach this room. Check the server, then retry." —
  pre-existing wording, aimed more at an operator than a player. Queued as a
  copy task rather than rewritten inside an engineering slice.
- **`CLAUDE.md` is still unmerged.** `84a8032` on `coordinator/audit-20261021`
  adds the coordination links; the file is protected, so it stays for Tyson. No
  work depends on it.
- **The Node 24.22 image pin is still waiting on you.** `1282bce` is unblocked,
  but it changes the digest production builds from, so it wants a rebuild plus a
  full smoke run as its own slice.
- Still open from before: whether the shared screen should show the *text* of
  unvoted Herd answers, the welcome-screen guides link, and whether a host may
  censor a live prompt mid-round.

## Earlier checkpoint — executor session, 2026-10-22 (Herd anonymity)

**Current.** Roadmap section 2, item 1 continued on branch
`agent/herd-anonymity` (worktree `Projects/gahookz/worktrees/herd-anonymity`):
P02 **steps 1, 2 and 4**
([record](verification/2026-10-22-herd-anonymity/README.md)).

The engine was already right, and had been for a while: `buildHerdAssignmentPlan`
drew an independent displayed-slot permutation per prompt and the seeded
4/5/8/20-player tests were already there. What was missing was anything proving
the **server spent it**. `standalone/server.js` read
`ANSWER_META[assignment.displayIndex]` inline, and every engine test would still
have passed had it read `answerIndex` — the author leak back in production, no
failing test anywhere.

Found on the way, and this is the part worth reading: **the shared screen named
every Herd writer before the vote.** During `herd-writing` the host screen — the
screen the whole room watches — printed "Answer by <name>" under every answer as
it arrived, two lines below its own promise that "Answers stay anonymous during
voting." The 2026-10-21 privacy work had checked that non-hosts cannot obtain
that payload, which is a different question from whether the host should show it
to the room. `answerAuthor` is no longer sent in the host's review list, the
contract now forbids it there and requires it in a writer's own list, and the
card says the writer is hidden until the reveal. Moderation loses nothing: an
answer is removed by prompt and slot, and the player wall still shows who owes
one.

What else landed:

- `standalone/server/herd-answers.mjs` — the slot-building step as a named
  module, identity from `displayIndex`, sorted into display order rather than
  trusting the plan, refusing a slot that does not exist, two writers in one slot
  or one writer twice. Nine unit tests, built on a plan where rotation and slots
  disagree on every writer. A startup check keeps the writer cap within the
  display table, so raising `HERD_MAX_AUTHORED_ANSWERS` fails at boot instead of
  producing an answer with **no id** — unvotable, unscorable, invisible to
  moderation.
- The attack fixtures bounded against *measured* chance. Replaying the old
  circular formula must now score below `1/n + 0.08`, not a round `0.6` that
  half a leak would pass. Two new attacks: whether the first displayed slot says
  who has written least (the rotation scores 0.75–1.00 against a 0.48 baseline;
  the displayed slot 0.46–0.52), and whether writers who share two prompts keep
  their order. Each asserts what the rejected design scores, so the test cannot
  go quietly vacuous.
- `standalone/smoke-herd-anonymity.mjs` in the shared chain: a real five-player
  game, writers unnamed in every payload until the reveal, the four slots
  complete and in order with stable text, a refresh returning the same prompt and
  the same order to host and player alike, and both attacks replayed over HTTP.
  The old-formula attack tries every prompt as the watched one (80 predictions,
  measured 17–25, bound 60, a leak being 80) and first proves itself against a
  synthetic game the old allocator would have produced, so an attack that had
  stopped detecting anything fails instead of passing quietly.
- `ownHerdAssignments` and `herdAnswerReview` described in the contract rather
  than tolerated (58 → 56), with the rule also pinned on hand-built payloads.

Verified on **Node 24.22.0**: `npm run check` (279/279 unit, up from 266; strict
TypeScript; build `release-70d7efeeafd8d804`), the full `npm test` chain exit 0,
`docs:check` 113 files. Nine mutations applied one at a time; eight were caught.
The ninth — the whole display path following the writing rotation, sort included
— passes the server suite and is caught only by the unit tests, because that
leak is statistical over many games. The record states that plainly rather than
tidying it, and it is why both layers exist.

**Next.** Roadmap section 2 continues, and nothing below needs an owner
decision:

1. **P01 step 6** — the typed browser adapter, where these schemas would start
   enforcing instead of describing. It is the last open piece of P01.
2. **Section 2, item 2's remaining half** — player media across every
   moderation surface. The identity work is done; media is not.
3. Then section 3's characterized Gahook extraction.

**Limits — and what needs Tyson.**

- **Nothing was deployed.** Production is still `74a489949e02`. A deploy is a
  separate current-chat approval.
- **One product judgement, not a defect.** The shared screen still shows the
  *text* of every Herd answer while the room writes, which is how the host
  moderates. Whether a room should read the answers before voting on them is
  your call; the anonymity problem is fixed either way.
- **Social anonymity is still not claimed.** A writer recognises their own
  wording and a table can collude. What is proven is that the payload and the
  displayed colour carry nothing about who wrote an answer.
- **The server's randomness stays `Math.random`.** Injecting a seed into a live
  server would be a way to predict a real game, so determinism lives in the
  engine fixtures and the server suite asserts only what holds for every game.
- **`CLAUDE.md` is still unmerged.** `84a8032` on `coordinator/audit-20261021`
  adds the coordination links; the file is protected, so it stays for Tyson. No
  work depends on it.
- **The Node 24.22 image pin is still waiting on you.** `1282bce` is unblocked
  now that the laptop runs 24.22.0, but it changes the digest production builds
  from, so it wants a rebuild plus a full smoke run as its own slice.
- Still open from before: the welcome-screen guides link, and whether a host may
  censor a live prompt mid-round.

## Earlier checkpoint — executor session, 2026-10-22 (contract payloads)

**Current.** Roadmap section 2, item 1 continued on branch
`agent/contract-phase-payloads` (worktree
`Projects/gahookz/worktrees/contract-phase-payloads`): P01 **step 2**, the
discriminated phase payloads, and P01 **step 5**, validating real response
shapes before enforcing anything
([record](verification/2026-10-22-contract-phase-payloads/README.md)).

The rules were already right. The *evidence* was not, and measuring it first is
what this step asks for:

- the public snapshot contract described **11 of 76** fields and passed 50
  through silently; it now describes 18 and lists the other 58 as knowingly
  tolerated, so a new server field fails a test by name;
- the fixture corpus was **fifteen server fields stale** and nothing could tell.
  `building.host` and `building.player` held `lobby` snapshots, so the building
  phase was never covered; `lobby.spectator` was captured with the host's own
  credential and recorded `isHost: true`; no captured player had ever submitted
  a question, so the test named "a player's own questions still show them their
  own answer key" was guarded by `if (own?.length)` and never ran. Three of
  those four were asserted by tests that passed.

What landed: captures that play real games through Quiz Classic, Majority and
Herd with deliberately split votes so a real tie reason reaches a fixture;
`PublicSnapshotSchema`, a `phase`-discriminated union pinning the three gates
`publicQuestion` implements, plus locked game rules, the Quiz key versus the
Majority prediction, and tie explanations that may not be false; and
`standalone/smoke-contract-drift.mjs` in the shared chain, which validates real
responses live and fails when the corpus drifts from the server in either
direction.

Verified on **Node 24.22.0**: `npm run check` (266/266 unit, up from 254;
strict TypeScript; build `release-2e544d33f0fabce4`), the full `npm test` chain,
`docs:check`. Six mutations were applied one at a time to prove the new rules
bite; five were caught here and the sixth by an existing engine test, which the
record states rather than tidies.

**Next.** Roadmap section 2 continues, and nothing below needs an owner
decision:

1. **P02 steps 1, 2 and 4** — the private per-question displayed-slot
   permutation is already implemented in `buildHerdAssignmentPlan` (an
   independent `shuffledSlots` per question, `byQuestionId` sorted by
   `displayIndex`); what is missing is proof that the **server** uses
   `displayIndex` rather than `answerIndex` for every identity, and the seeded
   4/5/8/20-player attack fixtures showing a prior reveal cannot predict the
   next mapping from the old circular formula.
2. **P01 step 6** — the typed browser adapter, which is where these schemas
   would start enforcing instead of describing.
3. Then section 3's characterized Gahook extraction.

**Limits — and what needs Tyson.**

- **Nothing was deployed.** `main` keeps moving; production is still
  `74a489949e02`. A deploy is a separate current-chat approval.
- **`CLAUDE.md` is still unmerged.** `84a8032` on `coordinator/audit-20261021`
  adds the coordination links; the file is protected, so it stays for Tyson. No
  work depends on it — the same two documents are linked from the README, this
  handoff and the agent guide.
- **The Node 24.22 image pin is now unblocked.** I held `1282bce` back because
  its `.node-version`/`.nvmrc` pinned 24.22.0 against a 24.18.0 laptop. Node
  24.22.0 became the default runtime here on 2026-10-21, so that objection is
  gone. It still changes the digest production builds from, so it wants a
  rebuild plus a full smoke run as its own slice — say the word.
- **These schemas do not run in production.** The server imports only
  `HostSettingsRequestSchema` and `normaliseGameSettings`; the snapshot schemas
  run in tests. That is why tightening them could not affect a live player, and
  equally why they prove shape rather than enforce it.
- The `health` fixture now comes from the disposable development server. The
  September capture from a built container is preserved as `health.built.json`
  rather than overwritten, because the schema has to accept both.
- Still open from before: the welcome-screen guides link, and whether a host may
  censor a live prompt mid-round.

## Earlier checkpoint — executor session, 2026-10-21

**Current.** `main` is at the privacy-contract merge; the branch
`agent/privacy-moderation-contract` (worktree
`Projects/gahookz/worktrees/privacy-moderation-contract`) carried it. Two blocks
landed today, in this order:

1. The coordinator's audit documentation, integrated as named files after a
   line-by-line review (`273a372`). Every factual claim I could test, I tested:
   the pre-reveal privacy rule against `publicAnswerSelections`, ETag/304 in
   `serveFile`, `node:24-alpine` in every Dockerfile stage. Two pieces were
   **held back** deliberately — see *Limits*.
2. Roadmap section 2, items 1 and 2: the role and phase privacy contract as
   executable negative cases, plus one real duplicate key removed from the
   host's Herd review payload and a guard generalised to catch its whole class
   ([record](verification/2026-10-21-privacy-moderation-contract/README.md)).

Verified on Node 24.18.0: `npm run check` (254/254 unit, strict TypeScript,
build `release-2e544d33f0fabce4`), the full `npm test` chain, and `docs:check`
(113 files). Every new assertion was proved non-vacuous by breaking the rule it
protects and watching it fail; the four mutations and their messages are in the
record.

**Next.** Roadmap section 2 continues. The obvious next slice is the one this
block deliberately did not take: **runtime validation** of the payloads whose
privacy is now proven (P01 steps 2 and 5), or the P02 step 1/4 permutation and
seeded attack fixtures. Both are bounded and need no owner decision. Section 3's
characterized Gahook extraction remains the larger next move after that.

**Limits and what needs Tyson.**

- `CLAUDE.md` is protected, so the audit's `CLAUDE.md` commit (`84a8032` on
  `coordinator/audit-20261021`) was **not** applied by me. It is ready on the
  branch for Tyson to land. The same two documents are linked from the README,
  this handoff and the working agreement, so nothing depends on it.
- `1282bce` on that branch pins a new `node:24-alpine` digest (24.22.0) and adds
  `.node-version`/`.nvmrc`. It arrived after the verification, it changes the
  image production is built from, and it pins 24.22.0 while this laptop has
  24.18.0 — so it needs a rebuild and the full smoke suite as its own slice.
  Only its two ignore-file lines were taken. **Not integrated.**
- Production is still `74a489949e02` and the gap to `main` keeps growing. No
  deploy was made or implied.
- The main checkout's `node_modules` was found empty (timestamped 14:27 today)
  and was reinstalled. npm 11 denies install scripts by default; esbuild and
  Puppeteer both still work, but a future "nothing builds" report may start
  here.

## Earlier checkpoint — coordinator audit, 2026-10-21

Baseline main `170105c`; current ordered work is [ROADMAP.md](ROADMAP.md), with the [coordination contract](COORDINATION.md). The dated 18–19 Oct account below is retained historical context, not today's next-task list. Recent night-shift merges include Herd status copy, independent reduced-effects/mute, duplicate-key and dead-export cleanup.

The existing tmux `gahookz` session is idle at the audit capture; `deploy it` is an unsubmitted draft and was not executed. Latest visible Claude plan: Gahook subsystem extraction. Reconcile the roadmap before resuming, and do not confuse later night-shift commits with a currently running Claude turn.

Fresh audit verification on installed Node 24.18.0: `npm run check` (252/252 unit, strict TS, build), full `npm test`, disposable `test:rooms` (12 games), disposable `test:browser` (18 checks), `test:deploy-script` (8 cases), `docs:check` (111 files before audit edits), all exit 0. Full raw output: `/Vault/Assistant/Tasks/Output/Gahookz and Arena audit 2026-10-21/`. No PostgreSQL/container-volume/load, physical-device or human fun claim is implied.

Read-only public health reported production `74a489949e02`, account persistence `memory`, Google login unavailable; it remains older than main. No deployment in this audit. Node 24 **is installed** at `/usr/bin/node-24`, though `/usr/bin/node` still points to 22; use an explicit Node-24 PATH rather than asking Tyson to install it again. No current product decision blocks the roadmap's engineering slices.


**Written 2026-10-18, updated 2026-10-19 by Claude Code (executor session).** Read this, then
[`CLAUDE.md`](../CLAUDE.md). This is the short version: where things stand, what
is half-finished, what to do next. The detailed history is
[`docs/history.md`](history.md) and the ledger in
[`IMPLEMENTATION-PLAN.md`](../IMPLEMENTATION-PLAN.md) section 8; the live list of
open work is [`docs/backlog.md`](backlog.md).

## In one paragraph

Production runs `74a489949e02`, deployed 2026-10-18, which closed the 48-commit
gap the previous handoff led with: everything Tyson asked for on 8 October is
live, along with a host-Gahook security fix, the Herd rotation work and the
development-watcher repair. The rollback plan has been rehearsed for the first
time, and every suite passes on this laptop — including the browser suites,
which could not run here at all until Chromium was installed.

Since then `main` has moved ahead of production, and **nothing is
half-finished**: both decisions that were waiting on Tyson were answered on
2026-10-19 (**forget GET GOT during live rounds**, **Node 24** as the declared
runtime), and `agent/small-fixes` is finished and merged. So the obvious next
thing is to ask whether to deploy; nothing waiting is urgent.

## The live services

Checked 2026-10-18 15:58 AEDT, straight after the deploy:

| | Revision | Notes |
| --- | --- | --- |
| `main` | `74a4899` plus the commits listed below | Everything in *What shipped* is verified against `74a4899` |
| Production (gahookz.com, :3102) | `74a489949e02` | Deployed 2026-10-18. **`main` has moved ahead of it:** the paused-skip refusal (`d1c00fe`) and the whole 2026-10-19 batch below are not live. Nothing in them is urgent or risky; a deploy needs Tyson's word. Rollback target `gahookz:rollback-prod-20261018-1556` |
| Beta (:3103) | `f15af0b9da5d` | Older by design; used for the rollback rehearsal and restored |
| Development (:3101) | bind-mounts the Store tree | So dev *is* current |

All three run under the **one** Compose project `gahookz-prod`, so a bare
`docker compose up -d` in the repository recreates production too. Always name
the service and pass `--no-deps`.

## What happened on 2026-10-18

Five branches that had been sitting unmerged since 11–17 October were verified
and merged, two defects were found on the way in, and a six-day outage was
found and fixed. Each has a record under `docs/verification/`:

- **[Host Gahook claim gate](verification/2026-10-18-host-poke-claim/README.md)** —
  a host who created a room but never joined it could Gahook a live round
  without the per-question limit, up to GET GOT. Fixed, with a regression smoke.
  This was also the cause of the long-running `smoke-gahooks` failure.
- **[The development watcher](verification/2026-10-18-dev-watcher/README.md)** —
  `dev.gahookz.com` had been dead for six days behind a container reporting
  "Up", because the watcher would not restart a server that exited *cleanly*.
  The trigger was a host-side `pkill -f server.js` that also restarted
  production and beta twice, ending any games in progress. Fixed three ways:
  the watcher, `scripts/docker-status.sh` (it only ever looked at production),
  and `scripts/stop-test-server.sh` as the safe way to stop a test server.
- **[Deploy safety](verification/2026-10-18-deploy-safety/README.md)** — the
  deploy script refuses, rather than warns and proceeds, wherever it would end
  a game nobody agreed to end, and cancels an abandoned drain.
  `npm run test:deploy-script` holds each decision against a stubbed Docker.
- **[Rollback rehearsal](verification/2026-10-18-rollback-rehearsal/README.md)** —
  Option 2 works on beta. It also showed that the 2026-10-02 rollback images
  report `revision: unknown`, so a rolled-back service must be identified by
  image tag and `builtAt`.
- **[The deploy itself](verification/2026-10-18-deploy/README.md)**.
- **Herd rotation (P06 step 2)** — questions and authors now rotate by stable
  ID across rematches, with nine 2/3/5-player boundary fixtures
  (`npm run test:herd-boundaries`). The author ordering was wrong in the branch
  and is fixed (`e1ae787`).

## What happened on 2026-10-19

- **Both owner decisions answered** and recorded where the findings live: live
  GET GOT is left as it is, and Node 24 is the declared runtime
  ([node 24 record](verification/2026-10-19-node-24/README.md)).
- **`agent/small-fixes` is finished and merged**, with every item in it done and
  three proved in a real browser
  ([record](verification/2026-10-19-small-fixes/README.md)): the Install app
  button, "Game guides" linking `/information` from inside the game for the
  first time, `/host` and `/play` as entry points, two first-paint modules
  missing from the PWA shell cache, the host-away notice covering the lobby
  banner, host removal of a reported answer or question, and a disconnected Herd
  writer no longer blocking Start. Skip's paused rule moved into
  `skipDecision(phase, { paused })`.
- **Nothing is half-finished.** There is no WIP branch to pick up.

## What to do next

1. **Ask Tyson whether to deploy.** `main` now carries player-visible changes
   production has never run (the whole 2026-10-19 batch, plus the paused-skip
   refusal). Nothing is urgent and nothing is risky, but the gap will keep
   growing. Never deploy unasked (`CLAUDE.md` rule 2).
2. **Nothing is blocked on a decision.** The only thing left for Tyson is
   installing Node 24 (below).
3. **Split the monoliths.** `server.js` (5,650 lines), `app.jsx` (5,496),
   `styles.css` (11,414) are the item that most slows everything else down.
   `standalone/server/question-selection.mjs` is the pattern that works:
   extract a vertical slice, inject the rules it needs, unit test it. The
   Gahook subsystem (`pokePlayer`, the spam window, Ultimate, GET GOT, counter
   Gahooks, the duel) is the most self-contained next candidate. See
   [the TypeScript plan](plans/typescript-migration.md).
4. Then the rest of [`docs/backlog.md`](backlog.md).

## Waiting on Tyson

- **Install Node 24 on this laptop.** Decided 2026-10-19: `engines.node` is now
  `>=24.0.0`, matching CI and the `node:24-alpine` image, but the system Node is
  still 22, so local verification runs below the declared floor. Nothing refuses
  — there is no `.npmrc`, so npm only warns — but a timing-sensitive result
  cannot be trusted to match production until it is installed. It needs your
  password: Fedora 44 has `nodejs24` (24.18.0) in `updates`, and nothing but its
  own subpackages requires the installed `nodejs22`
  ([record](verification/2026-10-19-node-24/README.md)).
- Plus the longer-standing ones in the backlog's *Owner decisions* section:
  accounts, audience and monetisation, the Herd author-points denominator.

Answered on 2026-10-19, for the record:

- **GET GOT during live rounds: leave it.** No work on making the −1,000 penalty
  reachable and no live-phase test coverage for it; the lobby assertions stay as
  they are ([record](verification/2026-10-18-host-poke-claim/README.md)).
- **Node version: Node 24.** The floor is raised and every document that
  described the old `>=20` state is updated
  ([record](verification/2026-10-19-node-24/README.md)).
- **Node 24 is installed** (done by Tyson, found 2026-10-21): `nodejs24`
  24.18.0 and `nodejs24-npm` 11.16.0, as `/usr/bin/node-24` and
  `/usr/bin/npm-24`. `/usr/bin/node` is still 22 and the packages are designed
  to coexist, so a verification run needs an explicit Node 24 PATH — the tested
  recipe, and the trap that makes `npm-24 run` insufficient, are in
  [the agent working agreement](agents/README.md).

Two operational suggestions, neither urgent:

- **`GAHOOKZ_METRICS_TOKEN` is not set in `.env`**, so no deploy can drain.
  Today's deploy was safe because the hardened script checks `activeRooms` and
  refuses if anyone is playing — but a graceful drain needs the token, and it
  only takes effect on the deploy *after* it is added.
- **Nothing watches health between sessions.** Docker will not restart an
  unhealthy container. `scripts/docker-status.sh` now reports every service and
  exits non-zero, which is enough for a small timer to call and report through
  Hermes.

## How to verify (this laptop)

The previous handoff said tests time out here and must run on the desktop. That
is stale: this machine has twelve cores and 15 GB, and the full matrix takes
about four minutes.

```bash
cd /mnt/storage/syncthing/Store/Projects/gahookz
npm run check                    # typecheck, unit tests, build
npm test                         # shared smoke chain, owns its own servers
npm run test:deploy-script       # deploy decisions, stubbed docker, no containers
npm run test:disposable -- npm run test:rooms
npm run test:disposable -- npm run test:herd-boundaries
npm run test:disposable -- npm run test:browser          # and :navigation, :mobile, :herd-writing
npm run docs:check
```

Chromium for the browser suites lives in `~/.cache/puppeteer` (installed
2026-10-18 with `npx puppeteer browsers install chrome`); without it every
browser suite fails at launch rather than failing a check.

## Traps that have already caught someone

- **`pkill -f server.js` reaches inside the containers.** It has taken
  production down twice. Use `bash scripts/stop-test-server.sh 3199`.
- **One Compose project.** Name the service and pass `--no-deps`.
- **`styles.css` merges.** Two branches appending rules conflict, and a
  union-merge once dropped a closing brace, silently disabling every rule after
  it. There is a test that every stylesheet closes its braces — keep it.
- **The three stamped shell files** (`index.html`, `service-worker.js`,
  `vendor-bootstrap.js`) conflict on nearly every merge. Resolve with
  `git checkout --theirs` then `npm run build`, never by hand.
- **`node_modules` is a symlink in worktrees.** Never `git add -A` blindly;
  never `npm ci` inside a worktree.
- **Browser suites can overwrite dated evidence.** Check `git status` before
  committing and restore dated folders.
- **Two orchestrators at once.** On 8 October two sessions built the same
  feature twice. Check `pgrep -af claude` and `git log` before starting.
- **Keep progress in the repository, not the vault.** A vault copy of the plan
  drifted from this one and two finished branches were lost because nothing
  here recorded them. The vault file is now a pointer.
