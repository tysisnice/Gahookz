# Gahookz — implementation and session handoff plan

Created: 2026-09-08. Status: **planned; implementation has not started**.

This is the actionable follow-up to the owner's approval of the **2026-09-07 Arena rebuild and project review**, plus the owner's requested lobby-rules modal, merged Quiz/Majority selector, and 20 educational + 20 personalised funny prompts. It describes work to implement in subsequent sessions; it does not claim those features already exist.

The earlier arena rebuild exists in this working tree, with uncommitted changes. Preserve it. No production deployment is authorised by this plan. Guest play must remain completely account-free.

## 1. Start here — reading list for the next model/session

Read this section, the decision tables, and the execution ledger before editing. Then read the source files for the first unfinished stage. Paths below are relative to this project root unless stated otherwise; function names are more reliable than line numbers after refactoring.

### Required, in order

1. [CLAUDE.md](CLAUDE.md), completely: safety, source/build boundaries, disposable tests, production ownership, and guest-play rules.
2. This document, completely on first pickup. On later sessions, read the ledger, latest handoff, and the next stage in full. This is the current product implementation scope, not permission to deploy.
3. [README.md](README.md): local run/build/test commands, arena and room simulations. Read [package.json](package.json) to verify actual commands rather than trusting old notes.
4. [OPERATIONS-AND-ROADMAP.md](OPERATIONS-AND-ROADMAP.md), sections 4–6, 10, and 12: source layout, safe workflow, closed/open issues, and incremental TypeScript tasks. Do not redo already-completed foundation work. The September review and this plan supersede older statements about the arena and the three-button mode selector; other standing safety constraints still apply.
5. [Architecture decision](docs/architecture/0001-long-term-foundation.md) and [production readiness](docs/operations/production-readiness.md): single-process authority, optional accounts, deployment gates. Read [DEPLOY-FEDORA.md](DEPLOY-FEDORA.md) only when doing environment/release work.
6. Inspect `git status --short`, `git diff --stat`, and the relevant existing diff. The initial arena work is not a clean baseline commit. Never reset, overwrite, or assume all dirty files are disposable.

### Read by task

| Work | Source reading route |
| --- | --- |
| State/contracts/network | `packages/contracts/src/{game,schemas,index}.ts`, `packages/contracts/test/contracts.test.ts`; API helper, state reducer, polling and EventSource setup in `standalone/public/app.jsx`; `standalone/server/transport.mjs`; routes/snapshots/SSE in `standalone/server.js` |
| Build and typed browser modules | `standalone/build-client.mjs`, `standalone/dev.mjs`, `tsconfig.*.json`, `.gitignore`, `standalone/public/service-worker.js`; existing versioned module imports and `client/globals.d.ts` |
| Lobby and mode settings | `HostMode`, `HostView`, `HostLobby`, `HostMoreOptions`, `HostQuickMenu`, `GameModeSelector`, `RoundPresetSelector` in `app.jsx`; `createRoom`, `updateHostSettings`, `lockSetup`, `resetLobby`, question submission/selection and public snapshot builders in `server.js` |
| Prompts | `PARTY_QUESTION_PRESETS`, `MAJORITY_QUESTION_PRESETS`, `EDUCATION_QUESTION_PRESETS`, `QuestionBuilder` in `app.jsx`; `GENERATED_*_PRESETS`, `makeGeneratedQuestion`, force-fill paths in `server.js`; `standalone/smoke-prompt-library.mjs` |
| Fairness and game length | `packages/game-engine/src/herd.ts`, its tests; `standalone/server/{majority,scoring,gameplay,presentation}.mjs`; `maximumRoundsForPreset`, `selectQuestionsForGame`, `beginHerdAnswerWriting` and result snapshots in `server.js`; reveal components in `app.jsx` |
| Career reliability | `recordCareerResults` in `server.js`; `standalone/server/accounts.mjs` and tests; `packages/accounts/src/index.ts` and tests; `infra/postgres/001_accounts.sql`; PostgreSQL configuration references, without printing credentials |
| Arena/lobby entertainment | `standalone/server/arena.mjs`, `arena.test.mjs`; `standalone/public/client/arena.jsx`, `arena.css`; arena commands/lifecycle hooks in `server.js`; `standalone/smoke-arena-lifecycle.mjs` |
| Performance and abuse limits | SSE write/scheduler/heartbeat paths in `server.js`; `standalone/server/admission.mjs` and tests; transport tests; current client network recovery loop |
| Public content and UX | `standalone/public/client/{information,tutorial,presentation,preferences,social}.jsx`, `styles.css`, corresponding smoke files |
| Regression evidence | `standalone/simulate-games.mjs`, `standalone/simulate-room-flows.mjs`, `standalone/smoke-{round-presets,majority-scoring,majority-flow,herd-flow,roles,regressions,prompt-library,deployment,security}.mjs`, `.github/workflows/ci.yml` |

The original review is additional context, **not a required dependency** for a fresh clone:

`/mnt/storage/syncthing/Vault/Work/Projects/Gahookz/2026-09-07 - Arena rebuild and project review.md`

Its actionable findings are reproduced below. Do not rely on old `/tmp` test workspaces or optional untracked `PROJECT-MEMORY.md`/`git.md` files. Read relevant source fully before modifying it; the names above identify where to begin, not a substitute for understanding call sites.

## 2. Baseline and boundaries

### What already exists

- The arena is now tap-target tug of war: a 2.4-second countdown, first to lead by five taps wins, 45-second draw limit, spectator bar/profile pulses, private ordered target tokens, retry-safe scoring, and departure/start-game cleanup. Do not rebuild it again.
- Previous verification passed configured `npm run check`, 2,000 seeded arena races, 15,000 mode simulations, twelve complete API games at 4/8/12/20 players, and the full smoke suite on a fresh disposable process. Chromium checks exercised touch, keyboard, latency, reload, lost acknowledgements and several viewport sizes.
- Those are **historical results**, not passes for future changes. Physical phones, screen readers, human sessions, database outage recovery, public-network load, and rollback were not verified by that work.
- Review base commit: `81a70d21902c5d2cbd8e56790c4b4c9598d20191`. Arena browser build: `release-0b77d61da4f26583`. Neither identifies an already-deployed arena release.
- Existing security/admission/password/moderation/stream-ticket fixes are real. Keep their regression tests; do not reopen them based only on stale August audit text.

### Confirmed issues this plan addresses

| Finding | Concrete evidence at planning time | Stage |
| --- | --- | --- |
| Herd answer authors can be predicted across questions | Circular writer assignment + one roster shuffle per game | P02, P06 |
| Vote-tie explanation can be false | `tieBrokenBySpeed` is true even when stable answer order actually breaks the tie | P02 |
| Herd Quick is not short | `maximumRoundsForPreset()` returns infinity for Herd; 20 players produced 20 rounds | P06 |
| Simply capping Herd makes work uneven | Capped 20-player probe assigned between zero and four answers per writer | P06 |
| Career writes can vanish | `statsRecorded` is set before asynchronous writes; failure only logs | P07 |
| Conflict copies interfere with verification | An ignored old `smoke-regressions.sync-conflict-…mjs` still contains the production-port default and is scanned | P00 |
| Settings can silently destroy questions | `updateHostSettings()` clears all question queues on a mode change and truncates them when limits shrink | P03, P04, P06 |
| Funny Classic suggestions invent a correct answer | `QuestionBuilder` randomly selects the key for opinion prompts | P05 |
| Generator style is inconsistent | Server fill selects by mode, not `promptStyle`; Majority/Herd client suggestions also bypass that style choice | P05 |
| Code is only partly typed | Main `.js`, `.mjs`, `.jsx` files are outside the strict TS projects; schemas are not consistently used at runtime | P01, P09, P10 |
| Network work grows needlessly | Every tab polls full state every 1.8 seconds even with healthy SSE; slow-client writes ignore backpressure | P08 |
| Lobby/reveal/navigation need focus | Hidden room rules, separate nearly-identical mode buttons, unclear bonuses, mixed public/internal information | P03, P04, P10, P11 |

### Scope and operating rules

- Implement this as small, independently verified slices. Keep the current React/Redux-style browser, Node server, npm workspaces, and server authority. No framework/package-manager switch, speculative microservices, or simultaneous giant visual rewrite.
- Development on port 3101 may hot-reload when this Syncthing source changes. Use an isolated working copy when a server restart would disrupt a development session. Never run stateful tests against port 3102 or a public domain.
- Rooms remain in one Node process. PostgreSQL account persistence does not recover live rooms. Keep one production replica and the existing drain process.
- Preserve existing submitted questions, user-authored content, custom assets and unrelated changes. Archive/reconcile conflict copies; do not delete them blindly.
- Implement source changes and tests locally when a subsequent session is asked to implement. Production deploys, real account provisioning, proxy-key rotation, paid products, public acquisition, legal review and store releases are not implicitly authorised here.
- Every stage ends with evidence and an updated handoff. Do not mark a stage complete based on a plan, an unrun test, or historical results.

## 3. Approved product direction and implementation defaults

The requests are approved. The finer defaults below make them executable without repeatedly asking the owner the same questions. Record a rationale before changing a default; seek direction only for a material expansion or an unresolved external dependency.

### One Quiz mode, two scoring rules

The selector contains **Quiz** and **Herd**. Majority is a scoring option within Quiz, not a third mode button. Do not remove its existing scoring engine or historical results.

```text
Host lobby controls
┌────────────────────────────────────┐
│ Lobby rules                   ⚙    │  opens host-only modal
├────────────────────────────────────┤
│       [ Quiz ]       [ Herd ]       │
│                                    │
│ Majority Rulez                [off] │  Quiz only
│ Most-voted answer wins.         ⓘ   │
│                                    │
│ Game length: Quick / Standard / …   │  contextual to selected game
│                                    │
│ Begin game                         │
└────────────────────────────────────┘
```

