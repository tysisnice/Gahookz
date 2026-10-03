# Accounts (C1): audit, foundations, verification

- Item: C1, "Start work on Gahookz accounts, the ability to sign in and retain
  custom Gahookz etc. Please give suggestion on how to implement this."
- Agent / branch / worktree: accounts / `agent/accounts` /
  `~/gahookz-agent-worktrees/accounts` (from `82ae1dc`).
- Production touched: **no**. Nothing was deployed, no live container or the
  Store repository was touched, and no external service (Google included) was
  contacted.
- The proposal for finishing accounts is
  [`docs/product/accounts-plan.md`](../../product/accounts-plan.md).

## Audit: what existed, and the gaps found

The account path was read end to end: `server/accounts.mjs`, both
repositories, `infra/postgres/001_accounts.sql`, the routes in `server.js`, the
custom-Gahook routes, `career-outbox.mjs`, `AccountPanel`, the join screen and
form picker, and the privacy notice.

**What a player kept before this change:**

- *Guest:* name, avatar preset or drawn picture, and Gahook form in this
  browser's `localStorage` (the last-join record). Custom Gahooks lived only on
  the room player (two slots) and disappeared with the room.
- *Signed in (where configured):* career totals and **one** cloud custom-Gahook
  slot. The look (name, picture, form) was never saved to the account.
- *Production today:* nothing. No database or OAuth client is configured, so
  accounts are memory-only and the panel is hidden.

| # | Finding | Severity | Outcome |
| --- | --- | --- | --- |
| A1 | Production is inert: no `DATABASE_URL`, no Google client, memory repository | expected | Provisioning checklist in the plan (step 1) |
| A2 | The player's look was not retained with the account at all | gap | **Built:** saved look, migration 002 |
| A3 | Accounts had one cloud slot while guests draw two; slot 1 was never saved, yet the save response said `persisted: true` | bug | **Fixed:** two base slots; `persisted` reports the real write |
| A4 | Joining restored only saved slot 0 | gap | **Fixed:** every saved slot is restored |
| A5 | Signing in from inside a room (the Google redirect returns there) did not link the seat until a rejoin, so stats and saves silently went nowhere | bug | **Fixed:** `POST /api/account/link`, called by the panel after sign-in |
| A6 | No way to delete an account (notice said "ask us"); App Store and Play rules require one | gap | **Built:** `POST /api/account/delete` and "Delete my account" |
| A7 | Google email was requested, stored and sent to the browser; nothing used it | privacy | **Fixed:** scope `openid profile`; not stored; 002 clears old values; notice updated |
| A8 | `pg` Pool had no `error` listener: an idle connection terminated by the server (57P01) would crash the process and end every room | critical when PostgreSQL is enabled | **Fixed:** pool and client listeners; verified against real PostgreSQL |
| A9 | A failed start left the pool open; a failed `ROLLBACK` masked the real error; only 001 ever ran, with no ledger | robustness | **Fixed:** pool closed; broken clients discarded; numbered migrations with `schema_migrations` and an advisory lock |
| A10 | Career results for a deleted account would fail on the foreign key, retry 12 times and stay "exhausted" in the journal | bug | **Fixed:** dropped as handled |
| A11 | `verify-postgres-outbox.mjs` failed with an unhandled 57P01: it connected to the image's temporary init server, which then shut down | probe bug | **Fixed:** waits for init to finish; passes |
| A12 | The probe's temp directory is chowned to uid 70 by the image and could not be removed; one from 18 Sep was still in `/tmp` | hygiene | **Fixed:** ownership returned before removal; the old directory cleaned |
| A13 | `GET /api/account` sent full saved configurations, including audio data URLs | efficiency | **Fixed:** previews only (`name`, first frame) |
| A14 | The code read only `DATABASE_URL`, the docs only `GAHOOKZ_DATABASE_URL` | config | **Fixed:** reads both; an explicitly empty `DATABASE_URL` (beta, smokes) still means "no database" |
| A15 | `drill:resilience` journal step failed on every run: it replays with the journalled backoff but flushes immediately | test bug | **Fixed:** the drill starts past the backoff, as the unit test does |

## What changed

**Server**

