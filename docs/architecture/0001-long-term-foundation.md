# ADR 0001: Long-term foundation for Gahookz

- Status: accepted
- Decision date: 2026-08-10
- Scope: maintainability, browser build, styling, room authority, scale, identity,
  persistence, and paid-entitlement readiness

## Context

Gahookz is already a working React party game with a distinctive visual style
and unusually broad social features. Its main maintainability risks are not a
lack of features or a lack of a CSS framework. They are three monoliths
(`standalone/server.js`, `standalone/public/app.jsx`, and
`standalone/public/styles.css`), unvalidated network data, process-local rooms,
bearer credentials in URLs, no durable identity store, and no deterministic
game-engine boundary.

The current smoke suite is valuable and passed in full against a disposable
server before this decision was implemented. The migration must preserve that
behavioural baseline while improving boundaries incrementally.

## Research findings

### TypeScript and build tooling

TypeScript is a strong fit because it preserves JavaScript runtime behaviour,
supports gradual JavaScript migration, and can enforce strict null and implicit
`any` checks. TypeScript's migration guide explicitly supports `allowJs`, while
its strictness guidance recommends strict mode for new typed code. Types do not
validate runtime network input, so schemas are required at HTTP/SSE and storage
boundaries.

React's current guidance recommends a supported build tool such as Vite when a
framework is not appropriate. Gahookz is a client-heavy, room-code SPA; it does
not currently benefit enough from SSR or React Server Components to justify a
full-stack React framework. Vite supports React, TS/TSX, CSS modules, code
splitting, dependency optimization, and standards-based CSS. Migrating the
custom browser build is worthwhile, but only after typed contracts and source
module boundaries exist; doing it first would combine too many failure modes.

Decision:

1. Add strict TypeScript and runtime contracts immediately.
2. Convert pure leaves and split monoliths incrementally.
3. Move the browser build to Vite after source boundaries are stable.
4. Keep the server as modern Node ESM; do not introduce an SSR framework.

### CSS framework

A utility framework would require rewriting thousands of existing declarations
and JSX class strings while risking the game's strongest asset: its recognizable
visual identity. It would not solve the current cascade size or component
ownership problem by itself.

Vite supports native CSS modules and recommends modern CSS variables and
standards-compatible CSS. The safer route is:

1. define design tokens for colour, spacing, type, motion, elevation, and radii;
2. add cascade layers (`reset`, `tokens`, `base`, `components`, `utilities`,
   `overrides`);
3. split styles by feature as components move out of `app.jsx`;
4. use CSS modules for new/extracted components and keep a deliberately small
   global layer;
5. retain semantic reusable utility classes only where they already help.

Decision: do not adopt Tailwind, Bootstrap, or a component skin. Adopt native
CSS tokens, layers, modules, linting, and component ownership incrementally.

### Browser-hosted / peer-hosted rooms

WebRTC data channels can carry encrypted peer-to-peer application data, but a
production connection still needs an application signaling service plus
STUN/TURN infrastructure. Some network paths must relay through TURN, so
peer-to-peer does not eliminate server bandwidth or operations. The WebRTC
specification also notes that peers expose network-address information to one
another.

Making the host browser authoritative would create additional product risks:

- closing, suspending, backgrounding, or losing the host device ends the game;
- mobile browsers are especially unsuitable as durable authorities;
- every client must trust host-provided scoring, stats, entitlements, and bans;
- host migration requires state transfer, election, replay protection, and
  split-brain resolution;
- moderation/audit evidence becomes incomplete;
- peer IP/network metadata is exposed;
- a signaling and TURN service is still required.

That trade can be sensible for latency-sensitive action games, LAN/offline
play, or products where server cost dominates trust. Gahookz sends small,
low-frequency commands and state snapshots, while requiring trustworthy
scoring, accounts, moderation, and future purchases. Server authority is the
better fit.

Decision:

1. Keep the host UI as a privileged controller, not the room authority.
2. Extract a deterministic room engine and run one authoritative worker per
   room.
3. Add explicit room affinity and graceful draining before multiple nodes.
4. Consider a managed per-room primitive such as Cloudflare Durable Objects or
   a sharded Node worker only after measured load proves the current service is
   the bottleneck.
5. Keep WebRTC as a possible future LAN/offline experiment, not the public
   source of truth.

Cloudflare documents Durable Objects specifically as single coordinators for
chat rooms and multiplayer games, with hibernating WebSockets and durable
storage. It is a credible future deployment target for a pure room engine, but
adopting it now would couple the migration to one provider. The engine must be
platform-neutral first.

### Accounts and authentication

Guest play is a core advantage and must remain account-free. Durable accounts
are useful for career stats, cross-device cosmetics, purchase recovery,
moderation, and extra custom-Gahook slots.