- Toggle label: **Majority Rulez**. Helper: **Most-voted answer wins.** Tooltip/help: “The room's most-voted answer wins, rather than a preset answer. Ties use the displayed tie-break rules.” Help must work by touch and keyboard, not hover alone.
- Off: **Quiz · Classic**. On: **Quiz · Majority Rulez**. Use the owner's spelling consistently in new UI; accept old `majority` / “Majority Rulz” identifiers at compatibility boundaries.
- Show the effective scoring label in host and player lobbies, shared display, ready/start confirmation, game-start card, in-round compact badge, reveal and finale. On reconnect, the locked game rules win over cached lobby settings.
- At start, explain one sentence: Classic = “Pick the preset answer.” Majority = “Pick what you think the room will choose.” Make Gahook score effects visible beside this summary.
- Default new rooms to Quiz/Classic to preserve the existing default. Switching between Quiz and Herd remembers each family's settings for this lobby. The Majority toggle retains its choice while Herd is selected but is hidden there.
- Keep current Classic/Majority points and the existing Majority author-bonus condition initially. The current bonus is **100 points when every eligible voter chooses the author's predicted answer**; it is not awarded merely for predicting the largest group. Preserve and explain the actual condition.

### Settings ownership

| Setting/control | Location | Behaviour |
| --- | --- | --- |
| Generated prompts: Funny / Educational | Host Lobby rules modal | Applies to both suggestion and server-fill paths in supported modes; changes future generations, never rewrites submitted text |
| Approve player questions | Host Lobby rules modal | Retain approval workflow; explain what switching it off does to pending questions |
| Custom profile pictures / custom Gahooks | Host Lobby rules modal | Room visibility/permission rules; never delete an account's saved media when disabled |
| Gahook effects | Host Lobby rules modal | `Off`, `Visual only`, `Chaos — affects points`; enforce on server, not just hidden buttons |
| Lobby 1v1 availability | Host Lobby rules modal | On by default; consensual challenges only; independent of main-round score effects |
| Existing room access/privacy controls | Lobby rules, separate access group | Relocate existing settings if available; passwords remain protected, never included in public snapshots or share URLs; do not invent unrelated access features |
| Game family: Quiz / Herd | Main game selector | Two buttons; not inside Lobby rules |
| Majority Rulez scoring | Directly above Quiz game length | Quiz-only toggle, not a room-wide rule |
| Game length | Under selected game | Show actual planned rounds and approximate duration, with mode-specific meaning |
| Personal mute, reduced motion/effects, volume | Existing personal preferences | Per-device preferences, not host authority; no room rule may force animation/audio on a player |
| Kick/report moderation, leave/end/transfer actions | Existing Host menu / player menu | Actions, not lobby rules; don't bury urgent moderation in settings |

“Gahook effects” governs main-game interruptions and score consequences. `Off` blocks those effects; `Visual only` permits cosmetic reactions but no point stealing/GET GOT penalties; `Chaos` preserves the existing score effects. New-room default: existing Chaos behaviour, clearly disclosed. Recommend Visual only in educational/competitive help, but do not silently change the choice when modes/styles switch. Inventory every Gahook effect path before implementing, including counters and GET GOT; arena scoring remains separate.

The modal opens from a dedicated button **above the main mode selector**. It has labelled sections, draft state, **Save changes** and **Cancel**; one atomic host settings request on Save. Escape/backdrop cancellation must not accidentally save. Trap focus, restore it to the trigger, support narrow phones/safe areas and allow internal scrolling. During a started game, show rules read-only with “Locked for this game”; edit again after returning to the lobby. Players get a readable summary, not editable controls.

### Question preservation and rule changes

- Switching Classic ↔ Majority changes scoring, not the question bank. Preserve question IDs/text/answers/ownership/approval and separate the Classic intended key from the Majority author prediction.
- An opinion draft with no Classic key remains saved but is marked “Choose an intended answer for Classic.” Never silently assign a random key. Switching back restores its prediction without rewriting it.
- Reducing game length selects fewer questions for this game and retains overflow for the next. Reducing a writing quota must not delete existing submissions. Keep saved-bank count, active-game selection and per-player quota as different concepts.
- Switching Quiz ↔ Herd preserves incompatible questions in a per-family saved bank. Show how many are retained and invalidate only readiness that no longer meets the chosen family's requirements. Do not pretend multiple-choice answers are player-written Herd submissions.
- Room rules are frozen when setup/game rules lock. Race tests must cover settings Save versus Begin game. A rejected/stale Save must leave the whole room unchanged.

## 4. Prompt design and personalisation contract

Appendices A and B are the **40 new drafts** to add, not replacements for the existing libraries. There are exactly 20 educational and 20 funny entries. Keep stable content IDs and migrate existing entries without losing useful content.

### A single content source

Create a shared content module (recommended `packages/content/`) containing a server-owned template catalogue and pure validation/instantiation helpers. Browser suggestions and server fill share that catalogue through the generation service, not separate copied arrays. Keep private catalogue/key metadata out of general player bundles; only an authorised question author receives their draft's editing metadata. Integrate any browser-safe types/helpers into the actual build: this project currently transforms named files and rewrites imports; it is not a general-purpose bundler. Emit/import the browser-safe subset explicitly, or use a narrowly scoped build entry. Do not leave raw Node/TypeScript imports in served JavaScript. Privacy tests concern hidden game state; they cannot make publicly known trivia facts secret.

Each educational template has an ID, category/difficulty, question, stable option IDs, `factualAnswerId`, and short explanation. Each funny template has an ID, question template, four suggested options, and **no factual answer**. A generated question instance separately stores template ID/version, rendered text, selected player IDs, stable option IDs/order, and any author-supplied intended answer or prediction. Server-only keys must not leak in pre-reveal snapshots.

Server-authoritative instantiation is the default for connected play: an authenticated suggestion request returns one rendered instance, and submission references that draft/instance. The host force-fill path uses the same service. Apply existing admission limits and bounded draft expiry; the endpoint must not create unbounded room state. An offline-only mode may use a neutral local template but must not impersonate a connected-room generation.

### Resolve `{Player1}` once, safely

1. Build the eligible pool from **currently connected player seats** in the room at generation time. Include the host only when they occupy a connected player seat. Exclude removed/banned/disconnected seats; never use account real names, email addresses or credentials.
2. Choose uniformly by player ID using an injectable RNG for tests. A target may be the person requesting a prompt; avoid complicated exclusion rules that make one-player lobbies fail. Future `{Player2}` support must use a different ID when available.
3. Substitute the validated public display name as literal text. Render with normal React text escaping, not HTML or regex replacement-string interpolation. Names such as `$&`, `{Player1}`, emoji or `<img …>` must remain inert names; do not recursively expand placeholders.
4. Freeze the selection and rendered text for that instance. Everyone receives the same wording; reconnect, renaming, departures and later joins do not reroll an existing question. Later generated questions use the current roster. A generation/removal race must not crash; moderation can still remove any resulting content.
5. With an empty eligible pool, replace `{Player1}` with **“your imaginary teammate”**. With one player, use that player. Never display an unresolved token. Duplicate display names are allowed; store IDs for consistency without exposing private identifiers or inventing a changed username.
6. Use a shuffled bag of template IDs per room/style to reduce repeated questions before a library cycle completes. Random player selection is independent; do not claim uniformity if later adding an anti-repeat weighting scheme.
7. Generated suggestions follow normal ownership/approval/moderation. A player-requested suggestion does not bypass approval; host-generated bank entries are visibly labelled as generated and follow the documented host approval policy.

### Style is not a scoring rule

| Combination | Behaviour |
| --- | --- |
| Classic + Educational | Use verified answer and explanation; shuffle options while retaining answer ID |
| Classic + Funny | Personalised suggestions are subjective: require the question author to choose an **intended answer** before accepting the question as Classic-ready; label this clearly |
| Majority + Funny | Use the personalised prompt and options; votes decide the winner; author prediction is separate, optional, and required only to qualify for the existing bonus |
| Majority + Educational | Use the educational options, but room votes still decide points; show the factual answer/explanation separately at reveal as **Fact check**, never relabel a wrong fact as factually correct |
| Herd + either style | Use the corresponding prompt text as a writing seed; do not auto-submit the supplied options as if players wrote them. Educational fact checks may appear after reveal, separate from popularity-based points |

For a **fully automatic Classic fill with no human-selected intended answer**, use verified educational/factual content and explain “Classic autofill uses questions with verified answers.” Do not silently switch to Majority or randomly call a funny opinion “correct.” The Funny option still supplies all 20 personalised prompts through the authoring path. A funny zero-writing ready-to-play set uses Majority, with an explicit user-selected scoring rule. This is an intentional correctness safeguard, not an ignored style setting.

## 5. Execution ledger

All checkboxes below refer to **new implementation**, not the completed arena baseline. Each numbered step is a bounded change/review unit; split further if a diff becomes hard to verify. Do not combine scoring changes with mechanical type/file conversions.

| Done | ID | Deliverable | Depends on |
| --- | --- | --- | --- |
| [x] | P00 | Preserved source baseline and conflict-safe verification | — |
| [x] | P01 | Runtime contracts, compatible schema evolution, typed client adapter/build seam | P00 |
| [x] | P02 | Herd per-question anonymity and truthful tie reasons | P01 |
| [x] | P03 | One Quiz selector, Majority toggle, non-destructive scoring changes | P01, P02 |
| [ ] | P04 | Host Lobby rules modal and authoritative room effects | P03 |
| [ ] | P05 | Shared generation, safe player substitution, all 40 new prompts | P03, P04 |
| [ ] | P06 | Short Herd, balanced capped writing, fair carryover | P02, P04 |
| [ ] | P07 | Durable, retry-safe career-result delivery | P01 |
| [ ] | P08 | Measured recovery polling, SSE backpressure and cache policy | P01; test P03–P06 flows |
| [ ] | P09 | Pure phase/mode boundaries and smaller server orchestration | P02, P03, P06, P07, P08 |
| [ ] | P10 | Feature-owned UI/CSS, clearer reveal and lobby hierarchy | P04, P05, P06, P09 |
| [ ] | P11 | Faster start, consensual arena discovery/polish, public content cleanup | P05, P10 |
| [ ] | P12 | Full regression matrix, human tests, release/rollback readiness | P00–P11 |

