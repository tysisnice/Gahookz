# Accounts: what exists, and how to finish them

- Status: **proposal**, with the foundations marked *Built* already on branch
  `agent/accounts` (2026-10-04). Nothing here is live on gahookz.com: production
  has no database and no Google client, so it reports
  `accountPersistence: "memory"` and `googleLoginAvailable: false`, and the
  account panel stays hidden.
- Request (Tyson, 25 September): "Start work on Gahookz accounts, the ability
  to sign in and retain custom Gahookz etc. Please give suggestion on how to
  implement this."
- Audit and test evidence: [`docs/verification/2026-09-25-update/accounts.md`](../verification/2026-09-25-update/accounts.md).

## The rule everything below follows

Guest play never requires an account (CLAUDE.md rule 1). Creating a room,
joining and finishing a game never ask anyone to sign in. An account only adds
things a guest cannot keep: the same look on every device, saved custom
Gahooks that outlive a room, career statistics, and, later, purchases. Every
step in this plan keeps the sign-in out of the join path and fails closed: if
the database or the identity provider is missing, the panel disappears and
play is unaffected.

## Where it stands

| Piece | State |
| --- | --- |
| Google sign-in (OIDC code flow, PKCE, state, nonce, JWKS signature, issuer/audience/expiry checks) | Existed before this work; never live |
| Opaque `HttpOnly` session cookie, hashed server-side, 30 days | Existed |
| PostgreSQL schema 001, memory repository for tests, auto-migration | Existed |
| Career statistics through a durable journal ("outbox") | Existed |
| Entitlement table and a slot entitlement (`custom_gahook_slot`) | Existed; nothing grants one yet |
| **Developer sign-in** (`GAHOOKZ_DEV_LOGIN=1`, development only, refused in production) | **Built** |
| **Saved player look** (name, preset or drawn picture, Gahook form), migration 002 | **Built** |
| **Prefill on any device**: the join screen and form picker start from the saved look | **Built** |
| **Both custom Gahook slots kept** (was one); all saved slots restored into a new room | **Built** |
| **Guest-to-account upgrade inside a room**: signing in uploads what the guest drew there | **Built** |
| **Self-service deletion**: `POST /api/account/delete` and "Delete my account" | **Built** |
| **No email collected** (scope `openid profile`; 002 clears earlier values) | **Built** |
| **PostgreSQL robustness**: pool error listeners, migration ledger, probe repaired | **Built** |
| Data export, Apple sign-in, passkeys, purchases, saved-media moderation, provisioning | Proposed below |

## What is stored, and why

Data minimisation is the default: store what a feature needs and nothing else.

| Data | Why | Where |
| --- | --- | --- |
| Provider and opaque subject (Google `sub`, later Apple `sub`) | The stable identity; never shown | `account_identities` |
| Provider display name and picture URL | The account panel heading | `accounts` |
| Saved player look: room name (24 chars), avatar preset, drawn picture (≤ 1.5 MB data URL, the room limit), Gahook form | Prefill on any device | `account_profiles` |
| Saved custom Gahooks (≤ 3 frames, ≤ 1 sound, ≤ 1 MB each) | Survive the room; reload anywhere | `account_custom_gahooks` |
| Twelve career totals and per-match result rows | Career statistics; idempotent replay | `career_stats`, `account_match_results` |
| Entitlements with source and reference | Unlocks and, later, purchases | `account_entitlements` |
| Hashed session tokens with expiry | Staying signed in | `account_sessions` |

**Not stored:** email address, password, date of birth, location, contacts,
chat, answers, votes, or anything said in a room. Rooms remain memory-only.

**Email:** no current feature needs one, so it is no longer requested. Add it
only with a feature that requires it (for example magic-link sign-in or
purchase receipts sent by Gahookz rather than a store), and update the privacy
notice in the same change.

## How retention works (built)

1. A player signs in from the account panel (join screen or either lobby).
2. While signed in, every join, profile edit and Gahook form choice saves the
   look to the account. Saving is best effort: a database outage never delays
   or fails the room command. A room that switched off drawn pictures or
   custom Gahooks does not overwrite the saved choice with its fallback.
3. Custom Gahooks saved in either slot are written to the account and reported
   back as `persisted: true` only when the write succeeded.
4. On any device, signing in loads the saved look into the device's join
   defaults, so the join screen and the form picker start from it. Every
   field stays editable per room.
5. Joining a room loads every saved custom Gahook into the player's slots.
6. **Guest to account:** signing in from inside a room links the seat this
   device already holds (`POST /api/account/link`). The guest's drawn Gahooks
   fill empty account slots, saved account Gahooks fill empty room slots, and
   the guest's look becomes the first saved look. Nothing that exists on
   either side is overwritten.

*Proposed:* guests today keep custom Gahooks only for the life of a room, so
there is no device library to upload. If Tyson wants guests to keep drawings
between rooms on one device, add a small device library (IndexedDB, bounded
like the room limits) and upload it on first sign-in with the same
fill-empty-slots rule. That is the "local custom Gahooks uploaded on first
sign-in" path; about one agent-day.

