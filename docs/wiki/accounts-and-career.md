# Accounts and career stats

> A Google sign-in that is entirely optional and only adds a saved look, saved custom Gahooks and career totals; guests play every game without one.

**Area:** [Accounts](../areas/accounts.md) · **Status:** hidden · **Last reviewed:** 2026-10-04

## What it is

Nobody has to sign in to host, join or finish a game. An account only adds
extras that follow a player between devices: a saved look (name, picture and
Gahook form), two saved custom Gahooks and career statistics.

**On the live site accounts are still switched off.** Production has no
database and no Google client configured, so the account panel never appears.
Setting that up is a task for Tyson.

Where sign-in is available, a signed-in player's look is saved whenever they
join or change it, and the join screen on another device starts from it. A guest
who signs in from inside a room keeps their seat and the Gahooks they drew. A
"Delete my account" button removes the account and everything saved with it.
Gahookz collects no email address. For local testing only, a developer sign-in
exists (`GAHOOKZ_DEV_LOGIN=1`); production ignores it.

## Rules and numbers

- Twelve statistics: games played, wins, podiums, total score, high score,
  answers submitted, correct answers, popular choices, questions authored, Herd
  votes received, Gahooks sent and Gahooks received. High score is a maximum, the
  rest are sums.
- Two cloud Gahook slots, up to 12 with an entitlement an operator grants.
- Sessions last 30 days and the token is stored only as a hash.
- Deleting needs a typed confirmation and cannot be undone.
- Career results are saved to a local journal first, then delivered with
  retries; if that fails the game still finishes.

## Where it lives

| Part | Code |
| --- | --- |
| Service, sessions, sign-in, saved look, deletion | `standalone/server/accounts.mjs` |
| Saving the look, linking a guest seat | `standalone/server/account-room.mjs` |
| Career-result journal and retry | `standalone/server/career-outbox.mjs` |
| Schema | `infra/postgres/001_accounts.sql`, `002_account_profiles.sql` |
| Routes | `standalone/server.js` — `/api/account/*` |
| Browser panel and delete dialog | `standalone/public/client/account.jsx` |
| Tests | `standalone/server/accounts.test.mjs`, `standalone/smoke-accounts.mjs` |

## Related

- [Custom Gahooks](custom-gahooks.md)
- [Joining and profiles](joining-and-profiles.md)
- [Accounts area guide](../areas/accounts.md)

## History

- 2026-08-26 — Google sign-in, sessions, career stats and schema added.
- 2026-09-11 — Career results made durable with a local journal (P07).
- 2026-10-04 — Saved look, two Gahook slots, guest upgrade in a room, account deletion and local developer sign-in added; email no longer collected; database connection drops no longer crash the server. Still inactive in production.
