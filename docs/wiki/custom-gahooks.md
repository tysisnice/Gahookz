# Custom Gahooks

> Draw up to three frames, pick a colour, a move and a sound, and throw your own Gahook.

**Area:** [social](../areas/social.md) · **Status:** live · **Last reviewed:** 2026-10-07

## What it is

Instead of one of the [six characters](gahook-characters.md), a player can build a Gahook of their own. The creator (in the player menu) has a small paint editor for up to **three frames** that play as an animation, a **background colour**, one of four **moves** (Wild shake, Spin attack, Mega bounce, Jump zoom), and a **sound**: Bonk, Honk, Boing, Airhorn, Silent, or **My sound**, a clip you record (5 seconds in the creator) or upload. It also has a name, up to 32 characters.

Everyone gets **two slots** with no account, kept on their seat in the room. Signed-in players save slots to their account so they survive the room; an account can unlock more slots, up to 12 ([Accounts and career stats](accounts-and-career.md)). The saved copy wins when a slot is picked.

## Rules and numbers

- Editing and switching slots work only while the room is waiting (lobby or building).
- Server limits: 3 frames, each at most 180,000 characters of image data; a sound at most 280,000 characters. Images and sounds are stored by the server and shared by `/media` link, so other players never receive raw uploads.
- A custom sound must exist before "My sound" can be selected.
- The host can switch **Custom Gahooks** off in Lobby rules. Players on a custom Gahook are moved to the monkey and returned when it is switched back on, and nobody can pick it meanwhile.
- A custom Gahook behaves exactly like any other Gahook for steals and spam ([Gahooks](gahooks.md)).
- The creator offers eight colours; the server accepts any six-digit hex colour.

## Where it lives

| Part | Code |
| --- | --- |
| Server | `standalone/server/custom-gahook.mjs` — `normaliseCustomGahook`, `publicCustomGahook`; `standalone/server.js` — `updatePlayerCustomGahook`, `selectPlayerCustomGahookSlot` |
| Account copy | `standalone/server/accounts.mjs` — `customGahookSlotCount`, `saveCustomGahook` |
| Browser | `standalone/public/client/custom-gahook.jsx` — `CustomGahookCreator`; `client/drawing.jsx` |
| Tests | `standalone/smoke-social-creation.mjs`, `standalone/smoke-social-media.mjs`, `standalone/smoke-accounts.mjs` |

## Related

- [Gahook characters](gahook-characters.md), [Gahooks](gahooks.md), [Joining and profiles](joining-and-profiles.md)

## History

- 2026-07-20 — Custom Gahooks exist from the first commit (`dd449f2`).
- 2026-09-19 — Two room-local slots for everyone, no account needed (`78a1382`).
- 2026-10-04 — Signed-in players save slots to their account (accounts merge, `471ef5f`).
