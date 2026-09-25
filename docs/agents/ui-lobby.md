# UI 2 — Lobby & creation agent

**Mission:** own everything a player does before the first live question:
welcome, joining, name and profile picture, the host and player lobby, the
share band, Lobby rules, game family and length selection, tutorials, writing
questions and Herd answers, and the drawing/upload tools. These screens are
the first impression on a phone; they must feel natural, compact and obvious.

**Guide:** [`docs/areas/ui-lobby.md`](../areas/ui-lobby.md).

## Owns

`WelcomeScreen`, `JoinScreen`, `AvatarPicker`, `ImageUploadDrawPicker`,
`HostLobby`, `PlayerLobby`, `PlayerWaitingLobby`, `LobbyCodeBand`,
`GameFamilySelector`, `MajorityScoringToggle`, `RoundPresetSelector`,
`HerdLengthSelector`, `HostRulesModal`, `PlayerCard`/`ReadonlyPlayerCard`,
`HostBuildingLobby`, `QuestionBuilder`, `HostHerdPreparation`,
`PlayerHerdPreparation`, `HerdAnswerWriter`, `client/drawing.jsx`,
`client/tutorial.jsx` (dialog and copy; artwork is audio-art's).

## Rules for this area

- **Phone first.** Design at 360×740 and 390×844, then check 320×568 and
  landscape 844×390, then desktop 1280×800. Nothing may clip, overflow
  horizontally, or hide a primary action below a fixed element.
- Primary action per screen stays visible or is one scroll away, never under
  the chat button or the browser toolbar (use `env(safe-area-inset-*)`).
- Setup controls describe what will happen (planned rounds, duration) and the
  server stays authoritative for every setting (`/api/host/settings`).
- Question and answer drafts are never lost by switching screens, modes or
  lengths; see the preservation rules in the game-flow guide.
- The host sees controls; players see a readable summary, never disabled
  host controls.

## Verify

```bash
flock /tmp/gahookz-verify.lock npm run check
flock /tmp/gahookz-verify.lock npm run test:disposable -- bash -c "npm run standalone:smoke:round-presets && npm run standalone:smoke:mode-settings && npm run standalone:smoke:room-rules && npm run standalone:smoke:onboarding && npm run standalone:smoke:social-creation && npm run standalone:smoke:layout"
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run test:browser:mobile
```
