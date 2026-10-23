# Gahookz — current delivery roadmap

Updated 2026-10-21 by the coordinator. This is the **ordered execution index**, not a replacement for the approved scope or historical evidence. Start here → HANDOFF → the relevant area guide/code. `IMPLEMENTATION-PLAN.md` remains the detailed P00–P12 acceptance contract; `PLAN-PROGRESS.md` records partial acceptance; `docs/backlog.md` is the issue inventory. Older roadmap dates are not deadlines.

## Mission and quality bar

A funny, welcoming, phone-first party game where friends can host, join and finish Quiz, Majority Rulz and Herd without an account or developer coaching. Protect the shared-screen/phone loop: understandable setup, brief writing waits, fair scoring, readable reveals and an obvious rematch. Gahooks add expression without making core participation inaccessible. Keep existing owner-approved scoring; do not redesign it or revive live-round GET GOT without a new decision.

Quality means observable behaviour, not a count of merged tasks. A test that searches source text is a tripwire, not proof of a usable button. Simulations cannot establish that prompts are funny, and a Chromium viewport cannot establish iPhone Safari support.

## At a glance

- **Current integrated baseline:** `170105c`, clean at audit start, matched the locally recorded `origin/main` (no fetch performed).
- **Claude session:** laptop tmux `gahookz`, idle at audit capture, with an unsubmitted `deploy it` draft. Its last visible completed turn finished `agent/small-fixes`; its proposed next slice was Gahook subsystem extraction. Later repository work was merged by night-shift agents: see git and the implementation ledger, not the stale pane alone.
- **Live versus integrated:** read-only public health on 2026-10-21 reported production revision `74a489949e02`, `accountPersistence: memory`, Google login unavailable. A green current branch is not a deployed release. This audit does not deploy or submit the draft.
- **Runtime:** Node 24.18.0 is installed as `/usr/bin/node-24`; the system `/usr/bin/node` still resolves to 22.23.1. Use an explicit Node-24 PATH for verification. No root installation is necessary to run tests with the installed binary.

## Pipeline

### 1. Preserve the playable baseline — delivered, keep regression coverage

- [x] Guest hosting/joining and three mode flows; authoritative server and SSE recovery.
- [x] Host claim-gate repair, safer deploy refusal/cleanup and beta rollback rehearsal (18 Oct evidence).
- [x] Small-fixes batch: entry routes, install control, cache imports, host-away layout, report controls and disconnected-writer Start repair.
- [x] Herd author rotation/boundary coverage and honest writing/carryover status copy.
- [x] Recent focused cleanups: duplicate result key, independent reduced-effects preference, dead room-asset exports.
- [x] Coordinator fresh baseline: 252 unit tests, typecheck/build, full smoke chain, 12 HTTP room games, 18 browser checks, 8 deploy-script cases and documentation check.

These checkboxes describe integrated work and the cited baseline, **not full P01–P12 completion** or a public-launch approval.

### 2. Now — close engineering gaps that protect the party loop

Work these as bounded vertical slices; keep one active implementation goal plus one independent coder task.

