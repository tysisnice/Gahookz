# Release readiness — Quiz/Herd overhaul

**2026-09-19: NOT RELEASE-READY.** Review repairs exist and focused verification passes, but required implementation and acceptance gates remain open. No deployment is authorized.

Branch `overhaul/quiz-herd-p00-p12`, HEAD `e31cdc88989a78d7e1dabb468f589f46f18546b2` plus uncommitted repairs; browser build `release-4a97d7b7c3b5edca`. This is not a clean immutable candidate. No current image ID/digest or previous recoverable image has been verified. Earlier `d0a7f5b`/image claims are historical and must not be attributed to this tree.

## Fresh evidence

All stateful runs used owned disposable servers on 127.0.0.1:3199. Production and beta were neither queried nor changed.

| Command | Final result | Scope limit |
| --- | --- | --- |
| `npm run check` | Exit 0; 177 tests passed, 0 failed; typecheck/build pass | Strict typing covers migrated modules, not all JSX/server code |
| `npm test` | Exit 0; 15,000 simulations and 24 smoke scripts | Static deployment assertions do not execute a container or deploy |
| `npm run test:disposable -- npm run test:rooms` | Exit 0; 12 games, 4/8/12/20 per mode | Accelerated HTTP lifecycle, not public-network load or human pacing |
| `npm run test:disposable -- npm run test:browser` | Exit 0; 18 Chromium checks | Representative Classic flow, not full role/mode/device/rematch matrix |
| `npm run test:disposable -- npm run standalone:smoke:review-repairs` | Exit 0; all three repair summaries | Targeted HTTP fixtures, not complete plan acceptance |
| Real PostgreSQL probe | Prior run failed: unhandled Pool error `57P01` | No successful transaction/outage/replay evidence; not rerun here |
| Journal-volume replacement probe | Not run | Configuration is not durability proof |
| Current-tree image, load, staging drain/rollback | Not verified | No release identity, capacity or recovery claim |

[Exact commands, raw outputs, initial failures and source hashes](docs/verification/2026-09-19-review-repairs/README.md) are retained. The first smoke failed a shuffled-fixture assumption; the first two browser attempts failed/stalled before harness corrections. Final successes do not erase those findings.

## Repairs and remaining implementation

Repairs address pause, saved-question scoring, suggestion authorization, torn journal append/compaction, hidden content inventory, stale modal saves/focus, shared style-aware generation, owned factual metadata, settings validation, browser heartbeat/backoff and stalled-stream deadlines. See the [latest handoff](IMPLEMENTATION-PLAN.md#8-handoff-discipline) for files and [stage acceptance audit](PLAN-PROGRESS.md#stage-acceptance-audit) for missing work.

P01–P12 remain partial. Required runtime contracts, option identity/carryover and complete privacy coverage, typed transition/lifecycle extraction and feature-owned UI/CSS are still engineering work. They are not waived by passing a narrow suite.

## Storage and release configuration — not applied

`Dockerfile` creates `/app/data` owned by the non-root user. `compose.yaml` mounts `career-data:/app/data` and sets `GAHOOKZ_CAREER_JOURNAL=/app/data/career.journal` for the read-only production service. This changes the checked-in storage configuration; no live mount or migration was inspected or applied. Verify permissions, durable acceptance, compaction/disk-full recovery and container replacement with a disposable volume and current image.

Prod and beta now have separate configurable image references (`GAHOOKZ_PROD_IMAGE` and `GAHOOKZ_BETA_IMAGE`), but defaults are mutable tags. **Known integration regression: `scripts/docker-deploy.sh` still verifies `gahookz:local` after Compose builds the changed prod image name. Resolve and test that before operational use.** Separate tags alone do not preserve a rollback image.

No SQL migration was added by these repairs. Compatibility and real transactional idempotency still require a passing disposable PostgreSQL test; lack of a new migration is not proof of compatibility. Actual account status must also be checked through the application.

## Rollback remains unqualified

The previous document's deploy command was not a rollback procedure. Do not run it as one. First preserve the exact old image ID/digest, build an independently identified candidate, prove old/new journal and database compatibility, then rehearse synthetic-room drain and restoration of that old image on an isolated staging stack. Capture post-restore health, guest gameplay, account recovery and schema compatibility. No production/beta replacement is part of this review, and no previous image identity has been confirmed.

## External gates

- Observed 4/8/12/20-player sessions, with at least eight people for eight-round Quick Herd; compare Quick/Full, setup clarity, writing waits, scoring understanding and arena fatigue/rematch choices.
- Physical iOS Safari and Android Chrome, rotation/keyboard/background-resume/poor connectivity; desktop keyboard and real screen reader, contrast, reduced motion, muted audio and shared-screen readability.
- Factual review and read-aloud personalization of all 40 new prompts, with small-screen and intended-answer/Fact-check clarity.
- Separate owner-authorized account/OAuth, proxy/certificate and eventual release operations when local engineering is ready. The historical December 13 beta certificate reminder needs owner confirmation; it was not checked live.

Tyson does not need to provide a database or production access for the next local repairs. Numerical scoring changes may stay deferred. Release readiness requires the unfinished engineering, automated, human/device and isolated operations gates; a later explicit deployment request is still required after that.
