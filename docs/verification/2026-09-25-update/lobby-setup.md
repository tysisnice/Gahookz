# Lobby setup — game length, game cards, rounds wheel, share band, join screen (U2, U3, U6, U17, U4)

Agent branch `agent/lobby-setup` (`96d5b9a`, `51d9dcf`, `386d107`,
`9764a03`), merged in `c14abbc`. The agent's run ended before its write-up;
this record is the orchestrator's, from its commits and the checks below.

## What changed

- **U2.** Quick / Standard / Custom (Quiz) and Quick / Full room / Custom
  (Herd) are one segmented radio row (arrow keys, Home/End, roving tab stop);
  the selected option's description sits at the end of the "Game length"
  heading.
- **U3.** The Quiz and Herd cards put the icon inline with a larger title,
  with the description on the row below.
- **U6.** Custom length uses `NumberWheel` (`client/number-wheel.jsx` and
  `.css`): a scroll-snap strip under a highlighted lens with −/+ buttons,
  spinbutton semantics and keyboard steps. It replaces Herd's raw number
  input (1–20 rounds) and Quiz's 1–5 questions-per-player buttons; the
  existing optimistic host-settings request stays authoritative.
- **U17.** The share band reads **Share Lobby Code** and has about 15 px less
  padding on every side on phones and short landscape screens.
- **U4.** The join screen is one scrolling page. Every profile picture is in
  one grid (four columns on phones, six on desktop) with no nested scroll box;
  the **Join** footer is sticky, respects the bottom safe area and rises above
  an on-screen keyboard (`useKeyboardInset`); the selected picture has a ring
  and a tick. The clipped-Join bug from Tyson's screenshot was reproduced at
  360×740 before the fix.
- Also fixed: the host setup at 761–920 px wide (a phone held sideways) drew
  the controls under the player list.

## Verification (integration branch after merging, Node 24, disposable servers)

| Command | Result |
| --- | --- |
| `npm run check` | exit 0 — 206 unit tests |
| `npm test` | exit 0 — 15,000 seeded games, room expiry, 28 smoke scripts (incl. `smoke-layout` and `smoke-round-presets` updated for the new controls) |
| `npm run test:disposable -- npm run test:browser:mobile` | exit 0 — three avatar rows visible at 360×800, nothing clipped at 740×360, keyboard-open Join check, 320×568 setup check (segments, cards, Share Lobby Code, wheel by +, arrows, End and swipe, confirmed on the server) |
| `test:rooms`, `test:browser`, `test:browser:navigation`, `test:browser:arena` | exit 0 |

Screenshots: [Quiz custom at 320 px](lobby-setup/setup-quiz-custom-320.png),
[Herd custom at 320 px](lobby-setup/setup-herd-custom-320.png). The capture
harness `lobby-setup/capture.mjs` can regenerate a full set at five sizes.
