# Release candidate — Quiz/Herd overhaul (P00–P12)

**Status: ready for an explicitly requested deployment. Not deployed, and this
document does not authorise one.**

Branch: `overhaul/quiz-herd-p00-p12`
Base: `81a70d2` (the review base the implementation plan names)
Previous recoverable image: `gahookz:local`

---

## What changed, in one line each

| Stage | Change |
| --- | --- |
| P00 | One shared Syncthing-artifact rule; 15 conflict copies reconciled and archived |
| P01 | Canonical `gameFamily`/`quizScoring`; typed browser network adapter; fixture corpus |
| P02 | Herd answer colours no longer identify their authors; tie reasons are truthful |
| P03 | Two-game selector with Majority as a scoring toggle; saved question bank; locked rules |
| P04 | Host Lobby rules dialog; server-enforced Gahook effects and arena policy |
| P05 | One shared prompt catalogue, 40 new prompts, safe `{Player1}` substitution |
| P06 | Herd is short: 20 players play 8 rounds, not 20; writing load spread ≤ 1 |
| P07 | Career results survive a database outage via a durable journal |
| P08 | Idle recovery polling removed; SSE backpressure; asset revalidation |
| P09 | Phase progression as a pure decision; authorisation stated as data |
| P10 | Reveal extracted as a feature; scoring explained honestly; browser harness |
| P11 | Fast start that keeps player work; the arena is findable; public page is for players |
| P12 | This document, plus the defects below |

---

## Defects this candidate fixes that players would have felt

- **Herd answers were identifiable.** An answer's colour came from its writer's
  position in a fixed rotation, so one reveal taught the pattern and every later
  question was solvable by hand — in the mode whose whole appeal is not knowing.
- **Ties lied.** Any tie with a winner was announced as decided by speed, even
  when the stable answer order decided it.
- **Herd was not short.** "Quick" played one round per player with no ceiling.
- **Career stats could vanish.** `statsRecorded` was set before the write, which
  was fire-and-forget with a `.catch` that only logged.
- **Every tab polled the whole room state 33 times a minute** whether or not the
  live stream was healthy — 733 requests a minute in a 20-player room.
- **A stalled reader grew server memory** for as long as it stayed connected.
- **Static assets were never cacheable**, so the whole client re-downloaded on
  every load.
- **Funny Classic suggestions invented a correct answer** for opinion prompts.
- **Disabling custom profiles destroyed uploads** rather than hiding them.
- **A fast start binned pending player questions.**
- **A completed game could be reopened** at question zero by a duplicated advance.

## Defects found by building a real image, in this stage

Both were introduced earlier in the branch and passed every other check.

1. **The production image could not be built.** `build-client.mjs` imports the
   shared artifact rule added in P00, which the Dockerfile never copied.
2. **The production image could not start.** `packages/content` used TypeScript
   parameter properties, which Node's type stripping rejects with
   `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. Development runs under `tsx` and never
   saw it. `erasableSyntaxOnly` now catches this at typecheck.

Also: 18 of our own test files were shipping inside the production image. Now
zero, and `smoke-deployment.mjs` fails if any of the three regress.

---

## Test evidence

All run against the candidate at `d0a7f5b`, each suite on its own fresh
disposable server on port 3199. Production and development were never targeted.

| Gate | Result |
| --- | --- |
| `npm run check` | 167 unit tests, typecheck, build — pass |
| `npm test` | 24 smoke scripts — pass |
| `npm run test:rooms` | 12 complete games at 4/8/12/20 players — pass |
| `npm run test:browser` | 16 checks, three browser contexts — pass |
| `npm run drill:resilience` | 4 failure drills — pass |
| `docker build --target production` | builds, starts, healthy |
| Browser flow **against the built image** | 16/16 pass |

Image hygiene: 0 conflict artifacts, 0 of our test files, no Puppeteer, no
TypeScript. `esbuild` is present as a transitive dependency of `tsx`, which is a
runtime dependency. Image size 262MB.

---

## Deployment needs

- **A persistent volume for the career journal.** It defaults to
  `standalone/.data/` inside the container. Without a volume, results survive a
  database outage but not a container replace. Set `GAHOOKZ_CAREER_JOURNAL` to a
  mounted path.
- **No schema migration is required.** `recordMatch` was already idempotent in
  both repositories, so no new table or column was needed.
- **No environment variable is required to change.** New room settings default
  to existing behaviour: Gahook effects default to `chaos`, lobby duels to on.

## Rollback

```bash
cd /srv/gahookz
docker compose ps                      # note the running image id
docker image inspect gahookz:local     # the previous recoverable image
GAHOOKZ_DRAIN_WAIT_SECONDS=300 bash scripts/docker-deploy.sh
```

The deploy script refuses to continue if the production port belongs to a
Compose project it does not own, stamps the revision into the image, and fails
if the running container reports a different one. A restart still ends every
room in progress, which is why the drain window exists.

**Rollback was not rehearsed against a real deployment.** The image was built,
started and exercised on a throwaway port; replacing a running production
container and putting the previous one back was not performed, because doing so
on this host would interrupt the live service.

---

## Open risks and what is NOT verified

These are the gates P12 names that a machine cannot pass. None is a reason the
candidate is unsound; each is a reason not to call it proven.

- **No human has played it.** No observed sessions at 4, 8, 12 or 20 players.
  Whether eight Herd rounds feels right, whether the new prompts land, and
  whether the reveal now reads clearly are all unanswered.
- **No physical device.** iOS Safari and Android Chrome untested. The 320px
  layout is verified in headless Chromium only.
- **No screen reader.** The accessibility work — focus order, Tab trapping,
  `aria-modal`, 44px targets, reduced motion — is structural and reasoned about,
  never heard.
- **No real PostgreSQL.** The career outbox ran only against the in-memory
  repository, because `accountPersistence` is `memory` on this host. Outage
  injection against a real database, and the journal on a real volume, are
  untested.
- **No load test.** P08's instrumented baseline was not built, so "no p95
  regression" is unverified, as is behaviour under a reconnect storm against the
  32-stream per-address cap.
- **The 40 new prompts have not been read aloud** with real player names, or
  checked on a small phone. That is Appendix B's own content-acceptance gate.
- **Rollback not rehearsed**, as above.

---

## Recommended order before any deploy

1. Play a full game on dev with three or four people. Herd on Quick, then Quiz
   with Majority on. This answers more than any remaining automated work.
2. Open the Lobby rules dialog on a phone; check the toggles are comfortable and
   the dialog scrolls.
3. If accounts matter, stand up a disposable PostgreSQL and run the career
   outbox against it, including stopping the database mid-game.
4. Decide the authored-point denominator question recorded in
   `docs/architecture/0003-scoring-alternatives.md`.
5. Then, and only then, request a deploy.
