# Verification — the role and phase privacy contract, as executable cases (2026-10-21)

Branch: `agent/privacy-moderation-contract` (from `main` @ `273a372`), worktree
`/mnt/storage/syncthing/Store/Projects/gahookz/worktrees/privacy-moderation-contract`.
Roadmap section 2, items 1 and 2. Node 24.18.0 throughout.

## Why this block exists

The privacy rules were already correct in the code. They were close to
untested: of the twenty host-only routes, **two** had a test that proved they
refuse a non-host (`kick` and `remove-content`), and **nothing** inspected an
SSE frame, which is the payload the browser actually lives on. P02 step 3 asks
for every role-filtered payload to be inspected "not only the main snapshot".
That is what was missing, so that is what was built — not a change of
behaviour.

## What changed

- `standalone/smoke-privacy-contract.mjs` — new HTTP suite, in the shared smoke
  chain between `security` and `mode-settings`. Five sections, described below.
- `standalone/server.js` — removed a repeated `namedPlayerNames` key in
  `publicHerdAssignments`, the payload behind the host's Herd review list. Both
  copies held the same expression, so nothing behaved differently; the second
  line was dead and had the indentation of a merge that kept both sides.
- `standalone/server-duplicate-keys.test.mjs` — rewritten. The old guard sliced
  one named function out of `server.js` by counting braces and checked the keys
  of its own `return {`. That is why it could not see the duplicate above,
  which sits two objects deep inside a `.map`. It now scans **every object
  literal in every source file we own**, at any depth.
- `package.json` — `standalone:smoke:privacy-contract`, and the chain entry.
- Docs: this record, `docs/CHANGELOG.md`, `docs/history.md`, `docs/backlog.md`,
  `docs/HANDOFF.md`, `docs/ROADMAP.md`, `PLAN-PROGRESS.md`,
  `docs/areas/quality.md`, `docs/areas/game-flow.md`.

## What the suite asserts

1. **Host authority.** The route list is imported from
   `server/route-policy.mjs` rather than retyped, so a new host route joins the
   matrix by existing. Each of the twenty routes is called by four impostors —
   an ordinary player, a stranger with no seat, no credential at all, and a
   player who also claims `role: "host"` — and each call must be refused with
   HTTP 400, `ok: false`, the host gate's own words ("Only the host can do
   that."), and a body carrying nothing but those two fields. The exact message
   matters: a route that happened to fail on a missing argument would otherwise
   pass for the wrong reason and hide a missing check. 80 refusals in all.
2. **The `role` string is a layout hint, never a grant.** The same player
   credential asking as `host`, `room`, `party`, `guest` and `admin` receives
   an identical moderation surface and identical ownership of answers. The host
   credential receives the review list; nobody else does.
3. **Writing is private.** Each writer's own assignments are only ever their
   own. Each writer's answer carries a nonce, and that nonce must be absent
   from the whole JSON payload of every other viewer — another writer, a party
   screen, a stranger — while present for its author and for the host, who has
   to be able to moderate it.
4. **The event stream is filtered exactly like the snapshot.** One state frame
   is read from `/events` with a real single-use ticket and put through the
   same two questions.
5. **Answering stays private and the reveal does not.** Mid-answering, a player
   knows who has answered but not what they chose, in the snapshot and in the
   frame alike; at the reveal, Herd answers are attributed — which is what
   proves section 3 measured a boundary rather than a payload that never
   carries authorship at all.

## Non-vacuity

Each rule was broken in the server, one at a time, and the suite was re-run.
Every mutation was reverted with `git checkout --` and the final tree re-tested.

| Mutation | Result |
| --- | --- |
| `/api/host/skip` dropped from `isHostOnlyRoute` **and** its own `requireHost` call deleted — a forgotten check, the real failure mode | `AssertionError: /api/host/skip accepted an ordinary player` |
| `isHost` also true when the caller asks for `role: "host"` | `AssertionError: Asking for role host changed the moderation surface a player receives` |
| `publicHerdAssignments` stops filtering by author | `AssertionError: Privacy Player 1 should hold four Herd prompts` |
| `publicAnswerSelections` treats Herd like Classic (live picks) | `AssertionError: The snapshot leaked another player's Herd choice before the reveal` |

The third mutation is caught by the ownership assertion before the text probe
is reached, so it proves the ownership rule rather than the leak probe. The
leak probe is instead proven live inside the same block, which asserts the
nonce **is** present for its author and for the host: it can see the text when
the text is allowed to be there.

For the duplicate-key guard, the removed line was put back and the guard failed
with `standalone/server.js:4065 repeats namedPlayerNames`; with the line gone it
passes. The scanner is also tested in both directions: it finds a duplicate
nested two objects deep inside a callback and the exact historical
`publicMajorityResults` shape, and it reports nothing for a sample of legal code
built from the shapes that are easy to mistake for keys — `case`/`default`
labels, a colon inside a string and inside a template literal, ternaries
returning sibling objects, repeated keys across *different* objects in one
array, shorthand, computed keys, spread, `{ a: { a: { a: 1 } } }`, a URL and an
arrow function returning an object.

## Why the scanner is hand-written

There is no parser available. TypeScript 7.0.2 is the native port and exposes no
JS compiler API (`ts.createSourceFile` is `undefined`), esbuild publishes no AST,
and this project stays dependency-light deliberately, so adding one for a test
would be the wrong trade. The scanner walks characters, skips comments and
string/template literals, tracks parentheses and brackets so a `.map((answer) =>
…)` cannot look like a key, and collects property names at each brace's own
level. Scanned across `standalone/` and `packages/` it produced exactly one hit
— the real one — and no false positives.

Generated browser modules are excluded by reading `.gitignore`, which is the
authority on what the build writes; `vendor/` (third-party, minified) and
`legacy/` are skipped by name.

## Commands and results

```
$ node --version                                  v24.18.0   (/usr/bin/node is 22; PATH shim)
$ npm run check                                   254/254 unit, strict TS, build
                                                  release-2e544d33f0fabce4
$ npm test                                        full shared chain, exit 0
$ node standalone/test-disposable.mjs node standalone/smoke-privacy-contract.mjs
  Privacy contract smoke passed: host authority, role claims, writing privacy,
  stream parity and reveal attribution.
$ npm run docs:check                              113 files (records are not
                                                  link-scanned, so the count
                                                  does not move for this one)
```

The unit count moves 252 → 254: the duplicate-key file went from one test to
three (the scanner's two self-tests plus the tree scan).

## Limits

- **No behaviour changed for players.** The server change is a dead line
  removed. Everything else is tests, scripts and documentation.
- This proves *authority* and *payload filtering*. It does not prove runtime
  schema validation of those payloads (P01 steps 2 and 5, still open), and it
  makes no claim about P02 steps 1 and 4 — the private per-question
  permutation and the seeded 4/5/8/20-player attack fixtures are untouched.
- Anonymity against a writer recognising their own text, or against players
  colluding, is explicitly not claimed and cannot be.
- Five writers, one room, one Herd game. Party-sized rooms, tab suspension and
  reconnect storms belong to P08 and were not measured.
- No browser suite was run for this block: nothing visual changed.
- Production, beta and port 3102 were not queried or changed. No deploy.
