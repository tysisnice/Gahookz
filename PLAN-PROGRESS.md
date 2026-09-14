# Overhaul progress — read this before continuing the plan

**Purpose.** `IMPLEMENTATION-PLAN.md` is the approved scope. This file is the
running answer to "where did we get to, and what is safe to assume". Read both
before doing anything; read this one first, because the plan describes intent
and this describes what actually happened.

**Branch:** `overhaul/quiz-herd-p00-p12`
**Base:** `81a70d2` — the review base the plan names
**Production:** untouched for the whole plan. `gahookz.com` still reports
revision `815c7e494bef`.

---

## Stage status

| Stage | Status | One-line summary |
| --- | --- | --- |
| P00 | ✅ | One Syncthing-artifact rule; 15 conflict copies reconciled and archived |
| P01 | ✅ | Canonical `gameFamily`/`quizScoring`; typed network adapter; fixture corpus |
| P02 | ✅ | Herd answer colours no longer identify authors; tie reasons truthful |
| P03 | ✅ | Two-game selector, Majority as a toggle, saved bank, locked rules |
| P04 | ✅ | Host Lobby rules dialog; server-enforced Gahook effects and arena policy |
| P05 | ✅ | Shared prompt catalogue, 40 new prompts, safe `{Player1}` substitution |
| P06 | ✅ | Herd is short — 20 players play 8 rounds; writing load spread ≤ 1 |
| P07 | ✅ | Career results survive a database outage via a durable journal |
| P08 | ✅ | Idle polling removed, SSE backpressure, asset revalidation |
| P09 | ✅ | Phase progression as a pure decision; authorisation stated as data |
| P10 | ✅ | Reveal is its own feature; honest scoring copy; browser harness |
| P11 | ✅ | Fast start keeps player work; arena is findable; public page is for players |
| P12 | 🟡 | Automated half done. Human, device and real-database gates outstanding |

Every stage's own handoff entry, with full detail, is at the bottom of
`IMPLEMENTATION-PLAN.md` in reverse date order.

---

## How to verify anything

Each suite needs its **own fresh** disposable server on port 3199. Reusing one
process across batches fails on the 32-room cap rather than on a defect, which
looks like a bug and is not.

```bash
npm run clean:generated && npm run build   # never `rm client/*.js` — that deletes source
npm run check                              # typecheck, unit tests, build
npm test                                   # 24 smoke scripts
npm run test:rooms                         # 12 complete games
npm run test:browser                       # 16 checks in real Chromium
npm run drill:resilience                   # 4 failure drills
```

Current state at `d0a7f5b`: **167 unit tests, 24 smoke scripts, 12 games, 16
browser checks, 4 drills — all passing.** The production image builds, starts,
and passes all 16 browser checks when serving the client itself.

---

## Things a future session must not rediscover the hard way

These cost time once already.

- **`standalone/public/client/*.js` mixes generated output with hand-written
  source.** `audio.js` and `gahook-forms.js` are source. Use
  `npm run clean:generated`, never `rm *.js`.
- **`tsconfig.web.json` does not type-check `.jsx` at all**, and esbuild
  transforms each file without resolving globals. A deleted top-level constant
  passes every check and throws on first render. A regex guard for this was
  written and then deleted because it did not work — JSX prose containing an
  apostrophe breaks any regex that strips string literals.
- **Everything under `packages/` must stay within erasable TypeScript syntax.**
  Production runs plain `node`, which strips types by erasure only. Parameter
  properties, `enum` and `namespace` parse under `tsx` and then fail at
  container start-up. `erasableSyntaxOnly` now catches this at typecheck.
- **Source-string assertions pinned to `app.jsx` break whenever code moves.**
  Four tests needed the same fix: scan every shipped browser module instead.
  Expect to do it again on the next extraction.
- **Two browser tabs in one profile share `localStorage`** and are treated as
  the same device. A second player in a browser test needs its own context.
- **The room cap is now `GAHOOKZ_MAX_ACTIVE_ROOMS`**, defaulting to 32. The beta
  site runs with 2.

---

## Deliberately not done, and why

Not omissions — decisions, each recorded where the work is.

- **P09's full server decomposition.** The 274-line `handleRoomAction` and its
  ~60 handlers stay in `server.js`. They close over module state in a
  5,000-line file. The stage was checked off on its verifiable goals; this part
  is better done behind the browser harness now that one exists.
- **P11 step 3, the arena rematch and cheers.** The plan gates it on observing
  the current arena first and permits explicit deferral. Building it on a guess
  about whether waiting feels long is the speculative work the plan warns
  against. The arena is now discoverable, which is what makes observation
  possible.
- **Both proposed scoring changes.** Evaluated with worked examples in
  `docs/architecture/0003-scoring-alternatives.md`, neither adopted. A guard
  fails if shipped scoring changes at all, so neither can arrive by accident.
  Recommendation if one is taken: the authored-point denominator.

---

## What is waiting on you

The full list with reasoning is in `RELEASE-CANDIDATE.md`. The short version:

1. **Play it.** No human has. The testing script is in your Vault at
   `Gahookz-Beta-Testing.md`.
2. **A phone.** No physical iOS or Android device has opened it.
3. **A screen reader.** The accessibility work is structural and reasoned
   about, never heard.
4. **A real PostgreSQL**, if accounts matter. The career outbox has only run
   against the in-memory repository.
5. **Decide the denominator question** in `docs/architecture/0003`.

---

## Beta site

**Live at https://beta.gahookz.com.** Same build as production, open to anyone,
no login, **two rooms at a time**, no database so nothing durable to lose.
Container `gahookz-beta` on `127.0.0.1:3103`.

Its TLS certificate was issued with certbot's Cloudflare DNS plugin, which the
Nginx Proxy Manager container already carries, using the same token that runs
the DDNS updater. The proxy host is a hand-written config
(`/data/nginx/proxy_host/beta-gahookz.conf`, copy in
`deploy/nginx/beta.gahookz.com.conf.example`) because creating one through the
NPM UI needs admin credentials. **It therefore does not appear in the NPM UI and
NPM will not renew its certificate**, which expires 2026-12-13. Recreating the
host in the UI before then hands both back to NPM; delete the file if you do.

---

## When you come back

Say *"read the plan and the progress file, then continue"*. The next work,
in the order I would take it:

1. Act on whatever the playtest turns up. That is the point of the pause.
2. P12's remaining gates, as they become passable.
3. P09's server decomposition, now that a browser harness makes it safe.
4. P11 step 3, if the arena observation says waiting is worth fixing.
