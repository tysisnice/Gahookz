# Social — area guide

Last verified against the code: 2026-10-07, commit 30ba1ce

## Purpose

Social owns everything one player can do *to or with* another outside the
quiz itself: the Gahook (a poke that throws a cartoon character at someone),
its escalations (Ultimate, Counter, GET GOT), the finale cheers and boos, the
character registry and player-drawn custom Gahooks, the 1v1 Gahook Arena, room
chat, painting over the lobby wall, and the offline Gahook Dash game.

Almost all of it is cosmetic. The one exception is the **steal**: during a
question a Gahook moves points, and GET GOT costs points, but only when the
host leaves "Gahook effects" on **Chaos**. Scoring rules for the steal belong
to game-flow ([scoring wiki page](../wiki/scoring.md)); this guide owns when a
Gahook may be sent and what it triggers. Guests must be able to use every
feature here with no account (rule 1 in `CLAUDE.md`).

Wiki pages: [Gahooks](../wiki/gahooks.md),
[Gahook characters](../wiki/gahook-characters.md),
[Custom Gahooks](../wiki/custom-gahooks.md),
[Gahook Arena](../wiki/gahook-arena.md), [Room chat](../wiki/room-chat.md),
[Lobby painting](../wiki/lobby-painting.md),
[Gahook Dash](../wiki/gahook-dash.md).

## What players see

- **Gahook buttons** next to every player in the lobby roster and in the
  in-round roster. A Gahook lands on the target as a full-screen character
  animation with a sound, the sender's name and the sender's chosen character
  (or custom Gahook).
- **In a question** each player gets **one Gahook per question**, shared by
  the reading, answering and reveal phases. It steals 50 points (Chaos only).
  Gahooking yourself is only a local animation.
- **Spam escalates.** Many Gahooks at one player turn into an **Ultimate
  Gahook** (bigger, stacking), and if the pile reaches 50 the target is
  **GET GOT** for everyone to see, costing 1,000 points under Chaos.
- **A Counter Gahook offer** appears for a player who has been Gahooked 10
  times in a row by one sender in the lobby: a 6.5 s "left an opening" prompt
  that fires back a Gahook, which in turn opens a short window to challenge
  that sender to the Arena.
- **Finale:** Congratulate and Boo buttons on the winner row, the leaderboard
  and the award rows. Many congratulations make an Ultimate Congratulations.
- **Gahook Arena:** a 1v1 tap duel in the lobby (challenge from a player's
  menu, or from the counter window), with a countdown, a rope-style score, and
  10 seconds of crowd congratulations and boos afterwards.
- **Room chat:** a floating chat bubble while the room waits (minimised by
  default, with unread count and short notifications).
- **Lobby painting:** a Draw button that lets a player scribble over the
  lobby player wall in their own colour.
- **Character picker and Custom Gahook creator** in the player menu (up to
  three drawn frames, a background colour, an effect and a sound).
- **Gahook Dash,** a one-button runner, on the "No lobby, still Gahooky" screen
  that appears when the server cannot be reached.

## Code map

