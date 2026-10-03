# Accounts — area guide

Verified 2026-10-04 against commit `27da7b6` on branch `agent/docs-core`. This
guide describes the accounts code **on this branch**. The developer sign-in,
saved profile and account-deletion work is landing from `agent/accounts` and
is not described here; the orchestrator will update this guide when it merges.

## Purpose

Accounts is the optional identity layer: Google sign-in, sessions, the career
profile, custom-Gahook cloud slots, entitlements, the durable career-result
outbox and the PostgreSQL schema. It exists only for cosmetic and progression
extras. **Guest play never requires an account** (rule 1 in `CLAUDE.md`): the
join path never reads an account, and a server with no accounts configured plays
exactly the same.

**Production status: accounts are inert.** No database and no Google OAuth client
are configured, so the server uses the in-memory repository, Google sign-in is
reported unavailable, and `/api/health` reports `accountPersistence: "memory"`
and `googleLoginAvailable: false`. Provisioning production (OAuth client,
database) is Tyson's operation.

## What players see

- Nothing, when sign-in is unavailable. `AccountPanel` renders nothing unless the
  server says `googleAvailable`, so it never advertises career stats that would
  not survive a restart.
- When available, signed-out players see "Keep your wins and custom Gahooks" and
  a "Continue with Google" link, with the line "Guest play stays instant."
- Signed-in players see a career profile (name, cloud Gahook slot count, twelve
  statistics) and a Sign out button.
- After a game, a signed-in player's result is accepted by the outbox and the
  snapshot carries `careerResultStatus` for them; the room never claims a result
  was recorded when it was not.
- A signed-in player joining a room gets their saved slot-0 custom Gahook
  restored. Custom Gahooks they build are saved to their account when a slot is
  unlocked.

## Code map

| Piece | Where |
| --- | --- |
| Account service, cookies, Google OAuth, memory and PostgreSQL repositories | `standalone/server/accounts.mjs` |
| Durable career-result outbox (journal, retry, compaction) | `standalone/server/career-outbox.mjs` |
| Career stat keys, bounds and match delta | `packages/accounts/src/index.ts` |
| Schema | `infra/postgres/001_accounts.sql` |
| Routes: `GET /api/account`, `POST /api/account/logout`, `GET /auth/google/start`, `GET /auth/google/callback` | `standalone/server.js` request handler |
| Use in rooms: join, custom-Gahook save, result hand-off, `accountLinked`, `careerResultStatus` | `standalone/server.js` (`joinPlayer`, custom-Gahook routes, the finish path that calls `careerOutbox.accept`) |
| Browser panel and stat labels | `standalone/public/app.jsx`: `AccountPanel`, `CAREER_STATS`, `accountLoginHref` |
| Docker checks | `standalone/verify-postgres-outbox.mjs`, `standalone/verify-journal-volume.mjs` |

`AccountPanel` is mounted in `HostLobby`, `JoinScreen` and `PlayerWaitingLobby`.

## How it works

### Service and repositories

`createAccountService` reads `DATABASE_URL` (Compose maps `GAHOOKZ_DATABASE_URL`
to it), `GAHOOKZ_PUBLIC_ORIGIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GAHOOKZ_DATABASE_SSL` and `GAHOOKZ_AUTO_MIGRATE`. With a database URL it opens a
PostgreSQL repository and runs `001_accounts.sql` unless auto-migrate is `0`; if
that fails it throws in production and falls back to the memory repository
elsewhere. `GAHOOKZ_REQUIRE_POSTGRES=1` makes the server refuse to start unless
persistence is `postgres`. Without a database it uses the memory repository,
which is ephemeral.

`googleAvailable` is true only when the public origin (HTTPS, or loopback HTTP),
client id and client secret are all set **and** persistence is PostgreSQL or the
environment is not production. So a production server with Google credentials
but no database still reports sign-in unavailable.

### Sign-in and sessions

