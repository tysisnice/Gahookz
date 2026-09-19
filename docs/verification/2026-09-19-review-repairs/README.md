# Review repairs — fresh verification, 2026-09-19

This evidence is from the resumed local review run. Working directory:
`/mnt/storage/syncthing/codex/2026-07-01/Gahookz`. Branch:
`overhaul/quiz-herd-p00-p12`; HEAD
`e31cdc88989a78d7e1dabb468f589f46f18546b2` **plus uncommitted changes**.
Node `v24.13.1`, npm `11.8.0`; browser build
`release-4a97d7b7c3b5edca`. [Source SHA-256 manifest](source-sha256.txt)
records the changed/new executable/configuration files. It does not substitute
for a candidate commit and immutable image ID.

All server suites ran sequentially on owned disposable 127.0.0.1:3199
lifetimes with synthetic data, temporary journals and no database/OAuth
credentials. No production/beta/public-domain requests or real container
mutations were performed. `/Vault` was read-only. The runner logs each owned
server's shutdown; final listener inspection found no 3199 listener. The
stalled first Chromium instance was closed through its own isolated browser
connection; the test exited and its wrapper stopped the corresponding server.

## Exact test commands and results

All redirections below are relative to this directory's repository root:

```bash
npm run check > docs/verification/2026-09-19-review-repairs/check.txt 2>&1
npm test > docs/verification/2026-09-19-review-repairs/smoke.txt 2>&1
npm run test:disposable -- npm run standalone:smoke:review-repairs > docs/verification/2026-09-19-review-repairs/review-repairs-first.txt 2>&1
npm run test:disposable -- npm run standalone:smoke:review-repairs > docs/verification/2026-09-19-review-repairs/review-repairs.txt 2>&1
npm run test:disposable -- npm run test:browser > docs/verification/2026-09-19-review-repairs/browser.txt 2>&1
npm run test:disposable -- npm run test:browser > docs/verification/2026-09-19-review-repairs/browser-final.txt 2>&1
npm run test:disposable -- npm run test:rooms > docs/verification/2026-09-19-review-repairs/rooms.txt 2>&1
npm test > docs/verification/2026-09-19-review-repairs/smoke-final.txt 2>&1
npm run test:disposable -- npm run test:browser > docs/verification/2026-09-19-review-repairs/browser-retry.txt 2>&1
```

| Output | Exit | Actual result |
| --- | --- | --- |
| [check.txt](check.txt) | 0 | `tests 177`, `pass 177`, `fail 0`; typecheck and build completed |
| [smoke.txt](smoke.txt) | 1 | Earlier suite scripts passed; new Classic scoring assertion failed at line 55 |
| [review-repairs-first.txt](review-repairs-first.txt) | 1 | Reproduced the same assertion in a fresh lifetime |
| [review-repairs.txt](review-repairs.txt) | 0 | All three repair summaries passed after locating the retained fixture among shuffled rounds |
| [browser.txt](browser.txt) | 1 | Stalled during new rules-modal interaction; the first-use tutorial was still open. Owned browser closed, yielding TargetCloseError; not a pass |
| [browser-final.txt](browser-final.txt) | 1 | Modal checks passed, then failed `educational draft selects verified key`; assertion returned a DOM node through Puppeteer |
| [rooms.txt](rooms.txt) | 0 | `ok: true`, `games: 12`, all modes at 4/8/12/20 players |
| [smoke-final.txt](smoke-final.txt) | 0 | 15,000 seeded games plus 24 smoke scripts, including all three repair summaries |
| [browser-retry.txt](browser-retry.txt) | 0 | After tutorial handling/foregrounding and boolean assertion correction: `ok: true`, `checks: 18` |

The word “final” in a retained log filename does not override its recorded
exit/result above. Failed attempts are retained deliberately.

Actual check summary:

```text
ℹ tests 177
ℹ suites 0
ℹ pass 177
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 14990.781823
Built standalone browser modules for release-4a97d7b7c3b5edca
```

Final smoke repair output:

```text
Review repairs HTTP: authorization, all timed pause/resume phases, both scoring directions, missing Classic key, and edit passed.
Review repairs HTTP: pause/resume while waiting for player progress passed.
Review repairs HTTP: live contracts, atomic rejection, aliases, draft ownership, factual metadata, and banned actor passed.
```