| Concern | Where |
| --- | --- |
| Gahook sending, spam, Ultimate, Counter, GET GOT, steal, effects policy, finale pokes, Arena routes and lifecycle, chat and whiteboard routes, Dash route, custom Gahook routes | `standalone/server.js`: `pokePlayer`, `pokeFromPlayer`, `roundPokeFromPlayer`, `claimQuestionGahookUse`, `counterPokeFromPlayer`, `registerGahookSpam`, `registerCounterGahookSpam`, `registerCongratulationsSpam`, `applyGetGot`, `gahookEffectsPolicy`, `finalPokeTarget`, `shamePokeFromPlayer`, `challengeGahookDuel`, `acceptGahookDuel`, `tapGahookDuel`, `reactToGahookArena`, `finishGahookDuel`, `scheduleGahookDuelDeadline`, `handleGahookDuelDisconnect`, `publicGahookDuel`, `updatePlayerGahookForm`, `updatePlayerCustomGahook`, `selectPlayerCustomGahookSlot`, `updatePlayerDash`, `postRoomChat` |
| Arena rules (pure) | `standalone/server/arena.mjs`: `initialiseArena`, `tapArena`, `pressesRequiredAtLead`, `arenaPressTable`, `arenaProgress`, `nextArenaTarget` |
| Custom Gahook validation | `standalone/server/custom-gahook.mjs`: `normaliseCustomGahook`, `publicCustomGahook`, `customGahookOptions` |
| Chat, whiteboard, reports | `standalone/server/social.mjs`: `addChatMessage`, `addWhiteboardStroke`, `clearWhiteboard`, `clearWhiteboardForPlayer`, `removeChatMessage`, `consumeRate` (reports and removal belong to systems, see [systems](systems.md)) |
| Custom slot persistence for accounts | `standalone/server/accounts.mjs`: `customGahookSlotCount`, `saveCustomGahook` (owned by [accounts](accounts.md)) |
| Character registry and legacy ids | `standalone/public/client/gahook-forms.js`; the server mirrors it with `GAHOOK_FORMS`, `LEGACY_GAHOOK_FORMS`, `normaliseGahookForm` in `server.js` |
| Character art and Gahook overlay | `standalone/public/client/presentation.jsx` (`GahookFormVisual`, `GahookOverlayVisual`, `PokeJumpScare`), sounds in `client/audio.js` (audio-art owns both) |
| Arena client | `standalone/public/client/arena.jsx` (`ArenaOverlay`, `TapMatch`, `ArenaSpectator`, `isArenaThrownGahook`), `client/arena.css`; crowd controls `GahookArenaCrowdControls` in `app.jsx` |
| Custom Gahook creator | `standalone/public/client/custom-gahook.jsx` (`CustomGahookCreator`), drawing in `client/drawing.jsx` |
| Chat bubble, lobby paint | `standalone/public/client/social.jsx` (`WaitingRoomSocial`, `LobbyPaintLayer`); mounted by `app.jsx` |
| Roster, picker, counter prompt, rules dialog | `standalone/public/app.jsx`: `GahookRoster`, `GahookFormPicker`, `CounterGahookPrompt`, `GahookEffectsHelp`, `HostRulesModal`, `optimisticPokePayload` |
| Gahook Dash | `standalone/public/client/offline.jsx`: `GahookDash`, `useServerConnection`, `OfflineExperience` |

## How it works

### Every Gahook is `pokePlayer`