Default execution order is the table order. P07 is separable if account infrastructure work is blocked; complete its local tests and record the external gate rather than stopping unrelated gameplay work. A working deliverable can be reviewed after P05 and P06, without waiting for a giant overhaul release.

### P00 — preserve and establish a trustworthy baseline

1. Read the required documents and current diff. Record the current revision, dirty paths, Node/npm versions, test environment and what is already implemented. Do not commit or revert unrelated work just to obtain a clean status.
2. Inventory Syncthing conflict copies, including ignored files, using `rg --files --hidden --no-ignore -g '*sync-conflict-*' -g '!.git/**' -g '!node_modules/**'`. The prior audit counted 15; re-count rather than assuming the count is unchanged.
3. Compare canonical and conflict versions. Preserve meaningful variants in an explicit non-executable archive outside served/test source, with a manifest of original paths and any merged decisions. Regenerate generated outputs from canonical source; do not discard unique user work. Ask only when a conflict cannot safely be reconciled.
4. Make smoke-file discovery use the same conflict-artifact exclusion policy as build/static/CI. Keep canonical tests forbidding production defaults. Add a fixture proving an ignored conflict copy does not become an executable test while a canonical unsafe default still fails.
5. Reproduce `npm run check`, the full suite and room simulations on separate fresh disposable server lifetimes. Capture failures honestly before changing behaviour. Promote any reusable browser harness from temporary prior work into a maintained test location if it still exists; otherwise recreate the required tests.

Acceptance: canonical source preserved; conflicts cannot be served/run/discovered inadvertently; baseline results recorded with commands and environment. No production traffic or broad process termination.

### P01 — contracts and one browser network boundary

1. Capture synthetic, credential-free fixtures for host/player/spectator views in lobby, building, reading, answering, Herd writing/voting, reveal, finished and arena states. Include errors, health and reconnect snapshots. Do not put real room content in fixtures.
2. Extend existing contracts with discriminated phase payloads, host settings request/response, locked game rules, question key/prediction distinctions, and result tie reasons. Use `unknown` plus validation at untrusted boundaries; do not add broad `any` or disable strictness.
3. Define canonical settings as `gameFamily: "quiz" | "herd"` and `quizScoring: "classic" | "majority"`, keeping room rules and game settings separate. Define one normalisation function: legacy `quiz` → Quiz/Classic; legacy `majority` → Quiz/Majority; `herd` → Herd. Reject contradictory old/new inputs. Never maintain two independently writable mode truths.
4. Stage schema migration: first accept legacy payloads and add compatible optional fields/readers; then emit the new version once clients understand it. Make legacy `gameMode` a derived compatibility field until consumers migrate. Preserve historical match tags and old tutorial routes. A genuinely unsupported schema should cause an actionable refresh/reconnect message, not a broken lobby.
5. Validate representative real response shapes before enforcing schemas. Existing health schemas are narrower than the server's extra health fields; blindly calling the current strict parser would reject healthy responses. Treat missing required/invalid fields differently from explicitly tolerated forward-compatible additions.
6. Extract API, session storage, SSE, server-clock offset and snapshot dispatch into a typed browser adapter. Initially preserve network cadence; P08 optimises it. Support timeouts, cancellation, credential redaction, one subscription per view, stale response/version rejection, and safe unknown/malformed data handling.
7. Wire TS/browser emission into `build-client.mjs`, versioned imports, dev watcher, generated-file exclusions and offline cache. Add contract tests for malformed host settings and public data, plus a real build/import smoke. Expand request validation one endpoint family at a time so existing valid calls keep working.

Acceptance: existing fixtures pass; invalid/untrusted data fails safely; no key/author leakage; no duplicate connections after mounting/rejoining; a clean browser build can load every new module. Report actual migrated coverage, not “the app is now fully TypeScript.”

### P02 — Herd anonymity and honest ties

1. Keep writer selection balanced, but apply an independent, unbiased displayed-slot permutation for **each question**, generated once and retained privately. Use injectable RNG in tests; do not expose the seed or private assignment map.
2. Decouple writer assignment indices from answer display indices/IDs. All vote validation, self-vote flags, answer editing, moderation, reveal attribution, timers and results must reference stable identities through that permutation.
3. Inspect every role-filtered payload during writing/reading/answering, not only the main snapshot. No IDs, ordering, colours, sequence numbers or author-labelled draft lists should expose other writers before reveal. Keep the per-viewer own-answer information required to prevent self-voting; do not claim anonymity against a writer recognising their own text or colluding players.
4. Add deterministic 4-, 5-, 8- and 20-player attack fixtures: a prior reveal must not predict the next mapping using the old circular formula. Exercise many seeds/permutations rather than asserting a random permutation can never coincidentally equal the old one. Refresh must retain the same question order.
5. Return explicit `tieBreakReason: "none" | "fastest" | "average" | "order"` from both Herd and Majority. For three or more tied groups, determine the rule that actually separates the final winner; a tie among the fastest must advance to average/order. No votes means no winning answer and reason `none`.
6. Keep numerical scoring unchanged. Use reveal text such as “Vote tie · fastest vote”, “Vote tie · fastest average”, or “Exact tie · answer order”. The compatibility `tieBrokenBySpeed` may remain temporarily but must only describe fastest/average outcomes. P11 evaluates shared winners separately.

Acceptance: engine tests, exact/partial/three-way/no-vote tie fixtures, privacy tests, legal self-vote rejection, related flow smoke, and full-size seeded games pass. Make the limits of social anonymity explicit.

### P03 — merge the visible modes without losing questions

1. Add behaviour fixtures for existing Classic and Majority scores, author bonus, readiness, approvals, reset/carryover, host-as-player and host-only sessions. Lock these before changing UI or payloads.
2. Apply P01 normalisation throughout question submission/eligibility, snapshots, start/reset, score dispatch, tutorials, final summaries and account/metrics adapters. Preserve old historical mode records; new records must include enough scoring information to distinguish Classic and Majority.
3. Replace the three-button selector with Quiz/Herd and place the Majority Rulez toggle immediately above Quiz game length. Implement the labels/start-state visibility in section 3 on every relevant role/view, not only the host screen.
4. Change settings semantics so toggling scoring never runs the current destructive mode-change reset. Store intended Classic key and Majority prediction separately by option ID, retain approval/ownership, and mark only incompatible drafts as needing attention.
5. Separate saved question banks from selected game questions. Preserve Quiz/Herd drafts when changing family and preserve overflow when reducing quotas/rounds. Recalculate readiness and counts from active eligibility, not raw bank size; show why an otherwise-ready player needs to act.
6. Freeze effective rules for the game and use them for all subsequent results. Handle host Save/start races atomically. Cover old `gameMode: "majority"` requests, old cached snapshots, and rematches after each scoring choice.

Acceptance: only two visible mode buttons; toggle in requested position; everyone knows the rule at start/reconnect; both full flows retain existing scoring; cycling Quiz → Majority → Herd → Quiz and reducing length loses no saved content. Update source-string tests to behaviour tests where practical, not mere renamed assertions.

### P04 — host-only Lobby rules modal

1. Extract a small settings view/model seam and reuse existing modal/focus primitives if suitable. Keep the main game selector and game-length controls out of the modal. Remove the old scattered “More Options” duplication only after all settings are mapped.
2. Implement the ownership table and draft/Save/Cancel behaviour. Use one authoritative validated host request, a settings revision/staleness check, and atomic validation before mutation. Update/consolidate **both** `HostMode` and `HostView` optimistic settings allowlists; otherwise one host route will appear not to save new fields.
3. Preserve host authorization server-side, including forged requests from ordinary players and spectators. Read-only player summaries expose policy but never room passwords or credentials. Existing moderation/action menus remain readily available.
4. Define approval transitions: enabling approval affects future submissions, not retroactively approved ones; disabling it promotes valid pending questions while retaining any excess in the saved bank. Preview this consequence in the modal. Save failures/Cancel leave queues untouched.
5. Disable room custom-media use without destroying underlying saved assets. Enforce restrictions for joining, selecting forms, uploading/serving room-visible content and reconnecting; restore only content still permitted, not removed/moderated media.
6. Add server-owned main-round Gahook effects policy. Audit player, host, counter, ultimate and GET GOT paths so no alternate route can steal points when policy is Visual only/Off. Disclose current 50-point steal and actual GET GOT penalty rules using constants/shared copy, not a guessed penalty. Keep personal accessibility/audio preferences independent.
7. Add lobby arena enable/disable policy; default on. Disabling during the lobby cancels pending/active duels with a clear neutral reason, not a forfeit or score penalty. Main-game start still cancels the arena. Add read-only locked-rules modal during play.

Acceptance: keyboard/touch/focus/screen-reader checks; modal fits 320px-wide and short landscape screens; both host routes save; unauthorized/stale/locked-phase requests fail without partial writes; spectator summaries update live; settings survive a rematch in the same lobby; ordinary mode/length controls remain outside the modal.

### P05 — shared prompts and all 40 new entries

