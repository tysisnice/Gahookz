# Gahooks

> A Gahook is a poke: tap a friend and a cartoon character crashes onto their screen.

**Area:** [social](../areas/social.md) · **Status:** live · **Last reviewed:** 2026-10-07

## What it is

Every player has a Gahook button beside each name. In the lobby and at the finale it is only a reaction: the target sees your character and hears a sound. During a question it also **steals points**, so each player gets one Gahook per question.

A fast pile of Gahooks becomes an **Ultimate Gahook**, and a big enough pile is a **GET GOT** the whole room sees. In the lobby, 10 Gahooks in a row from one person earn a **Counter Gahook** and a chance to challenge them to the [Gahook Arena](gahook-arena.md). [Congratulations and boos](finale.md) at the end use the same machinery.

## Rules and numbers

- **One per question.** One Gahook per player per question, shared by reading, answering and reveal. A second one gets "You already used your Gahook for this question." Lobby and finale Gahooks are unlimited.
- **Steal:** 50 points move from target to sender, in reading, answering and reveal. **GET GOT:** −1,000 for the target. Both need the host's Gahook effects rule to be **Chaos** (the default); on **Visual only** nothing moves ([Scoring](scoring.md), [Lobby rules](lobby-rules.md)).
- **Ultimate:** Gahooks at one target, each within 1.2 s of the last, become Ultimate after 5 s; each later one on that target needs 1 s longer. Each extra Gahook within 1 s adds one; at 50 it is GET GOT.
- **Counter offer:** 10 Gahooks in a row from one sender (each within 2.2 s), again at 12, 14 and so on; lasts 6.5 s, lobby only.
- **Ultimate Congratulations:** 8 congratulations from at least 3 players in quick succession (details in the [area guide](../areas/social.md)).
- A Gahook needs a connected target. Being Gahooked wipes your own lobby paint ([Lobby painting](lobby-painting.md)).
- **Known gap:** with effects **Off**, the in-question button still sends a harmless Gahook ([area guide](../areas/social.md#known-issues)).

## Where it lives

| Part | Code |
| --- | --- |
| Server | `standalone/server.js` — `pokePlayer`, `claimQuestionGahookUse`, `registerGahookSpam`, `applyGetGot`, `counterPokeFromPlayer`, `finalPokeTarget` |
| Browser | `standalone/public/app.jsx` — `GahookRoster`, `CounterGahookPrompt`; `client/presentation.jsx` — `GahookOverlayVisual` |
| Tests | `standalone/smoke-gahooks.mjs`, `standalone/smoke-room-rules.mjs` |

## Related

- [Gahook characters](gahook-characters.md), [Custom Gahooks](custom-gahooks.md), [Gahook Arena (1v1)](gahook-arena.md)
- [Scoring](scoring.md), [Finale](finale.md), [Lobby rules](lobby-rules.md)

## History

- 2026-07-20 — Gahooks, Ultimate stacking and GET GOT exist from the first commit (`dd449f2`).
- 2026-08-26 — Counter Gahooks and the Arena challenge arrive (`178d56b`).
- 2026-09-11 — The host's effects rule is enforced by the server (`2ae50f4`).
- 2026-09-26 — Gahooks thrown at a duelist appear as tappable minis (`6c852a7`).
