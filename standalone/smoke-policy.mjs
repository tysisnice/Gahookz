// Rules about the smoke suite itself, kept pure so they can be tested without
// touching the filesystem or standing up a server.
//
// The stateful smoke suite creates and mutates real rooms in whatever server
// it is pointed at. On this host port 3102 is production, so a smoke file that
// defaults to 3102 will run against real players' games the moment someone
// types `npm test` without exporting the environment variables. That is the
// hazard `smoke-deployment.mjs` exists to catch.

import { isSyncArtifact } from "./sync-artifacts.mjs";

// Matches a BASE_URL fallback that points at the production port instead of
// the disposable one. Written as a regular expression rather than spelled out
// in prose on purpose: this detector scans smoke source as plain text, so a
// file that merely *documents* the unsafe literal would report itself.
const PRODUCTION_PORT_DEFAULT = /BASE_URL \|\| "http:\/\/127\.0\.0\.1:3102"/;

/** True when a file name is one the smoke runner would actually execute. */
export function isExecutableSmokeFile(fileName) {
  return /^smoke-.*\.mjs$/.test(fileName) && !isSyncArtifact(fileName);
}

/**
 * Given `[fileName, source]` pairs, return the names of the smoke files that
 * would send the suite at production.
 *
 * Syncthing conflict copies are skipped, and skipped *before* the content
 * check rather than after: a conflict copy is not a file the suite can run,
 * so reporting it is a false alarm that cannot be fixed by editing source —
 * the only remedy is deleting an ignored file, which is not what this check is
 * for. Every other path in the project (the static server, the browser build,
 * the TypeScript projects, `.dockerignore` and CI) already refuses these
 * files; smoke discovery was the one place that did not, so it failed on an
 * ignored August copy while the canonical file was correct.
 *
 * A canonical file with the unsafe default is still reported. That is the
 * whole point of the check and must not be weakened to make the suite green.
 */
export function selectProductionPortDefaults(entries) {
  return entries.
    filter(([name]) => !isSyncArtifact(name)).
    filter(([, source]) => PRODUCTION_PORT_DEFAULT.test(source)).
    map(([name]) => name);
}
