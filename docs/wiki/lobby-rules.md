# Lobby rules

> The host's one dialog for rules that apply to everyone in the room, plus two switches that only affect the host's own device.

**Area:** [UI lobby](../areas/README.md) · **Status:** live · **Last reviewed:** 2026-10-04

## What it is

The host opens **Lobby rules** from the control panel in the lobby. The dialog says "These apply to everyone in the room." Nothing changes until the host presses **Save changes**. **Cancel**, Escape and the Back button all leave without saving.

**Questions**
- **Approve questions before they go in.** Off by default. Turning it off lets waiting questions straight in.
- **Generated prompts: Funny or Educational.** Funny is the default. It changes what is suggested next, never a question already written ([Prompts and suggestions](prompts-and-suggestions.md)).

**Gahook effects**
- **Off:** no Gahook interruptions during a round.
- **Visual only:** reactions happen, but nobody loses points.
- **Chaos** (the default): a Gahook steals points and GET GOT costs more ([Gahooks](gahooks.md)).
- **Reduce Gahook effects on this device** and **Music on this device** are personal switches. They are not room rules and only change the host's own screen ([Preferences and accessibility](preferences-and-accessibility.md), [Music and sound](music-and-sound.md)).
- **Allow 1v1 duels in the lobby.** On by default. Switching it off cancels any duel in progress and nobody loses ([Gahook Arena](gahook-arena.md)).

**What players may bring**
- **Custom profile pictures** and **Custom Gahooks.** Both are on by default. Turning them off hides what people made for this room. It is never deleted and returns if switched back on ([Custom Gahooks](custom-gahooks.md)).

## Rules and numbers

- Rules can only change in the lobby. Once the host locks the game, the lobby shows a "Locked for this game" summary of the mode, Gahook effects and prompt style.
- The server enforces every rule, for example "The host has turned Gahook effects off for this game."

## Where it lives

| Part | Code |
| --- | --- |
| Dialog | `standalone/public/app.jsx` — `HostRulesModal`, `RULES_FIELDS`, `LockedRulesSummary` |
| Contracts | `packages/contracts/src/host-settings.ts` — `HostSettingsRequestSchema` |
| Server | `standalone/server.js` — `updateHostSettings`, `lockSetup` |
| Tests | `standalone/smoke-room-rules.mjs`, `standalone/smoke-mode-settings.mjs` |

## Related

- [Lobby](lobby.md), [Game setup](game-setup.md), [Host and roles](host-and-roles.md)

## History

- 2026-09-11 — One host rules dialog, with effects the server enforces (`2ae50f4`).
- 2026-09-29 — Back closes the dialog and focus returns to its button (`fee0b26`).
- 2026-10-01 — Music switch added to the dialog (`9c5e84b`, a checkpoint commit).
