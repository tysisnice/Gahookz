# Accounts and career stats

> A Google sign-in that is entirely optional and only adds career totals and saved custom Gahooks; guests play every game without one.

**Area:** [Accounts](../areas/accounts.md) · **Status:** hidden · **Last reviewed:** 2026-10-04

## What it is

Nobody has to sign in to host, join or finish a game. An account only adds
extras that follow a player between devices: career statistics, saved custom
Gahooks and unlockable slots.

**Right now accounts do nothing on the live site.** Production has no database
and no Google client configured, so sign-in is reported unavailable and the
sign-in panel never appears. The server reports `accountPersistence: "memory"`
and `googleLoginAvailable: false` in `/api/health`. Setting up production
sign-in is a task for Tyson.

When it is configured, signed-out players see "Keep your wins and custom
Gahooks" with a "Continue with Google" link. Signed-in players see a career
profile (name, cloud slot count, twelve statistics) and a Sign out button.
After a game, each signed-in player's result is written to a local journal
first and delivered to the database afterwards, with retries. If that fails,
the game still finishes and that player's status is "unavailable".

Developer sign-in, a saved profile and account deletion are being added on
`agent/accounts`. They are not part of this page yet.

## Rules and numbers

- Twelve statistics: games played, wins, podiums, total score, high score,
  answers submitted, correct answers, popular choices, questions authored, Herd
  votes received, Gahooks sent and Gahooks received. High score is a maximum, the
  rest are sums.
- Sessions last 30 days. The token is stored only as a hash. The cookie is
  HttpOnly and SameSite=Lax.
- Cloud Gahook slots: one by default, up to 12 with the `custom_gahook_slot`
  entitlement. Nothing in the code grants entitlements yet; an operator must.
- The email is kept only when Google says it is verified.
- Career results: 12 delivery attempts, delay doubling from 0.5 seconds to 5
  minutes, then the entry is parked for an operator to replay.
- There is no delete-account route in this branch, and Google is the only provider.

## Where it lives

| Part | Code |
| --- | --- |
| Service, sessions, Google flow, repositories | `standalone/server/accounts.mjs` |
| Career-result journal and retry | `standalone/server/career-outbox.mjs` |
| Stat names and match delta | `packages/accounts/src/index.ts` |
| Schema | `infra/postgres/001_accounts.sql` |
| Routes, join and finish hand-off | `standalone/server.js` |
| Browser panel | `standalone/public/app.jsx` — `AccountPanel`, `CAREER_STATS` |
| Tests | `standalone/server/accounts.test.mjs`, `career-outbox.test.mjs`, `packages/accounts/test/accounts.test.ts` |

## Related

- [Custom Gahooks](custom-gahooks.md)
- [Joining and profiles](joining-and-profiles.md)
- [Accounts area guide](../areas/accounts.md)

## History

- 2026-08-26 — Google sign-in, sessions, career stats and schema added.
- 2026-09-11 — Career results made durable with a local journal (P07).
- 2026-10-04 — Page written; accounts confirmed inert in production.