1. Inventory all current client/server banks. At planning time the client has 50 party, 40 Majority and 58 educational entries; server fallback banks are separate. Migrate with stable IDs and explicit deduplication, preserving useful old content. Append the 20 + 20 drafts below; do not replace a whole bank with them.
2. Implement the shared schema, generator and server suggestion endpoint in section 4. Use authenticated role/room context, bounded drafts, request limits, seeded test RNG and stable option IDs. Keep factual keys and author predictions private until the correct reveal phase.
3. Implement player substitution, frozen instances, empty/single/multiple-player behaviour, literal escaping and per-room template bags. Exercise names containing Unicode, braces, dollar signs, markup, maximum length and duplicates.
4. Replace both `QuestionBuilder` suggestion branches and server force-fill branches with the shared service. Respect the lobby style across Quiz/Classic, Quiz/Majority and Herd; implement the explicit automatic-Classic fallback rather than pretending opinions have factual keys.
5. For personal Classic prompts, start intended-key selection unset, including after changing/removing the selected answer. Validate readiness server-side. For Majority use a clearly labelled “Predict the room's choice” control; an unset prediction earns no author bonus. Generated host/system questions have no invented player author bonus.
6. Add fact-check reveal copy separate from Majority/Herd winning votes. Preserve option identity through shuffle/edit, invalidate a removed factual key, and never expose correctness in the answering payload or CSS classes.
7. Replace brittle source-regex bank counting in `smoke-prompt-library.mjs` with tests importing validated content. Assert all 40 new IDs, retained legacy examples, uniqueness, allowed tokens, four distinct options, correct educational keys and explanations. Do not weaken content checks merely because constants moved.

Acceptance: exactly 20 new educational and 20 new funny templates available; two clients/host see identical resolved names for the same instance; new joins affect only future instances; no unresolved template tokens (a name may itself contain literal braces), XSS, random opinion keys, silent scoring switches, duplicated banks or approval bypass. Exercise suggestion, edit, submit, approve, fill, game, reveal, reset and reconnect paths.

### P06 — a genuinely short, balanced Herd

1. Add contextual Herd length choices: **Quick — up to 8 rounds**, **Full room — one prompt per eligible player**, **Custom — selected round count within available prompts and supported server bounds**. Default Herd to Quick for a faster first session; remember the chosen setting. At four players Quick naturally uses four distinct available prompts; do not invent eight duplicates. Keep the current one-prompt-per-player writing rule separate from round count.
2. Select active prompts before assigning answer writing. Carry unused prompts into the next game; prefer not-yet-played authors across rematches, track rotation by stable IDs, and account for joins/departures/removed content. Display actual round count and a duration range derived from configured phase timers and writing allowance, not an unsupported exact finish time.
3. Replace the capped-set circular allocator with a constrained balanced assignment algorithm. Each question needs the existing supported number of distinct writers; exclude its prompt author where the roster size permits (currently at least five). Preserve documented small-room fallbacks. Minimise global writer-load spread with randomised tie choices; do not assume a naive greedy least-loaded pick always finds the feasible solution.
4. Use a small matching/min-cost-flow or equivalent bounded allocation approach; at a maximum party size of 20, correctness matters more than clever asymptotics. Prove via property tests/independent feasibility checks that load differs by at most one where constraints permit, and explicitly report any unavoidable constraint exception. Include capped subsets whose authors cluster in roster order.
5. Apply P02 per-question display permutation **after** assigning writers. Do not reintroduce the author leak while improving balance. Keep answer IDs, own-answer disabling, disconnect/timeout autofill and moderation valid under fewer active prompts.
6. Give writers breathing room with clear “answers left” and “waiting for…” status; use observed preparation times before changing all timer constants. Explain no-vote/no-writer fallback. Do not let absent writers block the room forever or call server fallback a real player's submission.
7. Add complete 4/8/12/20-player Quick/Full/Custom games plus 2/3/5-player boundary fixtures where supported. Current historical simulations sometimes permit self-votes at pure-engine level; constrain simulated voters to legal choices and separately test the HTTP rejection path.

Acceptance: 20-player Quick has eight rounds, not twenty; available small-room counts are honest; capped allocations are balanced within feasibility; anonymous slots stay private; unused questions survive and get a fair turn next game. Human Quick-versus-Full comparison remains an explicit P12 gate.

### P07 — retryable, durable career results

1. Inventory existing match/account identifiers, idempotency and transaction boundaries. Define a unique stable match ID and per-account result key; retries must not duplicate career totals, rewards or entitlements. Guests continue to finish games without an account service.
2. Extract an immutable match-result event on completion. Replace the premature `statsRecorded` flag with explicit pending/queued/delivered state. Freeze earned results once, independent of reset, room expiry or later cosmetic changes.
3. Design a durable outbox with bounded exponential backoff and jitter, attempt metadata, retry visibility and manual replay for exhausted items. A database-only outbox cannot accept a result while that database is unavailable: **do not claim outage durability without solving this admission boundary**.
4. Recommended initial design for the single-process server: a bounded local durable journal on a persistent application-data volume accepts the final result event, then a worker transactionally records/deduplicates it in PostgreSQL and acknowledges delivery. Use fsync/atomic append or an established transactional store; define corruption recovery, permissions, restart replay, retention/compaction and disk-full behaviour. Minimise stored personal data; no auth credentials or raw question/chat content.
5. Reuse existing persistence transactions/idempotency if adequate; add an additive SQL migration after `001_accounts.sql` only for necessary keys/outbox delivery records. Make migration and downgrade compatibility explicit. Never repurpose production credentials for testing.
6. A completed game must not hang on PostgreSQL. If durable admission itself fails, show an honest pending/unavailable career status and emit a redacted actionable alert; do not mark the result recorded or promise guaranteed recovery of an unwritten event. Set bounded memory/disk queues and operator recovery instructions.
7. Fault-inject database failure before enqueue/delivery, transient recovery, partial multi-account success, duplicate deliveries, reset before retry, restart after delivery before acknowledgement, journal damage and disk-full. Use disposable PostgreSQL and temporary journal volumes; separately test guest-only/no-account operation.

Acceptance: persisted accepted events survive a worker/process restart and eventually deliver exactly once in effect; failures are observable and don't end the party. A no-DB development run alone is not proof. Production volume/migration rehearsal requires an explicit later operations gate, not an assumption that a local file in the image survives replacement.

### P08 — SSE, recovery load and static caching

1. Record a reproducible local baseline with host + 20 players + spectator, including arena taps: full-state bytes, events/sec, recovery requests/sec, command-to-visible-state latency, event-loop delay and memory. Use synthetic data; collect no real usernames/messages. Add small structured, redacted events/counters to support diagnosis.
2. Replace always-on 1.8-second full-state polling with one adapter policy. A healthy SSE connection should need no frequent recovery poll. Use the existing ~15-second heartbeat plus a safety margin for liveness, monotonic elapsed time, bounded jittered reconnect, visibility/resume resync and version-based stale detection. Obtain a new single-use ticket for each connection attempt.
3. On reconnect fetch a current role-filtered snapshot; discard stale responses/events by room/game/version. Back off failures without duplicate connections/timers. Test background suspension, offline → online, quiet lobbies, lost events, version changes and expired/replaced credentials.
4. Respect `res.write()` backpressure. On a stalled client, retain at most a bounded latest replaceable state, resume after `drain`, or disconnect beyond a byte/time budget. Never interleave partial SSE frames or drop non-replaceable lifecycle events without a recovery strategy. Remove timers/listeners and decrement admission counters exactly once on all exits.
5. Exercise shared-NAT 20-player rooms, spare tabs and reconnect storms against the existing 32-stream per-address cap. Fix leaked/double-counted connections first. Tune limits only from measured legitimate usage and abuse tests; do not blindly raise caps.
6. Preserve arena local feedback, token privacy, ordered retry semantics and current 30ms coalescing. Add compact arena deltas only if full-state measurements show a material bottleneck; then require sequence/version validation, a full snapshot recovery path and privacy tests. Record a measured “not needed” decision if snapshots already meet the agreed budget.
7. Audit cache headers and PWA update behaviour. `?v=…` on a mutable asset path is not proof that old content remains addressable. Introduce retained content-addressed asset paths before using long immutable caching, or keep revalidation for mutable paths. API/state/auth/media restrictions stay private/no-store as appropriate; HTML/service worker must update reliably.

Acceptance: suggested local targets are ≥90% fewer idle recovery polls than baseline, no steadily growing memory with stalled readers, and no material regression in p95 command-to-visible update latency. Record actual conditions/numbers; these are engineering targets, not public latency promises. Service-worker/offline Dash, old-client refresh, security and admission tests still pass.

### P09 — pure game transitions and smaller server boundaries

1. Reconcile completed work with the existing TS task ledger; schemas/workspaces already exist. Extract remaining pure scoring/gameplay/presentation leaves one module at a time, strictly type them, and keep point calculations unchanged in these mechanical commits.
2. Introduce private room state, role-filtered public snapshots and discriminated commands as separate types. Inject clock and RNG into transition logic; keep Node timers, sockets, media I/O and account delivery in adapters.
3. Extract transitions as current state + validated command/time → next state + explicit effects. Cover setup lock, building, reading, answering/voting, reveal, finale, pause/skip, disconnect, expiry, reset, arena cancellation and pending result delivery.
4. Move route/authorization dispatch and room lifecycle into bounded modules after their leaves are stable. Preserve URLs, error semantics, host/player credential distinction, password/bans and moderation. Avoid an enormous generalised plugin framework for two game families.
5. Add seeded replay fixtures and fake-clock tests for timer cancellation, double start, duplicate vote, host change/departure, player removal during a phase, reset/expiry and stale commands from the previous game. Compare final scores and public projections to pre-extraction fixtures.
6. Complete useful strict typing of migrated modules; convert remaining entrypoints only once imports/build/dev/Docker execution support it. Update the older TS ledger with evidence. A final workspace path reshuffle is a separately justified mechanical step, not a prerequisite for delivering this product work.
7. Document room-recovery/affinity feasibility from the new boundary: what must be checkpointed, which credentials/timers/media survive, ownership and rejoin semantics, and failure cases. Keep this an architecture decision/prototype in isolation; no extra production replicas or implied live-room recovery claim.

