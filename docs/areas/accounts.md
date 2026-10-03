# Accounts — area guide

Verified 2026-10-04 against commit `56497b9` on branch `agent/docs-core`, which
includes the merged accounts work (developer sign-in, saved look, two cloud
Gahook slots, guest upgrade in a room, account deletion). The record of what was
built and verified is
[`../verification/2026-09-25-update/accounts.md`](../verification/2026-09-25-update/accounts.md);
the plan for what is left is [`../product/accounts-plan.md`](../product/accounts-plan.md).

## Purpose

Accounts is the optional identity layer: Google sign-in, sessions, the saved look,
the career profile, custom-Gahook cloud slots, entitlements, the durable
career-result outbox and the PostgreSQL schema. It exists only for cosmetic and
progression extras. **Guest play never requires an account** (rule 1 in
`CLAUDE.md`): the join path never reads an account, saving a look never blocks a
room command, and a server with no accounts configured plays exactly the same.

**Production status: accounts are still inert.** No database and no Google OAuth
client are configured, so the server uses the in-memory repository, Google sign-in
is reported unavailable, and `/api/health` reports `accountPersistence: "memory"`
and `googleLoginAvailable: false`. The account panel is hidden there. Production
also ignores the developer sign-in. Provisioning production is Tyson's operation
(see below); nothing in this work was deployed.

## What players see

- Nothing, when no sign-in method is available. `AccountPanelView` renders nothing
  unless the server reports `googleAvailable` or `devLoginAvailable`, so it never
  advertises a saved look or career stats that would not survive a restart.
- When available, signed-out players see "Keep your wins and custom Gahooks", a
  "Continue with Google" link (when Google is configured), the developer form
  (when enabled, local only) and the line "Guest play stays instant."
- Signed-in players see their saved look (name, picture, Gahook form), previews of
  their saved custom Gahooks, twelve career statistics, Sign out, and
  "Delete my account".
- **Saved look, kept across devices.** While signed in, joining a room, editing
  the profile or picking a Gahook form saves the look to the account. The last
  look used wins, and it stays editable in each room. The join screen on any
  other device starts from it.
- **Two custom Gahook slots**, matching the two a guest can draw, so signing in
  never loses a drawing. Joining a room restores every saved slot, not only the
  first.
- **Guest upgrade inside a room.** A guest who signs in from inside a room (the
  Google redirect returns to it) is linked to their seat at once: the panel calls
  `POST /api/account/link`. Gahooks the guest drew fill empty account slots, saved
  Gahooks fill empty room slots, and nothing on either side is overwritten.
- **Delete my account.** The dialog asks for confirmation; Back or Escape keeps
  the account. Deleting removes the account and everything saved with it, signs
  the browser out, and detaches the account from any seat it holds in a live room.
- After a game, a signed-in player's result is accepted by the outbox and the
  snapshot carries `careerResultStatus` for them; the room never claims a result
  was recorded when it was not.

## Code map

| Piece | Where |
| --- | --- |
| Account service, cookies, Google OAuth, developer sign-in, saved look, deletion, memory and PostgreSQL repositories, migration runner | `standalone/server/accounts.mjs` |
| Where a room player meets their account: save the look, restore slots, link a guest seat, detach deleted accounts | `standalone/server/account-room.mjs` (`createAccountRoomBridge`) |
| Durable career-result outbox (journal, retry, compaction) | `standalone/server/career-outbox.mjs` |
| Career stat keys, bounds and match delta | `packages/accounts/src/index.ts` |
| Schema | `infra/postgres/001_accounts.sql`, `infra/postgres/002_account_profiles.sql` |
| Routes: `GET /api/account`, `POST /api/account/dev-login`, `POST /api/account/link`, `POST /api/account/delete`, `POST /api/account/logout`, `GET /auth/google/start`, `GET /auth/google/callback` | `standalone/server.js` request handler and room-command dispatch (`/api/account/link` is a room command) |
| Use in rooms: join, profile and form handlers, custom-Gahook save (`persisted`), result hand-off, `accountLinked`, `careerResultStatus` | `standalone/server.js` (`joinPlayer`, `linkPlayerAccount`, custom-Gahook routes, the finish path that calls `careerOutbox.accept`) |
| Browser panel, delete confirmation, join-screen prefill, shared account status | `standalone/public/client/account.jsx` (`AccountPanelView`, `useAccountJoinPrefill`, `onAccountProfile`) |
| Thin wrapper and device sink (writes a newly saved look into the last-join record and the stored Gahook form) | `standalone/public/app.jsx`: `AccountPanel`, `CAREER_STATS`, `accountLoginHref` |
| Privacy notice (no email, saved look, self-service deletion) | `standalone/public/client/legal.jsx` |
| Docker checks | `standalone/verify-postgres-outbox.mjs`, `standalone/verify-journal-volume.mjs` |

