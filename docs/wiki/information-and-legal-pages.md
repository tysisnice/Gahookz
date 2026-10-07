# Information and legal pages

> Two plain reading pages inside the game: `/information` explains how the modes work, and `/legal` holds the rules, terms and privacy notice.

**Area:** [UI shell](../areas/README.md) · **Status:** live · **Last reviewed:** 2026-10-04

## What it is

**`/information`** is a short library of player guides: a Gahookz overview, a
Majority Rulez guide and a Herd guide, chosen from a list on the left (the choice
is kept in the address, for example `/information#herd`). It once also held the
product roadmap, launch checklist and operations notes. Those moved into the
repository, and their old addresses now show a "has moved" notice so bookmarks
still work. The welcome screen does not link to this page and no in-app link was
found (unverified for every menu), so it is reached by address.

**`/legal`** holds four short documents in plain English: Community rules, Terms
of use, Privacy, and Contact and takedown (`/legal#privacy`, and so on). The
welcome screen links to it as "Rules, terms & privacy". The page states it was
written in good faith and has not been reviewed by a lawyer. The privacy notice
says guest play keeps nothing on the server beyond the life of the room, with no
analytics, advertising or trackers.

Both pages are part of the same browser app. They are available even when the game server is offline or updating, because the
offline and update screens skip them.

## Rules and numbers

- `/information` shows its guide as "reviewed 10 August 2026" and `/legal` says "Last updated 6 September 2026". Both dates are typed into the source and do not update themselves.
- Known stale or wrong statements (also recorded in the verification file):
  the Contact document says "use the report button in the room", but the browser has no report button yet (see [Moderation](moderation.md));
  the privacy notice says a room ends "a few minutes after everyone leaves", while the server keeps an abandoned room for 60 seconds (see [Rooms and room codes](rooms-and-codes.md)).

## Where it lives

| Part | Code |
| --- | --- |
| Information guides | `standalone/public/client/information.jsx` — `InformationHub` |
| Legal documents | `standalone/public/client/legal.jsx` — `LegalHub` |
| Routing to both pages | `standalone/public/app.jsx` — `getRoute` |
| Static rewrite | `standalone/server.js` — `serveStatic` |
| Welcome-screen link | `standalone/public/app.jsx` (`welcome-legal-link`) |
| Moved reports | `docs/product/internal-reports.md` |
| Tests | `standalone/smoke-information.mjs` |

## Related

- [Moderation](moderation.md)
- [Accounts and career stats](accounts-and-career.md)
- [Install and offline](install-and-offline.md)

## History

- 2026-07-20 — `/information` reports page in the first commit.
- 2026-09-06 — `/legal` rules, terms, privacy and contact added with host moderation.
- 2026-09-12 — `/information` rewritten for players; operator reports moved to the repository (P11).
- 2026-10-04 — Page written; two stale statements on the legal page recorded.
