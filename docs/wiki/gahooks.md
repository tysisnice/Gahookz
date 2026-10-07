# Gahooks

> A Gahook is a poke: tap a friend and a cartoon character crashes onto their screen.

**Area:** [social](../areas/social.md) · **Status:** live · **Last reviewed:** 2026-10-07

## What it is

Every player has a Gahook button beside each name. In the lobby and at the finale it is only a reaction: the target sees your character, hears a sound and sees your name. During a question it also **steals points**, so each player gets one Gahook per question.

If many Gahooks pile onto one person quickly, they escalate into an **Ultimate Gahook**, and a big enough pile is a **GET GOT** that the whole room sees. In the lobby, a player who has been Gahooked 10 times in a row by the same person is offered a **Counter Gahook** and the chance to challenge them to the [Gahook Arena](gahook-arena.md). At the end of the game, [congratulations and boos](finale.md) use the same machinery.

## Rules and numbers

- **One per question.** One Gahook per player per question, shared by reading, answering and reveal. A second one gets "You already used your Gahook for this question." Lobby and finale Gahooks are unlimited.
- **Steal:** 50 points move from target to sender, in reading, answering and reveal. **GET GOT:** −1,000 for the target. Both need the host's Gahook effects rule to be **Chaos** (the default); on **Visual only** nothing moves ([Scoring](scoring.md), [Lobby rules](lobby-rules.md)).
- **Ultimate:** a streak of Gahooks at one target, each within 1.2 s of the last, becomes Ultimate once it has lasted 5 s; each later Ultimate on that target needs 1 s longer. Each extra Gahook within 1 s adds one to the stack; at 50 it becomes GET GOT.
- **Counter offer:** 10 Gahooks in a row from one sender (each within 2.2 s), then again at 12, 14 and so on. The offer lasts 6.5 s and works in the lobby only.
- **Ultimate Congratulations:** 8 congratulations from at least 3 different players within 1.2 s gaps, or 5 s of steady congratulations (at least 4).
- A Gahook needs a connected target. Being Gahooked wipes your own lobby paint ([Lobby painting](lobby-painting.md)).
- **Known gap:** with effects set to **Off**, the in-question button still sends a Gahook that moves no points (details in the [area guide](../areas/social.md#known-issues)).

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