`AccountPanel` is mounted in `HostLobby`, `JoinScreen` and `PlayerWaitingLobby`.
`client/account.jsx` is registered in `build-client.mjs`, `dev.mjs` and the
service-worker precache; like all client modules its compiled `.js` is a build
product.

## How it works

### Service and repositories

`createAccountService` reads `GAHOOKZ_DATABASE_URL` or `DATABASE_URL` (Compose maps
the first to the second; `DATABASE_URL` wins when set, and an explicitly empty
value, as on beta and in the smokes, means "no database"), `GAHOOKZ_PUBLIC_ORIGIN`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GAHOOKZ_DATABASE_SSL`,
`GAHOOKZ_AUTO_MIGRATE` and `GAHOOKZ_DEV_LOGIN`. With a database URL it opens a
PostgreSQL repository and applies the numbered files in `infra/postgres/` once
each, unless auto-migrate is `0`. The runner records each file in
`schema_migrations` and holds an advisory lock so two processes starting together
cannot race; a database created before that ledger existed replays 001 and 002
safely. If the database fails to start, the pool is closed, and the service throws
in production and falls back to the memory repository elsewhere.
`GAHOOKZ_REQUIRE_POSTGRES=1` makes the server refuse to start unless persistence
is `postgres`. Without a database it uses the memory repository, which is
ephemeral.

The PostgreSQL pool and each checked-out client have `error` listeners. An idle
connection terminated by the server (PostgreSQL code 57P01, for example during a
restart or failover) is logged and discarded; it used to be an unhandled event
that would have crashed the process and ended every room. A failed `ROLLBACK` no
longer hides the original error, and a broken client is discarded rather than
returned to the pool.

`googleAvailable` is true only when the public origin (HTTPS, or loopback HTTP),
client id and client secret are all set **and** persistence is PostgreSQL or the
environment is not production. So a production server with Google credentials
but no database still reports sign-in unavailable.

### Developer sign-in (local testing only)

`GAHOOKZ_DEV_LOGIN=1` turns on "Developer sign-in", and only when `NODE_ENV` is
`development` or `test`. It is an allowlist, so an unknown `NODE_ENV` fails
closed. A production process ignores the variable and logs
`GAHOOKZ_DEV_LOGIN is ignored` instead of refusing to boot, so a stray variable
cannot take the live site down. The variable is commented in `.env.example` and is
not in `compose.yaml`. `POST /api/account/dev-login {displayName}` is
same-origin, goes through admission, and answers 404 unless the feature is
enabled. The same display name signs in to the same account. To try it locally:

```bash
NODE_ENV=development GAHOOKZ_DEV_LOGIN=1 HOST=127.0.0.1 PORT=3210 DATABASE_URL= npm start
```

Use any free port other than 3101–3103 and the test port 3199, and never the
shared dev container.

### Google sign-in and sessions

`/auth/google/start` calls `beginGoogleLogin`: random `state`, `nonce`, PKCE
verifier (S256) and a browser-binding cookie; the flow lives in memory for ten
minutes (at most 2,000 flows). The scope is `openid profile`, so **no email is
requested**. `/auth/google/callback` calls `finishGoogleLogin`, which checks the
state and binding cookie, exchanges the code, verifies the ID token (RS256
signature against Google's published keys, issuer, audience, expiry, nonce) and
builds a profile: opaque `sub`, display name (max 80) and an HTTPS avatar URL.
`upsertIdentity` creates or finds the account. A session token (32 random bytes)
is hashed with SHA-256 before storage and lasts 30 days. The cookie is HttpOnly,
SameSite=Lax, and named `__Host-gahookz_session` over HTTPS. Sessions are cached
for 60 s. `returnTo` is reduced to a same-origin path, and the browser comes back
with `?account=connected` or `?account=error`. Failed callbacks increment
`login_failures` in `/api/metrics`.

### What is stored

| Table | Holds |
| --- | --- |
| `accounts` | id, display name, avatar URL; `email` column kept but always empty |
| `account_identities` | (provider, subject) to account; `email` column kept but always empty |
| `account_sessions` | SHA-256 token hash, expiry |
| `account_profiles` | the saved look: player name, avatar preset, drawn picture (data URL), Gahook form |
| `career_stats` | the twelve counters |
| `account_entitlements` | key, quantity, source, expiry |
| `account_custom_gahooks` | slot 0-11 and the configuration JSON (each at most 1 MB) |
| `account_match_results` | one row per (match, account), with the stat delta |

Every table that refers to an account deletes with it (`ON DELETE CASCADE`), so
`deleteAccount` removes all eight tables' rows for that account. Migration
`002_account_profiles.sql` creates `account_profiles` and **clears any email an
earlier build stored**; Gahookz no longer requests, stores or sends an email
because no feature used one. Stored forms and avatar ids are passed through the
server's own `normaliseGahookForm` and `normaliseAvatarId` on write and on read,
so a retired id (such as `capybara`, now `pig`) maps forward.

The twelve stats are `gamesPlayed`, `wins`, `podiums`, `totalScore`, `highScore`,
`answersSubmitted`, `correctAnswers`, `popularChoices`, `questionsAuthored`,
`herdVotesReceived`, `gahooksSent`, `gahooksReceived`. All are bounded
non-negative integers; `highScore` is a maximum, the rest are sums.
`matchCareerDelta` turns a placement into games, wins and podiums.

Cloud Gahook slots: two by default (`LOCAL_CUSTOM_GAHOOK_SLOTS`, the same two a
guest can draw), plus the `custom_gahook_slot` entitlement quantity, up to 12. No
code path grants entitlements; a row has to be inserted by an operator.
`GET /api/account` sends previews only (`name` and first frame), not full saved
configurations. The save response's `persisted` flag reports whether the account
write really happened.

### Deletion

`POST /api/account/delete {confirm: "DELETE"}` is same-origin, goes through
admission, and requires a session (401 otherwise) and the exact confirmation (400
otherwise). The service deletes the account and everything saved with it, the
route clears the session cookie, and `detachAccount` in `account-room.mjs` removes
the account from any seat in a live room so the room stops trying to save to it.
Career results still in the outbox for a deleted account are dropped as handled
instead of failing on the foreign key and retrying twelve times.

### Room hand-off (`account-room.mjs`)

`createAccountRoomBridge` is handed the service and the room's slot helpers. It
saves the look after join, profile edit and form choice (best effort, never throws
or delays the command; a room that disables drawn pictures or custom Gahooks does
not overwrite the saved choice), restores saved slots into the room player, links a
guest seat (`linkPlayerAccount`, filling empty slots both ways and never
overwriting) and detaches deleted accounts.

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
  a game on an account. Saving the look never blocks or fails a room command.
- Identity comes from the server session cookie, never from the request body.
- Store the minimum: opaque subject, display name, saved look, stats,
  entitlements and saved Gahooks. **No email is collected.**
- Session tokens are stored only as hashes; cookies are HttpOnly.
- The developer sign-in runs only when `NODE_ENV` is `development` or `test`.
- Every write that matters to a player is idempotent and survives a restart.
- A dropped database connection must never take the process down.
- No real credentials in the repository, tests or logs. Tests use the memory
  repository or a disposable database you start and remove yourself.

## Provisioning production (Tyson's task)

Nothing here is done, and nothing deploys without being asked. The checklist is
step 1 of [`../product/accounts-plan.md`](../product/accounts-plan.md):

1. A Google OAuth client (scopes `openid` and `profile` only) with the redirect
   URI `https://gahookz.com/auth/google/callback`.
