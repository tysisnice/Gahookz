# Documentation audit: old documents and coverage gaps

Audited: 2026-10-07  
Scope: 12 named root-level plan/deployment documents; every file in docs/product/, docs/architecture/, docs/operations/

This audit compares old documents against newer structure (docs/areas/*.md, docs/wiki/*.md, docs/architecture/overview.md, docs/operations/runbook.md) and recommends archive, keep-and-update, or merge.

---

## Root-level plans and deployment guides

| Document | What it is | Newer coverage | Recommendation | Links | Notes |
|---|---|---|---|---|---|
| **IMPLEMENTATION-PLAN.md** | Scope and execution ledger for the Sept 2026 overhaul (quiz mode, contracts, arena, UI fixes, accounts proposal). Status: partial, not release-ready. 143 KB. | docs/areas/ (game-flow, platform, ui-shell), docs/architecture/overview.md, docs/verification/2026-09-25-update/*.md (per-agent completion audit) | **Keep and update** — remains the authoritative acceptance scope for this overhaul phase. Update the "Latest handoff" and acceptance table at P00–P12 after each agent's verification audit. | CLAUDE.md, PLAN-PROGRESS.md, RELEASE-CANDIDATE.md, README.md, OPERATIONS-AND-ROADMAP.md, docs/plans/2026-09-25-briefs.md, docs/CHANGELOG.md | Still drives the current work. Export decision tables to docs/verification/2026-09-25-update/scope.md when handoffs stabilize. |
| **PLAN-PROGRESS.md** | Session completion audit. Logs which stages (P00–P12) are complete, partial, or blocked. Last checked 2026-09-19. Status: every stage except P00 is partial. | docs/verification/2026-09-25-update/*.md (detailed per-agent verifications), IMPLEMENTATION-PLAN.md ledger | **Merge into IMPLEMENTATION-PLAN.md** — the execution ledger there should be the single live record. Flatten this into an "Audit history" section with dated snapshots. | IMPLEMENTATION-PLAN.md, RELEASE-CANDIDATE.md, README.md, OPERATIONS-AND-ROADMAP.md, docs/plans/2026-09-25-briefs.md | Duplication with the ledger in IMPLEMENTATION-PLAN.md creates a maintenance burden. Stage tables belong in the same document. |
| **RELEASE-CANDIDATE.md** | Release readiness snapshot, 2026-09-19. Verification of check/test/smoke runs; confirmation that no deployment is authorized. | docs/operations/production-readiness.md, docs/operations/runbook.md, docs/verification/2026-09-25-update/*.md, IMPLEMENTATION-PLAN.md | **Archive with banner** — superseded by ongoing verification records in docs/verification/2026-09-25-update/. Kept as a historical snapshot of what was tested and why. | IMPLEMENTATION-PLAN.md, PLAN-PROGRESS.md, docs/plans/2026-09-25-briefs.md, docs/verification/2026-09-19-review-repairs/README.md | The evidence it reports (npm run check, npm test, etc.) is now in per-agent completion audits. No new deployment gate is authorized by this snapshot. |
| **ARENA-1V1-PLAN.md** | Implementation plan for 1v1 arena UX fixes. Frames the work as "snappy and responsive". Ground rules on disposable test servers and read-only access to /Vault. | docs/verification/2026-09-19-arena-1v1/README.md (verification results), docs/areas/ui-shell.md, docs/wiki/hosting-and-deploys.md | **Archive with banner** — this plan phase is complete and verified. Arena work is now integrated into docs/areas/ui-shell.md and tracked in standard runbooks. | docs/plans/2026-09-25-briefs.md, docs/verification/2026-09-19-arena-1v1/README.md, standalone/browser-arena-1v1.mjs | Verification report exists; the phase is closed. Keep for project history. |
| **DESKTOP-UI-PLAN.md** | Implementation plan for desktop UI fixes. Five stages, each with acceptance criteria. Emphasizes working stages in order. | docs/verification/2026-09-19-desktop-ui/README.md (verification), docs/areas/ui-shell.md, docs/wiki/prompts-and-suggestions.md | **Archive with banner** — design phase complete and verified. Desktop work is now in docs/areas/ui-shell.md and flowing through standard CI/CD. Kept for method reference. | docs/plans/2026-09-25-briefs.md, docs/verification/2026-09-19-desktop-ui/README.md, docs/verification/2026-09-19-mobile-ui/README.md, MOBILE-UI-PLAN.md | Contains method (stages, acceptance) worth preserving for training, but the phase closed on 2026-09-19. |
| **MOBILE-UI-PLAN.md** | Implementation plan for mobile/narrow-screen fixes. Three items; narrow scope. | docs/verification/2026-09-19-mobile-ui/README.md (verification), docs/areas/ui-shell.md | **Archive with banner** — phase complete and verified (2026-09-19). Mobile work integrated into standard runbooks and docs/areas/ui-shell.md. | docs/plans/2026-09-25-briefs.md, docs/verification/2026-09-19-mobile-ui/README.md, standalone/browser-mobile-ui.mjs | Verification complete. Keep for history. |
| **HOSTING-PLAN.md** | Investigation task: move game hosting from laptop to player devices or desktop RAM/CPU to reduce load. Frames scope: feasibility first, implementation second. | docs/operations/production-readiness.md (current 1v1 architecture, scaling limits), docs/areas/platform.md, docs/wiki/hosting-and-deploys.md | **Archive with banner** — investigation completed (docs/verification/2026-09-19-hosting/README.md). Result: current single-process model per environment is the constraint. Scaling approaches are in production-readiness. | docs/plans/2026-09-25-briefs.md, docs/verification/2026-09-19-hosting/README.md | Investigation closed. Findings in arch docs and platform area guide. |
| **OPERATIONS-AND-ROADMAP.md** | Long-form architecture, maintenance, and roadmap, written in layers since 2026-07-20. 65 KB. Marks sections as superseded or struck through. Section 10 is the live backlog. | docs/areas/platform.md (runbook summary), docs/operations/runbook.md (daily operations), docs/architecture/overview.md (current state), docs/operations/production-readiness.md (constraints) | **Keep and update** — remains reference for architectural reasoning and long-form context. Consolidate superseded passages into a single "Archived" section at the end; move backlog items to docs/plans/2026-09-25-update.md. Shorten for readability. | CLAUDE.md, IMPLEMENTATION-PLAN.md, README.md, SERVER-COMMANDS.md, docs/architecture/0001-long-term-foundation.md, docs/architecture/overview.md, docs/areas/accounts.md, docs/product/accounts-plan.md, docs/plans/2026-09-25-briefs.md, docs/plans/2026-09-25-update.md | Heavy re-reading load. Refactor to a "why it is this way" reference and move operational detail to runbook. |
| **SERVER-COMMANDS.md** | Short runbook for Fedora server. Rewritten 2026-09-06 after Cloudflare Tunnel and old Nginx setup were removed. Lists trees, branches, and port bindings. | docs/operations/runbook.md (comprehensive owner's runbook, covers environments, logs, update cycle), docs/wiki/hosting-and-deploys.md | **Merge into docs/operations/runbook.md** — both cover the same content. runbook.md is newer, more structured, and is the approved source for operations. SERVER-COMMANDS.md is a less complete duplicate. | CLAUDE.md, DEPLOY-FEDORA.md, docs/operations/runbook.md, docs/plans/2026-09-25-briefs.md, docs/plans/2026-09-25-update.md, docs/wiki/hosting-and-deploys.md, README.md | Remove duplication. Keep runbook.md as the single source of truth. |
| **DEPLOY-FEDORA.md** | Build-from-scratch recipe for standing up Gahookz on a Fedora laptop with Docker and Nginx. Reviewed 2026-09-06; noted as illustrative, not a description of live server (which uses Nginx Proxy Manager, paths differ). | docs/operations/runbook.md (environment setup, ports, project paths), docs/wiki/hosting-and-deploys.md | **Keep and update** — remains a valid from-scratch deployment reference. Update paths section (production/beta/dev now at `/srv/gahookz` and `/mnt/storage/syncthing/Store/Projects/gahookz` since 2026-10-02). Remove "illustrative" caveats; make clear which parts are current. Repoint to runbook for live machine state. | CLAUDE.md, IMPLEMENTATION-PLAN.md, README.md, docs/plans/2026-09-25-briefs.md, docs/plans/2026-09-25-update.md, docs/wiki/hosting-and-deploys.md, deploy/FEDORA-CODEX-PROMPT.md | Used as a reference for fresh setup. Needs one small update: path references. Codex prompt below depends on it. |
| **deploy/FEDORA-CODEX-PROMPT.md** | Prompt to copy into Codex on the Fedora server. References DEPLOY-FEDORA.md, Dockerfile, compose.yaml, etc. Sets deployment criteria (health checks, HTTPS, etc.). | docs/operations/runbook.md (covers the same deployment steps and health checks), docs/wiki/hosting-and-deploys.md | **Archive with banner** — this is a single-use prompt template for onboarding Codex on that machine. Once deployment is live, it is historical. Kept as a record of what was deployed and how. | docs/plans/2026-09-25-briefs.md | One-time onboarding artifact. Archive. |

---

## docs/product/ files

| Document | What it is | Newer coverage | Recommendation | Links | Notes |
|---|---|---|---|---|---|
| **2026-08-10-product-technical-audit.md** | Product and technical audit (8 Aug): modes, UI, flow, maintainability, security, hosting, persistence, monetisation, release risk. Verdict: Gahookz is coherent three-mode game. | docs/architecture/overview.md (current state), docs/operations/production-readiness.md (ops constraints), docs/areas/ (game-flow, platform, quality, ui-shell), docs/product/accounts-plan.md, docs/product/roadmap-and-growth.md | **Archive with banner** — historical audit from before the Sept overhaul. Findings are preserved in area guides and architecture docs. Kept as a checkpoint before the current work. | docs/architecture/0001-long-term-foundation.md, docs/operations/production-readiness.md | Audit is complete. Findings are in newer documents. |
| **accounts-plan.md** | Proposal (2026-09-25 request): what accounts should do, what exists, how to finish. Foundations on branch agent/accounts; nothing live on gahookz.com yet (accountPersistence: "memory", no Google client). | docs/areas/accounts.md (comprehensive area guide with full implementation path), docs/verification/2026-09-25-update/accounts.md (agent completion audit), docs/operations/production-readiness.md (account sections updated) | **Archive with banner** — superseded by docs/areas/accounts.md, which is the current authoritative guide. accounts-plan.md is the proposal that led to it; keep as context for why the path was chosen. | docs/areas/accounts.md, docs/operations/production-readiness.md, docs/plans/2026-09-25-update.md, docs/product/roadmap-and-growth.md, docs/verification/2026-09-25-update/accounts.md | The area guide now owns accounts. |
| **internal-reports.md** | Product pages moved out of the public /information endpoint in P11 step 4. Explains why (info architecture, not access control; moved for audience, not security). | docs/wiki/information-and-legal-pages.md (the player-facing guide that documents where these pages are served), docs/product/roadmap-and-growth.md | **Archive with banner** — reference for why the migration happened. The moved pages are documented in wiki/information-and-legal-pages.md. | docs/wiki/information-and-legal-pages.md, IMPLEMENTATION-PLAN.md, standalone/smoke-information.mjs | Historical context for the information architecture choice. Keep for audit trail. |
| **roadmap-and-growth.md** | Proposal (2026-09-25): Tyson's goals for reach and monetisation. Nothing yet implemented or approved. Answers the "Future" section of 2026-09-25-update note. | docs/plans/2026-09-25-update.md (broader update decision log), docs/areas/ (strategic direction by domain) | **Keep and update** — this is a strategic proposal under active review. Not yet approved, but worth keeping current as Tyson makes decisions. Link prominently from docs/plans/2026-09-25-update.md. Add decision status (approved, deferred, rejected) as decisions land. | docs/plans/2026-09-25-update.md | Active proposal. Keep it current. |

---

## docs/architecture/ files

| Document | What it is | Newer coverage | Recommendation | Links | Notes |
|---|---|---|---|---|---|
| **0001-long-term-foundation.md** | ADR (2026-08-10): accepted decision on maintainability, browser build, styling, room authority, scale, identity, persistence, and paid-entitlement readiness. Rationale and context. | docs/architecture/overview.md (describes what is built today from this ADR), docs/operations/production-readiness.md (production decisions flowing from this), docs/areas/accounts.md, docs/areas/platform.md | **Keep and update** — remains the decision record. Annotation needed: cross-reference which decisions are now live (most of them) vs. which are for future work (accounts, scale). Relink from overview.md and production-readiness.md. | CLAUDE.md, IMPLEMENTATION-PLAN.md, README.md, docs/architecture/overview.md, docs/operations/production-readiness.md, docs/product/2026-08-10-product-technical-audit.md, OPERATIONS-AND-ROADMAP.md | Foundational decisions. Keep as a stable reference. |
| **0002-room-recovery-feasibility.md** | Feasibility record (status: evaluated, not implemented). Assesses what would be needed for room persistence / replica affinity if the single-process model ever changes. P09 step 7 asks for this to be written. | docs/architecture/overview.md (section on single-process model and its constraints), docs/operations/production-readiness.md (scaling and replica limits) | **Archive with banner** — feasibility study. Findings (that single-process model is deliberate and any change would be large) are now in architecture overview and readiness docs. Kept for future consideration. | docs/architecture/overview.md, IMPLEMENTATION-PLAN.md | P09 step is satisfied. Findings captured elsewhere. |
| **0003-scoring-alternatives.md** | ADR (status: evaluated, decision deferred to playtest). Two older backlog scoring proposals, neither implemented. Worked examples with fixtures. | docs/areas/game-flow.md (current scoring rules and decision log), docs/wiki/scoring.md (player-facing scoring guide) | **Archive with banner** — deferred proposals with worked examples. Kept for future playtest consideration. Decision to defer is recorded in ADR. Findings are reflected in docs/areas/game-flow.md. | docs/areas/game-flow.md, IMPLEMENTATION-PLAN.md, docs/wiki/scoring.md | Proposals are on hold. Keep for reference when playtest happens. |

---

## docs/operations/ files

| Document | What it is | Newer coverage | Recommendation | Links | Notes |
|---|---|---|---|---|---|
| **dependency-policy.md** | Dependencies and base images (status 2026-10-04: accurate). Runtime surface is pg and tsx; base image pinned by digest; erasableSyntaxOnly in tsconfig. Updated to clarify that tsx is dev/test only; production runs plain node. | docs/operations/runbook.md (dependency and version setup in environment section), docs/areas/platform.md, IMPLEMENTATION-PLAN.md | **Keep and update** — forms part of production readiness. Add link to CI matrix and Node 24 requirement in runbook. Ensure it is clear whether this is a live requirement or historical context. | IMPLEMENTATION-PLAN.md, docs/plans/2026-09-25-briefs.md, docs/plans/2026-09-25-update.md, docs/operations/runbook.md | Details are accurate and used. Needs minor cross-reference update to runbook. |
| **production-readiness.md** | Operations guide (2026-10-04: accurate). Single Node process owns every room, restart ends them, drain flag and health check work as described. Sections on admission, moderation, accounts, PostgreSQL. Context updated: paths moved to Store repo as of 2026-10-02. | docs/operations/runbook.md (comprehensive coverage with day-to-day procedures), docs/architecture/overview.md (architectural constraints), docs/areas/accounts.md (account sections), docs/areas/platform.md | **Keep and update** — remains the authoritative record of production constraints and operational decisions. Minor updates: cross-reference runbook for day-to-day; confirm account sections match docs/areas/accounts.md. Used as a reference by runbook. | CLAUDE.md, IMPLEMENTATION-PLAN.md, README.md, docs/plans/2026-09-25-briefs.md, docs/plans/2026-09-25-update.md, docs/operations/runbook.md, docs/product/2026-08-10-product-technical-audit.md, docs/product/accounts-plan.md, docs/product/internal-reports.md | Actively used. Minimal changes needed. |
| **runbook.md** | Owner's runbook (2026-10-04): day-to-day guide for running Gahookz on the home server. Covers environments, logs, updates, health, drain cycle. Comprehensive and structured. | None — this is the newest document. It consolidates earlier operational knowledge and is the authoritative source. | **Keep as single source of truth** — this is the document to use and maintain. Archive SERVER-COMMANDS.md and reduce OPERATIONS-AND-ROADMAP.md operational detail to summary, pointing here. | docs/architecture/overview.md, docs/operations/production-readiness.md, docs/plans/2026-09-25-briefs.md, docs/plans/2026-09-25-update.md, README.md, SERVER-COMMANDS.md, standalone/smoke-deployment.mjs | The current authoritative runbook. Actively maintained. |

---

## Summary and next steps

### Archive with banner (historical record, not in active use)

Move these documents to an archive or add a banner to the top:

```markdown
> **Archived 2026-10-07** — [reason]. [Link to replacement or context]. Kept for history.
```

- **RELEASE-CANDIDATE.md**: superseded by ongoing verification in docs/verification/2026-09-25-update/
- **ARENA-1V1-PLAN.md**: phase complete; verified in docs/verification/2026-09-19-arena-1v1/README.md
- **DESKTOP-UI-PLAN.md**: phase complete; verified in docs/verification/2026-09-19-desktop-ui/README.md
- **MOBILE-UI-PLAN.md**: phase complete; verified in docs/verification/2026-09-19-mobile-ui/README.md
- **HOSTING-PLAN.md**: investigation complete; findings in docs/operations/production-readiness.md
- **deploy/FEDORA-CODEX-PROMPT.md**: one-time onboarding prompt; deployment now live
- **2026-08-10-product-technical-audit.md**: historical audit; findings in area guides
- **accounts-plan.md**: superseded by docs/areas/accounts.md
- **internal-reports.md**: informational; pages are in wiki/information-and-legal-pages.md
- **0002-room-recovery-feasibility.md**: P09 step 7 satisfied; findings in overview
- **0003-scoring-alternatives.md**: deferred proposals; kept for future playtest

### Keep and update (active reference or strategic)

- **IMPLEMENTATION-PLAN.md**: remains the approved overhaul scope; update the ledger and latest handoff after each agent verification
- **OPERATIONS-AND-ROADMAP.md**: consolidate superseded passages; shorten for readability; move backlog to docs/plans/2026-09-25-update.md
- **DEPLOY-FEDORA.md**: update path references (2026-10-02 repository moves); clarify what is current vs. illustrative
- **roadmap-and-growth.md**: active strategic proposal; add decision status as decisions land
- **0001-long-term-foundation.md**: foundational ADR; add annotations on live vs. future decisions
- **dependency-policy.md**: accurate and used; add cross-reference to runbook
- **production-readiness.md**: authoritative ops reference; update account sections to match docs/areas/accounts.md

### Merge into other documents (reduce duplication)

- **PLAN-PROGRESS.md** → merge into IMPLEMENTATION-PLAN.md execution ledger
- **SERVER-COMMANDS.md** → merge into docs/operations/runbook.md or archive as historical duplicate


---

## Orchestrator corrections (2026-10-07)

Checked against the plan and the documents before acting on this audit:

- **`docs/product/accounts-plan.md`: keep, do not archive.** It is the proposal
  written for Tyson's decisions on accounts (sign-in provider, persistence,
  launch), which are still open. `docs/areas/accounts.md` describes the code;
  the plan describes choices not yet made.
- **`docs/architecture/0003-scoring-alternatives.md`: keep.** Its decision is
  deferred to a playtest, not abandoned; a deferred ADR stays live.
- **`DEPLOY-FEDORA.md`:** production does **not** run from `/srv/gahookz`. Since
  2026-10-02 production, beta and dev all run from the Store repository;
  `/srv/gahookz` is a stale clone.
- Archiving the remaining recommended files is done by the orchestrator in one
  pass after the wave-2 merges, so that inbound links are fixed once.