`/auth/google/start` calls `beginGoogleLogin`: random `state`, `nonce`, PKCE
verifier (S256) and a browser-binding cookie; the flow lives in memory for ten
minutes (at most 2,000 flows). `/auth/google/callback` calls `finishGoogleLogin`,
which checks the state and binding cookie, exchanges the code, verifies the ID
token (RS256 signature against Google's published keys, issuer, audience, expiry, nonce) and builds a profile: opaque `sub`, display name
(max 80), the email **only if Google marks it verified**, and an HTTPS avatar
URL. `upsertIdentity` creates or finds the account. A session token (32 random
bytes) is hashed with SHA-256 before storage and lasts 30 days. The cookie is
HttpOnly, SameSite=Lax, and named `__Host-gahookz_session` over HTTPS. Sessions
are cached for 60 s. `returnTo` is reduced to a same-origin path, and the browser
comes back with `?account=connected` or `?account=error`. Failed callbacks
increment `login_failures` in `/api/metrics`.

### What is stored

| Table | Holds |
| --- | --- |
| `accounts` | id, display name, email (empty unless verified), avatar URL |
| `account_identities` | (provider, subject) to account |
| `account_sessions` | SHA-256 token hash, expiry |
| `career_stats` | the twelve counters |
| `account_entitlements` | key, quantity, source, expiry |
| `account_custom_gahooks` | slot 0-11 and the configuration JSON |
| `account_match_results` | one row per (match, account), with the stat delta |

The twelve stats are `gamesPlayed`, `wins`, `podiums`, `totalScore`, `highScore`,
`answersSubmitted`, `correctAnswers`, `popularChoices`, `questionsAuthored`,
`herdVotesReceived`, `gahooksSent`, `gahooksReceived`. All are bounded
non-negative integers; `highScore` is a maximum, the rest are sums.
`matchCareerDelta` turns a placement into games, wins and podiums.

Cloud Gahook slots: one by default, plus the `custom_gahook_slot` entitlement
quantity, up to 12. No code path on this branch grants entitlements; a row has to
be inserted by an operator. There is no delete-account route on this branch.

### The career outbox

When a game finishes, each signed-in player's result goes to
`careerOutbox.accept`, which appends it to a local journal and fsyncs it before
acknowledging. Delivery to PostgreSQL (`recordMatch`) happens afterwards and is
retried with backoff (12 attempts, a 0.5 s delay that doubles up to 5 min, then the entry is
parked as exhausted and can be replayed by an operator). `recordMatch` is
idempotent on (match, account), so redelivery after a restart cannot double
count. The queue is bounded to 4 MiB pending. If acceptance fails the player's
status is `unavailable` and the game still finishes. The journal lives at
`GAHOOKZ_CAREER_JOURNAL`; in production Compose that is `/app/data/career.journal`
on the `career-data` volume. The outbox cannot survive loss of that volume.
Status appears under `careerResults` in `/api/health`.

## Invariants

- No sign-in in the join path; no feature may gate creating, joining or finishing
  a game on an account.
- Identity comes from the server session cookie, never from the request body.
- Store the minimum: opaque subject, display name, stats, entitlements, saved
  Gahooks, and the verified email Google supplies.
- Session tokens are stored only as hashes; cookies are HttpOnly.
- Every write that matters to a player is idempotent and survives a restart.
- No real credentials in the repository, tests or logs. Tests use the memory
  repository or a disposable database you start and remove yourself.

## Tests

```bash
PATH=/usr/bin:$PATH flock /tmp/gahookz-verify.lock npm run check
PATH=/usr/bin:$PATH flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run drill:resilience
PATH=/usr/bin:$PATH flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run standalone:smoke:security
```

`check` runs `standalone/server/accounts.test.mjs` (cookies, origins, redirects,
an identity gets a session and one idempotent match aggregate),
`career-outbox.test.mjs` (journal before acknowledgement, outage and restart
redelivery, torn tails, bounded queue, replay) and
`packages/accounts/test/accounts.test.ts`. `smoke-security` confirms a guest gets
`signedIn: false` and no profile. `drill-resilience` drill 3 replays the journal
after a restart. `verify-postgres-outbox.mjs` starts a disposable
`postgres:16-alpine` with no network and `verify-journal-volume.mjs` needs an
isolated `gahookz:review-*` image; both need Docker, so run them only when asked.

## Common changes

- **Add a career stat:** add the key in `packages/accounts/src/index.ts`, a column
  in a new numbered migration (do not edit `001`), the repository SQL, and a label
  in `CAREER_STATS` in `app.jsx`; update the tests.
- **Add a table or column:** new `infra/postgres/00N_*.sql` migration that is safe
  to run twice; auto-migrate runs the migration file named in `accounts.mjs`, so
  wiring a second file is part of the change.
- **Grant an entitlement:** insert into `account_entitlements` (operator action).

## Known issues

- Only `001_accounts.sql` is wired into auto-migrate.
- Google is the only provider. There is no email-free recovery or guest-to-account merge.
- A session removed or expired directly in the database is still honoured for up to 60 s from the cache.
- The account panel appears in three lobby screens, not in a settings page.

Developer sign-in, saved profile and deletion work: landing from `agent/accounts`
(not yet in this branch). Live backlog: [`../backlog.md`](../backlog.md).
