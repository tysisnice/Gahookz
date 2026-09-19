# Mobile UI changes — verification record

Scope: `MOBILE-UI-PLAN.md`, derived from `/Vault/Mobile UI changes.md`. Branch
`overhaul/quiz-herd-p00-p12`, on top of the desktop-UI work already in the tree.
`/Vault` was read only. No production, beta or port 3102 process was queried or
changed, and `scripts/docker-deploy.sh` was never run. Every browser run owns a
disposable server on `127.0.0.1:3199` through `npm run test:disposable`.

Failures are preserved: `browser-1.log` through `browser-6.log` are kept in
order, and the first four of them failed.

## Progress

| Item | Status | Verified at |
| --- | --- | --- |
| 1 — lobby bottom padding, chat bubble overlap | **Done** | 360×800, scrolled fully down |
| 2 — tutorial mode buttons fit one row | **Done** | 360×800 |
| 3 — profile picture picker shows 3 rows | **Done** | 360×800 portrait; 740×360 landscape |
| Desktop unchanged | **Confirmed** | 1440×1000 |

## Coordination with the desktop work

`DESKTOP-UI-PLAN.md` and its evidence were read first, as the plan requires.
The desktop agent had moved lobby painting onto the player wall (stage E) and
resized the tutorials (stage F). Both were extended rather than undone:

- Every change here is inside a `max-width` media query, so desktop rules are
  untouched. This is asserted, not assumed — see *Desktop is unchanged* below.
- The lobby padding was checked against the new paint surface specifically,
  because the plan warned it must not create a dead zone that swallows strokes.

## How it was verified

`npm run check` cannot prove any of this; a build only proves the JSX parses.
A new harness drives real Chromium at real phone sizes and measures geometry:

```bash
npm run test:disposable -- node standalone/browser-mobile-ui.mjs
```

Registered as `npm run test:browser:mobile`. Viewports: **360×800** (small
Android portrait), **740×360** (short landscape), **1440×1000** (desktop
control), all with `isMobile`/`hasTouch` set.

Final run — [`browser-6.log`](browser-6.log), exit 0:

```json
{
  "ok": true,
  "checked": [
    "lobby scrolled fully down leaves every player banner clear of the chat bubble",
    "lobby paint canvas still covers the full wall including the new bottom padding",
    "all three game-mode tutorial tabs fit one row at 360px without clipping, still >=40px tall",
    "profile picture picker shows 3 full rows at 360x800",
    "short landscape 740x360 shows 2 full rows before scrolling, keeps the join action reachable, and scrolls rather than clips",
    "desktop at 1440x1000 keeps full-width tutorial tabs and no phone-sized lobby padding"
  ]
}
```

---

## Item 1 — Lobby padding and the chat bubble

The minimized chat is a 58px circle pinned to the bottom-right of the viewport
(`.social-chat-fab` inside `.waiting-room-social.is-minimized`, which is fixed
at `bottom: max(8px, env(safe-area-inset-bottom))` below 760px). Scrolled fully
down, it sat on the last player's banner.

Space is **reserved** rather than the bubble being moved, exactly as the plan
directs — a control that jumps around while you are reading is worse than one
that is simply out of the way:

```css
.setup-lobby .player-wall,
.building-lobby .player-wall,
.player-party-lobby .player-wall {
  padding-bottom: calc(58px + 18px + env(safe-area-inset-bottom));
}
```

The check scrolls to the true bottom of the document, then counts
`.player-card` rectangles that intersect the bubble's rectangle. It asserts the
count is zero **and** that the page really was scrolled to the bottom, because
the test is meaningless otherwise.

**The paint-surface warning was real and is covered.** `.lobby-paint__canvas`
is `inset: 0` against `.player-wall`, so padding on the wall grows the canvas
with it. The harness asserts the canvas bottom tracks the wall bottom to within
2px, which is what proves the reserved strip is still drawable rather than a
dead zone.

Screenshot: [`lobby-360-scrolled-bottom.png`](lobby-360-scrolled-bottom.png).

## Item 2 — Tutorial mode buttons

**First attempt failed** ([`browser-1.log`](browser-1.log)): Herd wrapped to a
second row.

```
Quiz, Majority Rulz and Herd should share one row at 360px, saw 2 rows:
[{"mode":"quiz","top":65,...},{"mode":"majority","top":65,...},{"mode":"herd","top":110,...}]
```

Shrinking the tabs alone was not enough, and measuring showed why: the tabs
were not short of *tab* width, they were short of *container* width.
`.tutorial-guide__header` pads 48px on each side to clear the
absolutely-positioned close button — which sits up beside the heading, a row
above the tabs. The tabs never needed that clearance; they were simply paying
96px for it. They now reclaim it:

```css
.tutorial-mode-tabs { gap: 5px; margin-inline: -40px; }
.tutorial-mode-tab  { min-width: 0; min-height: 40px; padding-inline: 7px; font-size: 0.66rem; }
```