- `server/accounts.mjs`: developer sign-in; `saveProfile`, `deleteAccount`,
  `clientStatus`; profile normalisation through the server's own
  `normaliseGahookForm` and `normaliseAvatarId`, on write and on read (so the
  art branch's `capybara` → `pig` mapping applies to stored forms once merged);
  two base cloud slots (`LOCAL_CUSTOM_GAHOOK_SLOTS`); saved Gahooks capped at
  1 MB; no email; the hardened PostgreSQL repository and migration runner.
- `server/account-room.mjs` (new): saves the look on join, profile edit and form
  choice (best effort, never blocks a room command; a room that disables drawn
  pictures or custom Gahooks does not overwrite the saved choice); restores
  saved slots; links a guest seat (fill empty slots both ways, never
  overwrite); detaches deleted accounts from seats.
- `server.js`: three routes, the bridge wiring, `context` passed to the
  profile and form handlers, all saved slots restored on join, and the
  `persisted` fix.
- `infra/postgres/002_account_profiles.sql` (new): `account_profiles`; clears
  stored emails.

**Browser**

- `client/account.jsx` (new; registered in `build-client.mjs`, `dev.mjs`,
  `.gitignore`, the service-worker precache): one shared account status; the
  panel (Google button, developer sign-in form, saved look, saved Gahook
  previews, stats, Sign out, Delete my account); the delete confirmation
  (Back or Escape keeps the account, uses `useBackToClose`); and the
  join-screen prefill hook.
- `app.jsx`: a thin `AccountPanel` wrapper (the three placements are
  unchanged), a device sink that writes a newly saved look into the last-join
  record and the stored Gahook form, and one prefill hook in `JoinScreen`.
- `styles.css`: account-panel rules only; the dialog reuses the "Leave game?"
  styles at `--z-modal`.
- `client/legal.jsx`: the privacy notice now says no email is collected, the
  saved look is kept, and deletion is self-service.

**Tests and tools**

- `server/accounts.test.mjs`: 6 new tests (developer sign-in guard; same
  account by name; profile bounds, normalisation and retention; picture
  validation; two slots and previews; deletion removes everything everywhere).
  One assertion was updated: an account now has 2 slots, not 1.
- `smoke-accounts.mjs` (new, in `npm test` after room-expiry): owns two
  servers on free loopback ports.
- `smoke-onboarding.mjs`: the Google-redirect check now reads
  `client/account.jsx`, plus checks that the panel stays hidden with no
  sign-in and that Back closes the delete confirmation.
- `verify-postgres-outbox.mjs`: repaired and extended (see A11, A12).
- `drill-resilience.mjs`: clock offset in the journal step (A15).

## Settings

| Variable | Where | Effect |
| --- | --- | --- |
| `GAHOOKZ_DEV_LOGIN=1` | local shell only; commented in `.env.example`; **not** in `compose.yaml` | Enables "Developer sign-in" only when `NODE_ENV` is `development` or `test`. A production process ignores it and logs `GAHOOKZ_DEV_LOGIN is ignored`. An unknown `NODE_ENV` fails closed. |
| `GAHOOKZ_DATABASE_URL` / `DATABASE_URL` | production environment file (see plan, step 1) | PostgreSQL. `DATABASE_URL` wins when set, even empty. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GAHOOKZ_PUBLIC_ORIGIN` | same | Google sign-in (unchanged) |
| `GAHOOKZ_REQUIRE_POSTGRES=1` | same, after the first verified start | Refuse to boot without PostgreSQL (unchanged) |

To try it locally:
`NODE_ENV=development GAHOOKZ_DEV_LOGIN=1 HOST=127.0.0.1 PORT=3210 DATABASE_URL= npm start`,
on any free port other than 3101–3103 and the test port 3199, and never on
the shared dev container.

## Endpoints

| Route | Rules | Purpose |
| --- | --- | --- |
| `GET /api/account` | none | Status: `signedIn`, `googleAvailable`, `devLoginAvailable`, `persistence`, and the account (`developer`, stats, slots, `profile`, saved Gahook previews). No email. |
| `POST /api/account/dev-login` `{displayName}` | same-origin, admission; 404 unless enabled | Developer sign-in |
| `POST /api/account/link` `{code, playerKey}` | same-origin, admission, session | Attach the account to this device's seat and merge Gahooks |
| `POST /api/account/delete` `{confirm: "DELETE"}` | same-origin, admission, session (401), confirmation (400) | Delete everything; clear cookie; detach seats |
| `POST /api/account/logout` | unchanged | Sign out |

## Commands and results

All commands were run from the worktree with `PATH=/usr/bin:$PATH` (Node
24.13.1) under `flock /tmp/gahookz-verify.lock`.

| Command | Result |
| --- | --- |
| `npm run check` | **pass**: typecheck, 212 unit tests (10 in `accounts.test.mjs`), build |
| `npm run test:disposable -- bash -c "npm run standalone:smoke:security && npm run standalone:smoke:onboarding && npm run standalone:smoke:social-creation && npm run standalone:smoke:accounts"` | **pass** |
| `npm run test:disposable -- npm run standalone:smoke:accounts` | **pass**: sign-in, saved look and both Gahooks, sign-out/in retention, restore into a new room, guest upgrade, deletion; production refuses the developer sign-in with the variable set |
| `npm test` (full stateful suite, now including the accounts smoke) | **pass** |
| `npm run test:disposable -- npm run test:browser` | **pass** (guest flow in Chromium) |
| `npm run test:disposable -- npm run drill:resilience` | failed 3 of 3 before A15 (journal step); **pass** after |
| `npm run test:disposable -- npm run standalone:smoke:deployment` | **pass** |
| `node --import tsx standalone/verify-postgres-outbox.mjs` | **pass** on real `postgres:16-alpine`: migrations 001 and 002 applied once and idempotent; idle connections terminated server-side (57P01) without a crash, then reconnected; saved look; third slot by entitlement; deletion cascaded through all eight tables; late result dropped; paused-database journal replay; partial-transaction rollback. Afterwards `docker ps -a --filter name=gahookz-review-pg` was empty and no `/tmp/gahookz-pg-review-*` remained. |
| `npm run docs:check` | 66 problems, **identical with and without this change** (wiki and area pages on other branches) |

The first probe run passed every assertion but could not delete its temporary
directory (A12). That was fixed and the run repeated cleanly.

## Screenshots (390×844, developer sign-in, disposable server)

- [`accounts/01-developer-sign-in-390x844.png`](accounts/01-developer-sign-in-390x844.png): the guest panel on the join screen with the labelled developer form.
- [`accounts/02-signed-in-account-panel-390x844.png`](accounts/02-signed-in-account-panel-390x844.png): signed in, in the player lobby, showing the saved look, two saved custom Gahooks, stats and "Delete my account".
- [`accounts/03-delete-account-confirmation-390x844.png`](accounts/03-delete-account-confirmation-390x844.png): the confirmation. Pressing Back closed it and the player stayed in the lobby (checked in the same run).

The capture script was a throwaway in `/tmp`, not added to the repository.
The first capture showed the Sign out button squeezing the name to one word
per line on a phone; the button now wraps to its own line.

## Decisions taken where the brief left room

- **Last look used wins:** while signed in, joining, editing the profile or
  picking a form updates the saved look. It is still editable per room.
- **Two base cloud slots,** matching the two a guest can draw, so signing in
  never loses a drawing. Entitlements add more (cap 12).
- **Email dropped** rather than kept unused (data minimisation; the account
  agent profile's rule).
- **Linking fills empty slots only;** nothing on either side is overwritten.
- **Developer sign-in is an allowlist** (`development`, `test`), stricter than
  "not production", so a typo fails closed. A production process logs and
  ignores the variable rather than refusing to boot, so a stray variable
  cannot take gahookz.com down.
- **Saving the look never blocks a room command.** Linking a guest seat during
  a rejoin does wait for its account writes, which only happens at that one
  moment.

## Known issues and follow-ups

- Production remains inert until Tyson provisions Google and PostgreSQL (plan,
  step 1). Store secrets outside the Syncthing-synced tree.
- Data export (`GET /api/account/export`) is not built (plan, step 2).
- Sessions are cached for 60 s per process. With more than one instance, a
  deletion could take up to a minute to reach the others. Gahookz runs one
  instance by design.
- Saved media lives in PostgreSQL rows (worst case about 11 MB per account).
  Move it to object storage before large numbers of accounts (plan, step 6).
- Guests have no device library of custom Gahooks between rooms; it is
  optional, and proposed in the plan.
- Not mine, noticed: `standalone/dev.mjs` `buildSources` does not list
  `client/host-presence.jsx`, so the dev watcher may not rebuild it on save
  (platform).
- Documentation per this wave's brief: `docs/wiki/`, `docs/areas/`,
  `docs/CHANGELOG.md`, `CLAUDE.md` and `README.md` were deliberately left for
  the docs agents.
