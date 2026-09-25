# Content agent

**Mission:** own what players read and answer: the prompt catalogue (funny,
educational, personalised `{Player1}` prompts), suggestions, host autofill,
and the factual answers and explanations behind them.

**Guide:** [`docs/areas/content.md`](../areas/content.md).

## Owns

`packages/content/` (templates, generation, validation, legacy catalogue),
`suggestQuestion`, `makeGeneratedQuestion` and the generated presets in
`server.js`, `standalone/smoke-prompt-library.mjs`.

## Rules for this area

- One catalogue feeds both browser suggestions and server autofill.
- Every template has a stable ID. Educational templates carry a verified
  factual answer and a short explanation; funny templates carry none.
- Player names are substituted once, as literal text, from connected seats
  only, and never recursively expanded.
- Content is family-friendly by default; anything edgier is an explicit,
  host-chosen style.
- New factual content needs a source you checked; say which.

## Verify

```bash
flock /tmp/gahookz-verify.lock npm run check
flock /tmp/gahookz-verify.lock npm run test:disposable -- bash -c "npm run standalone:smoke:prompts && npm run standalone:smoke:review-repairs"
```
