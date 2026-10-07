# TypeScript migration plan and status

Status: 2026-10-07, checked against `tsconfig.*.json`, `package.json` and the file tree of
branch `agent/docs-backlog`. The plan is section 12 of
[OPERATIONS-AND-ROADMAP.md](../../OPERATIONS-AND-ROADMAP.md) (TS-00 to TS-18); this page adds the current
status. Backlog link: [backlog](../backlog.md).

## Where things stand

- Typechecking is real and gated: `npm run typecheck` runs `tsc -p tsconfig.contracts.json`, then `tsconfig.server.json`, then `tsconfig.web.json`; `npm run check` is typecheck, unit tests, build; CI runs it ("Typecheck, unit tests, build").
- `tsconfig.base.json` is strict and stricter than the plan asked: `strict`, `noEmit`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly`. Production runs `.ts` directly on Node 24 type stripping, with no `tsx` (tsx is for dev and tests only).
- Converted: all of `packages/` (`accounts`, `content`, `contracts`, `game-engine`) is `.ts`, with unit tests; in the browser only `back-stack.ts`, `net.ts`, `music.ts`, `music-composer.ts`, `globals.d.ts` and their tests.
- Not converted: `standalone/server.js` (5,612 lines), every file in `standalone/server/` (`*.mjs`: transport, auth, media, social, scoring, gameplay, room, arena, accounts and more), `standalone/public/app.jsx` (5,496 lines) and the other client `.jsx`/`.js` files. `tsconfig.server.json` includes `standalone/server/**/*.ts`, which matches nothing yet; `tsconfig.web.json` covers only `.ts`/`.tsx`, so no `.jsx` file is typechecked.
- The final workspace layout (`apps/*`, `packages/client-data`, `packages/ui`) was not started. `package.json` has `workspaces: ["packages/*"]`; `pnpm-workspace.yaml` is a stray file (the project uses npm; its `esbuild` entry is unresolved).

## Task status

| ID | Task | Status | Evidence |
| --- | --- | --- | --- |
| TS-00 | Baseline and test commands | done | `npm run check`, `npm test`, `test:disposable`; see [runbook](../operations/runbook.md) |
| TS-01 | TypeScript, strict configs, `typecheck` | done | `typescript` 7.0.2 pinned; four `tsconfig*.json`; `typecheck` script |
| TS-02 | npm workspaces skeleton | done | `workspaces: ["packages/*"]` |
| TS-03 | Shared enums, IDs, base DTOs | done | `packages/contracts/src/{identifiers,game,settings,host-settings}.ts` |
| TS-04 | Runtime schemas for health, errors, envelope, snapshot | partial | `packages/contracts/src/schemas.ts` with fixture tests; the server does not yet parse every request or snapshot at the boundary |
| TS-05 | Convert scoring and Herd ranking | partial | Herd is `packages/game-engine/src/herd.ts`; `standalone/server/scoring.mjs` and `majority.mjs` are still `.mjs` |
| TS-06 | Convert room, gameplay, presentation helpers | not started | `room.mjs`, `gameplay.mjs`, `presentation.mjs` are `.mjs` |
| TS-07 | Typed transport and response helpers | not started | `transport.mjs` is `.mjs` (it has unit tests) |
| TS-08 | Convert auth, media, social, custom-Gahook | not started | all `.mjs`; `accounts.mjs` wraps `packages/accounts` |
| TS-09 | Typed client API and SSE adapter | partial | `client/net.ts` (tested); no `client-data` package; `app.jsx` still calls the loosely typed helper |
| TS-10 | Convert small client leaves | partial | `back-stack.ts`, `music.ts`, `music-composer.ts` done; `preferences`, `qr`, `gahook-forms`, `presentation`, `drawing`, `tutorial` still `.jsx`/`.js` |
| TS-11 | Extract typed Redux store from `app.jsx` | not started | store still inside `app.jsx` |
| TS-12 | Split UI by feature | partial | many components moved to `client/*.jsx` (account, arena, reveal, social, legal and others); `app.jsx` is still 5.5k lines and not by feature folders |
| TS-13 | Typed route table from `server.js` | not started | `server.js` still has the `if (pathname === ...)` chain; `server/route-policy.mjs` holds policy only |
| TS-14 | Extract room lifecycle and phase engine | partial | `packages/game-engine/src/phases.ts` exists and is tested, but the live machine does not use `nextPhase`, `resumeDeadline` or `estimatedDurationMs` ([game-flow](../areas/game-flow.md)); `server/phase-controls.mjs` is a small extraction |
| TS-15 | Rename client source to `.tsx` | not started | |
| TS-16 | Server entry to `.ts`, built output | not started | Docker runs `node standalone/server.js` |
| TS-17 | Final workspace layout | not started | |
| TS-18 | Enforce CI and quality budgets | partial | CI runs typecheck, unit tests, build, smoke and image jobs; no strict-quality budget or suppression check |

## Differences from the plan

- The plan assumed compiled server output; the project instead runs `.ts` sources directly on Node 24 (`erasableSyntaxOnly` keeps that valid).
- Several `.mjs` modules have `.test.mjs` tests but no types, so TS-06 to TS-08 start from tested JavaScript.
- The next step by the plan's dependencies is TS-04 (finish boundary parsing), then TS-05 to TS-08 server leaves.
