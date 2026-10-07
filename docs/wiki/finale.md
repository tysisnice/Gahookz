# Finale

> When the last question ends, the room sees the final scores, cheers the winner, boos the loser and plays again.

**Area:** [game flow](../areas/game-flow.md) · **Status:** live · **Last reviewed:** 2026-10-04

## What it is

After the last reveal the game is Finished. A crowd cheer plays for everyone, and the screen shows:

- **Winner row.** "Final scores are in", then "Name wins!". Players tied on top get "It's a tie!" and each is a joint winner, with a **Congratulate** button.
- **Final leaderboard.** Every player, with a **Boo** button on each row. Tied scores share a rank.
- **Party awards**, the "shame row": the **Best** and **Worst question** (or prompt in Herd), by the room's Good and Nah votes, with **Congratulate** and **Send a boo**. A single lowest scorer is the "Last place legend", with **Send a boo**.

Congratulations, boos and Gahooks open only now: before the end the server answers "Final Gahooks open at the end." Many congratulations at once can set off an Ultimate Congratulations ([Gahooks](gahooks.md)).

The host also sees **New game with same rules**, which resets scores, keeps the unplayed questions and returns to question writing. **Reset Lobby** clears the scores and goes back to a clean lobby. The previous game's summary is kept for the lobby ([Lobby](lobby.md)).

## Rules and numbers

- If everyone ties it is a shared win with no loser.
- Finale Gahooks, congratulations and boos move no points ([Scoring](scoring.md)).
- **The cheer** (2026-09-25 update): a brass fanfare and about three seconds of crowd roaring, whooping and clapping. It plays once per game for everyone. Refreshing or joining a finished game does not replay it, and Mute silences it.
- Signed-in players also see whether their career result has synced. Guests see nothing different ([Accounts and career stats](accounts-and-career.md)).

## Where it lives

| Part | Code |
| --- | --- |
| Host screen | `standalone/public/app.jsx` — `FinishedScreen` |
| Player screen | `standalone/public/app.jsx` — `PartyFinalScoreboard`, `FinalSpotlightRow`, `FinalShameRow`, `getFinalSpotlights` |
| Cheer | `standalone/public/client/audio.js` — `playGameWinCheer`, `syncGameSoundCues` |
| Server | `standalone/server.js` — `finalPokeTarget`, `resetLobby`; `standalone/server/scoring.mjs` — `scorePlacements` |
| Tests | `standalone/smoke-finals.mjs`, `standalone/browser-audio-cues.mjs` |

## Related

- [Reveal and results](reveal-and-results.md), [Music and sound](music-and-sound.md), [Gahooks](gahooks.md)

## History

- 2026-07-20 — Final scoreboard, awards, congratulations, boos and New game exist from the first commit (`dd449f2`).
- 2026-10-03 — The crowd cheer replaces the old victory sound, once per game (`f997566`).
