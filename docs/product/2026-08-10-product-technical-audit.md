# Gahookz product and technical audit

- Review date: 10 August 2026
- Scope: active game modes, UI and flow, maintainability, security, hosting,
  identity, persistence, monetisation readiness, competitor position, and
  release risk
- Evidence: source inspection, strict checks, browser screenshots, focused
  flow/security tests, and seeded simulation

## Executive verdict

Gahookz now has a coherent three-mode product rather than a collection of
experiments:

1. **Quiz** is the unchanged rules benchmark: factual correctness plus speed,
   up to 1,000 points.
2. **Majority Rulz** keeps the Quiz-shaped interface but makes the crowd's most
   popular choice correct; speed resolves a tied vote and a question author can
   earn 100 points for a unanimous successful prediction.
3. **Herd** makes the group write both prompts and answers, then rewards both
   choosing the favourite response and writing something people vote for.

The game is in a strong state for invited beta sessions. It is **not yet ready
for anonymous mass promotion**. The missing work is no longer basic game logic;
it is abuse operations, real production load and failure testing, accessibility
evidence, legal/privacy workflows, and live verification of Google/PostgreSQL
configuration.

The strongest strategic position is a browser-first bridge between Kahoot's
recognisable shared-screen rhythm and Jackbox's friend-made comedy. Trying to
match education platforms on curriculum libraries, AI generation, LMS
integration, or reporting breadth would dilute that position and consume far
more capital than it creates differentiation.

## What changed

### Modes and game flow

- The retired free-text Herd implementation and its tests, components, styles,
  server logic, and source snapshots are disconnected from production and
  preserved under `standalone/legacy/herd/`.
- The unreleased Oddball fourth-mode experiment is absent from the live client,
  server, contracts, prompts, and styling; recovery notes remain under
  `standalone/legacy/oddball/`.
- The shipped mode contract accepts exactly `quiz`, `majority`, and `herd`.
- Classic Quiz's scoring and factual-answer rules remain the benchmark. Shared
  infrastructure changed around it, but its rules did not.
- Majority Rulz uses party/opinion prompt suggestions, hides the author's
  prediction during voting, chooses the highest vote total, breaks a tied top
  count by fastest choice, applies Quiz's 1,000-point speed curve to voters on
  the winner, and awards the author 100 points only for a unanimous match.
- The new Herd gives every player one prompt to create. Every prompt receives
  `min(4, playerCount)` balanced answer-writing assignments. With five or more
  players an author is not assigned their own prompt; smaller rooms necessarily
  use every player. Per-player workloads differ by at most one.
- Herd's live phase reuses the Quiz reading, voting, reveal, leaderboard, and
  finale structure. A voter on the favourite answer receives up to 500 speed
  points. Every answer author receives `500 × votes / eligible voters`, rounded,
  so writing and judging can contribute up to 1,000 points in one question.
- Top-count ties in Herd use fastest vote, then average speed, then stable answer
  order. This prevents server/order nondeterminism from changing a winner.

### UI, onboarding, and audio

- All three modes use the same visual language and broad host/player flow.
  Mode-specific text explains factual answers, crowd correctness, or authored
  favourites without reskinning the entire game.
- Tutorials use concise three-step explanations, purpose-made diagrammatic art,
  keyboard focus containment, and responsive tabs. Majority and Herd have
  dedicated rules instead of generic generated-sounding prose.
- Low-volume procedural music now follows five useful states: welcome, lobby,
  preparation, live play, and finale. It waits for user interaction, crossfades,
  and respects the existing mute preference.
- Returning from a finale retains a compact previous-game result with winners
  and leading scores. The lobby therefore feels like the same party continuing,
  rather than a hard reset that erases the last result.
- Optional account/stat and cloud-slot UI lives on the welcome screen without
  putting registration in the room-code path.
- Desktop and 390-pixel Firefox screenshots showed a clean welcome layout and
  readable hierarchy. Automated layout checks cover more states, but this is
  not a substitute for full visual and assistive-technology testing on physical
  devices.

## Mode-by-mode product assessment

### Quiz

Quiz remains the safest first game and the reference for pacing. It has the
lowest explanation cost and makes the scoring relationship between knowledge,
speed, reveal, and leaderboard immediately legible. Protecting it from special
case accumulation is the right decision.

The main risk is not its rules; it is creator effort and factual quality. If a
room does not want to write questions, it needs excellent curated material.
Generated factual content should not be trusted without sourcing or review.

### Majority Rulz

This is the best low-friction social spin-off. It reuses knowledge players
already gained in Quiz, opinion questions are quick to write, and the author's
hidden prediction creates a second private objective without distracting from
the vote.

Risks:

- weak prompts produce an obvious answer instead of debate;
- three- and four-player rooms generate many vote ties, so the speed explanation
  must remain visible;
- unanimity bonuses will be rare in large rooms and should feel like a surprise,
  not an expected source of score;
- authors may optimise for predictable consensus instead of funny disagreement.

The best prompt library should mix “read the room” choices with specific party
scenarios, then rate packs from real completion and laughter data rather than
adding thousands of uncurated prompts.

