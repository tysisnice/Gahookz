# What this device remembers — P01 step 6, the storage half

Date: 2026-10-23. Branch `agent/session-storage`, worktree
`Projects/gahookz/worktrees/session-storage`, from `main` at `09201a2`.
Requested by Tyson: "go ahead with the session storage half". No deploy, no
container or infrastructure change.

Companion to [the snapshot adapter](../2026-10-23-snapshot-adapter/README.md),
which did the other half of the same step earlier today.

## What step 6 asks for, and what was left

> Extract API, **session storage**, SSE, server-clock offset and snapshot
> dispatch into a typed browser adapter … Support timeouts, cancellation,
> credential redaction, one subscription per view, stale response/version
> rejection, and **safe unknown/malformed data handling**.

Storage was the last item not extracted. Four things lived untyped and
untestable in `app.jsx`: the credential that *is* this player
(`gahookz-client-key`), the name and look they last joined with
(`gahookz-last-join`), a room's password (`sessionStorage`, per room), and the
`?pwd=` link an older release used to write. `net.ts` even declared a
`StorageLike` interface for it that nothing ever implemented — that type was
deleted this morning rather than left implying work that had not happened.

This is data the code did not write. Another release wrote some of it, months
ago, possibly in a different shape; the person can edit all of it; and a
browser is free to answer every read with an exception.

## Measured first, on the real client

Three scenarios, a real browser, a real room, the disposable server.

| Scenario | `main` at `09201a2` | This branch |
| --- | --- | --- |
| A legacy `/CODE?pwd=SECRET` link | address scrubbed, password in `sessionStorage` only — already correct | unchanged, now guarded |
| A saved join whose `name` is the number `12345` | **`w.trim is not a function`, and a blank page**: no join form, no message, no way back but clearing site data | join form renders, player joins, the junk is cleared out |
| A browser with site data blocked | **1,001 distinct player keys from one tab**, screen stuck on "Joining" for ever | **1** key, player reaches the lobby |

The second and third are the findings.

**A blank page from one stored value.** `getSavedJoin` parsed whatever was in
`gahookz-last-join` and handed it straight to the screen, so a `name` that was
not a string threw during render. Nothing recovers from that: the join form is
what you would use to fix it.

**Guest play was impossible with storage switched off.** `getClientKey()`
caught the storage failure and returned a *fresh* `"player-" + Date.now() +
Math.random()` — and it is called on every render and every command. Each call
was therefore a different person. The room accepted the join (one of those
thousand identities) and the tab could never prove it was that player again, so
it asked again, and again: 1,001 credentials in a few seconds, and a self-
inflicted request storm to go with them. CLAUDE.md's first rule is that guest
play must never require an account; a browser setting that blocks site data is
not an account, and it made the game unplayable.

## Changes

| Change | Where |
| --- | --- |
| `standalone/public/client/session.ts` — the typed device-storage boundary. Takes a store *provider* rather than reaching for one, so which store a value lands in is decided in the open, and a test can hand over one that throws | new |
| `sanitiseJoin` — a saved join is rebuilt field by field from the five fields the app can use, so an unknown key cannot survive a round trip and a value that is not the string it claims to be is dropped | same |
| A picture is kept only if it is a `data:` image. The server already refuses anything else, so a stored `http://…` could only ever have put a stranger's URL in front of the room | same |
| A record that is not what this version writes is **rewritten**, so a `password` an older release stored durably is gone from the device rather than ignored on the way past | same |
| `readClientKey(local, createId, memory)` — a key the browser will not keep is held for the life of the page | same |
| `readUrlPassword` / `urlPasswordFor` — a legacy link's password is taken out of the address and offered **only to the room that link named** | same |
| `normaliseRoomCode` moves here, where the storage keys and the router both read it from one place | same, `app.jsx` |
| Nineteen unit tests (289 → 308 overall) | `standalone/public/client/session.test.ts` |
| `browser-session-storage.mjs` — the three measured scenarios as assertions on the real client | new, `npm run test:browser:session` |
| The password tripwires follow the code to its new home, and a new rule: only `session.ts` may name these three keys | `smoke-security.mjs`, `smoke-regressions.mjs` |
| A new client module has five registration points; all five are wired | `build-client.mjs` (generated list, versioned import, transform), `dev.mjs` watcher, `.gitignore`, `service-worker.js` shell cache |