Google documents OpenID Connect and recommends Google Identity Services for web
sign-in. The server flow lets the backend validate identity; it requires a
Google Cloud project, client credentials, redirect URIs, and consent-screen
configuration. OWASP recommends OIDC for authentication, validating issuer,
audience, signature and expiry, and keeping session credentials out of
`localStorage`. Sessions should use meaningless, high-entropy identifiers in
`HttpOnly`, `Secure`, appropriately `SameSite` cookies with server-side state.

Decision:

1. Implement an identity-provider-neutral account model with Google OIDC as the
   first provider.
2. Use authorization-code flow with PKCE/state/nonce and server-side callback
   validation; never accept a client-asserted email or purchase flag.
3. Store only the provider subject as the stable external identifier; email and
   display name are mutable profile attributes.
4. Use opaque server-side sessions in secure cookies.
5. Keep room guest credentials separate from account sessions.
6. Use PostgreSQL in production for accounts, sessions, career aggregates,
   match/stat events, entitlements, verified transactions, and moderation/audit
   records.
7. Do not use Node's built-in SQLite for production yet: the Node 24 API is
   still marked release candidate. An in-memory repository is acceptable only
   for deterministic tests; development should use the same PostgreSQL schema
   through Compose.

Google login cannot become live until the owner supplies an OAuth client ID and
secret through unsynced deployment secrets and registers the production/dev
redirect URIs. The application must fail closed and keep guest play available
when those settings are absent.

### Security and mass adoption

Before broad promotion, the following are release gates rather than optional
polish:

- runtime validation and correct 4xx errors for every request;
- secure cookies or short-lived stream tickets instead of credentials in URLs;
- per-IP and per-room admission/command/SSE limits;
- explicit allowed origins/hosts and standard security headers;
- host moderation for text, images, audio, drawings, and custom Gahooks;
- structured redacted logs, readiness/draining, metrics, and immutable rollback;
- account/privacy/community/legal documents and deletion/retention operations;
- deterministic simulations and browser/accessibility/device testing.

## Target repository shape

The migration target remains:

```text
apps/
  web/                 React TypeScript PWA
  server/              authoritative Node TypeScript service
packages/
  contracts/           runtime schemas and shared DTOs
  game-engine/         deterministic commands/transitions/scoring
  client-data/         typed API/SSE/session adapter
  ui/                  shared components and design tokens
  content/             prompt libraries and metadata
  accounts/            account/session/stat repository contracts
  entitlements/        store-neutral product and unlock rules
docs/
  architecture/        decisions and diagrams
  product/             candid reports and research
infra/                 deployment, proxy, database, monitoring
```

npm workspaces are sufficient. Do not add a second package manager or a
monorepo orchestrator until actual build times justify one.

## Delivery sequence

1. Baseline and architecture decision.
2. Strict TypeScript configs, pinned tooling, contracts, runtime schemas.
3. Convert pure scoring/game helpers and build the deterministic engine.
4. Typed transport, secure sessions, validation, limits, and observability.
5. PostgreSQL accounts/stats/entitlements plus optional Google OIDC.
6. New Herd on the shared engine and Quiz-shaped UI.
7. Component/style split, redesigned tutorials, stateful audio/music, and
   post-game continuity.
8. Large deterministic simulations, load/security/accessibility tests, bug
   fixes, and the final candid report.
9. Standard Vite build and final workspace move once typed boundaries are
   stable, unless an earlier migration becomes necessary for component work.

## Sources reviewed

- TypeScript migration guide:
  <https://www.typescriptlang.org/docs/handbook/migrating-from-javascript.html>
- TypeScript strictness guidance:
  <https://www.typescriptlang.org/docs/handbook/2/basic-types.html#strictness>
- React, building from scratch and supported build tools:
  <https://react.dev/learn/build-a-react-app-from-scratch>
- React, adding React to an existing project:
  <https://react.dev/learn/add-react-to-an-existing-project>
- Vite features, TypeScript and CSS modules:
  <https://vite.dev/guide/features.html>
- W3C WebRTC recommendation:
  <https://www.w3.org/TR/webrtc/>
- WebRTC peer connection/signaling guidance:
  <https://webrtc.org/getting-started/peer-connections>
- WebRTC ICE/TURN connectivity overview:
  <https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Connectivity>
- Cloudflare Durable Objects WebSocket guidance:
  <https://developers.cloudflare.com/durable-objects/best-practices/websockets/>
- Google OpenID Connect guidance:
  <https://developers.google.com/identity/openid-connect/openid-connect>
- OWASP authentication guidance:
  <https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html>
- OWASP session-management guidance:
  <https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html>
- Node 24 SQLite API status:
  <https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html>

## Consequences

This path takes longer than a rewrite that merely compiles, but it keeps the
game playable after each phase and creates trustworthy boundaries for scaling,
accounts, paid cosmetics, and additional modes. It deliberately avoids three
expensive distractions: peer-host authority, a visual-framework rewrite, and
premature multi-node infrastructure.