Each route below ends in `pokePlayer(room, { playerId }, fromName, options)`.
It checks the phase (the lobby always passes; any other phase must be in the
route's `allowPhases`), requires a **connected** target, then in order:

1. **Steal.** In `reading`, `answering` or `reveal`, for a sender other than the
   target, only if `gahookScoringAllowed(room)` (Chaos): the target loses and
   the sender gains `GAHOOK_STEAL_POINTS`. Final and interactive kinds never steal.
2. **Spam and escalation** (below), setting `kind` to `normal`, `ultimate`,
   `get-got`, `counter`, `duel-challenge`, `congrats`, `boo` or `ultimate-congrats`.
3. **Records** `player.latestPoke` (the object every client animates from), clears
   the target's lobby paint (`clearWhiteboardForPlayer`), publishes a room-wide
   `latestRoomPoke` for GET GOT, and adds `gahooksSent` and `gahooksReceived`
   career stats when sender and target differ.
4. Broadcasts a snapshot immediately, unless the caller batches it.

### Which route sends what

| Route | Who, when | Notes |
| --- | --- | --- |
| `/api/player/poke` | Players, any phase that `pokePlayer` allows (lobby, building, reading, answering, reveal, finished) | In a live phase it claims the question's one use first. Under policy `off` it is refused in a live phase. |
| `/api/player/round-poke` | Players, `reading` and `answering` only | The browser uses this during the question; claims the one use; target must be connected and not self. |
| `/api/host/poke` | The host (also a player if seated) | Same rules, host name "Host" if not seated. |
| `/api/player/counter-poke` | Lobby and building | Needs the live `counterOffer`. |
| `/api/player/final-poke`, `/api/host/final-poke` | Finished only | `finalKind` `congrats`, `boo`, or none (a plain Gahook). Moves no points. |
| `/api/player/shame-poke` | Finished only | Gahooks the last-place player. The browser no longer calls it (it uses `final-poke`); the route is still served. |
| `/api/player/duel-react` | Lobby and building, after an Arena | Crowd congrats or boo at the Arena winner or loser. |

**One use per question.** `claimQuestionGahookUse` stores
`room.game.pokeUses["question:<index>:<senderId>"] = targetId` and refuses a
second claim with "You already used your Gahook for this question." The key
covers reading, answering and reveal of the same question; the map is reset
when the next question starts. A failed `pokePlayer` releases the claim.
Lobby and finale Gahooks are not limited.

### Effects policy: off, mini, visual, chaos

`room.gahookEffects` is one of `GAHOOK_EFFECT_POLICIES = ["off", "mini",
"visual", "chaos"]` (also in `packages/contracts/src/host-settings.ts`), default
`DEFAULT_GAHOOK_EFFECTS = "chaos"`; the host sets it in the Lobby rules dialog
(`HostRulesModal`, `/api/host/settings`, lobby phases only; picker order Off,
Mini, Visual only, Chaos) and it is published as `gahookEffects`. Enforcement
lives in `server.js`:

- **Off means no gahooking.** `gahookEffectsAllowed` (policy is not `off`) is
  checked in the dispatcher for every Gahook route in every phase
  (`EFFECT_GATED_GAHOOK_ROUTES`: `/api/player/poke`, `round-poke`,
  `counter-poke`, `shame-poke`, `final-poke` and `/api/host/poke`,
  `/api/host/final-poke`): error "The host has turned Gahook effects off for
  this game." Finale congratulations and boos travel through `final-poke`
  (`finalPokeTarget`), so they are refused too. The client hides every Gahook
  button (`useGahooksOff`: player cards, leaderboards, reveal, finale cards,
  roster, counter prompt). `smoke-room-rules` covers a lobby Gahook and the
  finale pokes under Off.
- **Mini** allows Gahooks but every client draws them as the small pop-up
  (`MiniGahookLayer`, the style a host gets in the lobby) instead of the
  `PokeJumpScare` takeover: `PlayerView` routes every incoming Gahook to
  `showMiniPoke`, and Get Got room overlays and counter-offer takeovers are
  skipped (the counter offer stays as `CounterGahookPrompt`). No points move.
- `gahookScoringAllowed` (policy is `chaos`) gates the steal in `pokePlayer`
  and the GET GOT penalty in `applyGetGot`: the "no points move" rule for
  Mini and Visual only, on every route.

The three "Reduce Gahook effects" switches (join screen, Lobby rules, player
Settings) all use `useReducedEffects`, so they reduce effects and mute sound
together.

A separate switch, `room.lobbyArenaEnabled` (default true), makes
`/api/player/duel-challenge` answer "The host has turned off lobby duels." and
cancels any pending or running duel without forfeits when switched off. A
third, `room.allowCustomGahooks` (default true), is covered under custom
Gahooks.

### Ultimate Gahook, GET GOT and the spam streak

Per target, `registerGahookSpam` keeps a streak: a Gahook that arrives within
`ULTIMATE_GAHOOK_SPAM_IDLE_MS` of the previous one continues it; otherwise the
streak restarts at 1. When the streak has lasted `thresholdMs` the Gahook
becomes `ultimate`. The first threshold is `ULTIMATE_GAHOOK_BASE_THRESHOLD_MS`
and each Ultimate raises that target's threshold by
`ULTIMATE_GAHOOK_THRESHOLD_STEP_MS` (reset by `resetUltimateGahookThreshold`
when a game starts or the lobby resets). The starting stack is the streak
count (at least 1, at most `ULTIMATE_GAHOOK_MAX_STACK`). While an Ultimate is
active (`ultimateGahookUntil`, extended `ULTIMATE_GAHOOK_GRACE_MS` by every
Gahook) each further Gahook adds 1 to the stack; when the stack reaches the
maximum the kind becomes **`get-got`**: `applyGetGot` subtracts
`GET_GOT_SCORE_PENALTY` (live phases under Chaos only), resets the target's
state and `latestRoomPoke` shows it to the whole room. A timer
(`scheduleUltimateGahookReset`) ends the Ultimate when the grace passes.

### Counter Gahook

`registerCounterGahookSpam` counts Gahooks from **one sender** to one target
within `COUNTER_GAHOOK_SPAM_IDLE_MS` of each other. At
`COUNTER_GAHOOK_TRIGGER_COUNT` and every `COUNTER_GAHOOK_REPEAT_EVERY`
after that (10, 12, 14, ...) the target gets `counterOffer`
(valid `COUNTER_GAHOOK_OFFER_MS`). `/api/player/counter-poke` (lobby or
building only) spends it: a `counter` Gahook ("Spam returned") goes to the
spammer and opens `COUNTER_GAHOOK_OVERLAY_MS` in which the spammer can be
challenged to the Arena. A counter never steals or escalates.

### Congratulations, boos and the finale

`final-poke` with `finalKind` `congrats` or `boo` (finished phase only) never
steals. Congratulations have their own streak, `registerCongratulationsSpam`:
an **Ultimate Congratulations** starts when either `ULTIMATE_CONGRATS_TRIGGER_COUNT`
congratulations from at least `ULTIMATE_CONGRATS_MIN_SENDERS` different
senders land inside the idle gap `ULTIMATE_CONGRATS_SPAM_IDLE_MS`, or the
streak has run `ULTIMATE_CONGRATS_THRESHOLD_MS` with at least 4. Then it
stacks (grace `ULTIMATE_CONGRATS_GRACE_MS`, cap `ULTIMATE_CONGRATS_MAX_STACK`).
Boos have no escalation. Spotlight and shame rows (best and worst question,
last place) call the same route: see [finale](../wiki/finale.md), whose UI
(`PartyFinalScoreboard`, `FinalSpotlightRow`, `FinalShameRow`) belongs to
ui-game. Arena crowd reactions reuse the `congrats` and `boo` kinds in the
lobby with the messages "ARENA CHAMPION" and "GET GOT".

### Characters and custom Gahooks

`GAHOOK_FORMS` (server) and `GAHOOK_FORMS` (client registry) both list
`monkey`, `gorilla`, `pig`, `koala`, `croc`, `chicken`; `custom` is a seventh
form that is not in the picker list but is accepted. The labels are Classic
Monkey, Rage Gorilla, Sad Pig, Chonky Koala, Cool Croc, Cymbal Chicken and
"Your Custom Gahook". **Sad Pig replaced Airhorn Capy** (decided 2026-09-25, landed 2026-09-30 in `77534e0`); the
legacy id `capybara` maps to `pig` in both `LEGACY_GAHOOK_FORMS` tables, on read
and write, in saved accounts (`normaliseGahookForm` is passed to the account
service) and in a browser's stored choice. Unknown ids become `monkey`.

`custom` is refused with "Custom Gahooks are disabled in this room." when
`room.allowCustomGahooks === false`. When the host turns it off, every player on
`custom` is switched to `monkey` and remembered in `hiddenGahookForm`; turning
it back on restores them. Players joining while it is off get `monkey`.

Custom Gahook validation (`normaliseCustomGahook`, in `custom-gahook.mjs`)
produces `{ version: 2, name, frames, backgroundId: "monkey", backgroundColor,
effectId, soundId, customAudioDataUrl, customAudioName }`:

- frames: at most `MAX_CUSTOM_GAHOOK_FRAMES`, each stored through
  `storeRoomImage` capped at `MAX_CUSTOM_GAHOOK_FRAME_CHARS`; stored values must
  match the room-media URL pattern `/media/<code>/<32 hex>`;
- name cleaned to 32 characters (default "My Gahook");
- background colour: one of `CUSTOM_GAHOOK_BACKGROUND_COLORS` is offered by the
  UI, but the server accepts any `#rrggbb`; legacy ids `burst`, `checker`,
  `void`, `confetti` map to colours;
- effect in `CUSTOM_GAHOOK_EFFECT_IDS`, sound in `CUSTOM_GAHOOK_SOUND_IDS`;
- `custom` sound needs an uploaded or recorded clip, stored through
  `storeRoomAudio` capped at `MAX_CUSTOM_GAHOOK_AUDIO_CHARS`; its name is cut to
  64 characters.

Only the lobby and building phases may edit or switch slots. **Slots:** every
player has `LOCAL_CUSTOM_GAHOOK_SLOTS` slots that live on the room player (no
sign-in). An account's `customGahookSlotCount` is the local count plus its
`custom_gahook_slot` entitlement, clamped to 12; a slot below the account's
count is also saved to the account (`saveCustomGahook`, at most
`MAX_SAVED_GAHOOK_CHARS` serialised) and wins over the room copy when the slot
is selected. `persisted` in the response is true only when that account write
happened.

### The Gahook Arena

A duel lives on `room.gahookDuel` (one per room) with `status` `challenge`,
`active` or `finished`.

1. **Challenge.** `/api/player/duel-challenge` (lobby or building, duels
   enabled) either names a `playerId` (player menu; one challenge per
   challenger per `GAHOOK_DUEL_CHALLENGE_MS`; target connected, not self, not
   banned) or, with no `playerId`, uses the challenger's own `counter` Gahook
   while its `duelChallengeUntil` is open. It refuses if the room already has a duel.
   It creates the duel and sends the target a `duel-challenge` Gahook. The
   challenge expires after `GAHOOK_DUEL_CHALLENGE_MS` (timer
   `scheduleGahookDuelDeadline`).
2. **Accept.** `/api/player/duel-accept` by the challenged player starts
   `active`: intro `GAHOOK_ARENA_INTRO_MS` (countdown), then play until
   `ARENA_DURATION_MS` after the intro ends; `initialiseArena` seeds
   `ARENA_TARGET_BUFFER` targets per player.
3. **Tap.** `/api/player/duel-tap` with the duel id and the player's current
   target id. `tapArena` rejects non-competitors, bad ids, taps before GO or
   after the end, and out-of-date targets; a retried (already accepted) target
   returns `duplicate: true` and never scores twice. A press scores when the
   player's `charge` reaches `pressesRequiredAtLead(lead)`: one press per point,
   except at a lead of `ARENA_LEAD_TO_WIN - ARENA_CLOSING_POINTS` or more (4 or
   5), where it takes `ARENA_CLOSING_PRESSES` (2). A part-charged point is
   dropped if the lead changes (the opponent scores), so it cannot be banked.
   First to a lead of `ARENA_LEAD_TO_WIN` (**6**, was 5 before 2026-09-26) wins
   with `resultReason` `lead`. The server publishes `leadToWin` and
   `pressesByLead` so the browser's optimistic projection follows the same table.
   If the clock runs out with nobody six ahead it is a draw (`time`, no winner).
4. **Finish.** `finishGahookDuel` records the result (winner's
   `gahookDuelWins` +1) and keeps the result open for `GAHOOK_DUEL_FINISH_MS`.
   Anyone who is not one of the two competitors may react with
   `congrats` (at the winner) or `boo` (at the loser) via `duel-react` until
   `reactionEndsAt`; the server sets no per-person cap on reactions.
   Then `clearGahookDuel`.
5. **Cleanup.** A disconnect (`handleGahookDuelDisconnect`) ends an active duel
   as a win for the other player (`left`) and drops a pending challenge. A duel is
   also cleared when the host starts a game, Herd answer writing begins, the
   lobby resets, the room expires or duels are switched off. No score changes
   at any point: the Arena awards no points ([scoring](../wiki/scoring.md)).

Tappable thrown minis: while someone is in a duel, ordinary and Ultimate
Gahooks thrown at them are drawn inside the arena as tappable buttons (at most
4 at once, see `ARENA_THROWN_MINI_MS`, `isArenaThrownGahook`); tapping one
Gahooks the sender back through `/api/player/poke`.

### Chat and lobby painting

Both live in `server/social.mjs` and are open to seated players and the host
(`getSocialActor`; the host appears as "Host" with the crown). Both are refused
unless the phase is `lobby`, `building` or `herd-writing` ("<Chat/The whiteboard>
is available while the room is waiting."; `WAITING_PHASES`). Every limit below
applies unchanged in `herd-writing`.

- **Chat.** `addChatMessage`: control characters stripped, whitespace collapsed,
  `MAX_CHAT_MESSAGE_CHARS` per message, empty refused, rate limited by
  `consumeRate` per credential (`CHAT_RATE_MAX` per `CHAT_RATE_WINDOW_MS`:
  "Chat is moving quickly."). The last `MAX_CHAT_MESSAGES` are kept. The host
  can remove a message; it stays as a "removed" tombstone with no text or picture.
- **Painting.** The same whiteboard transport. A stroke is a tool (`brush` or
  `eraser`), a `#rrggbb` colour, a size of small, medium or large (3, 7 or 14)
  and 1 to `MAX_WHITEBOARD_POINTS_PER_STROKE` points inside 0..1; at most
  `STROKE_RATE_MAX` strokes per `STROKE_RATE_WINDOW_MS`; the last
  `MAX_WHITEBOARD_STROKES` are kept. **Clear** removes only the caller's own
  strokes (one per `CLEAR_RATE_WINDOW_MS`). Being Gahooked erases the target's
  own strokes. The lobby layer (`LobbyPaintLayer`) uses one fixed brush
  (`LOBBY_PAINT_BRUSH` 7), opacity `LOBBY_PAINT_OPACITY` 0.6 and the player's
  profile colour.

### Gahook Dash

`GahookDash` in `client/offline.jsx` is a single-canvas runner: tap for a hop,
hold for a full jump, Space or Arrow Up when focused. The speed is
`min(540, 275 + score x 0.72)` pixels per second, score grows 12 per second,
and the player's character is chosen from the same registry. The best score is
kept in this browser under `gahookz-offline-high-score`. It is mounted only by
`OfflineExperience` (the server-down screen, with "No lobby, still Gahooky.").
The server also has `/api/player/dash` (`updatePlayerDash`: score clamped to
0..999999, `playerY` to -260..0, lobby and building only) and public player
fields `dashScore`, `dashTopScore` and so on, plus a `roomMode` prop on the
component, but **nothing in the browser mounts the room mode today**. See
Known issues.

### Constants

One place for every number above. Update here first.

| Constant | Value | File |
| --- | --- | --- |
| `GAHOOK_STEAL_POINTS` | 50 | `server.js` |
| `GET_GOT_SCORE_PENALTY` | 1000 | `server.js` |
| `DEFAULT_GAHOOK_EFFECTS` | `chaos` (policies `off`, `visual`, `chaos`) | `server.js` |
| `ULTIMATE_GAHOOK_SPAM_IDLE_MS` | 1200 | `server.js` |
| `ULTIMATE_GAHOOK_BASE_THRESHOLD_MS` | 5000 | `server.js` |
| `ULTIMATE_GAHOOK_THRESHOLD_STEP_MS` | 1000 | `server.js` |
| `ULTIMATE_GAHOOK_GRACE_MS` | 1000 | `server.js` |
| `ULTIMATE_GAHOOK_MAX_STACK` | 50 | `server.js` |
| `COUNTER_GAHOOK_TRIGGER_COUNT` | 10 | `server.js` |
| `COUNTER_GAHOOK_REPEAT_EVERY` | 2 | `server.js` |
| `COUNTER_GAHOOK_SPAM_IDLE_MS` | 2200 | `server.js` |
| `COUNTER_GAHOOK_OFFER_MS` | 6500 | `server.js` |
| `COUNTER_GAHOOK_OVERLAY_MS` | 2750 | `server.js` |
| `ULTIMATE_CONGRATS_TRIGGER_COUNT` | 8 | `server.js` |
| `ULTIMATE_CONGRATS_MIN_SENDERS` | 3 | `server.js` |
| `ULTIMATE_CONGRATS_THRESHOLD_MS` | 5000 (with at least 4 congratulations) | `server.js` |
| `ULTIMATE_CONGRATS_SPAM_IDLE_MS` | 1200 | `server.js` |
| `ULTIMATE_CONGRATS_GRACE_MS` | 1000 | `server.js` |
| `ULTIMATE_CONGRATS_MAX_STACK` | 50 | `server.js` |
| `GAHOOK_DUEL_CHALLENGE_MS` | 6500 (also the per-challenger cooldown) | `server.js` |
| `GAHOOK_ARENA_INTRO_MS` | 2400 | `server.js` |
| `GAHOOK_DUEL_FINISH_MS` | 10000 | `server.js` |
| `ARENA_LEAD_TO_WIN` | 6 | `server/arena.mjs` |
| `ARENA_DURATION_MS` | 45000 | `server/arena.mjs` |
| `ARENA_TARGET_BUFFER` | 12 | `server/arena.mjs` |
| `ARENA_CLOSING_POINTS` / `ARENA_CLOSING_PRESSES` | 2 / 2 | `server/arena.mjs` |
| `MAX_CUSTOM_GAHOOK_FRAMES` | 3 | `server/custom-gahook.mjs` |
| `LOCAL_CUSTOM_GAHOOK_SLOTS` | 2 | `server/custom-gahook.mjs` |
| `MAX_CUSTOM_GAHOOK_FRAME_CHARS` | 180000 | `server/custom-gahook.mjs` |
| `MAX_CUSTOM_GAHOOK_AUDIO_CHARS` | 280000 | `server/custom-gahook.mjs` |
| `CUSTOM_GAHOOK_EFFECT_IDS` | `shake`, `spin`, `bounce`, `zoom` | `server/custom-gahook.mjs` |
| `CUSTOM_GAHOOK_SOUND_IDS` | `bonk`, `honk`, `boing`, `airhorn`, `none`, `custom` | `server/custom-gahook.mjs` |
| `CUSTOM_GAHOOK_BACKGROUND_COLORS` | 8 colours, `#ff3d8b` first | `server/custom-gahook.mjs` |
| `MAX_CLOUD_CUSTOM_GAHOOK_SLOTS`, `MAX_SAVED_GAHOOK_CHARS` | 12, 1000000 | `server/accounts.mjs` |
| Browser upload and recording limits | image 130000 bytes, audio 200000 bytes, recording 5000 ms (defaults; the creator may be given the server's `limits` instead, unverified) | `client/custom-gahook.jsx` |
| `MAX_CHAT_MESSAGES`, `MAX_CHAT_MESSAGE_CHARS` | 60, 240 | `server/social.mjs` |
| `CHAT_RATE_MAX` per `CHAT_RATE_WINDOW_MS` | 6 per 10000 | `server/social.mjs` |
| `MAX_WHITEBOARD_STROKES`, `MAX_WHITEBOARD_POINTS_PER_STROKE` | 160, 128 | `server/social.mjs` |
| `STROKE_RATE_MAX` per `STROKE_RATE_WINDOW_MS` | 60 per 10000 | `server/social.mjs` |
| `CLEAR_RATE_MAX` per `CLEAR_RATE_WINDOW_MS` | 1 per 2000 | `server/social.mjs` |
| `LOBBY_PAINT_OPACITY`, `LOBBY_PAINT_BRUSH` | 0.6, 7 | `client/social.jsx` |
| Dash score clamp, `playerY` clamp | 0..999999, -260..0 | `server.js` |

Reports (`REPORT_RATE_MAX` 5 per 60 s, `MAX_REPORTS` 40) live in the same file
and belong to [systems](systems.md).

## Invariants

- The server decides everything: scores, the one-use-per-question rule, spam
  and escalation, and every Arena result. The browser's optimistic Gahook and
  Arena projection are replaced by the next snapshot.
- Under policy other than Chaos no Gahook ever changes a score, on any route.
- A Gahook needs a connected target; in a question it needs a different player.
- The Arena never changes a score, and at most one duel exists per room.
- Arena presses are numbered by *press*, not by point, and `tapArena` is the
  only code that changes `hits`.
- Chat, painting and Dash are refused outside the waiting phases on the server,
  whatever the browser shows.
- `LEGACY_GAHOOK_FORMS` exists on both sides and must stay in step; a retired
  character id is mapped, never dropped.
- Custom Gahook media is stored by the server (`/media/<code>/<hash>`); a
  client-supplied URL that is not a stored room-media path is discarded.
- Every Gahook feature works for guests; accounts only add durable slots.

## Tests

Run under the shared lock with Node 24 (`export PATH=$HOME/.local/opt/node-v24.13.1-linux-x64/bin:$PATH`).

```bash
# unit tests (includes standalone/server/arena.test.mjs and client/gahook-forms.test.ts)
flock /tmp/gahookz-verify.lock npm run check
# Gahooks, steal, Ultimate, counter, one use per question, finale pokes, form picker
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run standalone:smoke:gahooks
# effects policy, lobby duels switch, defaults
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run standalone:smoke:room-rules
# Arena lifecycle: expiry, draw, cleanup, kick, host exits seat
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run standalone:smoke:arena
# Custom Gahook and chat / whiteboard creation and media
flock /tmp/gahookz-verify.lock npm run test:disposable -- bash -c "npm run standalone:smoke:social-creation && npm run standalone:smoke:social-media"
# Dash route
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run standalone:smoke:dash
# Arena in two real browsers (needs a build first: npm run build)
flock /tmp/gahookz-verify.lock npm run test:disposable -- npm run test:browser:arena
```

`arena.test.mjs` covers the six-point lead, two-press closing pulls, charge
drop, retries, privacy of targets and 2,000 seeded races. The smokes assert a
mix of server behaviour and source text; a legitimate rename may mean updating
an assertion. The `off` policy gap in Known issues is **not** covered by any
test (`smoke-room-rules` only exercises `/api/player/poke`).

## Common changes

- **Add a character.** Add the id and label to `GAHOOK_FORMS` in
  `client/gahook-forms.js` and in `server.js`; add art in `presentation.jsx`,
  a sound in `audio.js` and a Dash sprite in `offline.jsx`; if it replaces one,
  add the old id to both `LEGACY_GAHOOK_FORMS` tables; update
  `gahook-forms.test.ts`, [Gahook characters](../wiki/gahook-characters.md) and
  the tutorial art (audio-art owns art and sound).
- **Change a spam or Arena number.** Edit the constant (listed above), run the
  smokes, and update the Constants table, the wiki page and `Last reviewed`. The
  Arena table is published to the browser, so only `arena.mjs` changes.
- **Gate a new Gahook route by the effects policy.** Check
  `gahookEffectsAllowed(room)` for live phases in the dispatcher next to
  `/api/player/poke`, and add a smoke for each route.
- **Add a custom Gahook option (effect, sound, colour).** Add the id to the
  `CUSTOM_GAHOOK_*` list in `custom-gahook.mjs` and to the matching list in
  `client/custom-gahook.jsx`, then to the renderer in `presentation.jsx` and
  `audio.js`; the validators accept only listed ids.
- **Change a chat or paint limit.** Edit `social.mjs`; the browser's own 60 and
  240 limits are in `client/social.jsx` and must match.

## Known issues

Backlog: see [the backlog](../backlog.md). Found while writing this guide:

- **Reports in the browser** (resolved 2026-10-08). `ReportProvider` in `app.jsx`
  and `client/report.jsx` add Report controls (chat messages, question authors,
  revealed Herd answers), "Report a problem" in the player menu and a host
  "Reports" list in the host menu, over the existing `/api/player/report`,
  `/api/host/report/resolve` and (for chat) `/api/host/remove-content`. Report
  subjects now include `question` and `room`. Voting tiles carry no Report
  control (they are tap targets); an answer is reportable at the reveal.
- **Chat and painting in Herd writing** (resolved 2026-10-08): the server now
  accepts `herd-writing`, as the browser always offered.
- **Room Dash is dormant.** `/api/player/dash`, the `dash*` player fields and
  `GahookDash`'s `roomMode` exist but no screen mounts room mode.
- **`/api/player/shame-poke` is unused** by the browser.
- **The server accepts any `#rrggbb` custom Gahook colour**, though the creator
  offers eight.
