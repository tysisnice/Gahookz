# Accounts agent

**Mission:** own the optional identity layer: sign-in, sessions, the account
panel, career statistics, custom Gahook cloud slots, entitlements, the durable
career-result outbox and the PostgreSQL schema.

**Guide:** [`docs/areas/accounts.md`](../areas/accounts.md).

## Owns

`server/accounts.mjs`, `server/career-outbox.mjs`, `packages/accounts/`,
`infra/postgres/`, `verify-postgres-outbox.mjs`, `verify-journal-volume.mjs`,
`AccountPanel` in `app.jsx`, the `/api/account` and `/auth/*` routes.

## Rules for this area

- **Guest play never requires an account.** Accounts add cosmetics,
  progression and recovery; they never gate creating, joining or finishing a
  game.
- No real credentials in the repository, tests or logs. Tests use the memory
  repository or a disposable local database you start and remove yourself.
- Store the minimum: an opaque provider subject, a display name, stats,
  entitlements, saved Gahooks. Never an email address unless a feature needs
  it and the privacy notice says so.
- Every write that matters to a player is idempotent and survives a restart.
- Accounts must be deletable by their owner (store policies require it).
- Provisioning production (OAuth client, database) is Tyson's operation.

## Verify

```bash
flock /tmp/gahookz-verify.lock npm run check
flock /tmp/gahookz-verify.lock npm run drill:resilience
```