- [ ] Finish the role/phase snapshot privacy contract and executable negative HTTP/SSE cases (P01/P02). Majority/Herd choices stay hidden until reveal; Classic's live picks are an intentional owner decision, not a new privacy defect.
  - **2026-10-23 (P01 step 6, session storage):** the last item in step 6's
    list, and the one with the findings. A saved join whose `name` was the
    number `12345` threw during render and left a **blank page** — no join
    form, no way back but clearing site data — and a browser with site data
    blocked minted a new credential on every call, so one tab sent **1,001
    different player keys** and never got past "Joining": guest play was
    impossible with a browser setting, which CLAUDE.md's first rule does not
    allow. Device storage is now `client/session.ts`, which is handed a store
    rather than choosing one, rebuilds a saved join field by field, wipes a
    credential an older release stored durably, keeps the key in memory when
    the browser will not, and offers a legacy `?pwd=` link's password only to
    the room that link named
    ([record](verification/2026-10-23-session-storage/README.md)). Step 6's
    list is now all there; what the browser enforces is still shape, not
    `PublicSnapshotSchema`.
  - **2026-10-23 (P01 step 6, snapshot dispatch):** `/api/state` was the one
    request still outside the typed boundary, fetched inline in `useEvents`
    with no timeout and no knowledge of the other two callers. A real browser
    on a black-holed connection stacked **eight** unanswered snapshot requests
    in sixty seconds, one more every five, for as long as the room stayed open;
    it is now one, with a timeout, a single queued follow-up and the five
    routing decisions as a tested pure function
    ([record](verification/2026-10-23-snapshot-adapter/README.md)). Healthy-path
    cadence is unchanged. Still open in step 6: session storage is still in
    `app.jsx`, and the browser enforces "a usable object", not a described
    payload.
  - **2026-10-22:** the payload those rules produce is now described per phase. `PublicSnapshotSchema` discriminates on `phase` and pins the three gates `publicQuestion` implements (answers listed from `reading`, text filled from `answering`, key and authors only at `reveal`), plus locked game rules, the question key/prediction distinction and truthful tie reasons; `smoke-contract-drift` validates real responses live. The fixture corpus had stopped being evidence — fifteen server fields no fixture contained, `building.*` captured in the lobby, `lobby.spectator` captured as the host, no authored question anywhere — and all of that is repaired and now guarded ([record](verification/2026-10-22-contract-phase-payloads/README.md)). Still open: 58 of 76 snapshot fields are listed as tolerated rather than described, and nothing validates at runtime (P01 step 6).
- [ ] Finish the moderation path for player media and verify exact question/answer identity end to end. Preserve the current honest `stillInPlay`/Skip behaviour for live prompts; do not silently change it.
  - **2026-10-23 (player media):** the half that was still open, and the
    findings are in the host's own controls. A room copies an uploaded picture
    into about a dozen places; the pruner walked one list to decide what to
    **keep** and three handlers walked their own lists to decide what to
    **clear**, and they had drifted both ways. Kicking somebody over their
    picture *broadcast* it — the ban record kept it, the pruner retained it on
    purpose, every client including an unauthenticated guest received it, and
    the host screen printed it in a panel that stays; their whiteboard marks
    stayed too. "Randomize name & pfp" left the picture in chat, on Herd
    answers, in the saved question bank, on the results screen and in the
    hidden slot — from which a later settings toggle **restored** it. A
    replaced picture was never collected: twelve uploads from one player, all
    twelve still served. Meanwhile the results screen and the GET GOT banner
    were displayed but not retained, so the pruner was free to delete what the
    room was showing. All of it now comes from one enumeration in
    `server/player-media.mjs`, walked once by the pruner and once by
    moderation, with thirteen mutations and both new suites proved against
    `main` ([record](verification/2026-10-23-player-media/README.md)). The
    contrast that makes these defects: `remove-content kind=player-media`, the
    dedicated control, was already correct. Still open in this item: nothing
    engineering-side; the owner's choice on whether a moderated live prompt
    should disappear at once is unchanged.
  - **2026-10-22 (Herd anonymity, P02 steps 1, 2 and 4):** the engine already drew an independent displayed-slot permutation per prompt; what was missing was any proof the **server** spent it, and a measurement of what the attacks are worth. The slot-building step is now a named, tested module that takes identity from `displayIndex` and refuses an impossible slot, the two attack fixtures are bounded against measured chance instead of a round number, and `smoke-herd-anonymity` plays a real five-player game and attacks it over HTTP. Found and fixed on the way: the **shared screen named every writer before the vote**, two lines below its own promise that answers stay anonymous — a step 3 list that the October 21 audit had checked only for non-host access ([record](verification/2026-10-22-herd-anonymity/README.md)). Still open: whether the shared screen should show unvoted answer text at all is Tyson's call, not a defect.
  - **2026-10-21:** identity is covered end to end by `smoke-herd-flow` (an answer id alone is refused because a colour is shared by every prompt, the same colour on another prompt survives a removal, an in-play question answers `stillInPlay` with the Skip notice), and every `/api/host/*` moderation route is now proven to refuse non-hosts. The host's own review payload repeated a key; that is removed ([record](verification/2026-10-21-privacy-moderation-contract/README.md)). Still open: player media across every moderation surface, and the owner's choice on whether a moderated live prompt should disappear at once.