Acceptance: deterministic transition replay, current complete API fixtures, arena lifecycle, pause/expiry/role/security tests all pass. Server orchestration is materially smaller and side effects are visible. A restart still honestly tells users rooms are gone until an independently tested recovery feature exists.

### P10 — UI decomposition and clear scoring

1. Finish extracting host setup/rules, private question writing, voting, reveal, finale and room roster into feature-owned components. Perform mechanical extraction and visual improvements in separate changes. Keep API/SSE access inside the P01 adapter.
2. Move feature styles out of the global stylesheet without changing selectors arbitrarily. Then introduce shared colour/spacing/type/focus/motion tokens and small buttons/dialog/badge primitives where real reuse exists. Preserve the bright Gahook identity, characters and profile pictures; do not replace the game with a generic dashboard.
3. Give the lobby a clear hierarchy: who's here, who's ready, what rules/game start next, primary start action; chat and arena remain secondary, optional waiting-room activities. Preserve host-as-player, shared display and small-phone layouts.
4. Classic reveal shows intended/factual answer as appropriate and points earned. Majority reveal highlights vote counts, winning choice and author-prediction bonus with the exact bonus condition. Educational Majority adds a distinct Fact check, even when the crowd chose wrongly.
5. Herd reveal separates “Points for your answer” from “Points for your vote” and shows the tie explanation. Show totals that reconcile exactly with the leaderboard. Avoid presenting a popularity winner as an objective truth.
6. Keep key controls reachable by touch/keyboard; check focus after phase/modal changes, readable contrast, non-colour score cues, reduced motion, local audio settings and restrained screen-reader announcements. Do not announce every arena tap as an assertive message.
7. Extend maintained browser tests across lobby → writing → vote → reveal → finale → rematch for host/player/spectator at the target viewports. Static layout string checks can remain supplemental; they are not visual/accessibility evidence.

Acceptance: all major phases work in real browser interaction tests, numerical reveal totals match engine fixtures, no duplicate settings controls, no lost draft/focus state on rerender, and feature-owned files reduce the main JSX/CSS burden without functionality loss.

### P11 — fast start, arena polish and public product content

1. Offer a clear ready-to-play path using curated verified sets for Classic/Educational and curated opinions for Majority. Let hosts use player-written or generated content without requiring accounts. Explain Classic/Funny's intended-answer requirement before promising a one-click start. Generated questions must respect quotas/length/approval and not overwrite player work.
2. Add a discoverable **Challenge to 1v1** action in the connected-player menu. Keep explicit accept/decline, timeout, one-active-arena rules, blocking/removal checks and rate limits. Retain the existing counter challenge path as a second entry; both use the same engine.
3. Observe the current arena first, then implement a lightweight “Rematch?” request/accept flow and restrained spectator cheers if they improve waiting time. A rematch is never automatic; starting the main game, disabled arena policy, departure or decline cancels it. Existing reaction/cheering mechanisms should be reused instead of duplicated. Keep cheers bounded and subject to local effects/audio preferences.
4. Separate `/information` into player-facing guides/FAQ and internal implementation/operations content in repository docs/Vault. Keep useful game rules public; preserve/redirect old guide routes and links. Moving an operations page is information architecture, not an access-control or secret-removal substitute.
5. Evaluate the report's longer-term shared-vote-winner suggestion in a developer-only experiment/fixtures: compare current tie-breaks against shared top-vote winners for two-way, three-way, no-vote and author-bonus cases. Also document before/after examples for Herd authored-point denominator (eligible voters excluding the author versus current denominator) and circular prediction incentives. These older backlog decisions must not be silently bundled into the UI merge.
6. Use observed sessions to decide whether those alternative scoring rules are clearer/fairer; produce a short decision record with examples and recommendation. Ship the existing numerical rules until an explicit rule decision is recorded. The required implementation here is truthful explanations plus the evaluated proposal, not an unreviewed points rebalance.

Acceptance: a new group can find the fast-start path and consent-based arena; generated play obeys the selected scoring; rematch/cheer behaviour is implemented and tested or explicitly deferred with playtest evidence; public navigation contains player information, not internal reports; scoring experiments have reproducible examples and a recorded disposition.

### P12 — full validation, human play and release readiness

1. Run the matrix in section 6 against a fresh candidate. Repeat full smoke and full-room simulations on separate disposable server lifetimes. Promote repeatable tests to the repository/CI; do not leave the only proof in `/tmp` or a screenshot.
2. Run local/staging slow-reader, reconnection, shared-NAT capacity, account-outage/journal replay and restart/drain tests. Rehearse rollback to the previous image/digest using synthetic rooms and a test database. Check old/new schema and migration compatibility; immutable images alone do not prove rollback works.
3. Arrange observed 4/8/12/20-player sessions when participants are available. Compare short/full Herd, Classic/Majority understanding, funny name prompts, lobby setup clarity and arena fatigue. Record consented aggregate setup time, writing wait, game duration, quit/rejoin and rematch choices; no raw chat or personal profiles in telemetry.
4. Test physical iOS Safari and Android Chrome, desktop keyboard, screen reader, reduced motion, muted audio, poor connectivity and shared-screen readability. Browser emulation does not substitute for physical devices or human enjoyment evidence.
5. Update README, mode tutorials, public information, operations backlog and this ledger to reflect completed behaviour and verified coverage. Clearly distinguish deferred experiments/external gates. Review dependencies/base-image update policy and add a documented periodic advisory/update check without silently upgrading unrelated major versions.
6. Produce a clean candidate build/revision and a release note with migration/volume needs, test evidence, open risks, drain/rollback commands and the previous recoverable image. Preserve canonical source and excluded conflict archives; verify no credentials or ignored conflict copies enter an image/commit.
7. Stop at **ready for an explicitly requested deployment**. Never replace production just because all tests pass. Account/OAuth provisioning, legal/abuse-operations work and proxy-secret rotation listed in the older backlog require their own authorised operational work; reverify their current status privately rather than treating old notes as live facts.

Acceptance: automated gates green; human/device/operations gates either genuinely passed or labelled pending with who/what is needed. Do not mark the entire overhaul complete while required gates are outstanding. No live deployment or public launch is inferred from plan approval.

## 6. Verification matrix and safe commands

### Test matrix

| Area | Minimum cases |
| --- | --- |
| Room sizes/flows | 4, 8, 12, 20 players for Quiz/Classic, Quiz/Majority, Herd; 2/3/5-player supported boundaries; guest host/player plus host-only spectator screen |
| Settings | Each rule independently and combined; both host routes; Save/Cancel/stale Save; player forgery; start race; locked phase; rematch; family/scoring round-trip; reduced length without deletion |
| Content | All 40 IDs; legacy content retained; 0/1/many name candidates; duplicate/host/disconnected names; escaping; fixed instance across joins/rename/reload; option shuffle/key integrity; approval and autofill |
| Scoring/privacy | Golden Classic/Majority scores; unanimous author bonus; no/random/optional predictions; all tie reasons; no-vote rounds; Herd own-vote refusal; five-player inference attack; no pre-reveal answers/keys/authors |
| Herd pacing | Quick/Full/Custom across sizes; capped and clustered authors; workload feasibility; carryover rotation; disconnected writers/timeouts; consistent planned rounds and displayed duration |
| Arena | Lead-five winner, draw, lower-half targets, immediate local feedback, touch/keyboard repeat, 240ms delay/lost ack/retry, spectator pulses, consent/rematch, disable/start/leave/kick cleanup |
| Reliability | Malformed/out-of-order snapshots, duplicate commands, reconnect/background tab, slow readers, stream-cap cleanup, expiry/reset/drain, outbox transient/permanent failure and restart/idempotency |
| UI/accessibility | 320×568, 390×844, 844×390, 1280×800; host/player/spectator; focus/touch/help/modal scroll; keyboard, screen reader, contrast, reduced motion/audio; physical Safari/Android |
| Build/security | Strict migrated modules, clean browser imports, cache/PWA upgrade/offline Dash, role/media/password/admission tests, no served conflicts/secrets, isolated image and rollback rehearsal |

Use representative combinations for browser smoke and exhaustive cheap unit/property tests; do not attempt an unbounded Cartesian product of every setting. Complete end-to-end tests must exercise real legal choices, not merely host-skip every interesting state. Keep at least some real timer/arena lifecycle checks alongside accelerated simulations.

### Commands

From the intended test working copy, first inspect `git status --short` and the listener on 3199. Never stop an unfamiliar existing process; choose/record another disposable port if necessary and set both URLs consistently. Dependencies should already be pinned; use `npm ci` only when a clean install is needed.

```bash
npm run check
npm run test:simulation
```

Start a disposable process in its own terminal, with test-only data configuration and no production database credentials:

```bash
HOST=127.0.0.1 PORT=3199 npm start
```

In a second terminal:

```bash
GAHOOKZ_BASE_URL=http://127.0.0.1:3199 GAHOOKZ_TEST_BASE_URL=http://127.0.0.1:3199 npm test
```

Stop **that exact test process**, start a fresh one, then run the separate complete-game batch:

```bash
GAHOOKZ_BASE_URL=http://127.0.0.1:3199 GAHOOKZ_TEST_BASE_URL=http://127.0.0.1:3199 npm run test:rooms
```

The server has a 32-room limit; unrelated batches on the same uncleared process can fail through capacity rather than a game defect. Never solve this by pointing tests at production. Use relevant `standalone:smoke:*` scripts for each slice and the full suite at integration gates. Add new browser/load/outbox commands to `package.json` when those tests exist; don't claim proposed commands already run.

Build output includes ignored browser `.js` and `release.json`, plus version changes in tracked `index.html`, `service-worker.js` and `vendor-bootstrap.js`. Inspect generated changes rather than hand-editing release hashes. Run a clean rebuild in a separate copy if unrelated source changes would obscure a candidate.

