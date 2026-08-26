# Archived Oddball experiment

Oddball was an unreleased fourth-mode experiment that rewarded the least-picked
answer. It is not part of the active three-mode product (`quiz`, `majority`,
`herd`) and no Oddball branches, prompts, components, scoring, or CSS remain in
the shipped client/server.

The complete pre-removal implementation remains captured in the historical
snapshots under `../herd/snapshots/`:

- `app.jsx` contains the picker art, builder, reveal, and final labels;
- `server.js` contains validation, generated prompts, scoring, and snapshots;
- `styles.css` contains the mode-specific presentation.

Those snapshots are deliberately outside every build and TypeScript include.
If Oddball returns, port its rules into `packages/game-engine` and build it on
the current contracts rather than importing the old monolith branches.
