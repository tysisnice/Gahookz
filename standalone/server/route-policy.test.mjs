import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

import { HOST_ONLY_ROUTES, isHostOnlyRoute, knownHostRoutes } from "./route-policy.mjs";

const server = fs.readFileSync(new URL("../server.js", import.meta.url), "utf8");
const lines = server.split("\n");

/** Every `/api/host/...` path the server actually answers. */
function hostRoutesInServer() {
  const found = new Set();
  for (const match of server.matchAll(/pathname === "(\/api\/host\/[a-z0-9/-]+)"/g)) {
    found.add(match[1]);
  }
  return [...found].sort();
}

test("every host route the server answers is guarded by requireHost", () => {
  // The check that matters. A forgotten guard is invisible: the route works,
  // the suite passes, and any player can end everyone's game.
  const unguarded = [];
  lines.forEach((line, index) => {
    if (!/pathname === "\/api\/host\//.test(line)) return;
    const window = lines.slice(index, index + 4).join("\n");
    if (!window.includes("requireHost")) unguarded.push(line.trim());
  });
  assert.deepEqual(unguarded, [], "these host routes have no authorisation check");
});

test("a new host route is host-only by default", () => {
  // Prefix-based, so forgetting to add a route to the list makes it too
  // strict rather than too permissive.
  assert.equal(isHostOnlyRoute("/api/host/something-added-later"), true);
  assert.equal(isHostOnlyRoute("/api/player/poke"), false);
  assert.equal(isHostOnlyRoute("/api/question"), false);
  assert.equal(isHostOnlyRoute(""), false);
  assert.equal(isHostOnlyRoute(null), false);
});

test("the policy table matches the routes the server really has", () => {
  const actual = hostRoutesInServer();
  const declared = knownHostRoutes().sort();
  const missing = actual.filter((route) => !declared.includes(route));
  const stale = declared.filter((route) => !actual.includes(route));
  assert.deepEqual(missing, [], "host routes exist that the policy table does not name");
  assert.deepEqual(stale, [], "the policy table names routes the server no longer has");
});

test("no host route is served without the /api/host/ prefix", () => {
  // Otherwise the prefix rule above would quietly stop covering it.
  for (const route of HOST_ONLY_ROUTES) {
    assert.ok(route.startsWith("/api/host/"), route + " would escape the prefix rule");
  }
});
