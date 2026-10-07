# Project areas — who owns what

Gahookz is divided into eleven **areas**. Each area has one guide in this
folder and one agent profile in [`docs/agents/`](../agents/README.md). An agent
works inside one area at a time, so several agents can change the game in
parallel without editing the same code.

The split follows the player's journey for the interface and the server's
responsibilities for everything else:

```text
                    ┌──────────────── the browser ────────────────┐
  UI 1  ui-shell    │ frame, navigation, menus, dialogs, tokens    │
  UI 2  ui-lobby    │ welcome → join → lobby → making content      │
  UI 3  ui-game     │ live rounds → reveal → finale                │
                    └──────────────────────────────────────────────┘
  game-flow   phases, modes, rules, timers, scoring  (server + engine)
  social      Gahooks, forms, custom Gahooks, 1v1 arena, chat, whiteboard, Dash
  systems     rooms, lifecycle, transport, SSE, admission, security, media, moderation
  content     prompt catalogue, suggestions, autofill
  audio-art   music, sound effects, character art, tutorial art, icons
  accounts    optional sign-in, career stats, entitlements, PostgreSQL
  platform    build, dev server, Docker, deploy, CI, hosting
  quality     test harnesses, fixtures, verification discipline
```

## Why the interface is split in three

1. **UI 1 — Shell** is everything that is on screen regardless of phase: the
   top bar, the menus, dialogs and overlays, tooltips, the design tokens and
   the PWA wrapper. It changes rarely and everyone depends on it, so it has
   one owner and a stable contract (`client/controls.jsx`, the overlay
   pattern, the CSS custom properties).
2. **UI 2 — Lobby & creation** is everything a player does *before* the first
   live question: choosing a name and picture, the lobby, the host's rules and
   game selection, writing questions and Herd answers, drawing, and building a
   custom Gahook. These screens are form-heavy, mostly untimed and the most
   likely to be edited for layout.
3. **UI 3 — Live game** is everything *timed*: reading, answering, voting, the
   reveal, the leaderboard and the finale, for host, player and shared screen.
   It is performance- and privacy-sensitive, because it renders hidden state at
   exactly the moment it becomes public.

This matches how a player experiences the game, keeps each part's CSS and
components contiguous, and gives each agent a surface small enough to verify
end to end in one session.

## Ownership map

"Owner" means the area whose agent edits the code by default and whose guide
documents it. Other areas may make a small, necessary edit, but must list it in
their handoff (see [the working agreement](../agents/README.md)).

### Browser — `standalone/public/`

| Code | Owner |
| --- | --- |
| `app.jsx`: `App`, `RoomLoading`, `HostMode`, `HostView`, `PlayerView` (routing and overlay plumbing only), `getRoute`, `navigateTo`, `useEvents`, `api`, `reducer`, session helpers (`getClientKey` … `buildRoomLink`), `useModalBodyLock`, `useCloseMenuOnOutside`, `useDetailsMenu` | ui-shell |
| `app.jsx`: `HostQuickMenu`, `PlayerQuickMenu`, `JoinQuickMenu`, `PlayerSettingsDialog`, `EffectsPreference*`, `RoomStatusBanner`, `HostTopBar`, `PauseButton`, `TimerBar`, `useCountdown`, `labelForPhase` | ui-shell |
| `client/controls.jsx` (`ToggleSwitch`, `InfoTip`), `client/preferences.jsx`, `client/net.ts` (browser network boundary), `client/legal.jsx`, `client/information.jsx`, `client/qr.jsx` | ui-shell (net.ts shared with systems) |
| `index.html`, `manifest.webmanifest`, `service-worker.js`, `vendor-bootstrap.js`, `vendor/`, `*-shim.js`, `use-sync-selector.js` | ui-shell (build stamping: platform) |
| `app.jsx`: `WelcomeScreen`, `EntryModeArt`, `JoinScreen`, `JoinPlayerPreview`, `AvatarPicker`, `ImageUploadDrawPicker`, `shrinkImageFile`, avatar helpers (`AvatarBadge`, `makeAvatarImage`, `avatarArt`, `animalAvatarArt`) | ui-lobby |
| `app.jsx`: `HostLobby`, `PlayerLobby`, `PlayerWaitingLobby`, `LobbyCodeBand`, `PreviousGameSummary`, `GameFamilySelector`, `MajorityScoringToggle`, `RoundPresetSelector`, `HerdLengthSelector`, `ModeTutorialLauncher`, `ModeArt`, `HostRulesModal`, `RuleToggleRow`, `GahookEffectsHelp`, `LockedRulesSummary`, `PlayerCard`, `ReadonlyPlayerCard`, `BannedPlayersPanel`, `QuestionApprovalPanel` | ui-lobby |
| `app.jsx`: `HostBuildingLobby`, `QuestionBuilder`, `SubmittedQuestionList`, `ForceStartControl`, `HostHerdPreparation`, `PlayerHerdPreparation`, `HerdAnswerWriter` (per-player progress now lives in the player cards, via `herdProgressText`) | ui-lobby |
| `client/drawing.jsx` (paint editor), `client/tutorial.jsx` (dialog and copy; artwork belongs to audio-art) | ui-lobby |
| `app.jsx`: `HostGame`, `PlayerGame`, `Metric`, `AnswerGrid`, `AnswerChoicePlayers`, `VoteChoicePlayers`, leaderboard components, `RevealPanel`, `RoundRevealSummary`, `CorrectAnswerSpotlight`, `QuestionResultsPanel`, `QuestionAuthorLine`, `FinishedScreen`, `ReadonlyFinishedScreen`, `ReadonlyPartyView`, `PartyFinalScoreboard`, `Final*` components | ui-game |
| `client/reveal.jsx`, `client/reveal.css` | ui-game |
| `app.jsx`: Gahook plumbing (`RoomGetGotOverlay`, `HostLobbyPokeEffects`, `CounterGahookPrompt`, `GahookRoster`, `GahookFormPicker`, `GahookDuel*`, `GahookArenaCrowdControls`, `RoomSocialHub`, `LobbyPaintSurface`, mini-Gahook layers inside `PlayerView`) | social |
| `client/arena.jsx`, `client/arena.css`, `client/social.jsx`, `client/custom-gahook.jsx`, `client/offline.jsx` (Gahook Dash), `client/gahook-forms.js` | social |
| `client/audio.js`, `client/music.ts`, `client/music-composer.ts` (all sound and music) | audio-art |
| `client/presentation.jsx` (Gahook faces and overlays), `icons/`, tutorial artwork in `client/tutorial-art.jsx` | audio-art |
| `app.jsx`: `AccountPanel`, `CAREER_STATS` | accounts |

