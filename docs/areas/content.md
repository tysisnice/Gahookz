# Content — area guide

Verified 2026-10-04 against commit `27da7b6` on branch `agent/docs-core`. The
catalogue counts below were measured by importing `packages/content` under
Node 24 on this branch; they are the numbers most likely to change when the
content branches merge, so they sit in one table ("The catalogue").

## Purpose

Content owns what players read and answer: the prompt catalogue (educational,
funny and personalised `{Player1}` prompts), the suggestion endpoint, the host's
autofill, and the verified answers and explanations behind them. One catalogue
feeds both the browser's suggestions and the server's autofill, so the two cannot
drift the way the old copied arrays did.

## What players see

- A **Suggest** control while writing questions that returns a ready-made
  prompt with options in the room's chosen style.
- A **prompt style** choice from the host: `fun` or `education`.
- Funny prompts that sometimes name a connected player ("... Sam ..."), with
  the name emphasised. The name is chosen once, so everyone reads the same
  sentence even after a reconnect, rename or join.
- Educational prompts that carry a verified answer; the reveal shows a
  **Fact check** with the explanation.
- When the host force-starts with missing questions, the server fills the gaps
  and says why it chose that content (`autofillExplanation`).

## Code map

| Piece | Where |
| --- | --- |
| New templates (educational and funny), `{Player1}` constant, lookups | `packages/content/src/templates.ts` |
| Migrated legacy banks (opinion, factual, seed) | `packages/content/src/legacy.ts` |
| Rendering: `instantiateTemplate`, `substitutePlayerName`, `choosePlayer`, `poolForStyle`, `TemplateBag` | `packages/content/src/generate.ts` |
| Structural rules: `validateTemplate`, `validateCatalogue`, `validateLegacy` | `packages/content/src/validate.ts` |
| Package entry (re-exports all four) | `packages/content/src/index.ts` |
| `suggestQuestion`, `roomTemplateBag`, `makeGeneratedQuestion`, `generationStyleFor`, `autofillExplanation`, `attachDraftMetadata`, `forceStartGame`, `GENERATED_HERD_ANSWERS` | `standalone/server.js` |
| Suggest button and `PromptText` emphasis | `standalone/public/app.jsx` (ui-lobby owns the screens) |
| Unit tests | `packages/content/test/content.test.ts` |
| Smoke | `standalone/smoke-prompt-library.mjs`, `standalone/smoke-review-repairs.mjs` |

## How it works

### The catalogue

| Set | Count | Shape |
| --- | --- | --- |
| `EDUCATIONAL_TEMPLATES` | 20 | four options, `factualAnswerId`, `explanation`; ids `EDU-NEW-nn` |
| `FUNNY_TEMPLATES` | 20 | four options, always contains `{Player1}`, no answer key; ids like `FUN-NEW-nn` |
| `LEGACY_TEMPLATES` | 175 | `opinion` 86 (party prompts, two or four options, no key), `factual` 78 (with key), `seed` 11 (Herd writing seeds, no options) |

Verify with:

```bash
PATH=/usr/bin:$PATH node --import tsx -e 'import("./packages/content/src/index.ts").then(m=>console.log(m.EDUCATIONAL_TEMPLATES.length,m.FUNNY_TEMPLATES.length,m.LEGACY_TEMPLATES.length))'
```

Each new template has a stable id and a `version`. Legacy entries keep their
original shapes on purpose; nothing is invented to make them uniform. The 11
legacy seeds are exported but `poolForStyle` never draws them, and I found no
other server use (the Herd autofill uses ordinary templates for prompt text).

### Pools, styles and the bag

`poolForStyle("educational")` is the 20 educational templates plus the 78
legacy `factual` entries (98). `poolForStyle("funny")` is the 20 funny templates
plus the 86 legacy `opinion` entries (106). `TemplateBag` draws from two
bags, personalised and general, each shuffled and exhausted before it repeats.
A draw is personalised with probability `DEFAULT_PERSONALISED_SHARE` (0.35), so
the 20 named prompts are a seasoning among the general ones. Educational
prompts are never personalised, so that pool only uses the general bag. Each
room keeps one bag per style in `room.promptBags`, so a room works through the
library before a prompt returns.

The host's `promptStyle` is `"fun"` or `"education"` (older payloads that say
`"funny"` or `"educational"` are normalised). The server maps these to the
catalogue's `"funny"` and `"educational"`. Classic quiz scoring overrides the
choice for autofill: `generationStyleFor` returns `"educational"` whenever the
family is quiz with Classic scoring, because a funny prompt has no correct
answer and the server will not invent one.

### The `{Player1}` contract

- The only token the catalogue may contain is `{Player1}`; `validateTemplate`
  rejects any other `{...}` token, since it would reach a player as literal
  text. Educational templates must not contain it; funny templates must.
