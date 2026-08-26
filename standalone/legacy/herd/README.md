# Legacy Herd mode

This folder preserves the retired Herd implementation that was active before
Majority Rulz. It is intentionally disconnected from the production client,
server routes, mode selector, build, and smoke suite.

The archived mode asked players to write free-text answers, save answer drafts,
then choose one anonymous favourite. Its server-side ranking algorithm and
end-to-end smoke coverage remain here for a possible future Herd redesign:

- `server/herd-ranking.mjs` contains the one-favourite grouping and scoring
  implementation.
- `tests/smoke-herd-ranking.mjs` contains its pure ranking coverage.
- `tests/smoke-herd-flow.mjs` contains its former HTTP game-flow coverage.
- `client/herd-components.jsx` preserves the retired React component inventory.
- `client/information-report.jsx` preserves the retired in-app product report.
- `server/herd-flow.mjs` preserves the retired room-flow inventory.
- `snapshots/` contains complete pre-refactor tracked source for the former
  client, server, tutorial, room, and media paths. These snapshots keep the
  original components and orchestration recoverable even though they are not
  imported or built.

The focused files preserve the latest extracted Herd-specific artifacts. The
snapshots are broader historical references and may also contain unrelated
code that shared the same monolithic source files.

The active `herd` mode is a separate 2026 rebuild: players author prompts,
receive balanced answer-writing assignments, vote on the room's responses,
and split a maximum of 500 voter points and 500 answer-author points. It uses
the typed engine under `packages/game-engine` and does not import anything in
this legacy folder. If the retired version returns, port individual ideas into
the current contracts rather than reconnecting these files unchanged.
