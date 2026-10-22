# Phase-discriminated snapshot contracts, and a fixture corpus that had stopped being evidence

**Date:** 2026-10-22 · **Branch:** `agent/contract-phase-payloads` ·
**Base:** `aeb556d` · **Runtime:** Node 24.22.0 · **Deployed:** nothing

Roadmap section 2, item 1, continued: P01 **step 2** (discriminated phase
payloads, locked game rules, the question key/prediction distinction, result
tie reasons) and P01 **step 5** (validate representative real response shapes
before enforcing schemas).

## Why this block exists

The previous slice proved that the server filters snapshots by credential and
phase. It did not look at whether anything described the payload those rules
produce. Measured before changing anything:

| | before | after |
| --- | --- | --- |
| Snapshot fields the contract described | **11** | 18 described + 58 knowingly tolerated = **76, all accounted for** |
| Snapshot fields silently passed through | 50 | 0 undecided |
| Snapshot fixtures | 16 | 35 |
| Phases actually covered by a fixture | 5 of 7 | 7 of 7 |
| Modes covered end to end | Quiz Classic | Quiz Classic, Majority, Herd |

`PublicSnapshotBaseSchema` pinned eleven fields and `.passthrough()`-ed the
rest, with `currentQuestion: z.unknown().nullable()`. Since every snapshot
carries the same seventy-six keys in every phase, a key-presence schema cannot
express anything that matters here: the answer key, the answer text and the
names of the people who wrote the answers all live inside `currentQuestion`,
and each becomes visible at a different moment.

## What was wrong, found by measuring rather than reading

1. **The corpus was stale and nothing could tell.** The server has been sending
   `gameFamily`, `quizScoring`, `lockedRules`, `settingsRevision`,
   `herdRoundTarget`, `savedQuestionCount`, `savedQuestionCountOtherFamily`,
   `pendingQuestionCount`, `lobbyArenaEnabled`, `gahookEffects`,
   `gahookStealPoints`, `getGotPenaltyPoints`, `hostPresence`, `hostChange`,
   `ownHostReplaced` — fifteen fields no fixture contained. Every test was
   green throughout, because unknown keys passed through and the corpus was
   never recaptured. A comment in `fixtures.test.ts` still claimed "real
   snapshots still carry only the legacy gameMode"; they had not for some time.
2. **`building.host` and `building.player` held `lobby` snapshots.** The
   capture recorded them after `/api/host/settings` but before
   `/api/host/lock-setup`, which is the call that enters the building phase. The
   building phase was never covered at all. The test that claimed to check
   "every role and phase it claims to" only read file *names*.
3. **`lobby.spectator` was captured with the host's own credential** and a
   different `role` string, so it recorded `isHost: true` — the host's view
   under a spectator's name. Given that the `role` string grants nothing (the
   previous slice proved that), this fixture could never have shown what a
   spectator sees.
4. **No captured player had ever submitted a question**, so `ownQuestions` was
   `[]` in all sixteen fixtures and the test named "a player's own questions
   still show them their own answer key" was guarded by `if (own?.length)` and
   never ran.
5. **No fixture reached a reveal with a tie**, so `tieBreakReason` — the field
   P01 step 2 names — appeared in no captured payload in any form.

None of the five is a defect in the game. All five are defects in the evidence,
which is worse in one specific way: they were invisible, and three of them were
asserted by passing tests.

## What changed

**`standalone/capture-fixtures.mjs`** now plays real games. Players submit real
questions — Classic with one correct answer, Majority with one prediction, Herd
as prompts — everyone votes, and the votes are **split deliberately** so a
genuine tie reaches a fixture; a unanimous room reports `tieBreakReason: "none"`
for every question, which is the one case needing no contract. It captures the
building phase after the setup is locked, captures a shared display as one
really is (a viewer who is not the host, plus a keyless one), and runs all three
modes to `finished`. The journey is now **exported**, because two things need
it: the script rewrites the corpus, and the new smoke suite validates the same
payloads live.

**`packages/contracts/src/schemas.ts`** adds the contract that was missing.
`publicQuestion` in `standalone/server.js` implements exactly three gates, and
the schema now says so:

| phase | answers listed | answer text | key, authors, author points |
| --- | --- | --- | --- |
| lobby, building, herd-writing | no | — | no |
| reading | yes | blank | no |
| answering | yes | filled | no |
| reveal, finished | yes | filled | yes |

`PublicSnapshotSchema` is a `z.discriminatedUnion` on `phase` carrying those
per-phase question schemas. Withheld fields are pinned as *absent*
(`z.undefined().optional()`) rather than merely falsy, and the key is pinned as
explicitly `null` before the reveal so a client can tell "not yet" from "this
build does not send it". Also added: `LockedRulesSchema` (the rules frozen at
lock-in, required once a game has begun), `MajorityResultsSchema` and
`HerdResultsSchema` with `tieBreakReason`, and `OwnQuestionSchema`.