Dropping `min-width` mattered as much as the negative margin: at 96px, "Quiz"
and "Herd" were each being padded out to the width of "Majority Rulz".

The check asserts all three share a row, that no label is clipped
(`scrollWidth > clientWidth`), that none runs off screen, and that each stays
**at least 40px tall** so the buttons do not become too small to hit. Screenshot:
[`tutorial-tabs-360.png`](tutorial-tabs-360.png).

## Item 3 — Profile picture picker

Portrait was straightforward: the form claimed only `100dvh - 220px` and gave
the picker a 160px floor, which is not quite two rows of 92px choices. It now
takes back most of that space with a floor of three rows plus their gaps
(`3 × 92 + 2 × 8 = 292px`):

```css
.party-join-form {
  height: max(430px, calc(100dvh - 130px));
  grid-template-rows: auto auto minmax(292px, 1fr) auto;
}
```

Measured result: **3 full rows visible at 360×800 without scrolling.**
Screenshot: [`profile-picker-360.png`](profile-picker-360.png).

### Short landscape took three attempts, and the first fix was wrong

[`browser-2.log`](browser-2.log) failed on an assertion that was itself wrong —
it demanded the whole form fit inside a 360px-tall viewport, which the plan
never asked for. The plan permits scrolling and forbids clipping. The assertion
was corrected to check that everything stays *reachable*: scroll to the bottom,
and the join action must be on screen.

[`browser-5.log`](browser-5.log) then failed honestly, at 0 visible rows. A
direct measurement of the landscape layout found the cause:

```
viewport 740×360 · form top 192, height 340
grid rows: 76px 76px 56px 52px  ← the picker row got 56px
scroller height 32px, one choice 52px
```

Pinning the form to the viewport height had backfired. Roughly 190px of page
sits above the form at that size, so "viewport height" left the picker a 32px
slot — not even one full row. The form now sizes to its content and the page
scrolls, with the picker given a real two-row ceiling instead of the leftovers:

```css
@media (max-width: 900px) and (max-height: 560px) {
  .party-join-form { height: auto; max-height: none; grid-template-rows: auto auto auto auto; }
  .party-join-form .avatar-picker > div { grid-template-columns: repeat(6, minmax(0, 1fr)); height: auto; max-height: 118px; }
  .avatar-choice { min-height: 52px; }
}
```

Measured result: **2 full rows before scrolling**, scroller 118px, join action
reachable, nothing clipped. Three rows are not achievable at 360px of height
without hiding the page header, which is out of scope; the plan's fallback —
scroll rather than clip — is what is implemented. Screenshot:
[`profile-picker-740x360.png`](profile-picker-740x360.png).

## Desktop is unchanged

Asserted rather than assumed. At 1440×1000 the harness confirms the tutorial
tabs keep their full ≥96px width and the player wall has **no** phone-sized
bottom padding. A direct measurement also confirmed the mobile rules do not
leak: computed tab `font-size` is `14.4px` (0.9rem, the desktop value, not the
0.66rem phone value) and `.tutorial-mode-tabs` `margin-left` is `0px`, not
`-40px`. Screenshot: [`desktop-unchanged-1440.png`](desktop-unchanged-1440.png).

One brittle assertion of my own was corrected along the way
([`browser-3.log`](browser-3.log)): desktop tab tops measured 130, 131, 131 —
a sub-pixel artifact, not a wrap. "Same row" is now a <5px tolerance, which
still catches a real wrap easily, since a wrap moves a tab a full ~45px.

## Preserved failures

| Log | Exit | What happened |
| --- | --- | --- |
| [browser-1.log](browser-1.log) | 1 | Herd tab wrapped to a second row at 360px |
| [browser-2.log](browser-2.log) | 1 | Short-landscape assertion was wrong: demanded the form fit the viewport |
| [browser-3.log](browser-3.log) | 1 | Desktop row check too brittle; 1px sub-pixel spread read as a wrap |
| [browser-4.log](browser-4.log) | 0 | Passed, but recorded only 0 full picker rows in short landscape |
| [browser-5.log](browser-5.log) | 1 | Landscape two-row requirement added; failed honestly at 0 rows |
| [browser-6.log](browser-6.log) | 0 | Final: all six checks pass |

`browser-4.log` is kept deliberately. It exited 0, but the run it records was
not good enough — it showed no full rows of profile pictures in short
landscape. A passing exit code is not the same as a met requirement.

## Deferred

- **Physical devices.** Everything here is Chromium at a phone-sized viewport
  with `isMobile`/`hasTouch`. That is not a real phone: it does not prove
  browser chrome height, dynamic toolbars that change `100dvh` while scrolling,
  or real touch accuracy. iOS Safari in particular is unverified.
- **Three rows in short landscape.** Not achievable at 360px of viewport height
  without restructuring the page above the form. The plan's stated fallback is
  implemented instead.

## Commands

```bash
npm run check                                                   # 186 passed, 0 failed
npm run test:disposable -- node standalone/browser-mobile-ui.mjs   # browser-1..6.log
```