## 7. Coverage of every review recommendation

| Approved review recommendation | Implementation/disposition |
| --- | --- |
| Repair predictable Herd anonymity | P02 private per-question permutation, P06 allocation integration |
| Shorter big-room Herd without unfair writing loads | P06 capped balanced allocation, carryover, P12 comparison |
| Truthful ties; consider shared winners | P02 explicit reasons; P11 scored experiment/decision without covert rebalance |
| Retry career writes reliably | P07 durable acceptance, idempotent delivery, outage/restart tests |
| Reconcile conflict artifacts | P00 preservation/archive and consistent discovery exclusions |
| Extract browser adapter, phase engine, UI, then primitives | P01 → P09 → P10, with focused feature seams for requested UI work |
| Real runtime contracts/expanded TypeScript coverage | P01/P09/P10; reconcile existing TS ledger rather than restarting it |
| Reduce polling, bound slow SSE readers, measure party Wi-Fi | P08 metrics/backoff/backpressure/shared-NAT tests |
| Consider compact arena updates | P08 measurement-gated protocol change with full-state recovery |
| Keep single authority until recovery/affinity is tested | P09 feasibility record; P12 staging drain/rollback, no replica increase |
| Ready-to-play content, clearer Majority/Herd scoring | P05/P10/P11, including the 40 new drafts and truthful factual answers |
| Who's here/ready/next; optional chat and arena | P04/P10 lobby hierarchy and rules |
| Discoverable consensual challenges, later rematch/cheers | P11, reusing current arena engine/reactions and observed feedback |
| Explicit host Gahook effects choice | P04 server-enforced policy + start summary, personal preferences preserved |
| Separate internal reports from public information | P11 public guides/internal docs split |
| Real mobile/accessibility/human sessions | P10 browser checks and P12 physical/observed gates |
| Repeatable release candidate and explicit deployment | P00/P12, no production mutation from this plan |

This is not a mandate to implement every speculative Steam/mobile/monetisation item in the older operations roadmap. Those remain separate roadmap tracks. Relevant carryover risks (dependency cadence, caching, structured logs, account provisioning status and scoring decisions) are covered or explicitly gated above.

## 8. Handoff discipline

At the end of each implementation session, update this section and the ledger. Check off only stages whose code and acceptance tests are complete. Record partial subtasks so another model can resume without redoing work. Keep logs free of secrets and use stable repository evidence paths, not temporary-only links.

```text
Last updated:
Current stage and completed numbered steps:
Revision / relevant uncommitted changes:
Files changed and why:
Tests run (exact commands, disposable environment, pass/fail):
Observed behaviour / screenshots or fixture paths:
Decisions changed from this plan and rationale:
Known regressions or external gates:
Next exact task, files to read, and acceptance test:
Production touched: no / explicitly authorised action and evidence
```

### Handoff — 2026-09-11 — P03 complete

- **P03 steps 1-6 complete and checked off.** P04 is next.
- Step 5: `room.savedQuestionBank` keys written content by game family, separate from the questions selected for a game. Switching family parks the outgoing family's content and restores the incoming family's. The per-player quota now **parks** overflow instead of deleting it, and because the bank is merged back before the quota is applied, raising a limit restores what it parked — the operation is symmetric. `resetLobby` parks unplayed content rather than discarding it, so a full reset still gives a clean lobby while the writing survives. `savedQuestionCount` and `savedQuestionCountOtherFamily` are published so nothing disappears silently.
- Step 6: `room.settingsRevision` advances on every accepted write, and a Save carrying a stale revision is refused **before anything is touched**, so a rejected Save leaves the room completely unchanged and does not advance the revision. `room.lockedRules` freezes family, scoring, derived legacy mode, preset, quota, prompt style and `lockedAt` when setup locks; a reset clears it. Settings remain refused outside the lobby, so rules cannot change under a running game.
- **Two of the step 5 assertions were vacuous when first written** and were fixed rather than banked as a green result. After a reset the room held no questions, so the shrink and family-switch checks compared zero with zero. They are meaningful only because reset now parks content. Concrete numbers are asserted throughout: 8 written, 4 selected under a quota of 1, 8 again when it is raised.
- A third assertion was simply wrong and the code was right. Selecting Herd sets the per-player quota to one, and that quota survives the trip back to Quiz, so returning restores all 8 drafts but selects 4. That is the quota working, not data loss. The assertion now checks the real invariant — selected plus parked is conserved — and separately that restoring the quota reselects all 8.
- Verified: `npm run check` (103 unit tests), full `npm test` across 23 smoke scripts with 15 checks in `smoke-mode-settings`, and `npm run test:rooms` on a separate fresh lifetime — twelve games identical to the P00 baseline.
- Note for P04: the settings-destroys-questions hazard this plan listed is now **genuinely reachable**, because a bank can exist while the lobby is editable. It is guarded, and `smoke-mode-settings` fails if that regresses. P04's modal must send `settingsRevision` to get the staleness protection.
- Production touched: **no.**

### Handoff — 2026-09-11 — P03 partial (steps 1-4 done)

- **P03 steps 1, 2, 3 and 4 are done. Steps 5 and 6 remain, so P03 is NOT checked off.**
- **A correction to this plan's findings table.** "Settings can silently destroy questions" is listed as a confirmed defect citing `updateHostSettings()` clearing every question queue on a mode change. The code is real but was **unreachable**: questions are refused in `lobby` ("Wait for the host to lock in the game options") and settings are refused everywhere else ("Settings are locked once the quiz starts"), so the two states are mutually exclusive. Verified against a live server, not read off the source. It becomes reachable exactly when P03 step 5 and P04 land, so the guard is still needed — as prevention, not as a fix for a live bug, and it should not be reported as one.
- Step 1: `standalone/smoke-mode-settings.mjs` locks the lifecycle before any UI moved — questions refused in lobby, settings refused outside it, submissions retained in building, unused questions carried by `new-game`, `reset` clearing the bank, and legacy `gameMode` requests still working. Registered in the smoke chain (now 23 scripts).
- Steps 2 and 4: the room keeps `gameSettings`, the canonical `{ gameFamily, quizScoring }` pair, and derives `room.gameMode` from it. **Only a family change invalidates written content now**; switching Classic and Majority leaves the bank and everybody's readiness alone, where previously any mode change ran the full reset. Selecting Herd keeps the Majority toggle's position so returning to Quiz restores it. Contradictory payloads are refused.
- Step 3: the three-button selector is gone. `GameFamilySelector` shows **Quiz** and **Herd**; `MajorityScoringToggle` sits directly above the game length control and only under Quiz. Its help is a real button with `aria-expanded`, not a hover tooltip, because most people meet this on a phone. The lobby names the rule in force next to Begin Game ("Playing Quiz · Majority Rulez — pick what you think the room will choose."). `GAME_MODES` is retained for tutorials, mode art and historical records.
- **Both** optimistic settings allowlists were updated (`app.jsx` lines ~1579 and ~2012). The plan warns about this and it is real: with only one updated, that host route would appear not to save the toggle.
- `smoke-party-view` assertions were strengthened rather than renamed: the lobby must expose the family selector *and* the Majority toggle, the toggle must be Quiz-only, the lobby must name the scoring rule, and neither control may appear during question building.
- Verified: `npm run check` (103 unit tests), full `npm test` (23 smoke scripts), `npm run test:rooms` on a separate fresh lifetime — twelve games. dev.gahookz.com serves the new lobby.
- Outstanding for P03: **step 5**, separating the saved question bank from the questions selected for a game so drafts survive a family switch and overflow survives a shorter game; **step 6**, freezing effective rules at start and handling the host Save versus Begin Game race atomically. `LockedGameRules` already exists in contracts.
- Production touched: **no.**

### Handoff — 2026-09-11 — P02 complete

- **P02 steps 1-6 complete and checked off.** P03 is next.
- The anonymity leak was worse than "predictable": `server.js` built each Herd answer as `ANSWER_META[assignment.answerIndex]`, so the answer's **colour and id** came straight from its position in the writing rotation, and the rotation is a fixed circular walk from the question's author. Red/Blue/Yellow/Green literally named the writers. One reveal taught the offset and every later question was solvable by hand.
- Fix: `HerdAnswerAssignment` now carries `displayIndex` alongside `answerIndex`. Writer selection keeps the balanced circular walk (workload stays even, the prompt author is still excluded where the roster allows); where a writer *appears* is an independent Fisher-Yates permutation drawn per question, with the RNG injected so tests are deterministic. `byQuestionId` is returned in display order so a caller cannot reintroduce the rotation as the visible order. `server.js` renders `ANSWER_META[assignment.displayIndex]`.
- Tie reasons were false in **both** engines: `tieBrokenBySpeed: Boolean(tiedByVotes && winningAnswerId)` in `herd.ts` and `majority.mjs` alike, so every tie with a winner was reported as decided by speed even when the stable answer order decided it. Both now compute `tieBreakReason` of `none` / `fastest` / `average` / `order` by comparing the winner with the best other leader and naming the first key that differs, which advances correctly past a key three or more tied groups share. `tieBrokenBySpeed` is retained for compatibility but is now true only for `fastest` and `average`.
- The reveal said "Vote tie · quickest pick wins" for every tie, including order tie-breaks. It now reads "Vote tie · quickest pick wins", "Vote tie · fastest on average" or "Exact tie · settled by answer order", derived from `tieBreakReason` with a fallback for older snapshots.
- Tests: 14 engine tests including deterministic attack fixtures at 4, 5, 8 and 20 players across 60-200 seeds. They assert a *rate*, not "never" — a permutation coincides with the old formula sometimes and asserting otherwise would be a flaky test — plus that every rotation position reaches every display slot, that workload stays balanced and the author exclusion holds. One of these caught a flaw in my own first test: answers come back in display order, so comparing the `displayIndex` sequence proves nothing; the meaningful comparison is which rotation position lands in each slot.
- Verified: `npm run check` (103 unit tests), full `npm test` on a disposable 3199 server, and `npm run test:rooms` on a separate fresh lifetime. Herd workload spread remains **0** at 4, 8, 12 and 20 players, so the permutation did not disturb balance.
- Limits worth stating: this protects the *mapping* from a displayed slot to a writer. It cannot stop a writer recognising their own text, players colluding, or inference from a small roster. Herd at 20 players still produces 20 rounds — that is P06, untouched.
- Next exact task: **P03 steps 1-6.** Note `updateHostSettings` in `standalone/server.js` currently clears `room.questions`, `room.pendingQuestions` and `room.quizQuestions` on any mode change, and drops overflow when the per-player limit shrinks. The contracts P03 needs already exist in `packages/contracts/src/host-settings.ts`.
- Production touched: **no.**

