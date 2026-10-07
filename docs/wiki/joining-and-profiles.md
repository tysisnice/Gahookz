# Joining and profiles

> Pick a name and a picture, join with a four-letter code, and play. No account needed.

**Area:** [UI lobby](../areas/ui-lobby.md) · **Status:** live · **Last reviewed:** 2026-10-08

## What it is

Anyone with a room code or link can join. The welcome screen asks for the four-letter room word (and a password if the room has one), then a join form asks for a name and a profile picture. Nobody has to sign in; an optional account only fills in the form with a saved look ([Accounts and career](accounts-and-career.md)).

The name starts as a random funny animal name. The picture is one of 23 built-in pictures, a Random pick, or one you draw yourself (optionally over an uploaded photo). On a phone the form is one scrolling page with the Join button always in reach, even with the keyboard open.

Your last name and picture are remembered on that device, so the next join is quick. You can change both later from the menu (**Change name & profile**). The host can also join as a player from the lobby, or randomise a player's name and picture.

## Rules and numbers

- Name: up to 24 characters. Room word: four letters.
- Drawn picture: 384 px square, stored as a small WebP; the server accepts up to 1,500,000 characters of image data.
- The host can switch **Custom profile pictures** off in [Lobby rules](lobby-rules.md); the Draw tile disappears and drawn pictures are not shown.
- Passwords are never saved with your last join and never stay in the address bar.
- A banned player or a wrong password gets a jump scare and an error, not a join.

## Where it lives

| Part | Code |
| --- | --- |
| Server | `standalone/server.js` — `joinPlayer`, `validateAvatarImage`, the `/api/player/profile` route |
| Browser | `standalone/public/app.jsx` — `WelcomeScreen`, `JoinScreen`, `AvatarPicker`, `AVATAR_PRESETS` |
| Paint editor | `standalone/public/client/drawing.jsx` — `SimplePaintEditor` |
| Tests | `standalone/smoke-roles.mjs`, `standalone/smoke-room-rules.mjs`, `standalone/browser-mobile-ui.mjs` |

## Related

- [Rooms and room codes](rooms-and-codes.md)
- [Lobby](lobby.md)
- [Host and roles](host-and-roles.md)

## History

- 2026-09-27 — The join screen became one scrolling page with a sticky Join button and one picture grid (U4).
- 2026-10-03 — Optional accounts can prefill the saved name and picture.
