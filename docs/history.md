# Gahookz history, July to October 2026

Status: 2026-10-07. Built from `git log --format='%h %ad %s' --date=short` (227 commits, first on
2026-07-20) and the documents named in each entry. Commit dates are authors' dates; deploys are
recorded only where a document or commit message says so. Live open work: [backlog](backlog.md).

## Timeline

| Date | What happened | Source |
| --- | --- | --- |
| 2026-07-20 | Initial project (`dd449f2`); "small changes finally online on the laptop" (`bf5d24b`). The laptop hosts the game from the start. | git; [OPS](../OPERATIONS-AND-ROADMAP.md) written in layers from this date |
| 2026-08-10 | Product and technical audit and ADR 0001 (long-term foundation): maintainability, browser build, room authority, persistence. | [audit](product/2026-08-10-product-technical-audit.md), [ADR 0001](architecture/0001-long-term-foundation.md) |
| 2026-08-26 | Production foundations, accounts and new game modes (`178d56b`). | git |
| 2026-09-05 | Room-leak fix, room-state gated on the room password (`845138d`); CI added (`e4ccc5c`). Nginx Proxy Manager signing key exposed to a terminal (key rotation still open). | git; OPS section 10 |
| 2026-09-06 | Server identifies its revision, base image pinned, drain before deploy (`68d2763`); host moderation, legal documents, no Herd self-voting (`815c7e4`); deploy into the correct Compose project (`ede3587`); smoke suite kept off production (`38739be`); backlog re-audited (`81a70d2`). First documented production deploy of these. | git; [SERVER-COMMANDS](../SERVER-COMMANDS.md), OPS sections 3 and 10 |
| 2026-09-08 | Overhaul baseline preserved; P00, one Syncthing-artifact rule and a trustworthy test baseline (`6648afc`). | [IMPLEMENTATION-PLAN](../IMPLEMENTATION-PLAN.md) |
| 2026-09-09 to 09-12 | The P01-P12 overhaul: canonical settings and contracts (P01, P03), Herd anonymity and ties (P02), host rules dialog (P04), shared prompt catalogue (P05), short Herd games (P06), career outbox that survives a database outage (P07), connection heartbeat and backpressure (P08), phase decisions and replay fixtures (P09), reveal as its own feature plus a browser harness (P10), fast start and information pages (P11), real image build (P12 automated half). A public beta site appears (`551e30b`) and comes online as `beta.gahookz.com` on 09-14 (`e31cdc8`). | git; [PLAN-PROGRESS](../PLAN-PROGRESS.md) |
| 2026-09-19 | Release-candidate commit `78a1382` (the main tip until 09-29); compose project name fixed in the deployment (`e3b6dde`). Review repairs, arena, desktop, mobile and hosting verification records. Audit result: every stage except P00 only partial; no deploy authorised by the candidate. | [RELEASE-CANDIDATE](../RELEASE-CANDIDATE.md), [verification records](verification/2026-09-19-review-repairs/README.md) |
| 2026-09-25 | The update begins: areas, agent profiles, worktrees, baseline repair (`da0f01c`); roadmap and growth proposal. First wave of agents stops at usage limits. | [update plan](plans/2026-09-25-update.md), [briefs](plans/2026-09-25-briefs.md) |
| 2026-09-26 | Rooms survive the host leaving, with a grace period and promotion (S1); arena lead-to-win 6 and two-press closing pulls (A1, A2). | `1d02a2a`, `6c852a7` |
| 2026-09-29 | Merges: top bar, tooltips, phone menu sheet (`fee0b26`); lobby setup, number wheel, join screen (`c14abbc`). Integration verified green on Node 24; first push to `main` (`78a1382` to `f80cc75`, CI only). | update plan ledger |
| 2026-09-30 | Work moves to the Store repository. A phone sync deletes a file in the Store working copy; restored. | ledger |
| 2026-10-02 | Production, beta and dev containers moved to run from the Store repository (revision `f15af0b`, rollback images tagged); `/srv/gahookz` becomes a stale clone. Model-per-task policy starts. | ledger, [runbook](operations/runbook.md) |
| 2026-10-03 | Sad Pig, tutorial artwork, new icon (`3c9647f`); generated music, sound effects, finale cheer (`f997566`); third push to `main` (`90a509a`). | ledger |
| 2026-10-04 | Accounts merged: developer sign-in, saved look and Gahooks, account deletion, safer PostgreSQL (`471ef5f`). Documentation wave: area guides (systems, platform, quality, accounts, content, game-flow), eleven core wiki pages, runbook, architecture overview, game wiki pages. Most of the 79 commits that day are docs and ledger updates. | ledger |
| 2026-10-07 | UI shell guide merged (`3bb9bd0`); `CLAUDE.md` deploy commands corrected (`51fa4c6`); agent work moves to the desktop with local worktrees; host-succession tie bug fixed (`30ba1ce`); documentation audit of old plans written ([audit](verification/2026-09-25-update/docs-audit.md)); wave 2 (lobby creation, game UI with the U23 privacy fix, social docs) dispatched. | ledger |

## Notes

- Deploy facts this history can vouch for: the 2026-09-06 drain-and-deploy work, the 2026-09-14 beta site, and the 2026-10-02 container move. Production was also redeployed on or after 2026-09-19: on 2026-09-25 it reported revision `e3b6dde` (2026-09-19 23:20, "Fix compose project name"), though no document records that deploy.
- The old plans (`ARENA-1V1-PLAN.md`, `DESKTOP-UI-PLAN.md`, `MOBILE-UI-PLAN.md`, `HOSTING-PLAN.md`) date from the 2026-09-19 verification cycle; their fate is in the audit linked above.
- TypeScript migration status: [typescript-migration](plans/typescript-migration.md).
