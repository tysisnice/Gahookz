# lobby-creation verification (wave 2, UI 2 creation tools)

Evidence is produced by `standalone/browser-lobby-creation.mjs` (Puppeteer against the
disposable server, same launch pattern as `browser-mobile-ui.mjs`). It asserts geometry and
saves a screenshot per item at 360x740, 390x844, 320x568 and 1280x800:

    npm run test:disposable -- node standalone/browser-lobby-creation.mjs

All 20 checks (5 items x 4 viewports) pass. Screenshots in this folder are named
`<item>-<screen>-<viewport>.png`.

| Item | What changed | Evidence |
| --- | --- | --- |
| U7 copy | Majority Rulz tutorial tab, content and every launcher path removed (welcome list, mode launcher now maps majority to Quiz). Quiz step 2 is now "Pick the right colour fast: quicker correct answers score more. In Majority Rulez, the most popular answer wins." Art module untouched. | `u7-u13-tutorial-quiz-*.png`; script asserts no `majority` tab and the sentence; the two tabs share one row at 320 px |
| U13 | Step numbers use grid centring plus 4 px bottom padding (the inset shadow made the visible face 34 px). | `u7-u13-tutorial-herd-*.png`; script measures the digit glyph centre against the square (< 3.5 px) for Quiz and Herd at every viewport |
| U8 | "How to play" sits on the right of the "Create questions" heading row (heading no longer wraps; button never shrinks). | `u8-question-time-*.png` (heading row 55 px tall at 360, was ~110) |
| U9 | Draw/Done and Erase mine render (portal) into an empty `.lobby-paint-slot` in the "Players (n)" heading row of every lobby variant (host/player lobby, building, Herd writing), right-aligned, z-index above the paint canvas; tap-off-the-wall still finishes and the Done button does not re-toggle. | `u9-lobby-*.png`, `u9-lobby-paint-drawing-*.png`; script asserts same row, right aligned, tap-off and Done both end drawing |
| U14 | Paint editor: subtitle removed from both dialogs; idle status gone (live region kept, visually hidden, errors still shown); row 1 Undo / Clear canvas / Upload; row 2 brush sizes then Brush / Eraser (icons only at 420 px and below; "image" dropped from Upload at 350 px and below) so neither row wraps at 320; custom colour is a rainbow swatch at the end of the colour row. | `u14-draw-image-*.png`; script asserts no wrap, no clipping, ordering |
| U15 | Native colour dialog replaced by an in-app picker in `custom-gahook.jsx`: 38 swatches (8 brand, 12 bright, 12 deep, 6 neutrals), hue slider, shade slider, editable hex and live preview of the Gahook. Also fixed the creator form being 6-36 px wider than its modal at 320-360 px (grid columns now `minmax(0,1fr)`, footer buttons share the row). The paint editor's custom colour still uses the native input (not converted, see report). | `u15-colour-picker-*.png`; script asserts >= 24 swatches, preview follows swatch/hue/hex, no native input in the background picker, no horizontal overflow |

Tests updated: `smoke-onboarding`, `smoke-social-creation` (picker, no subtitle, no idle status),
`browser-desktop-ui` and `browser-mobile-ui` (two tutorial tabs).