**The tie explanation is now a contract.** Three rules from P02 steps 5 and 6,
none of which was previously checked against a payload:

- `tieBrokenBySpeed` may only describe a tie that speed actually settled, so a
  tie settled by the stable answer order must leave it false;
- naming a tie-break rule for a round that was not tied is a false explanation;
- no votes means no winning answer and reason `none`.

**Described versus tolerated, made explicit.** `DESCRIBED_SNAPSHOT_KEYS` and
`TOLERATED_SNAPSHOT_KEYS` together account for all seventy-six fields, and
`undescribedSnapshotKeys()` returns anything in neither list. A *new* server
field now fails a test by name instead of being waved through. That is the
distinction P01 step 5 asks for: a tolerated forward-compatible addition is a
decision somebody made, an undescribed one is not.

**`standalone/smoke-contract-drift.mjs`** (new, in the shared chain) asks the
live server three questions: does every snapshot it actually produces satisfy
the contract for its phase; does it send anything undecided; and has the
committed corpus drifted from the live shape, in either direction. The third is
the one that failed silently before, and its failure message names
`npm run capture:fixtures`.

**Both health captures are kept.** A fresh capture runs against the disposable
server, which has no release or revision to report. The September capture from a
built container does, and the schema has to accept both, so the old one is
preserved as `health.built.json` rather than overwritten — the same principle as
not letting browser suites overwrite old screenshots.

## Non-vacuity

Six mutations, each applied alone to the real server and reverted, with the
suite run against a disposable server on 3199.

| Mutation | Result |
| --- | --- |
| `revealAnswer` also true during `answering` | caught — `answering.host … expected undefined, received boolean` at `currentQuestion.answers[0].correct` |
| `showAnswerText` also true during `reading` | caught — `herd-reading.host … expected ""` at `currentQuestion.answers[0].text` |
| Herd answer author named without the reveal guard | caught — `herd-answering.host … expected null, received object` at `currentQuestion.answers[0].author` |
| `lockedRules` always `null` in the snapshot | caught — `answering.host … expected object, received null` at `lockedRules` |
| A new field `experimentalPartyScore` added to the snapshot | caught — "carries field(s) the contract neither describes nor tolerates: experimentalPartyScore" |
| `tieBrokenBySpeed: true` unconditionally in `majority.mjs` | **not caught by this suite.** Caught by the existing `standalone/server/majority.test.mjs` ("an order tie-break is not a speed win") |

The last row is recorded as it happened rather than tidied away. The captured
Majority round was a genuine `fastest` tie, so flagging speed was *consistent*
there — the refinement is real but that corpus does not exercise its `order`
branch, and no live capture easily can, since an order tie needs two groups with
identical vote counts, identical fastest times **and** identical averages. Both
engines already derive the flag from the reason and both have four-reason tests.
So the payload boundary is pinned separately and deliberately, by hand-built
payloads in `packages/contracts/test/contracts.test.ts` — the only place the
contract and the engines meet.

## Commands and results

| Command | Result |
| --- | --- |
| `npm run check` | **266/266** unit (was 254), strict TypeScript across all three projects, build `release-2e544d33f0fabce4` |
| `npm run standalone:smoke:contract-drift` (disposable 3199) | pass — "35 live snapshots satisfy their phase contract, 76 snapshot fields accounted for, corpus matches the server, tie reasons seen: fastest/none" |
| `npm test` (full chain) | pass |
| `npm run docs:check` | pass |
| `node standalone/test-disposable.mjs node standalone/capture-fixtures.mjs` | 39 fixtures written |

Every heavy job ran under `flock /tmp/gahookz-verify.lock`. Nothing was
deployed; no container, `.env` or infrastructure file was touched.

## Limits

- **The contract describes 18 of 76 snapshot fields.** The other 58 are listed
  as tolerated, which records that nobody has described them — it is not a claim
  that they are validated. `leaderboard`, `questionResults`, `herdPreparation`,
  `herdAnswerReview` and `ownHerdAssignments` are the substantial ones.
- **Nothing validates at runtime.** The server imports only
  `HostSettingsRequestSchema` and `normaliseGameSettings` from this package;
  these snapshot schemas run in tests. That is why tightening them cannot
  affect a live player, and also why they prove shape rather than enforce it.
  Wiring validation into the browser adapter is P01 step 6.
- The embedded player object is described by four of its roughly forty fields.
- `tieBreakReason` is covered for `none` and `fastest` by real payloads;
  `average` and `order` only by the engines' own tests and hand-built payloads.
- The `health` fixture now comes from a development server. A built container's
  health response is still covered, but only by the preserved September capture.
- `voteSelections` and `questionResults` are described as lists without member
  contracts, because nothing yet depends on their contents.