- [ ] Measure realistic shared-NAT 20-player connections, tab suspension/reconnect storms and bounded stream cleanup/RSS (P08). Record p50/p95 and refusals; use disposable services, not production.
- [ ] Run the isolated non-root/read-only journal-volume replacement proof (P07). If Docker access is unavailable, record that precise blocker and continue non-Docker work; do not demand production credentials for a disposable test.
- [ ] Replace source-only assertions for important user flows with browser/HTTP behaviour where practical. Stop browser suites overwriting old evidence; write new captures to the current run's folder.

### 3. Next — maintainability tied to behaviour, not a rewrite

- [ ] Extract the Gahook subsystem from `standalone/server.js` with characterization tests for Off/Visual/Chaos, claims, counter/Ultimate and lobby GET GOT. Keep outward behaviour unchanged.
- [ ] Extract client/stylesheet vertical slices with explicit ownership. Verify host/player/party roles, keyboard focus, phone portrait and short landscape after each extraction.
- [ ] Continue P03–P06 stable option identities, settings preservation, host routes and prompt acceptance. Do not check off whole stages from one passing fixture.
- [ ] Reconcile engine helpers with the live phase machine incrementally; deterministic transition tests must exercise the path the server actually uses (P09).

### 4. Human evidence — bounded request, not a blanket development stop

- [ ] Tyson/friends: first one normal-speed, uncoached session covering all three modes, on actual phones plus a shared screen; record joining friction, writing wait, confusing score/reveal, funny/unclear prompts and whether they want a rematch. Record devices/browser and rough group size, not private answer contents.
- [ ] Expand to 4/8/12/20-player observations as feasible; prioritize an eight-person Quick Herd pacing comparison. Do not require Tyson to assemble all sizes before engineering continues.
- [ ] Actual Safari/Android, screen reader/keyboard and reduced-motion checks; automated browser checks complement these rather than replacing them.
- [ ] Read factual prompts independently and personalized prompts aloud with long/short names. Keep safe, playful expression without humiliating claims about real players.

### 5. Later — gated public expansion

- [ ] Owner chooses audience/age, safety/retention and legal review before anonymous promotion.
- [ ] Accounts/database/OAuth and restore/export readiness only when the owner chooses that launch; guest play remains independent.
- [ ] Operational alerting, certificate ownership/renewal and reliable health diagnosis before growth. No auto-restart or proxy changes under a docs audit.
- [ ] Monetisation, ads, wrappers/Steam, cloud migration or multiple authorities remain proposals, not current implementation instructions. Cosmetic expression, never purchased scoring advantage.

## What Tyson needs to do

**Now:** no new product decision is required to continue sections 2–3. Review the coordinator's owner-action task and give a manageable real-device party playtest when available. A deploy is a separate current-chat approval, not implied by checking a report as read.

**Later/optional decisions:** whether a moderated live prompt should disappear immediately; audience/legal/accounts launch; scoring alternatives only with before/after fixtures and playtest evidence. The welcome-page guides link can be proposed as a reversible polish choice, not a reason to stop engineering.

## Execution and reporting

See [coordination contract](COORDINATION.md). Every stop records exact branch/commit, tests and failures, current task, next slice and owner blockers. Never label all of Gahookz release-ready because an individual batch passes. Production state is measured separately from source state.
