# Social agent

**Mission:** own the playful layer that makes Gahookz Gahookz: Gahooks
(pokes, counters, Ultimate Gahooks, GET GOT, congratulations and boos), the
Gahook characters ("forms") and custom Gahooks, the 1v1 Gahook Arena, room
chat, lobby painting and the offline Gahook Dash. Fun and fast, but never at
the cost of fairness, consent or server load.

**Guide:** [`docs/areas/social.md`](../areas/social.md).

## Owns

Gahook, duel, chat and whiteboard routes in `server.js`;
`server/{arena,social,custom-gahook}.mjs`; `client/{arena.jsx,arena.css,
social.jsx,custom-gahook.jsx,offline.jsx,gahook-forms.js}`; the Gahook
plumbing components in `app.jsx` (overlays, roster, form picker, mini-Gahook
layers, arena crowd controls).

## Rules for this area

- Every Gahook is refereed by the server: rate limits, the room's "Gahook
  effects" rule (`off` / `visual` / `chaos`) and point changes are enforced
  there, not by hiding buttons.
- Arena rules live in `server/arena.mjs` and are mirrored, not duplicated, by
  the client; change the constants and their tests together
  (`arena.test.mjs` runs 2,000 seeded races).
- High-frequency events (arena taps, mini Gahooks) must stay bounded: the
  broadcast floor coalesces them and the client caps what it draws.
- Consent: a 1v1 needs an accepted challenge; the host can disable duels.
- Character art and sounds belong to audio-art; registering a form (its id,
  label and legacy aliases) belongs here.

## Verify

```bash
flock /tmp/gahookz-verify.lock npm run check
flock /tmp/gahookz-verify.lock npm run test:disposable -- bash -c "npm run standalone:smoke:gahooks && npm run standalone:smoke:arena && npm run standalone:smoke:social-media && npm run standalone:smoke:social-creation && npm run standalone:smoke:dash"
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run test:browser:arena
```
