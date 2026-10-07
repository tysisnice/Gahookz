# Tutorials

> A short "How to play" picture guide that explains the game in three steps.

**Area:** [ui lobby](../areas/ui-lobby.md) · **Status:** live · **Last reviewed:** 2026-10-07

## What it is

"How to play" is a dialog with a drawn three-step picture and three short
sentences. It opens from the welcome screen ("How to play & tutorials"), from a
**How to play** button in the lobby, and by itself the first time a player or
host reaches a screen for that mode. Each device remembers what it has already
shown, so the dialog does not keep reappearing.

There are four tabs on the welcome screen: **Gahookz** (a general overview),
**Quiz**, **Herd** and **Host**. Inside a room the Host tab shows only for the
host, and the overview tab is only on the welcome screen. There is no Majority
Rulez tab: it is a scoring switch on Quiz, so the Quiz guide's second step
says "In Majority Rulz, the most popular answer wins." A room set to Majority
Rulez opens the Quiz guide.

## Rules and numbers

- Every guide has exactly three steps, each with a title and one sentence.
- Quiz steps: "Make your own questions", "Answer fast to score", "Sabotage
  your friends!"
- Close with **Let's Go!**, the close button, Escape, or a tap outside. Back
  also closes it ([navigation](navigation-and-back-button.md)).
- The seen-flag is local to the device and per mode (key prefix
  `gahookz-how-to-play-seen-v2-`).
- The dialog is a labelled modal: focus moves in and returns, Tab stays inside,
  arrow keys, Home and End move between tabs.
- The unused Majority picture still exists in the artwork file but no tab
  reaches it.
- The sentences spell the mode "Majority Rulz" while the rest of the game says
  "Majority Rulez"; the copy has not been unified.

## Where it lives

| Part | Code |
| --- | --- |
| Dialog and all copy | `standalone/public/client/tutorial.jsx` — `GameTutorial`, `TUTORIAL_CONTENT` |
| Pictures | `standalone/public/client/tutorial-art.jsx` — `TutorialArtwork` |
| Launcher and first-time logic | `standalone/public/app.jsx` — `ModeTutorialLauncher`, `WelcomeScreen` |
| Tests | `standalone/smoke-onboarding.mjs` |

## Related

- [Majority Rulez](majority-rulez.md)
- [Herd](herd.md)
- [Quiz · Classic](quiz-classic.md)
- [Lobby](lobby.md)

## History

- 2026-10-07 — The Majority Rulz tab was removed; Quiz step 2 now explains the majority rule in one line.
- 2026-09-30 — New tutorial artwork module and captures (U7).
- 2026-08-26 — Majority Rulez and Herd modes added with their guides.
- 2026-07-20 — First "How to play" dialog in the initial project.
