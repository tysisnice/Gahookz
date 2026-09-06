# Gahookz production operations

This document describes the production shape implemented in this repository. It
is intentionally candid about what is safe today and what still needs measured
work before a very large public launch.

## Authority and horizontal scale

The Node room process is authoritative. Browsers send commands and receive
sanitised snapshots; the host browser is a controller, not the game server.
This protects scoring, account attribution, entitlements, bans, and game
continuity from client tampering.

The browser sends the non-secret four-letter room code as `X-Gahookz-Room` on
API calls and as the `room` query parameter on event streams. The Nginx example
uses consistent hashing on that value, so every request for one room reaches
the same Node process. Event tickets remain opaque, scoped, and single-use.

Important limitation: active room state is still process-local. A process
restart ends its active rooms, and a node must be drained rather than replaced
mid-game. Consistent hashing permits several independent authorities, but it
does not provide live room migration. Before a genuinely mass-scale launch:

1. extract every mode into the deterministic `packages/game-engine` command
   boundary;
2. ~~add a room drain flag and deploy only after its active-room gauge reaches
   zero;~~ **done 2026-09-05.** `POST /api/drain` and a SIGTERM drain bounded by
   `GAHOOKZ_DRAIN_TIMEOUT_MS`; `scripts/docker-deploy.sh` waits when
   `GAHOOKZ_DRAIN_WAIT_SECONDS` is set;
3. load-test the real room/SSE mix and size each shard from measurements;
4. add a coordinator that assigns codes to healthy workers, or move the pure
   engine to a per-room primitive such as Durable Objects;
5. test worker loss, reconnect, rolling deployment, and regional failure.

Peer/browser hosting is not the scale plan. It would add signaling and TURN,
expose peers to one another, make mobile host suspension fatal, and make scores,
stats, purchases, and moderation host-controlled. Gahookz traffic is small
command/snapshot traffic, so authoritative room workers are the better trade.

## Required production configuration

Copy `.env.example` to an unsynchronised deployment environment or secret
manager. Never commit the filled file.

- `GAHOOKZ_PUBLIC_ORIGIN` is the canonical HTTPS browser origin.
- `GAHOOKZ_TRUST_PROXY=1` is valid only when Node is loopback/private and every
  request passes through the owned proxy.
- `GAHOOKZ_HTTPS=1` enables HSTS and `Secure` account cookies.
- `GAHOOKZ_DATABASE_URL` supplies PostgreSQL. Set
  `GAHOOKZ_REQUIRE_POSTGRES=1` for a public deployment so the service refuses to
  boot with ephemeral accounts.
- `GAHOOKZ_DATABASE_SSL=1` requires verified TLS to a remote database. A local
  private database may use `0`.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` enable login. Register exactly
  `${GAHOOKZ_PUBLIC_ORIGIN}/auth/google/callback` in the Google Web OAuth client.
- `GAHOOKZ_METRICS_TOKEN` is a long random bearer for a private metrics scraper.
  With no token, `/api/metrics` returns not found.
- Give every process a unique `GAHOOKZ_INSTANCE_ID`.

Google login fails closed when configuration is incomplete. Guest rooms remain
available. Identity comes only from a verified authorization-code exchange with
PKCE, state, nonce, issuer/audience/expiry checks, and the provider signature.
The browser receives an opaque `HttpOnly`, `SameSite=Lax`, `Secure` session;
neither identity claims nor purchase/entitlement flags are accepted from the
client.

## Database and account data

`infra/postgres/001_accounts.sql` creates:

- accounts and provider identities keyed by Google `sub`;
- hashed opaque sessions with expiry;
- twelve career aggregates plus idempotent per-match result rows;
- store-neutral entitlement grants;
- up to twelve numbered custom-Gahook configurations.

Every account starts with one cloud custom-Gahook slot. Active
`custom_gahook_slot` entitlement quantities add slots, capped at twelve. A
future store webhook must verify the store signature and transaction server-side
before writing an entitlement; the client must never grant one.

Back up PostgreSQL on a tested schedule, encrypt backups, and rehearse restore.
Account deletion should run as one database transaction by deleting the account
row; foreign keys cascade identities, sessions, stats, entitlements, cosmetics,
and match rows. Add owner-approved privacy/retention terms and a user-facing
export/deletion workflow before public account promotion.

## Admission and transport controls

Production mode enforces bounded token buckets for source addresses, actors,
room creation, and event-ticket issuance. It caps total, per-address, and
per-room SSE connections. Request bodies are byte-bounded JSON, mutation/event
requests must be same-origin, protected-room passwords use `scrypt`, internal
errors are not returned, and standard CSP/frame/referrer/MIME/permissions
headers are applied.

The current limits are conservative defaults, not universal truth. Tune them
from p95/p99 traffic and rejection metrics; do not simply raise them after an
incident. Put an edge request/body limit and basic DDoS service in front of
Nginx. Do not trust arbitrary forwarded-address headers.

User-created text, drawings, images, audio, and custom Gahooks are bounded.
Since 2026-09-06 the host can also remove individual content —
`POST /api/host/remove-content` handles a chat message, a Herd answer, one
player's uploaded media, or a submitted question — and players can report
privately to the host with `POST /api/player/report`. Removed chat leaves a
tombstone rather than silently reshuffling the conversation, and kicking a
player blanks their Herd answers.

Automated abuse scanning, appeals, evidence retention, and an operator
moderation console still do not exist. Those remain launch gates for an open
anonymous audience; they are not required for invited play, where the host is
present and holds the controls.

## Health, metrics, deploy, and rollback

- `/api/health` is a liveness/build check and reports schema, release,
  account-repository state, and — since 2026-09-05 — the Git `revision` baked
  into the image, `serverBuiltAt`, `instance`, `draining` and `activeRooms`.
  The browser `release-...` hash covers only `standalone/public`, so `revision`
  is the only reliable way to tell which server code is running.
- `/api/ready` returns 503 while draining or at local room capacity.
- `/api/metrics`, when bearer-authorised, exposes aggregate room/player/SSE,
  mode, memory, and uptime gauges without room codes or player data.
- Responses include `X-Gahookz-Instance`, which makes affinity failures visible
  in browser/network traces.

Alert on readiness failures, restarts, event-stream saturation, room-capacity
pressure, memory growth, PostgreSQL errors, elevated 4xx/5xx, and login callback
failures. Logs currently go to bounded Docker JSON files. Before high traffic,
replace ad-hoc console logs with structured redacted events and centralise them;
never log room passwords, player credentials, session cookies, OAuth codes, raw
media, or email addresses.

Build immutable images, run `npm run check` and `npm test`, deploy one shard at a
time, wait for health, run security/game smokes against the candidate, and keep
the prior image digest for rollback. Because rooms are process-local, schedule
or visibly announce drains until room migration exists.