### Handoff — 2026-09-11 — P01 complete

- Last updated: 2026-09-11. **P01 steps 1-7 are complete and the stage is checked off.** P02 is next.
- Step 1 delivered: `npm run capture:fixtures` drives a disposable server and writes 20 credential-free snapshots to `packages/contracts/test/fixtures/` covering host, player and spectator across lobby, building, reading, answering, reveal, finished and Herd writing, plus three error shapes, health and reconnect. The capture refuses to run against a live host, scrubs secret keys on the way out, stabilises timestamps, and fails loudly if a credential survives.
- Step 4 delivered: `describeSnapshotCompatibility` gives an unrenderable snapshot an actionable message instead of a half-drawn lobby, in both directions (client older than server, server still updating), and treats a missing `schemaVersion` as supported so current rooms keep working. Wired into the snapshot path in `app.jsx`. Because the browser cannot import the contracts package, `SNAPSHOT_SCHEMA_VERSION` now exists in two places and `smoke-regressions.mjs` fails if they drift.
- **The fixture corpus found something on its first run.** A blunt scan flagged `answering.player` as exposing a correct answer. It was a false alarm, and checking it properly was worthwhile: `currentQuestion.correctAnswerId` is `null` during answering, `currentQuestion.answers[*].author` is `null`, and the `correct` flags live under `ownQuestions`, which are the viewer's own submitted questions. A Quiz question is deliberately credited to its author by name. The assertions were replaced with the precise invariants — the key is withheld, answer authorship is hidden, and an author can still see their own key — which are the properties P02 has to preserve.
- Tests run: `npm run check` (91 unit tests, typecheck, build) passed. Full `npm test` passed against a disposable server on 127.0.0.1:3199. `npm run test:rooms` passed on a separate fresh lifetime, twelve games identical to the P00 baseline. Production and development were not targeted.
- **Browser gate now partially satisfied.** The owner loaded dev.gahookz.com from another device after the network extraction and reported it working, which is the first real-browser confirmation that the extracted adapter drives the client correctly. Automated browser coverage is still absent and remains a P10/P12 gate.
- Access note, outside the repository: dev.gahookz.com's Nginx access list allow rules (`192.168.0.0/24`, `100.64.0.0/10`) cannot match over the hostname, because hairpinned traffic arrives as the WAN address; basic auth is the only working path. The `gahookz` password was reset at the owner's request by writing `/data/access/1` directly, with backups taken. Nginx Proxy Manager regenerates that file from its database when an Access List is edited in its UI, so the same password should be set there to make it durable.
- Next exact task: **P02 steps 1-6.** Read `packages/game-engine/src/herd.ts` and its tests, plus `beginHerdAnswerWriting` and the result snapshot builders in `standalone/server.js`. `TieBreakReason` already exists in contracts. Acceptance: engine tests, exact/partial/three-way/no-vote tie fixtures, privacy tests, legal self-vote rejection and full-size seeded games all pass.
- Production touched: **no.**

### Handoff — 2026-09-09 — P01 partial

- Last updated: 2026-09-09. **P01 is not complete and is deliberately not checked off.**
- Completed numbered steps: **P01 steps 3, 5, 6 and 7.** Steps 1, 2 and 4 are outstanding.
- Revision: `7d4aca9` on `overhaul/quiz-herd-p00-p12`.
- Done in step 3: `packages/contracts/src/settings.ts` defines `gameFamily` / `quizScoring`, `toLegacyGameMode` / `fromLegacyGameMode`, and `normaliseGameSettings`, which rejects contradictory legacy-versus-canonical payloads instead of resolving them. `gameMode` is derived only. Legacy `herd` preserves the remembered Quiz scoring rather than resetting the host's toggle.
- Done in step 5: `HealthResponseSchema` was `.strict()` and narrower than the server's real response, so it rejected a healthy production server over seven operational fields. Reproduced against a live `/api/health` first. Fixed by enumerating the known optional fields, not by loosening to `passthrough()`, so the existing credential-leak assertion still holds.
- Done in step 6: `standalone/public/client/net.ts` owns commands, the live subscription, snapshot ordering and the clock offset, with `fetch`, `EventSource` and timers injected so it is testable in `node --test` without a browser. Seventeen tests cover out-of-order snapshots, coalescing, disposal, credential redaction and the one-open-stream invariant across remounts, races and reconnects. **Network cadence is unchanged, including the 1.8s recovery poll** — P08 owns that. Session storage was deliberately left in `app.jsx`.
- Done in step 7: wired through `build-client.mjs` (transform, generated-file exclusion, versioned import rewrite), `dev.mjs` (its `buildSources` allowlist would otherwise have served a stale module on dev.gahookz.com), the service-worker precache, `.gitignore`, `.dockerignore`, and the `test:unit` glob. `tsconfig.web.json` excludes test sources; `tsconfig.server.json` type-checks them under Node types.
- Outstanding for P01: **step 1** the credential-free fixture corpus for every role and phase; **step 2** discriminated phase payloads, host settings request/response and locked game rules; **step 4** the remainder of the staged schema migration beyond the optional canonical snapshot fields already added.
- Tests run: `npm run check` (71 unit tests, typecheck, build) passed; full `npm test` passed against a disposable server on 127.0.0.1:3199; `npm run test:rooms` passed on a separate fresh lifetime, twelve games matching the P00 baseline exactly. Production and development were not targeted.
- Decisions changed from this plan: two source-string assertions (`smoke-regressions.mjs`, `smoke-security.mjs`) broke without any behaviour change, because they pinned a client-wide security property to one file. Both now scan every shipped browser module, which is stronger and survives further extraction, rather than being renamed to point at the new file.
- **Known gate — no browser harness.** The adapter is covered by tests; its React call sites are not, because nothing in this project can execute the client. `npm test` drives the server over HTTP only. Until a harness exists (P10 step 7), any change to `useEvents` or the adapter's call sites needs a human loading a room. The dev container serves this tree, so dev.gahookz.com is the place to do that.
- Next exact task: **P01 steps 1, 2 and 4**, then P02. For P02, read `packages/game-engine/src/herd.ts` and its tests; `TieBreakReason` already exists in contracts.
- Production touched: **no.** Separately, a DNS fault was found and fixed outside the repository: the gahookz.com zone was not in the cloudflare-ddns `DOMAINS` list, so all three records were stranded on a previous WAN IP and the site was unreachable from outside. Records now track the current address. No container was redeployed.

### Handoff — 2026-09-08 — P00 complete

- Last updated: 2026-09-08, P00 only.
- Current stage and completed numbered steps: **P00 steps 1-5 complete.** P01 is next and not started.
- Revision: branch `overhaul/quiz-herd-p00-p12`, cut from `81a70d2` (the review base this plan names). `793a71a` preserves the previously uncommitted arena rebuild and this plan as a recoverable baseline; the P00 commit follows it. Node v24.13.1, npm 11.8.0.
- Files changed and why: `standalone/sync-artifacts.mjs` (new; one definition of the Syncthing-artifact rule), `standalone/smoke-policy.mjs` (new; pure smoke-discovery policy so it can be tested), `standalone/sync-artifacts.test.mjs` (new; the P00.4 fixture), `standalone/server.js` and `standalone/build-client.mjs` (drop their duplicate predicates and import the shared one), `standalone/smoke-deployment.mjs` (discovery now applies the shared exclusion), `package.json` (`test:unit` also runs `standalone/*.test.mjs`), `.gitignore` and `.dockerignore` (ignore the local `archive/`).
- Tests run: `npm run check` (typecheck + 39 unit tests + build) passed. Full `npm test` passed against a disposable server on 127.0.0.1:3199, exit 0. `npm run test:rooms` passed on a **separate fresh server lifetime**, exit 0, twelve complete games at 4/8/12/20 players. Production (3102) and development (3101) were not targeted; both still reported `activeRooms: 0` afterwards.
- Observed behaviour: `npm run standalone:smoke:deployment` **failed before this work**, exactly as the plan predicted — the ignored `smoke-regressions.sync-conflict-20260907-203159-CIYEAQN.mjs` still carried the production-port default and smoke discovery was the one path that did not exclude conflict artifacts. It passes now. `npm run test:rooms` independently reproduced the P06 defect: Herd at 20 players produced **20 rounds**.
- Conflict reconciliation: re-counted **15** copies (matching the earlier audit, not assumed). All 15 dated 2026-08-24 and are behind canonical; none is byte-identical to any commit reachable from `main`. Nine are regenerable build products; six are source whose every distinctive line is deliberately-removed code (`localStorage` room passwords, `?pwd=` links, `GET /api/state?`, credentials in the `/events` URL, retired `ODDBALL_QUESTION_PRESETS`, the 3102 default). The one genuine regression risk — the room-load timeout and retry UI — was checked directly and **survives in canonical** under different names (`problem` / `room-loading-status`, `standalone/public/app.jsx`). All 15 are archived read-only with a SHA-256 manifest under `archive/sync-conflicts-2026-09-07/`, hash-verified immediately before the originals were removed.
- Decisions changed from this plan and rationale: the archive is **not** committed. `.github/workflows/ci.yml` fails if any `*.sync-conflict-*` path is tracked, and renaming the copies to dodge that check would defeat the protection, so `archive/` is git- and docker-ignored and local to this machine. Nothing tracked depends on it.
- Known regressions or external gates: none introduced. The production-port detector is a plain source-text scan, so a file that merely documents the unsafe literal reports itself; `smoke-policy.mjs` is written to avoid spelling it out.
- Next exact task: **P01 steps 1-7.** Read `packages/contracts/src/{game,schemas,index}.ts`, the API helper / reducer / EventSource setup in `standalone/public/app.jsx`, `standalone/server/transport.mjs`, and the route and snapshot builders in `standalone/server.js`. Acceptance test: existing fixtures pass, invalid data fails safely, no key or author leakage, and a clean browser build loads every new module.
- Production touched: **no.**

