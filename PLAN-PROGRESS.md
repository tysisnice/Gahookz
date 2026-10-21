# Overhaul progress — audited 2026-09-19, Next work updated 2026-10-20

**Current navigation (2026-10-21):** [docs/ROADMAP.md](docs/ROADMAP.md) is the ordered execution index; [docs/HANDOFF.md](docs/HANDOFF.md) records the current main and fresh verification. The branch/dirty-tree/177-test checkpoint below is the historical September audit, not current source state. Preserve its incomplete P01–P12 acceptance: later focused merges and 252 passing current unit tests do not make every stage complete.

`IMPLEMENTATION-PLAN.md` remains the approved scope. The latest handoff there supersedes older completion claims. **The overhaul is partial and not release-ready.** This correction does not remove requirements.

Branch: `overhaul/quiz-herd-p00-p12`. HEAD: `e31cdc88989a78d7e1dabb468f589f46f18546b2` plus uncommitted review repairs. Browser build: `release-4a97d7b7c3b5edca`. No new candidate commit/image digest exists. Production, beta and port 3102 were not queried or changed; `/Vault` was read-only.

## Stage acceptance audit

No stage is newly checked off. P00 retains historical completion; every other stage has unfinished implementation or acceptance evidence.

| Stage | Status | Supported work and outstanding numbered steps/acceptance |
| --- | --- | --- |
| P00 | Complete, historical | Canonical source/conflict preservation remains in place; fresh check, smoke and separate room games pass. No conflict archive was discarded. |
| P01 | Partial | Host settings validation/aliases and real health/settings shape checks repaired. Steps 1–2, 4–7 still need full discriminated phase/role fixtures, runtime public-data validation, credential-safe errors and subscription lifecycle coverage. The generic `ok` check is not full snapshot validation. |
| P02 | Partial | Engine anonymity/tie tests and legal-vote simulations pass. Steps 2–4 still need the complete role-filtered payload/inference/privacy matrix, including review/moderation surfaces. No claim of anonymity against recognition or collusion. |
| P03 | Partial | Saved scoring round-trip and missing Classic key repaired and HTTP-tested; family lengths remembered. Steps 2–6 still need stable option identities through edits, all role/start/reconnect labels and full preservation, approval, race and rematch coverage. |
| P04 | Partial | Atomic settings, stale modal draft and initial focus trapping repaired; real two-tab Save/Cancel and focus checks pass. Steps 1, 4–7 and acceptance still need all policy/media paths, both host routes, 320px/short-landscape dialog, touch and screen-reader checks. Hidden-avatar preservation alone does not prove all media visibility is enforced. |
| P05 | Partial | Shared autofill, credential/phase-bound suggestions, owned metadata and unset keys repaired. Catalogue tests and one real browser suggestion pass. Steps 2, 5–7 still need stable option-ID editing and full suggest/edit/approve/fill/reveal/reset/reconnect coverage across modes; factual and read-aloud content review remains pending. |
| P06 | Partial | Capped allocator and legal simulations pass; 20-player Quick plays 8 rounds with spread 1. Author rotation by stable ID across rematches and the 2/3/5-player × Quick/Full/Custom boundary coverage are **done and merged** (2026-10-18; `npm run test:herd-boundaries`, `question-rotation.test.mjs`). Step 2 still needs honest waiting/duration/carryover status copy in the client. Human timing comparison is pending. |
| P07 | Partial | Torn-tail append, fsync ordering, bounded exhausted storage and I/O error tests pass; career status wired. Steps 3–7 still need real PostgreSQL acceptance (probe failed), full account-app status, persistent-volume/container replacement, disk-full/power-loss and operational replay proof. |
| P08 | Partial | Named heartbeat, jitter, stale-pending rejection and timed backpressure repaired. Chromium observed 0 polls over 32 quiet seconds. Steps 1, 3–6 still need party-sized measurements, suspension/credential/reconnect storms, real socket/counter cleanup, bounded RSS and p95 comparison. No material-latency-regression or 90%-reduction claim is proven by this one sample. |
| P09 | Partial | Pause defect repaired and host route policy invoked. Steps 1–6 still lack the planned typed private/public state, authoritative transition/effect engine, route/lifecycle extraction, deterministic replay and materially smaller orchestration. A tested phase helper does not complete this stage. |
| P10 | Partial | Reveal extraction exists; improved browser harness passes 18 checks for a representative Classic flow. Steps 1–3, 6–7 still need host/writing/voting/finale/roster and style decomposition plus all major phase/role/rematch/viewports and accessibility coverage. Main JSX is not strict-TS checked. |
| P11 | Partial | Fast start, consent-based discovery and public guides exist; scoring explanation corrected. Steps 3, 5–6 need observed rematch/cheer implementation-or-deferral evidence and reproducible scoring alternatives with observed disposition. Existing numerical rules stay in place. |
| P12 | Partial | Fresh automated results below; ledger corrected. Steps 1–7 still need the remaining matrix, database/load/storage/drain/rollback proof, human/device/content sessions and a reproducible immutable candidate. This is not merely a human-only gate. |

