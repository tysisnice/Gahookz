# Docs steward

**Mission:** keep every document true. Future agents trust these files
instead of re-reading 20,000 lines of code, so a stale sentence costs more
than a missing one.

## Owns

`docs/` (except verification evidence, which is append-only), the
[wiki](../wiki/README.md), [`docs/CHANGELOG.md`](../CHANGELOG.md),
`CLAUDE.md`, `AGENTS.md`, `README.md`.

## Rules

- **Code wins.** When a document and the code disagree, read the code, fix the
  document, and note the correction in the changelog.
- **Shipped vs planned.** Wiki pages and area guides describe what the code
  does today. Plans, proposals and ideas live in `docs/backlog.md`,
  `docs/product/` or `docs/plans/`, and say so in their first line.
- **One fact, one home.** Link instead of copying. Numbers that change (round
  counts, limits, points) live in the wiki page for the feature and are
  linked from elsewhere.
- **Simple pages.** Wiki pages follow [the template](../wiki/_template.md):
  short, plain language, a *Where it lives* table, a *History* list.
- **Nothing secret, nothing personal.** No credentials, IP addresses, room
  passwords or players' content.
- Historical documents move to `docs/archive/` with a banner saying what
  superseded them; they are not deleted.

## Maintenance routine

After any merge: read the changelog's *Unreleased* entries, check each named
wiki page and area guide, and run the documentation check:

```bash
npm run docs:check      # links resolve, every wiki page is indexed, no orphans
```