### Herd

Herd has the greatest differentiation and the strongest chance of producing
memorable group-specific moments. It also has the highest pacing risk.

At eight players, everyone writes roughly four answers and the game presents
eight authored questions, which is a strong party-length shape. At twenty
players, the writing work is still bounded at roughly four answers per person,
but a full twenty-question live phase can become long. The host should eventually
be able to choose or automatically cap the number of prompts used while keeping
assignment fairness. A likely social sweet spot is five to ten players; this
needs observed playtesting, not assumption.

At three players, every prompt receives three answers and each person must write
for every prompt, including their own. The rules remain valid, but anonymity is
thin and the work is repetitive. The UI should honestly label three as playable,
not ideal.

Herd's two-part score is fair and expressive: voters cannot earn more than 500,
and answer authors gain points from every vote rather than only first place.
Reveal design must keep those two sources obvious or players will experience
score changes as arbitrary.

## Architecture and maintainability

The long-term direction is recorded in
`docs/architecture/0001-long-term-foundation.md`.

Implemented foundation:

- npm workspaces for `contracts`, `game-engine`, and `accounts`;
- pinned TypeScript/build versions and strict project configurations;
- runtime schemas at contract boundaries;
- a pure, tested Herd assignment/scoring engine;
- separated admission, account, presentation, media, transport, and Majority
  helpers;
- deterministic unit and large seeded simulation coverage;
- production/development container stages that install from the lockfile.

The chosen migration is incremental TypeScript, not a rewrite. That is still
the correct trade: it preserves a working game while moving pure rules and
network contracts first. A framework change does not create good boundaries by
itself.

Native CSS also remains the right choice. Replacing the established identity
with Tailwind or a component skin would create a broad regression surface
without solving ownership or cascade structure. The target is design tokens,
cascade layers, feature-owned styles, and CSS modules as components are
extracted.

Hard maintainability truth: the primary client is still 5,227 lines, the
server 4,467 lines, and the global stylesheet 10,805 lines. Strict checks now
surround them, but they are still monoliths. The browser build is still custom,
not Vite. The next engineering milestone should extract one vertical slice at a
time—starting with account/welcome, room transport, and mode builders—rather
than announce a completed TypeScript migration that has not happened.

## Authority, hosting, and scale

The host browser should **not** become the room server. WebRTC would still need
signalling and often TURN relay, exposes peer network information, and makes a
closed, backgrounded, or suspended host device fatal. More importantly, it
would put score, bans, career attribution, and future purchases under client
control. Those costs are a poor trade for Gahookz's small command/snapshot
traffic.

The implemented model keeps one Node worker authoritative for a room. Clients
send bounded commands and receive sanitised snapshots. Nginx consistently
hashes the non-secret room code so several workers can host different rooms;
responses expose an instance identifier to diagnose bad affinity.

Current safeguards include:

- maximum 20 players and 32 active rooms per process;
- per-address, actor, room-creation, stream-ticket, and SSE admission limits;
- byte-bounded JSON and correct 4xx responses;
- `scrypt` room-password hashing and constant-time comparison;
- same-origin mutation/stream checks and standard CSP, HSTS, MIME, frame,
  referrer, and permissions headers;
- no room credentials in URLs;
- opaque two-hour, scoped, single-use SSE tickets;
- liveness, readiness, instance identity, and bearer-protected aggregate
  metrics.

Hard scale truth: consistent hashing is not shared room state. A worker restart
still ends its active rooms, OAuth flow state is process-local, and there is no
live room migration or failover. Before a mass launch, measure the real SSE and
media workload, implement draining, test worker loss and regional failure, and
then add a coordinator or move the pure engine to a single-room primitive such
as Durable Objects. The detailed runbook is
`docs/operations/production-readiness.md`.

## Accounts, statistics, and purchases

Guest play stays the default. Google OpenID Connect is optional and uses the
server authorization-code flow with PKCE, state, nonce, a browser-binding
cookie, signature/issuer/audience/time validation, and an opaque server-side
session cookie. The client cannot assert an account ID or entitlement.

PostgreSQL persists identities, hashed sessions, idempotent match results,
entitlements, cloud custom-Gahook slots, and twelve career statistics:

- games played, wins, podiums, total score, and high score;
- answers submitted, correct Quiz answers, and popular Majority choices;
- questions authored and Herd votes received;
- Gahooks sent and received.

Every account has one cloud custom-Gahook slot. Verified
`custom_gahook_slot` entitlement quantities can expand the allowance to twelve.
That is purchase-ready storage and enforcement, not a payment implementation.
A future App Store, Play, Steam, Stripe, or other webhook must verify the
transaction server-side before granting anything.

Google login and the PostgreSQL adapter still need a staging test with real
provider credentials, registered redirect URIs, TLS, migrations, backup, and
restore. Public deployments should set `GAHOOKZ_REQUIRE_POSTGRES=1` so account
data cannot silently fall back to memory.

## Competitor evidence and implications