- `substitutePlayerName` splits on the placeholder and joins, so a display name
  is inserted as literal text: no regex replacement (`$&` stays inert), no
  second expansion if the name itself contains `{Player1}`, and markup stays
  markup-free text. Never put HTML into a prompt; the client emphasises names by
  splitting the string on `namedPlayerNames` (`PromptText`).
- `choosePlayer` picks uniformly among **connected** seats (`seat.connected`),
  by id, so removed, banned and disconnected seats are never named. The requester
  may be chosen, so a one-player room works. Duplicate display names still resolve
  to one identified player.
- With nobody eligible the text uses `ABSENT_PLAYER_NAME`
  ("your imaginary teammate"), never a raw token.
- An instance is frozen: `instantiateTemplate` returns the finished `text`,
  `namedPlayerIds`, `namedPlayerNames`, shuffled `options` (ids stay stable so the
  key survives the shuffle) and, only when asked, `factualAnswerId` and
  `explanation`. Nothing is re-rendered later.
- Names come from `cleanText(seat.name, 24)`, falling back to `"Player"`.

### The suggestion endpoint

`POST /api/question/suggest` (`suggestQuestion`). It requires an unbanned
credential that `roomAccessGranted` admits, a joined player or the host, and the
`building` phase. It returns `instanceId`, `templateId`, `templateVersion`,
`kind`, `text`, `options` (id and text), `namedPlayerNames`, `intendedAnswerId`
and `explanation`. The last two are filled for educational prompts and null for
funny ones, so a Classic author must choose an intended answer for a funny
prompt themselves. They are included because the requester is the prospective
author; a key must never appear in an *answering* payload. `factCheck` is published
only in the reveal results builders (for example `publicHerdResults`). The draft is stored in `room.promptDrafts`
(at most 80, 15 minutes, tied to the requesting credential).

When the author submits, `attachDraftMetadata` keeps the instance and its fact
check only if the credential matches and the text, and for non-Herd the options,
are unchanged. A fact check is a reveal-time display, not a scoring key: under
Majority and Herd the votes still decide points.

### Autofill

`forceStartGame` (host force-start in `building`) fills each connected player's
missing question slots up to `maxQuestionsPerPlayer` using `makeGeneratedQuestion`,
which draws a template, renders it for the connected seats and builds the payload
for the room's mode: Herd takes the text only, Majority takes the options with no
prediction made on anyone's behalf, Classic marks the factual option correct.
Generated questions carry `generated: true`. In Herd writing, blank answers are
filled from `GENERATED_HERD_ANSWERS` (12 lines) and marked generated. Pending
submissions are promoted first, never discarded.

## Invariants

- One catalogue feeds both suggestions and autofill. The browser carries no copy.
- Every template has a stable id and a version. Educational templates carry a
  verified answer and a short explanation; funny templates carry neither.
- `validateCatalogue` and `validateLegacy` return no problems (a unit test runs
  them): exactly four options, distinct texts, no duplicate ids or prompts.
- Player names are substituted once, as literal text, from connected seats only,
  never recursively expanded.
- The answer key and explanation never enter an answering payload.
- Content is family-friendly by default. Anything edgier must be an explicit,
  host-chosen style, not a default.
- New factual content needs a source you checked; name it in the commit or record.
- Everything under `packages/` is loaded directly by plain `node` in production,
  so it must use erasable TypeScript only (no constructor parameter properties,
  enums or namespaces); otherwise the server fails at startup.

## Tests

```bash
PATH=/usr/bin:$PATH flock /tmp/gahookz-verify.lock npm run check
PATH=/usr/bin:$PATH flock /tmp/gahookz-verify.lock npm run test:disposable -- bash -c "npm run standalone:smoke:prompts && npm run standalone:smoke:review-repairs"
```

`check` runs `packages/content/test/content.test.ts`: the 20 + 20 structural
check, hostile and self-referencing display names, empty and one-player rooms,
frozen instances, withheld keys, both-bag coverage, the stated 35% mix and
out-of-range random sources. `smoke-prompt-library` imports and validates the
banks rather than counting source text.

## Common changes

- **Add a prompt:** append to the right array in `templates.ts` with the next
  `XXX-NEW-nn` id and `version: 1`; educational ones need `factualAnswerId` and
  `explanation` and a source you checked. Update the "20 + 20" assertion in
  `content.test.ts` and the counts above, then run `validateCatalogue` via `check`.
- **Retire or reword a prompt:** bump `version`; do not reuse its id.
- **Add a style:** extend `poolForStyle`, the `promptStyle` mapping in `server.js`,
  `generationStyleFor` and the host setting, and say how Classic scoring treats it.
- **Change the personalised share:** edit `DEFAULT_PERSONALISED_SHARE`; the
  unit test that states the default must change with it.

## Known issues

- The 11 legacy Herd seeds are unreachable from the generator.
- Only two styles exist, and `"fun"`/`"funny"` naming differs between the host
  setting and the catalogue.
- Names from `cleanText` are capped at 24 characters, so a long display name is
  truncated inside a prompt.

Live backlog: [`../backlog.md`](../backlog.md).
