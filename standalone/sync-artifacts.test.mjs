import assert from "node:assert/strict";
import test from "node:test";

import { isSyncArtifact } from "./sync-artifacts.mjs";
import { isExecutableSmokeFile, selectProductionPortDefaults } from "./smoke-policy.mjs";

const UNSAFE = 'const BASE_URL = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3102";';
const SAFE = 'const BASE_URL = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";';

test("Syncthing conflict copies and temporary files are artifacts", () => {
  assert.equal(isSyncArtifact("smoke-regressions.sync-conflict-20260907-203159-CIYEAQN.mjs"), true);
  assert.equal(isSyncArtifact("app.sync-conflict-20260824-100000-ABCDEFG.jsx"), true);
  assert.equal(isSyncArtifact(".syncthing.app.jsx.tmp"), true);
});

test("real project source is never mistaken for an artifact", () => {
  for (const name of ["smoke-regressions.mjs", "app.jsx", "server.js", "sync-artifacts.mjs"]) {
    assert.equal(isSyncArtifact(name), false, name + " must be treated as source");
  }
});

test("the artifact rule matches on the file name, not the directory", () => {
  // An archive directory holding conflict copies is not itself an artifact,
  // and a canonical file inside one must still be readable as source.
  assert.equal(isSyncArtifact("archive/sync-conflicts-2026-09-07/MANIFEST.md"), false);
  assert.equal(isSyncArtifact("/abs/archive/sync-conflicts-2026-09-07/files/app.jsx"), false);
  assert.equal(isSyncArtifact("archive/x/app.sync-conflict-20260907-1-A.jsx"), true);
});

// The two halves of the P00 rule. Both must hold at once: relaxing the check
// so an ignored conflict copy stops failing the suite must not also stop it
// catching a canonical file that really would run against production.

test("an ignored conflict copy is not treated as an executable smoke test", () => {
  const conflict = "smoke-regressions.sync-conflict-20260907-203159-CIYEAQN.mjs";
  assert.equal(isExecutableSmokeFile(conflict), false);
  assert.deepEqual(selectProductionPortDefaults([[conflict, UNSAFE]]), []);
});

test("a canonical smoke file defaulting to the production port still fails", () => {
  assert.equal(isExecutableSmokeFile("smoke-regressions.mjs"), true);
  assert.deepEqual(
    selectProductionPortDefaults([["smoke-regressions.mjs", UNSAFE]]),
    ["smoke-regressions.mjs"]
  );
});

test("the conflict exemption does not hide a real canonical offender beside it", () => {
  const entries = [
    ["smoke-regressions.sync-conflict-20260907-203159-CIYEAQN.mjs", UNSAFE],
    ["smoke-roles.mjs", SAFE],
    ["smoke-herd-flow.mjs", UNSAFE]
  ];
  assert.deepEqual(selectProductionPortDefaults(entries), ["smoke-herd-flow.mjs"]);
});

test("smoke discovery only executes files named smoke-*.mjs", () => {
  assert.equal(isExecutableSmokeFile("smoke-roles.mjs"), true);
  assert.equal(isExecutableSmokeFile("smoke-deployment.mjs"), true);
  assert.equal(isExecutableSmokeFile("simulate-games.mjs"), false);
  assert.equal(isExecutableSmokeFile("smoke-notes.md"), false);
});
