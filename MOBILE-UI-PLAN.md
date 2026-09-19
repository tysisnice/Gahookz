# Mobile UI changes — implementation plan

Source: `/Vault/Mobile UI changes.md` (3 screenshots, all present in
`/Vault/Archive/attachments/`). Repo: `/mnt/storage/syncthing/codex/2026-07-01/Gahookz`,
branch `overhaul/quiz-herd-p00-p12`.

Scope: mobile and narrow screens only. Three items. This is a small, focused
plan — do not expand it into a general mobile overhaul.

## Ground rules

- **Never touch production or beta.** Stateful runs use a disposable server via
  `npm run test:disposable -- <command>`. Never run `scripts/docker-deploy.sh`.
- `/Vault` is **read-only**.
- The tree carries uncommitted work from earlier agents. **Do not revert, stash,
  reset or commit other people's changes.** If `git status` surprises you, stop
  and report.
- `standalone/public/app.jsx` is 242KB — targeted edits only.
- A passing build does not prove mobile layout. Verify at real narrow viewports.

## Coordination warning

A desktop-UI agent has already changed some of these same files and may have
altered the components you are about to touch (menus, tutorials, lobby). **Read
`DESKTOP-UI-PLAN.md` and `docs/verification/2026-09-19-desktop-ui/README.md`
first** so you extend that work instead of undoing it. Where desktop and mobile
requirements differ, use responsive rules — never break desktop to fix mobile.

---

## Item 1 — Lobby bottom padding and chat bubble overlap

Screenshot: `Screenshot_20260919_161906_Gallery.jpg`

- Add extra bottom padding to the lobby so it does not feel cramped.
- When the player is scrolled all the way down, the chat bubble must **not**
  cover a player's banner. Reserve space for it (bottom padding equal to the
  bubble's height plus a gap) rather than repositioning the bubble on scroll.

Note a desktop-UI agent is adding lobby banner **painting** in the same
container. Keep your padding change compatible with that drawing surface —
padding should not create a dead zone that swallows strokes.

## Item 2 — Tutorial mode buttons too big on mobile

Screenshot: `Screenshot_20260919_161856_Gallery.jpg`

The Quiz / Majority Rulez / Herd buttons at the top of the tutorials are too
large and cramped on mobile. Make them smaller so **all three fit side by side**
on a phone width without wrapping or clipping.

The desktop-UI agent is separately fixing tutorial sizing and number alignment.
Scope your change to narrow viewports via media query so the two do not fight.

## Item 3 — Profile picture picker too cramped

Screenshot: `Screenshot_20260919_161847_Gallery.jpg`

The picker box is too small. Enlarge it to fill most of the screen so **at least
3 rows of profile pictures are visible** without scrolling. Keep it usable at
small heights (short landscape) — if 3 rows genuinely cannot fit, scroll rather
than clip.

---

## Verification

```bash
npm run check    # must stay 177 passed, 0 failed
npm run test:disposable -- npm run test:browser
```

Then check each item at real mobile viewports — at minimum a 360×800-class
portrait phone and one short-landscape size. Confirm:
- Scrolled fully down, no banner sits under the chat bubble.
- All three tutorial buttons on one row, no clipping.
- Three rows of profile pictures visible.
- **Desktop is unchanged** — re-check the same screens at desktop width.

Extend `standalone/browser-flow.mjs` with a narrow-viewport pass if practical.

## Reporting

Write evidence to `docs/verification/2026-09-19-mobile-ui/README.md`: exact
commands, raw output, viewport sizes tested. **Preserve failures** — never
overwrite a failed run with a passing rerun. Record anything deferred and why.

If a change conflicts with desktop work already in the tree, stop and write it
down rather than guessing.