### Initial handoff — 2026-09-08

- Planning only. The 40 draft prompts below are not yet loaded into the application.
- No P00–P12 implementation stage is checked off. The earlier arena implementation remains present and must be preserved.
- First implementation task: **P00 steps 1–4**, then establish a disposable baseline before P01. Read `CLAUDE.md`, this plan, the existing diff and smoke discovery before changing anything.
- Next requested product milestone after foundations/fairness: **P03–P05**, delivering the merged Quiz selector, host rules modal and shared personalised prompts.
- Human playtest availability and production/infrastructure authority are future gates, not reasons to fabricate completion or skip independent local work.
- Production touched by this planning session: **no**.

## Appendix A — 20 new educational prompts

Suggested audience: general mixed-age play; easy-to-medium, stable facts. These are additional entries, not a new replacement bank. Store the correct answer by stable option ID, then shuffle all four options per instance. The correct-answer column is content metadata, not a fixed on-screen position. Explanations appear only at the appropriate reveal.

| ID | Prompt | Correct answer | Three other options | Reveal explanation |
| --- | --- | --- | --- | --- |
| EDU-NEW-01 | What is 7 × 9? | 63 | 56; 72; 81 | Seven groups of nine total 63. |
| EDU-NEW-02 | What is 3/5 written as a decimal? | 0.6 | 0.3; 0.5; 0.8 | Three divided by five is 0.6. |
| EDU-NEW-03 | How many degrees are in a right angle? | 90° | 45°; 180°; 360° | A right angle is one quarter of a full turn. |
| EDU-NEW-04 | What is the area of a rectangle 8 cm long and 3 cm wide? | 24 cm² | 11 cm²; 22 cm²; 48 cm² | Rectangle area is length multiplied by width: 8 × 3 = 24. |
| EDU-NEW-05 | What is the median of 2, 5 and 9? | 5 | 2; 9; 16 | The median is the middle value when the numbers are ordered. |
| EDU-NEW-06 | How many millilitres are in one litre? | 1,000 | 10; 100; 10,000 | A millilitre is one thousandth of a litre. |
| EDU-NEW-07 | What is the chemical symbol for oxygen? | O | Ox; Og; Om | Oxygen's symbol is O; Og is the symbol for a different element. |
| EDU-NEW-08 | What is the change from liquid water to solid ice called? | Freezing | Melting; Evaporation; Sublimation | Freezing changes a liquid into a solid. |
| EDU-NEW-09 | Which material is strongly attracted to an ordinary magnet? | Iron | Wood; Glass; Plastic | Iron is a ferromagnetic material. |
| EDU-NEW-10 | What is Earth's natural satellite called? | The Moon | Mars; The Sun; Venus | The Moon naturally orbits Earth. |
| EDU-NEW-11 | What makes the Moon look bright in the night sky? | Reflected sunlight | Heat from its surface; Earth's shadow; Light from its own flames | We see sunlight reflected from the Moon's surface. |
| EDU-NEW-12 | How many legs does a typical adult insect have? | Six | Four; Eight; Ten | Insects have three pairs of legs. |
| EDU-NEW-13 | What is a caterpillar's transformation into a butterfly called? | Metamorphosis | Photosynthesis; Pollination; Hibernation | Metamorphosis is a major change in body form during development. |
| EDU-NEW-14 | Which part of a typical land plant absorbs water and minerals from soil? | Roots | Flowers; Fruits; Petals | Roots take up water and dissolved minerals from the soil. |
| EDU-NEW-15 | What do we call two straight lines that meet at a right angle? | Perpendicular | Parallel; Coincident; Curved | Perpendicular lines meet at 90 degrees. |
| EDU-NEW-16 | What is the simple past tense of “go”? | Went | Goed; Gone; Going | “Go” is irregular: its simple past form is “went”. |
| EDU-NEW-17 | Which word is the adjective in “The sleepy cat yawned”? | Sleepy | The; Cat; Yawned | “Sleepy” describes the cat. |
| EDU-NEW-18 | What type of comparison is “as quiet as a mouse”? | Simile | Metaphor; Personification; Onomatopoeia | A simile makes a comparison using words such as “like” or “as”. |
| EDU-NEW-19 | What does a map's key or legend explain? | The meaning of its symbols | Only the direction north; Only distances between places; The map reader's speed | A legend explains the symbols and colours used on a map. |
| EDU-NEW-20 | Which compass direction is halfway between north and east? | Northeast | Northwest; Southeast; Southwest | Northeast is halfway between north and east on a compass. |

## Appendix B — 20 new personalised funny prompts

Every entry uses a random connected player's display name through `{Player1}`. These are playful opinion prompts, **not facts about that person** and not pre-keyed trivia. The suggested answers make them immediately usable for Majority; a Classic author must choose an intended answer. Herd uses the prompt as a writing seed. Keep wording light and avoid real-world accusations, sensitive traits or humiliating personal claims.

| ID | Prompt template | Four suggested answers |
| --- | --- | --- |
| FUN-NEW-01 | What is something that {Player1} just cannot live without? | A suspiciously large snack stash; Wi-Fi with full bars; One more Gahook; The snooze button |
| FUN-NEW-02 | If {Player1} had a completely useless superpower, what would it be? | Finding the warm side of the pillow; Summoning one uncooked noodle; Knowing when a toaster is judging them; Turning invisible only when nobody is looking |
| FUN-NEW-03 | What would {Player1} bring to a picnic on the Moon? | An inflatable sofa; Emergency cheese; A speaker with one song; A very confused duck |
| FUN-NEW-04 | If {Player1} opened a museum, what would its star exhibit be? | A legendary unmatched sock; A phone on 1% battery; The world's most dramatic spoon; A button labelled “Definitely don't press” |
| FUN-NEW-05 | What would be the title of {Player1}'s autobiography? | I Was About to Do That; Just Five More Minutes; Snacks Were Involved; I Pressed the Gahook Button |
| FUN-NEW-06 | What would {Player1} name a pet dragon? | Toast; Sir Nibbles; Wi-Fi Password; Kevin the Slightly Warm |
| FUN-NEW-07 | If {Player1} became mayor for a day, what would be their first rule? | Mandatory afternoon snacks; Slides instead of stairs; Every meeting needs a theme song; Friday begins on Tuesday |
| FUN-NEW-08 | What would {Player1}'s entrance music sound like? | A heroic kazoo solo; One very confident triangle; A microwave finishing dinner; An orchestra of squeaky shoes |
| FUN-NEW-09 | What would {Player1} pack for a five-minute trip? | Three emergency outfits; Enough snacks for a week; A folding throne; Absolutely no charger |
| FUN-NEW-10 | If {Player1} invented a new sport, what would it involve? | Competitive blanket folding; Synchronised snack catching; Speed-walking away from chores; Extreme Gahook button tapping |
| FUN-NEW-11 | What would {Player1}'s robot assistant need to do first? | Locate the missing remote; Untangle every cable; Deliver snacks with dramatic flair; Explain why there are 47 tabs open |
| FUN-NEW-12 | What would {Player1} use as a secret handshake? | Three tiny jazz hands; An unnecessarily formal bow; A slow-motion high five; A thumbs-up followed by a Gahook |
| FUN-NEW-13 | If {Player1} were a video-game boss, what would their weakness be? | A well-timed compliment; Running out of snacks; A comfortable chair; Someone saying “one last round” |
| FUN-NEW-14 | What would {Player1} sell at a wildly unsuccessful shop? | Waterproof towels; Invisible glitter; Left-handed clouds; Premium empty boxes |
| FUN-NEW-15 | What would {Player1} do with a personal theme-park ride? | Add twelve snack stops; Make the queue the whole ride; Install a dramatic Gahook button; Turn it into a moving nap pod |
| FUN-NEW-16 | If {Player1} could rename Monday, what would they call it? | Sunday Part Two; The Loading Screen; Snack Preparation Day; Absolutely Not Yet |
| FUN-NEW-17 | What would {Player1} choose as their royal title? | Keeper of the Last Biscuit; Grand Duke of Just a Second; Supreme Button Presser; Baron of the Blanket Fort |
| FUN-NEW-18 | What would {Player1} put inside a time capsule? | A note saying “Did we win?”; A mysterious spare cable; A perfectly average pebble; Instructions for the ultimate Gahook |
| FUN-NEW-19 | If {Player1} hosted a cooking show, what would its catchphrase be? | We Can Probably Toast That; Measure with Your Heart, Panic Later; That's a Future-Me Problem; And Now, Emergency Cheese |
| FUN-NEW-20 | What would {Player1} choose as the lobby's official mascot? | A frog in tiny sunglasses; A potato with ambition; A duck holding a Gahook button; A raccoon with a clipboard |

Content acceptance before release: check all entries against the migrated bank for duplicates, read them aloud with long/short player names, verify display limits on small phones, and confirm educational keys independently during content review. These drafts have not yet been playtested with people.
