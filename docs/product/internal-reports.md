# Internal product reports

These were published on the public `/information` page alongside the player
guides. They are internal: a product roadmap, release gates, a monetisation
model and server operating detail are for whoever runs Gahookz, not for
somebody who joined a room to play a game.

Moved here verbatim in substance, by P11 step 4. The player-facing mode guides
stayed on `/information`, and the old report URLs still resolve — they explain
where the content went rather than 404ing.

Worth being precise about what this is and is not: moving an operations page
out of the app is **information architecture, not access control**. Nothing
here was secret, and nothing here was a credential. It was simply in the wrong
audience's way.

---

## Product roadmap

**Protect the successful friend-group experience while making it understandable
and operable for strangers.** The order matters: prove the three-mode loop with
real groups, then add the safety and operations needed for public reach.

### Now: evidence and safety

- **Observe all three modes.** Run coached and uncoached sessions at 3, 4, 8,
  12 and 20 players; time every phase and record where first-time players
  hesitate.
- **Moderate creation.** Text filtering, reporting, operator review and clear
  image/audio rules before open anonymous acquisition.
- **Instrument the funnel.** Room creation, join failure, creation completion,
  reconnects and round completion, without collecting unnecessary personal data.
- **Exercise failure.** Load-test real SSE rooms; rehearse worker loss,
  database restore, affinity mistakes, drains and rollback.

### Next: repeatable public sessions

- Curated and rated prompt packs for Family, Party, Education and seasonal events.
- Reconnect and maintenance messaging that explains process-local active rooms.
- Shareable post-game summaries that do not expose private room content by default.
- Formal accessibility testing on keyboard, screen reader, colour, motion and small screens.
- A privacy-respecting account export/deletion flow and store-verified entitlement webhook.

### Later: platform expansion

- The installable web app remains the common cross-platform client.
- A Steam host edition can wrap the party display with premium expression tools.
- Mobile companions can improve camera, sharing and purchase recovery without
  splitting the room protocol.
- A pure room engine can move to sharded workers or a per-room authority only
  after measured load justifies it.

---

## Public launch checklist

**Suitable for invited groups now; an open public launch still needs an abuse
and operations layer.** User-created text, drawings, images and audio make
moderation a product requirement rather than an optional setting.

### Required before broad promotion

| Priority | Area | Requirement |
| --- | --- | --- |
| P0 | Content safety | Profanity/hate filtering, image and audio rules, reporting, host removal, bans, evidence retention, a documented response path. |
| P0 | Privacy and legal | Plain-language privacy, terms, community rules, age positioning, contact details, retention rules, copyright/takedown handling. |
| P0 | Operational reliability | Central redacted logs, alerting, drain/rollback procedures, TLS renewal checks, PostgreSQL backups, a visible status path. |
| P1 | Accessibility | Keyboard-only flows, focus order, screen-reader announcements, reduced effects, colour-independent status, tested touch targets. |
| P1 | Public onboarding | Clear best-player counts, sample prompts, and recovery from wrong links, full rooms, reconnects and interrupted hosts. |

### Release gates

- Measured 20-player room and concurrent-room load tests pass with the
  production proxy and PostgreSQL.
- No critical path depends on a third-party CDN.
- A complete game is tested on current Chrome, Safari and Firefox plus
  representative iOS and Android devices.
- Hosts can understand and use moderation without reading documentation.
- Failure drills cover process loss, affinity mistakes, database restore and
  deployment rollback.
- At least three fresh groups complete Quiz, Majority Rulz and Herd without
  developer coaching.

---

## Fair monetisation

**Sell expression and host convenience, never competitive power.** Gahookz is
funniest when everyone feels equally able to participate.

| Surface | Model | Detail |
| --- | --- | --- |
| Web | Free core | Guest joining and all three modes stay free. Sell durable custom-Gahook slots, cosmetic packs and host presentation themes through optional accounts. |
| Steam | One-time host edition | Polished shared-screen controls, offline practice and a cosmetic allowance, keeping cross-platform room access. |
| Mobile | Free companion | Improve camera, sharing and purchase recovery; direct, clearly priced cosmetics if demand supports them. |
| Groups | Host subscription | Larger rooms, reports, moderation, brand controls and curated workplace or education packs — never player access. |

**Entitlement foundation.** Signed-in accounts currently receive one cloud
custom-Gahook slot. Server-side entitlement quantities can expand that to
twelve; a future store must verify every transaction before granting it.

**Rules worth keeping.** No loot boxes, random paid rewards, energy timers or
limited lives. No paid score boosts, stronger sabotage or host priority. No
full-screen ads during a room. Let guests see premium expression used by owners.
Require an account only for durable stats, purchases and cloud creator libraries.

---

## Hosting and operations

**The server, not the host browser, is the room authority.** That is the right
trust model for scoring, accounts, moderation and purchases, but active rooms
remain process-local and need careful draining.

### Current shape

- Maximum 20 players per room and 32 active rooms per process.
- Live state uses bounded commands and Server-Sent Events with opaque, scoped,
  single-use stream tickets.
- Nginx can consistently route a non-secret room code to one of several
  independent Node workers.
- Room state and uploaded room media remain in the owning worker; replacing it
  ends those active rooms.
- PostgreSQL persists optional accounts, career statistics, entitlements and
  custom slots across workers.
- Health, readiness and token-protected metrics expose deployment state without
  room or player data.

### Operational priorities

1. **Measure.** Load-test the real command, media and SSE mix; tune capacity and
   admission limits from p95/p99 evidence.
2. **Drain.** Stop assigning new rooms to a worker and wait for its active-room
   gauge to reach zero before replacement.
3. **Keep the origin private.** Expose only Nginx, trust forwarded addresses
   only from that proxy, keep PostgreSQL private.
4. **Scale deliberately.** Add a room coordinator or move the pure engine to a
   per-room primitive only when measured demand justifies live migration.

See `docs/operations/production-readiness.md`, `Dockerfile`, `compose.yaml`,
`infra/postgres` and the SSE-safe Nginx example. Browser or peer hosting is
deliberately not the public scale plan.

---

## About these reports

**These are implementation audits, not claims from a controlled user study.**

### Evidence used

- Client and server implementation, including phase timers, scoring,
  eligibility, account attribution and failure handling.
- Desktop and phone-sized browser review of the welcome experience.
- Automated flows for Quiz, Majority Rulz, Herd, roles, security, media,
  onboarding, finales and deployment.
- Seeded simulation of 15,000 games and more than 1.7 million answers, choices
  and votes.

### Evidence still needed

- Observed sessions with first-time players who did not watch the game being built.
- Timed sessions at 3, 4, 8, 12 and 20 players.
- Accessibility sessions using keyboard, screen reader and reduced motion on real devices.
- Public-room moderation exercises with intentionally difficult content.
- Production load, reconnect, failure, backup and rollback exercises.
- Consent-aware funnel and retention data.

Priorities marked P0 block safe public growth. P1 items materially improve
fairness, clarity or retention. Revisit both social-mode guides after their
first uncoached group playtests.
