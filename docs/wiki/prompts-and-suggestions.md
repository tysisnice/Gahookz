# Prompts and suggestions

> A shared library of funny, educational and personalised prompts that players can ask for while writing questions and that the server uses to fill gaps.

**Area:** [Content](../areas/content.md) · **Status:** live · **Last reviewed:** 2026-10-04

## What it is

While writing questions, a player can tap **Suggest** and get a ready-made
prompt with options. The host chooses the room's **prompt style**: *fun* or
*education*. Funny prompts sometimes name a connected player ("... Sam ..."),
with the name highlighted. The name is picked once, so everyone reads the same
sentence, even after a rename or reconnect. Educational prompts carry a
verified answer, and the reveal shows a **Fact check** with the explanation.

If the host force-starts with questions missing, the server **autofills** the
gaps from the same library and explains what it chose. In Herd, blank answers
are filled from a short list of generated lines. Autofilled items are marked as
generated.

One library feeds both the Suggest button and autofill, so the two never
drift apart.

## Rules and numbers

Counts below are measured from `packages/content` and change when prompts are added.

| Set | Count |
| --- | --- |
| Educational prompts (verified answer and explanation) | 20 |
| Funny prompts (always name a player, no answer key) | 20 |
| Older prompts kept as they were (opinion 86, factual 78, Herd seeds 11) | 175 |

- Funny pool: 20 new plus 86 opinion prompts. Educational pool: 20 new plus 78 factual ones.
- About 35% of funny draws are personalised (`DEFAULT_PERSONALISED_SHARE`).
  A room works through its whole library before any prompt repeats.
- Classic quiz scoring always autofills educational prompts, because a funny
  prompt has no correct answer.
- Names come from connected players only, are cut to 24 characters, and are
  inserted as plain text. With nobody connected the prompt says "your imaginary
  teammate".
- Suggestions work only in the question-writing phase, for a joined player or the host.
  Drafts last 15 minutes, up to 80 per room.
- The answer key is sent only to the player asking, who may be the author, and never in a
  question being answered. A fact check is a display, not a scoring key.
- The 11 Herd writing seeds exist but nothing draws them today.

## Where it lives

| Part | Code |
| --- | --- |
| New prompts | `packages/content/src/templates.ts` |
| Older prompts | `packages/content/src/legacy.ts` |
| Drawing and name substitution | `packages/content/src/generate.ts` |
| Validation | `packages/content/src/validate.ts` |
| Suggest endpoint, autofill | `standalone/server.js` — `suggestQuestion`, `makeGeneratedQuestion`, `forceStartGame` |
| Suggest button, highlighted names | `standalone/public/app.jsx` — `PromptText` |
| Tests | `packages/content/test/content.test.ts`, `standalone/smoke-prompt-library.mjs` |

## Related

- [Writing questions](question-writing.md)
- [Herd](herd.md)
- [Content area guide](../areas/content.md)

## History

- 2026-07-20 — Prompt banks and force-start autofill in the first commit.
- 2026-09-11 — One shared catalogue, the `/api/question/suggest` endpoint, safe name substitution and no invented answers (P05).
- 2026-09-11 — The named player is emphasised in prompts.
- 2026-09-12 — Named and unnamed funny prompts mixed.
