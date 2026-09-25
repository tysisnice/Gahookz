# Gahookz wiki

One short page per feature: what it is, the rules and numbers, where it lives
in the code, and its history. Pages describe **what the game does today**;
plans live in the [backlog](../backlog.md).

New to the project? Read [How a game works](how-a-game-works.md) first, then
the page for whatever you are about to change. Engineering depth for each part
of the code is in the [area guides](../areas/README.md).

**Keeping it true:** a change that alters a feature updates that feature's
page and adds a line to its *History* (see the
[working agreement](../agents/README.md#documentation-is-part-of-the-change)).
New pages copy [the template](_template.md) and are listed below.
`npm run docs:check` fails if a page is missing from this index or a link is
broken.

## The game

| Page | In one line |
| --- | --- |
| [How a game works](how-a-game-works.md) | The whole journey from "Host" to the final scoreboard |
| [Rooms and room codes](rooms-and-codes.md) | Four-letter rooms, links, QR codes, passwords and room lifetime |
| [Joining and profiles](joining-and-profiles.md) | Names, preset and drawn profile pictures, no account needed |
| [Host and roles](host-and-roles.md) | Host, host-as-player, party screen, host transfer and the host-away timer |
| [Lobby](lobby.md) | The waiting room: share band, players, previous game |
| [Lobby rules](lobby-rules.md) | The host's room-wide rules dialog |
| [Game setup](game-setup.md) | Quiz or Herd, Majority Rulez, game length and rounds |
| [Phases and timers](phases-and-timers.md) | Every phase, how long it lasts, pause and skip |

## Ways to play

| Page | In one line |
| --- | --- |
| [Quiz · Classic](quiz-classic.md) | Write questions with a right answer; answer fast to score |
| [Majority Rulez](majority-rulez.md) | Quiz scoring where the most popular answer wins |
| [Herd](herd.md) | Players write each other's answer options, then vote |
| [Writing questions](question-writing.md) | The question builder, images, approval and readiness |
| [Prompts and suggestions](prompts-and-suggestions.md) | Funny, educational and personalised prompt catalogue; autofill |
| [Scoring](scoring.md) | Every way points are earned or lost |
| [Reveal and results](reveal-and-results.md) | What is shown after each round, and when hidden things become public |
| [Finale](finale.md) | The final scoreboard, spotlights, cheers and boos |

## Gahooks and social

| Page | In one line |
| --- | --- |
| [Gahooks](gahooks.md) | Poking a friend: stealing points, counters, Ultimate Gahooks, GET GOT |
| [Gahook characters](gahook-characters.md) | Monkey, Gorilla, Sad Pig, Koala, Croc, Chicken |
| [Custom Gahooks](custom-gahooks.md) | Drawing your own animated Gahook with a sound |
| [Gahook Arena (1v1)](gahook-arena.md) | The tap tug-of-war duel in the lobby |
| [Room chat](room-chat.md) | The floating chat bubble |
| [Lobby painting](lobby-painting.md) | Drawing over the lobby player wall |
| [Gahook Dash](gahook-dash.md) | The offline runner game |

## Experience

| Page | In one line |
| --- | --- |
| [Tutorials](tutorials.md) | The "How to play" dialogs |
| [Music and sound](music-and-sound.md) | Background music, sound effects and the mute switch |
| [Navigation and the Back button](navigation-and-back-button.md) | Menus, overlays, and never leaving a room by accident |
| [Preferences and accessibility](preferences-and-accessibility.md) | Mute, reduced effects, motion, keyboard and screen readers |
| [Install and offline](install-and-offline.md) | The installable web app and what works without a connection |
| [Information and legal pages](information-and-legal-pages.md) | `/information` guides and `/legal` terms and privacy |

## Behind the scenes

| Page | In one line |
| --- | --- |
| [Accounts and career stats](accounts-and-career.md) | Optional sign-in, career totals, saved Gahooks |
| [Moderation](moderation.md) | Kick, ban, vote kick, reports and removing content |
| [Security and limits](security-and-limits.md) | Rate limits, caps, passwords, credentials and headers |
| [Live connection](live-connection.md) | How browsers stay in sync: commands, SSE, snapshots, reconnects |
| [Hosting and deploys](hosting-and-deploys.md) | Where the game runs and how a release reaches players |
| [Testing](testing.md) | Which checks exist and how to run them safely |
