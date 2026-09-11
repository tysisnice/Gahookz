// Which routes require which authority, stated as data.
//
// Authorisation is currently a `requireHost` call written into each host route
// by hand. All nineteen are guarded today, and the only thing keeping that true
// is that nobody has forgotten one. A forgotten check is invisible: the route
// works, the tests pass, and any player can end everyone's game.
//
// This table makes the rule checkable. It does not replace the per-route calls
// -- doing that would mean moving sixty handlers out of server.js, which is the
// rest of P09 -- but a test can now assert that every route the server answers
// has a stated policy and that every host route is actually guarded.

/** Routes only the room's host may call. */
export const HOST_ONLY_ROUTES = [
  "/api/host/start",
  "/api/host/force-start",
  "/api/host/lock-setup",
  "/api/host/skip",
  "/api/host/pause",
  "/api/host/poke",
  "/api/host/final-poke",
  "/api/host/settings",
  "/api/host/kick",
  "/api/host/unban",
  "/api/host/make-host",
  "/api/host/randomize-player",
  "/api/host/randomize-avatar",
  "/api/host/exit-player",
  "/api/host/question/approve",
  "/api/host/question/reject",
  "/api/host/remove-content",
  "/api/host/report/resolve",
  "/api/host/reset",
  "/api/host/new-game"
];

/**
 * True when a path must be refused for anyone who is not the host.
 *
 * Prefix-based on purpose: a new `/api/host/...` route is host-only by default
 * rather than open by default, so the failure mode of forgetting to update this
 * list is a route that is too strict, not one that is too permissive.
 */
export function isHostOnlyRoute(pathname) {
  return String(pathname || "").startsWith("/api/host/");
}

/** Every host route this table knows about, for the coverage test. */
export function knownHostRoutes() {
  return [...HOST_ONLY_ROUTES];
}