The Classic fixture had assumed that its retained question was first after
force-start. Force-start fills the played author's empty slot and shuffles the
rounds. The test now finds the retained authored text, asserts its presence,
and answers its original key. No scoring formula was changed to make it pass.
The browser harness now dismisses the first-use tutorial before accessing the
rules, foregrounds the keyboard target, and serializes the key-presence check
as a boolean. No runtime browser source changed during those harness retries.

Syntax checks were executed by a Python loop invoking `node --check` for each
path below with `check=True`; [syntax.txt](syntax.txt) lists their actual PASS
lines. All exited 0:

```bash
node --check standalone/server.js
node --check standalone/server/content-inventory.mjs
node --check standalone/server/content-inventory.test.mjs
node --check standalone/server/sse-backpressure.mjs
node --check standalone/server/sse-backpressure.test.mjs
node --check standalone/smoke-review-repairs.mjs
node --check standalone/test-disposable.mjs
node --check standalone/verify-journal-volume.mjs
node --check standalone/verify-postgres-outbox.mjs
```

## What those passes prove

- Current unit/build checks include network retry/order handling, timed
  PassThrough backpressure/drain cleanup, hidden-avatar/parked-image pruning,
  torn-tail append across another restart, exhausted-byte limits,
  acknowledgement/exhaustion I/O failure and fsync ordering.
- The targeted HTTP suite exercises authorization, actual pause/resume phases
  including progress waiting, scoring in both directions, missing-key refusal
  and edit, real health/settings contracts, atomic invalid settings and
  owned-versus-forged factual metadata.
- Room games report Herd rounds 4/8/8/8 and workload spreads 0/0/1/1 at
  4/8/12/20 players. They use accelerated phase progression.
- Chromium records zero recovery polls during 32 quiet seconds, stale/fresh
  rules saves, Shift+Tab containment and Escape focus restoration, an
  educational suggestion, real Classic answer points, reveal and a nonzero
  finale. Its 18 checks cover a representative flow, not the full plan matrix.

## Failed or unverified integration gates

The interrupted September 18 command was:

```bash
node --import tsx standalone/verify-postgres-outbox.mjs > docs/verification/2026-09-18-review-repairs/postgres.log 2>&1
```

It failed with an unhandled Pool error. Sanitized excerpt:

```text
error: terminating connection due to administrator command
code: '57P01'
```

No migration/transaction success marker was reached. Catching PostgreSQL's
temporary initialization server with `pg_isready` is a suspected readiness
race, not a proven diagnosis. Idle Pool errors and failed-initialization
cleanup also need review. The user independently confirmed the disposable
container and volumes were already removed; this resumption neither recreated
nor cleaned them again. The old raw diagnostic is ignored and is not included
as a shareable artifact because it dumps a large connection object.

`standalone/verify-journal-volume.mjs` has only been syntax-checked, not run.
An image build was started in the interrupted run, but no current-tree
build/start/browser/volume result or immutable digest is verified here.
`drill:resilience` was not rerun and its historical shallow checks are not
substitutes for real socket, database, load or rollback proof.

Compose's new prod image default does not match the deploy script's
`gahookz:local` verification. This known integration regression must be fixed
before operational use; static `smoke-deployment.mjs` passing does not detect
or excuse it.

Account-enabled application status, complete phase/role/privacy and media
policy, stable option-ID edits, carryover rotation, typed server/UI extraction,
party-sized load/RSS/p95/reconnect storms, current immutable image/volume,
isolated drain/rollback, physical devices, screen reader and human/content
sessions remain pending. See [plan progress](../../../PLAN-PROGRESS.md) and
[release readiness](../../../RELEASE-CANDIDATE.md).

## Final audit

[final-audit.txt](final-audit.txt) records exit 0 for `git diff --check`,
`node --check standalone/browser-flow.mjs`,
`node --check standalone/smoke-review-repairs.mjs`,
`sha256sum --check docs/verification/2026-09-19-review-repairs/source-sha256.txt`,
and `ss -ltnp 'sport = :3199'`. All 29 source manifest entries matched and the
listener output contained only its header. Local links from the new progress,
release and evidence documents resolved. This was document/source-identity and
cleanup verification; it did not exercise production or additional release gates.