## Fresh verification

Run sequentially from this repository:

```bash
npm run check
npm test
npm run test:disposable -- npm run test:rooms
npm run test:disposable -- npm run test:browser
npm run test:disposable -- npm run standalone:smoke:review-repairs
```

`npm test` owns its servers. Do not start a server first or wrap that command again. The other wrapper commands each start and stop their own 127.0.0.1:3199 process with synthetic configuration and a temporary journal. Do not stop an unfamiliar listener or target the real containers.

Fresh final results: check **177 passed, 0 failed**; full smoke **exit 0** with 15,000 seeded games and 24 smoke scripts; rooms **12 games, exit 0**; Chromium **18 checks, exit 0**; focused repair suite **exit 0**. Initial smoke/Chromium failures and fixture corrections are preserved, not erased. See [exact commands, outputs and limits](docs/verification/2026-09-19-review-repairs/README.md).

The real PostgreSQL probe failed in the interrupted run with unhandled Pool error `57P01`. It has not passed. The journal-volume probe was not run. No current-tree image/container, account-enabled UI, load or rollback test is claimed. Historical September 12 results do not qualify this dirty tree.

## Next work

Items 1 and 2 are done. Updated 2026-10-18.

1. ~~The deploy script's hard-coded `gahookz:local` image check.~~ **Done**, merged 2026-10-18 (`GAHOOKZ_PROD_IMAGE`, four offline checks in `smoke-deployment`).
2. ~~Readiness and Pool-error handling in the disposable PostgreSQL probe.~~ **Done** on `main` via `d5f2b12` (unix-socket chown workaround) and the 2026-09-25 accounts work. The 2026-10-10 TCP-loopback variant that also avoided the SELinux socket-cleanup failure was lost with its branch and must be rebuilt if wanted.
3. ~~Finish `agent/deploy-safety`: the stubbed `docker`/`curl` test (`scripts/docker-deploy.test.sh`, not written), runbook section 4 and `docs/areas/platform.md`, and the single-Compose-project correction. Then **rehearse a rollback on beta** — never done~~ — **Done.** The stubbed test exists and holds the decisions (`npm run test:deploy-script`, 8 cases, re-verified on `main` 2026-10-20), runbook section 4 and `docs/areas/platform.md` carry them, the single-Compose-project correction is in both the script and the runbook, and the beta rollback rehearsal ran 2026-10-18 ([record](docs/verification/2026-10-18-rollback-rehearsal/README.md)). Production was deployed 2026-10-18 as `74a489949e02` ([record](docs/verification/2026-10-18-deploy/README.md)); it is behind `main` again and every deploy stays gated on Tyson. The stale deploy docs that contradicted the fixed script (runbook "Known issue: the image check", four `platform.md` Known-issues entries, the rollback Option 2 heading) were corrected 2026-10-20.
4. Verify a current isolated image's read-only/non-root journal volume across replacement (`standalone/verify-journal-volume.mjs` needs a `gahookz:review-*` image), then continue the stage acceptance above.
5. P06 step 2's remaining piece: honest waiting/duration/carryover status copy in the client. **Done and merged to `main` 2026-10-20** (`e45480b`, merge `233f8cc`; re-verified on the merge branch under Node 24: `npm run check` 248/248 unit tests + build, full `npm test` exit 0, `test:browser:herd-writing` exit 0, `standalone:smoke:herd-flow` exit 0, [record](docs/verification/2026-10-20-herd-status-copy/README.md)). Stage acceptance stays Partial for the remaining P06 steps.

## Owner-dependent gates

Tyson needs to arrange observed 4/8/12/20-player sessions and physical Safari/Android, keyboard/screen-reader and accessibility checks. Use at least eight people to evaluate eight-round Quick Herd pacing. Review the 40 prompts factually and aloud with real names; record aggregate clarity, writing waits, duration and rematch/cheer feedback without raw personal content. Numerical scoring changes may remain deferred while the approved rules continue.

Accounts/OAuth provisioning and any proxy/deployment operations require separate owner-led operational work when local engineering is ready. Do not ask Tyson for a database just to run disposable integration tests.

## Historical operations reminder — not reverified

Earlier notes describe a guest-only two-room beta and a manually managed certificate expiring **13 December 2026**, outside Nginx Proxy Manager automatic renewal. Treat that as a reminder for Tyson to confirm ownership and renewal privately, not as current service evidence. No live revision, certificate, mount or running image was inspected in this review.

## Preserve these implementation constraints

- `standalone/public/client/*.js` includes handwritten `audio.js` and `gahook-forms.js`. Use `npm run clean:generated`; never delete all `.js` files.
- `.jsx` is outside strict TypeScript coverage. Build success does not prove browser execution; run real interaction checks.
- Packages executed by plain Node must keep erasable TypeScript syntax.
- Browser tabs in one profile intentionally share a device credential; use distinct contexts for distinct players.
- The room cap is 32 by default. Separate batches need separate server lifetimes.