2. A PostgreSQL database on the private Docker network (or a managed one), with a
   login role that owns only that database, and tested nightly backups kept off
   the Syncthing tree.
3. Settings in the production environment file, kept out of any synced or
   tracked folder: `GAHOOKZ_DATABASE_URL`, `GAHOOKZ_DATABASE_SSL`,
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GAHOOKZ_PUBLIC_ORIGIN`. Leave
   `GAHOOKZ_DEV_LOGIN` unset.
4. A deliberate deploy, then check `/api/health` reports
   `accountPersistence: "postgres"` and `googleLoginAvailable: true`, sign in once,
   delete that test account, and set `GAHOOKZ_REQUIRE_POSTGRES=1`.

Beta stays account-free (`DATABASE_URL: ""` in `compose.yaml`).

## Tests

```bash
PATH=/usr/bin:$PATH flock /tmp/gahookz-verify.lock npm run check
PATH=/usr/bin:$PATH flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run standalone:smoke:accounts
PATH=/usr/bin:$PATH flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run drill:resilience
PATH=/usr/bin:$PATH flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run standalone:smoke:security
```

`check` runs `standalone/server/accounts.test.mjs` (cookies, origins, redirects,
the developer sign-in guard, profile bounds and retention, two slots and previews,
deletion removes everything, an identity gets a session and one idempotent match
aggregate), `career-outbox.test.mjs` (journal before acknowledgement, outage and
restart redelivery, torn tails, bounded queue, replay) and
`packages/accounts/test/accounts.test.ts`. `smoke-accounts.mjs` owns two servers on
free loopback ports and covers sign-in, the saved look and both Gahooks,
sign-out/in retention, restore into a new room, guest upgrade, deletion, and that
production refuses the developer sign-in; it also runs inside `npm test`.
`smoke-onboarding` checks the panel stays hidden with no sign-in and that Back
closes the delete confirmation. `smoke-security` confirms a guest gets
`signedIn: false` and no profile. `drill-resilience` drill 3 replays the journal
after a restart. `verify-postgres-outbox.mjs` starts a disposable
`postgres:16-alpine` with no network (migrations, idle connections terminated
server-side, saved look, deletion cascade, journal replay) and
`verify-journal-volume.mjs` needs an isolated `gahookz:review-*` image; both need
Docker, so run them only when asked.

## Common changes

- **Add a career stat:** add the key in `packages/accounts/src/index.ts`, a column
  in a new numbered migration (do not edit `001` or `002`), the repository SQL, and
  a label in `CAREER_STATS` in `app.jsx`; update the tests.
- **Add a table or column:** new `infra/postgres/00N_*.sql` migration that is safe
  to run twice. The runner applies every numbered file in the directory once, so
  no wiring is needed.
- **Save something else with the account:** extend `account_profiles` or add a
  table in a migration, normalise on write and on read in `accounts.mjs`, and save
  it from `account-room.mjs` as best effort so a room command never waits on it.
- **Grant an entitlement:** insert into `account_entitlements` (operator action).

## Known issues

- Production is inert until Google and PostgreSQL are provisioned (above).
- Google is the only real provider (the developer sign-in is local only). There is
  no email-free recovery, and no Apple sign-in or passkeys.
- Data export (`GET /api/account/export`) is not built.
- A session removed or expired directly in the database, or a deletion made on
  another instance, is still honoured for up to 60 s from the cache. Gahookz runs
  one instance by design.
- Saved Gahooks live in PostgreSQL rows (worst case about 11 MB per account); move
  them to object storage before large numbers of accounts.
- Guests have no device library of custom Gahooks between rooms.
- The account panel appears in three lobby screens, not in a settings page.

Live backlog: [`../backlog.md`](../backlog.md).
