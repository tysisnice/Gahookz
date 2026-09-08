// One definition of "this file is a Syncthing artifact, not project source".
//
// Syncthing leaves two kinds of file in the working tree: conflict copies
// (`app.sync-conflict-20260907-203159-CIYEAQN.jsx`) and its own temporary
// files (`.syncthing.app.jsx.tmp`). Neither is source. Both must be refused
// consistently, because a rule that is enforced in some places and not others
// is worse than no rule: it hides a stale copy in whichever path forgot.
//
// This module is the single source of that policy. It is used by the static
// file server, the browser build, and smoke-test discovery. `.dockerignore`,
// `tsconfig.web.json` and the CI guards express the same rule in their own
// syntaxes, which cannot import from here; when this changes, change those too.
//
// Deliberately dependency-free so the build script, the server and a bare
// smoke script can all import it.

import path from "node:path";

/**
 * True when a path names a Syncthing artifact rather than project source.
 * Accepts an absolute path, a relative path, or a bare file name, and matches
 * on the final path segment only — a directory called `archive/` holding
 * conflict copies is not itself an artifact.
 */
export function isSyncArtifact(filePath) {
  const fileName = path.posix.basename(String(filePath).replaceAll("\\", "/"));
  return fileName.includes(".sync-conflict-") || fileName.startsWith(".syncthing.");
}