### Decisions worth knowing

**The password scoping is new behaviour.** A `?pwd=` that arrived for one room
used to be offered to every room the tab visited afterwards. It is now offered
to its own room only — and a link that names no room keeps the old behaviour,
because there is nothing to disagree with and refusing it would lock someone
out of a room they have a working link for. The room code comes from the
router, not from a second reading of the path: `/host/ABCD` and `/ABCD/player`
are both room ABCD, and guessing that twice is how two readings drift apart.

**Two call sites were handing a password to the saved join**, which then
discarded it. The discard was the only thing keeping a room password out of
durable storage. The callers no longer pass it, and the discard stays as the
guard it should always have been.

**The quota case was measured and left alone.** A nearly full `localStorage`
loses only the remembered name, and the join still works; there is no measured
failure to justify a retry path.

## Non-vacuity: ten mutations, applied one at a time

Each applied to real source, run, and restored by copy; `md5sum` confirms the
tree. All ten caught.

| # | Mutation | Caught by |
| --- | --- | --- |
| S1 | A saved join is copied rather than rebuilt | *keeps only the five fields the app can use* (+4 more) |
| S2 | Any value coerced to a string | *a name that is not a name is dropped* |
| S3 | A bad record ignored instead of wiped | *a password … is wiped from the device, not just ignored* |
| S4 | Any picture accepted | *a picture that is not a picture is dropped* |
| S5 | The key forgotten when storage refuses | *a browser that keeps nothing still gets one player key* |
| S6 | The room password written to `localStorage` | `smoke-security`: *Room passwords must be tab-scoped* |
| S7 | A link's password offered to any room | *offered to its own room and to no other* |
| S8 | The password left in the address | *a password in a link is taken out of the address* |
| S9 | The name cap removed | *cannot exceed what the server accepts* |
| S10 | The join written straight through | *written field by field, so a password cannot ride along* |

The browser suite was proved the same way, against `main`'s client, where it
fails at **"Timed out waiting for: a usable join form — screen reads """** —
the blank page, exactly as measured. Its third case is non-vacuous by the same
measurement: `main` sends 1,001 credentials where the suite asserts one.

## Gates

Node 24.22.0 throughout.

| Gate | Result |
| --- | --- |
| `npm run typecheck` | clean, strict |
| `npm run test:unit` | **308/308** (289 before) |
| `npm run build` | `release-eb981898735f10fb` |
| `npm test` (full chain, disposable 3199) | exit 0 |
| `npm run test:browser` | 18 checks |
| `npm run test:browser:navigation` | green, including `/host` and `/play` versus `/HOST` |
| `npm run test:browser:session` | 7 checks, new |
| `npm run docs:check` | 113 files |

## Limits

- **Private browsing on a real iPhone is not what this measures.** The blocked
  case is simulated by making every write throw, which is what the browsers
  that do this do; iOS Safari's own behaviour has changed over the years and
  only a device can settle it. It is on the human-evidence list.
- **A credential that cannot be stored still does not survive a refresh.**
  Nothing can, if the browser keeps nothing. The room is playable for the life
  of the page, which is the guarantee that was missing.
- **Client-side picture validation is defence in depth, not a security fix.**
  The server stores images as room assets and refuses anything that is not a
  `data:` image, so a hostile saved join could not have reached other players.
- **The schemas still do not run in the browser.** This step's "safe unknown
  data" is now handled at both boundaries — storage and the network — but as
  shape checks, not as `PublicSnapshotSchema`. That choice is in the backlog.
- **Nothing was deployed.** Production is still `74a489949e02`.
