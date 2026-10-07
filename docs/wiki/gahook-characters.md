# Gahook characters

> The six cartoon animals a player can choose to throw, plus their own custom one.

**Area:** [social](../areas/social.md) · **Status:** live · **Last reviewed:** 2026-10-07

## What it is

Each player picks one character. It is the one thrown whenever they send a [Gahook](gahooks.md): it flies onto the target's screen with its own sound. The same character is the runner in [Gahook Dash](gahook-dash.md). The choice is remembered in the browser and, for signed-in players, with their saved look ([Accounts and career stats](accounts-and-career.md)). A seventh choice, your own drawing, is covered on [Custom Gahooks](custom-gahooks.md).

## Rules and numbers

| Id | Name in the picker |
| --- | --- |
| `monkey` | Classic Monkey (the default) |
| `gorilla` | Rage Gorilla |
| `pig` | Sad Pig |
| `koala` | Chonky Koala |
| `croc` | Cool Croc |
| `chicken` | Cymbal Chicken |

- **Sad Pig replaced Airhorn Capy.** The old id `capybara` still arrives from old browsers, saved profiles and cached state, and is turned into `pig` everywhere (server and browser each hold the same table), so nobody falls back to the monkey.
- Any other unknown id becomes the monkey.
- The host's Lobby rules can switch off custom Gahooks; players using one are put on the monkey and get theirs back when it is switched on again.
- Characters are cosmetic: they never change a score. The picker order puts the pig next to the monkeys.

## Where it lives

| Part | Code |
| --- | --- |
| Server | `standalone/server.js` — `GAHOOK_FORMS`, `LEGACY_GAHOOK_FORMS`, `normaliseGahookForm`, `updatePlayerGahookForm` |
| Browser | `standalone/public/client/gahook-forms.js` — `GAHOOK_FORMS`, `normaliseGahookFormId`; `app.jsx` — `GahookFormPicker`; art in `client/presentation.jsx` |
| Tests | `standalone/public/client/gahook-forms.test.ts`, `standalone/smoke-gahooks.mjs` |

## Related

- [Gahooks](gahooks.md), [Custom Gahooks](custom-gahooks.md), [Gahook Dash](gahook-dash.md)

## History

- 2026-07-20 — Monkey, Gorilla, Capybara, Koala, Croc and Chicken exist from the first commit (`dd449f2`).
- 2026-09-25 — Tyson asks for Sad Pig to replace Airhorn Capy and sit beside the monkeys.
- 2026-09-30 — Sad Pig lands: art, tears overlay, Dash sprite and the `capybara` to `pig` mapping (`77534e0`).