## Finishing accounts, in order

Effort is in agent-days (one focused session with verification) and owner
time. Order matters: each step is shippable on its own.

### 1. Provision production (owner: about 2 hours; agent: half a day)

Tyson's checklist. Values never go in the repository or a tracked document.

1. **Google OAuth client.** Google Cloud console → APIs & Services → OAuth
   consent screen (External, app name Gahookz, scopes `openid` and `profile`
   only), then Credentials → OAuth client ID → *Web application*. Authorised
   redirect URI exactly `https://gahookz.com/auth/google/callback`. Optionally
   a second client for dev with `https://dev.gahookz.com/auth/google/callback`.
   Both scopes are non-sensitive, so no scope verification is needed (adding
   a logo to the consent screen can trigger Google's brand verification).
2. **PostgreSQL.** A `postgres:16` service on the machine's private Docker
   network (no published port) with a named volume, or a managed database.
   Create a database and a login role that owns only that database.
3. **Backups.** Nightly `pg_dump -Fc` to a directory outside the Syncthing
   tree and off the machine, encrypted, keeping 14 dailies; rehearse one
   restore into a scratch container before relying on it.
4. **Settings** go in the production environment file read by Compose: the
   untracked `.env` beside `compose.yaml` in the checkout production is
   deployed from (today the Store repository). That folder is synced by
   Syncthing, so first confirm `.env` is excluded from sync, or better, keep
   secrets in a root-only file outside the synced tree (for example
   `/etc/gahookz/production.env`, mode 600) referenced through Compose
   `env_file` (a small platform change). The names:
   - `GAHOOKZ_DATABASE_URL`: the connection string (Compose passes it to the
     container as `DATABASE_URL`).
   - `GAHOOKZ_DATABASE_SSL`: `1` for a remote database, `0` on the private
     Docker network.
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`: from step 1.
   - `GAHOOKZ_PUBLIC_ORIGIN`: `https://gahookz.com`.
   - Leave `GAHOOKZ_DEV_LOGIN` unset. Production ignores it anyway.
5. Deploy when asked (CLAUDE.md rule 2), check `/api/health` reports
   `accountPersistence: "postgres"` and `googleLoginAvailable: true`, sign in
   once, delete that test account, then set `GAHOOKZ_REQUIRE_POSTGRES=1` so a
   later start with a broken database refuses to boot rather than silently
   losing accounts.
6. Beta stays account-free (`DATABASE_URL: ""` in `compose.yaml`).

Agent work alongside: the `env_file` change, a backup script and timer, and
an alert on `login_failures` and PostgreSQL errors in `/api/metrics`.

### 2. Data rights and the privacy notice (agent: 1 day; owner: review)

- **Export:** `GET /api/account/export` returning the account's data as JSON
  (look, saved Gahooks, stats, entitlements, match rows). The notice currently
  says "ask and we will send a copy"; self-service is cheaper than answering
  requests by hand.
- **Retention:** delete sessions on expiry (done at start-up; add a daily
  sweep) and decide what happens to accounts unused for, say, three years.
- **Notice:** the privacy page already describes the built behaviour (updated
  in this change). Have it reviewed before promoting accounts publicly.
- **Australian Privacy Act 1988:** Gahookz may currently fall under the small
  business exemption (annual turnover ≤ AUD 3 million), but do not rely on it:
  behave as an APP entity. That means collecting only what is reasonably
  necessary (APP 3), saying what is collected and why at collection (APP 5),
  securing it and destroying it when no longer needed (APP 11), and giving
  access and correction (APP 12, 13). The 2024 amendments added a statutory
  tort for serious invasions of privacy and require a Children's Online
  Privacy Code. A party game will have under-18 players, so collect nothing
  from children that the game does not need: no email is the right default.
  This is not legal advice.
- Players outside Australia (GDPR, UK GDPR, US state laws) are covered by the
  same minimal design: deletion, export, no tracking, no sale of data.

### 3. Sign in with Apple, before any iOS store app (agent: 2–3 days; owner: Apple Developer Program)

- Apple's App Review Guidelines require in-app account deletion for apps that
  support account creation (5.1.1(v), now built). They also require an
  equivalent privacy-preserving login option when an app offers a third-party
  one such as Google (4.8). Sign in with Apple satisfies that. Recheck both
  guidelines at implementation time.
- Same OIDC shape as Google (`https://appleid.apple.com`, JWKS, nonce), with
  two differences: the client secret is a short-lived JWT signed with a key
  from the Apple developer account, and Apple sends the name only on the first
  authorisation. Request no email scope. Apple's private relay address is not
  needed.
- **Account linking:** a signed-in player can add a second provider from the
  account panel; never link by matching email addresses. Deleting the account
  removes every identity. The repository already supports several identities
  per account; this adds the "link" button and the conflict rules (refuse to
  link an identity that already belongs to another account).
- Google Play requires an in-app deletion path and a web link for deletion
  requests in the Data safety form. The in-app path is built; the web link can
  point to `/legal#privacy`.

### 4. Optional: passkeys or email magic links (agent: 3–5 days)

- **Passkeys (WebAuthn)** need no email, no third party and no password, and
  work on phones and laptops. Pair with "add a passkey" on an existing account
  first, then allow passkey-only accounts. Recovery is the trade-off: losing
  every device loses the account unless another provider is linked.
- **Email magic links** need an email-sending service, storing an email
  address (privacy notice change) and abuse controls. Prefer passkeys unless
  players ask for email.

### 5. Entitlements, paid cosmetics and a premium tier (agent: 3–5 days per store, after step 1)

Principle (OPERATIONS-AND-ROADMAP.md section 15): sell expression and
convenience, never power. No account is ever needed to play, and a purchase
never changes scores.

- **Store-neutral product IDs** in a new `packages/entitlements`: for example
  `supporter_pack_2026`, `gahook_form_pack_party`, `custom_gahook_slot` (adds
  slots, already honoured, capped at 12) and `premium_host` if a premium tier
  ever exists. Each store SKU maps to one product ID in one table. UI code
  never names a store SKU.
- **Server verification only.** Add a `store_transactions` table (store,
  transaction id, product id, account id, state, verified at). Write
  entitlements only after verifying server-side: Stripe webhook signatures for
  web checkout, App Store Server API and signed notifications for Apple,
  Google Play Developer API with real-time developer notifications, and Steam
  ownership checks. Refunds and revocations end the entitlement (set
  `expires_at`), and the account panel shows "restore purchases".
- **Guests and purchases:** a purchase needs an account, because it must
  survive devices and be restorable. That is the one place an account is
  required, and it never touches play.
- **Premium tier:** hold off until there is continuing hosted value people
  understand (saved prompt packs, larger rooms for organisations). A one-off
  supporter pack is the better first product.

### 6. Moderation of saved media (agent: 2–4 days; before public promotion)

Saved pictures and custom Gahooks outlive rooms, so they need more than the
host's in-room tools.

- Built: the room limits apply to saved media; saving is per-player and
  account-gated; deletion removes everything.
- Proposed: a "report this Gahook" path that reaches an operator rather than
  only the host, an operator page to view and remove a saved item (with an
  audit row), a per-account save rate limit, and optionally hash-matching
  against known abuse imagery through a service available to a small operator.
- Move saved media out of PostgreSQL rows into object storage once accounts
  are in use. Today the worst case is about 11 MB per account (one 1.5 MB
  picture and twelve full slots), fine for hundreds of accounts but not for
  many thousands.

### 7. Developer and test support (built)

`GAHOOKZ_DEV_LOGIN=1` with `NODE_ENV=development` adds a "Developer sign-in"
form that makes a synthetic account from a typed name (provider `dev`, which
can never collide with a Google subject). Production ignores the variable and
logs that it did, and an unknown `NODE_ENV` fails closed. It is not enabled in
`compose.yaml`. `standalone/smoke-accounts.mjs` drives the whole flow, and
`standalone/verify-postgres-outbox.mjs` exercises the real schema in a
disposable PostgreSQL container.

## Risks

| Risk | Mitigation |
| --- | --- |
| Secrets in a Syncthing-synced folder replicate to other devices | Keep secrets outside the synced tree (`env_file`), step 1 |
| PostgreSQL on the same 2-core machine competes with live rooms | Small `shared_buffers`; account reads cached 60 s; or a managed database |
| Database outage | Sign-in fails closed; rooms and guest play unaffected; results wait in the journal; saving the look is best effort |
| Lost database | Tested, encrypted, off-machine backups (step 1) |
| Developer sign-in left on somewhere public | Needs the opt-in *and* a development `NODE_ENV`; production refuses and logs; smoke test guards it |
| A compromised Google account takes over a Gahookz account | Only cosmetics and stats at stake; linking never by email; passkeys later |
| Under-18 players | No email, no tracking, minimal data; follow the Children's Online Privacy Code when published |
| Saved media abuse | Size limits now; operator reporting and removal before public promotion (step 6) |
| Several server instances | Sessions are cached per process for 60 s, so a deletion could take up to a minute to reach another instance. Gahookz runs one instance by design. |
| Store rules change | Re-read the Apple and Google guidelines at each store step |

## Effort summary

| Step | Agent | Owner |
| --- | --- | --- |
| Built in this change | done | review |
| 1. Provision Google and PostgreSQL, backups | 0.5 day | ~2 hours, plus a deploy when ready |
| 2. Export, retention, notice review | 1 day | review / legal |
| Device library for guest Gahooks (optional) | 1 day | decision |
| 3. Sign in with Apple and account linking | 2–3 days | Apple Developer Program |
| 4. Passkeys (optional) | 3–5 days | decision |
| 5. Entitlements: catalogue plus web checkout | 3–5 days | Stripe account, pricing |
| 5. Each store adapter (Apple, Google, Steam) | 3–5 days each | store accounts |
| 6. Saved-media moderation and object storage | 2–4 days | operator time |

Recommended next step: step 1 (provisioning) and step 2 (export), then turn
the panel on for gahookz.com. Apple sign-in waits until an iOS app is
actually planned.