`styles.css` follows the same map: each rule belongs to the area that owns the
component it styles. The file is ordered by history rather than by area, so
search for the component's class names before editing, and put new rules for a
feature in that feature's section (or a new `client/<feature>.css`, loaded from
`index.html`, when the feature has its own module).

### Server — `standalone/`

| Code | Owner |
| --- | --- |
| `server.js`: phase machine (`startGame`, `beginQuestion`, `beginAnswering`, `transitionToReveal`, progress waits, `skipPhase`, `setGamePaused`, `finishGameNow`, `resetLobby`), question selection, answers, votes, scoring calls, `getStartCheck`, `updateHostSettings`, `lockSetup`, snapshot builders for questions and results | game-flow |
| `server/gameplay.mjs`, `server/scoring.mjs`, `server/majority.mjs`, `server/phase-controls.mjs`, `server/presentation.mjs`; `packages/game-engine/`, `packages/contracts/` | game-flow (contracts shared with systems) |
| `server.js`: pokes, counters, ultimate Gahooks, GET GOT, congratulations and boos, duels, chat, whiteboard, custom Gahook routes, Dash | social |
| `server/arena.mjs`, `server/social.mjs`, `server/custom-gahook.mjs` | social |
| `server.js`: HTTP routing, `handleEvents`, tickets, `createRoomAction`, `joinPlayer`, room expiry, host transfer, kick/ban/report/remove-content, drain, health and metrics, static serving | systems |
| `server/transport.mjs`, `server/admission.mjs`, `server/auth.mjs`, `server/route-policy.mjs`, `server/room.mjs`, `server/media.mjs`, `server/content-inventory.mjs`, `server/sse-backpressure.mjs` | systems |
| `server.js`: `suggestQuestion`, generated presets, `makeGeneratedQuestion`; `packages/content/` | content |
| `server/accounts.mjs`, `server/career-outbox.mjs`, `packages/accounts/`, `infra/postgres/`, `verify-postgres-outbox.mjs`, `verify-journal-volume.mjs` | accounts |
| `build-client.mjs`, `dev.mjs`, `clean-generated.mjs`, `sync-artifacts.mjs`, `Dockerfile`, `compose.yaml`, `scripts/`, `deploy/`, `.github/`, `tsconfig.*` | platform |
| `smoke-*.mjs`, `simulate-*.mjs`, `browser-*.mjs`, `load-*.mjs`, `drill-resilience.mjs`, `capture-fixtures.mjs`, `test-disposable.mjs`, `packages/contracts/test/fixtures/` | quality (each area adds its own cases) |
| `legacy/` | nobody — retired modes, kept for reference, not built |

## Area guides

| Area | Guide | Profile |
| --- | --- | --- |
| UI 1 — Shell | [ui-shell.md](ui-shell.md) | [agent](../agents/ui-shell.md) |
| UI 2 — Lobby & creation | [ui-lobby.md](ui-lobby.md) | [agent](../agents/ui-lobby.md) |
| UI 3 — Live game | [ui-game.md](ui-game.md) | [agent](../agents/ui-game.md) |
| Game flow | [game-flow.md](game-flow.md) | [agent](../agents/game-flow.md) |
| Social | [social.md](social.md) | [agent](../agents/social.md) |
| Systems | [systems.md](systems.md) | [agent](../agents/systems.md) |
| Content | [content.md](content.md) | [agent](../agents/content.md) |
| Audio & art | [audio-art.md](audio-art.md) | [agent](../agents/audio-art.md) |
| Accounts | [accounts.md](accounts.md) | [agent](../agents/accounts.md) |
| Platform | [platform.md](platform.md) | [agent](../agents/platform.md) |
| Quality | [quality.md](quality.md) | [agent](../agents/quality.md) |

Every guide uses the same headings — *Purpose*, *What players see*, *Code map*,
*How it works*, *Invariants*, *Tests*, *Common changes*, *Known issues* — so an
agent can find the same kind of fact in the same place in any area.