| Product | Current first-party evidence | Lesson for Gahookz |
| --- | --- | --- |
| Kahoot | Its classic flow uses a shared screen, game PIN, phone controls, per-question leaderboards, and a final winner. Current one-event business tiers sell roughly 200 to 5,000 participants plus presentation, reporting, branding, and onboarding features. | Preserve the clear room rhythm and state music. Monetise host scale and professional controls later, but do not inherit the plan complexity before demand exists. |
| Wayground | Starter/individual plans support up to 100 participants; school/district plans reach 1,000 and sell premium content, question types, analytics, LMS integration, administration, and accommodations. | This is an institutional learning platform. Gahookz should not spend its early roadmap competing on curriculum libraries or LMS breadth. |
| Blooket | Essential creation and games are free up to 60 players; Plus reaches 300 and adds modes, reports, organisation, question-bank, curriculum, audio, and longer assignments. | A generous free loop can drive adoption. Paid value belongs in host capacity, organisation, reporting, and content tools—not stronger players. |
| Jackbox / Quiplash | One owner runs the game, everyone else joins with a room code and uses a phone browser; Quiplash asks players to write answers and lets the group or a large audience vote. | This is the closest party benchmark. Keep guest participation instant and make group-authored moments the reason to return. Gahookz can differentiate through browser-first hosting, Quiz plus social modes, persistent expression, and no required party-pack install. |

Sources:

- Kahoot classic flow: <https://kahoot.com/blog/2019/03/04/how-to-get-started-with-kahoot/>
- Kahoot one-event plans: <https://kahoot.com/register/pricing-events/>
- Wayground plan comparison: <https://help.wayground.com/support/solutions/articles/158000403874-understanding-wayground-plans>
- Blooket Plus features: <https://help.blooket.com/hc/en-us/articles/16376933513879-Blooket-Plus-Features>
- Jackbox participation model: <https://www.jackboxgames.com/how-to-play>
- Quiplash rules and audience: <https://www.jackboxgames.com/games/quiplash>

## Recommended monetisation

1. Keep joining, ordinary hosting, and all three rulesets free. The room needs
   enough participants to be fun, so a player paywall taxes the product's own
   network effect.
2. Sell expression directly: extra cloud custom-Gahook slots, curated character
   or reaction packs, profile cosmetics, and host presentation themes.
3. After measured demand, sell host tiers for larger rooms, downloadable
   reports, brand controls, advanced moderation, and organisation libraries.
4. Offer curated workplace, education, family, and seasonal prompt packs, but
   keep enough excellent free material to demonstrate the product.
5. Consider a one-time Steam host edition with a useful included cosmetic
   allowance. Keep web/mobile players compatible with the same rooms.
6. Never sell score boosts, stronger sabotage, host priority, energy, random
   paid rewards, or interrupt a live game with full-screen ads.

## Release gates and hard truths

P0 before open anonymous acquisition:

- automated text/image/audio safety appropriate to the product's age position;
- in-product reporting, operator review, evidence/appeal policy, and abuse
  response ownership;
- privacy, terms, community rules, copyright/takedown, retention, export, and
  deletion workflows;
- real PostgreSQL/Google staging verification plus backup and restore rehearsal;
- central redacted logs, alerts, deploy drains, immutable rollback, and failure
  drills;
- production-proxy load tests for concurrent rooms, 20-player rooms, reconnects,
  media caps, and admission rejection behaviour.

P1 before claiming a polished cross-device release:

- uncoached playtests at 3, 4, 8, 12, and 20 players in every mode;
- current Chrome, Firefox, Safari, representative iOS/Android, slow-network,
  background/resume, and install/update tests;
- keyboard, screen-reader, reduced-motion, colour-independent status, captions,
  and touch-target audits;
- consent-aware product instrumentation for join, creation, round, reconnect,
  and return funnels;
- a configurable Herd question cap or session-length control, based on observed
  pacing at large room sizes.

The product should not claim “mass-scale ready” until those gates have evidence.
It can honestly claim a hardened invited-beta foundation with deterministic
rules, optional durable identity, and a credible path to sharded authority.

## Verification performed

- `npm run check`: strict TypeScript projects, unit tests, and production build.
- `npm test`: security, all three mode flows/scoring, room presets, onboarding,
  Gahooks, roles, layout, finales, party view, regressions, PWA, information,
  social/media creation, prompts, and deployment smokes.
- Seeded simulation: 15,000 games total.
  - Quiz: 5,000 games, 42,157 rounds, 521,703 answers.
  - Majority Rulz: 5,000 games, 42,157 rounds, 521,703 choices, 10,506 tied
    top counts.
  - Herd: 5,000 games, 52,424 rounds, 715,918 votes, 207,157 authored answers,
    12,368 tied top counts.
- Simulation invariants include all score caps, top-count winners, unanimous
  Majority bonuses, exact and balanced Herd assignments, no self-assignment in
  rooms of five or more, and authored-vote reconciliation.

This evidence validates deterministic software behaviour. It does not validate
human fun, production capacity, moderation effectiveness, accessibility, or
retention; those require people, devices, and production-like infrastructure.
