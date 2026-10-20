import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Regression guard for the backlog item "publicMajorityResults sets unanimous
// twice": a repeated key in the returned object is dead code that silently
// shadows the first value. server.js has no parser dependency here, so the
// function is sliced by brace counting and its returned object's top-level
// keys are collected line by line.
const serverPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "server.js");
const lines = readFileSync(serverPath, "utf8").split("\n");

function stripNoise(line) {
  return line.replace(/\/\/.*$/, "").replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
}

function braceDelta(line) {
  let delta = 0;
  for (const char of line) {
    if (char === "{") delta += 1;
    if (char === "}") delta -= 1;
  }
  return delta;
}

function majorityResultKeys() {
  const start = lines.findIndex((line) => line.startsWith("function publicMajorityResults("));
  assert.notEqual(start, -1, "publicMajorityResults must stay a top-level function in server.js");

  const keys = [];
  let depth = 0;
  let returnDepth = null;
  for (let i = start; i < lines.length; i += 1) {
    const line = stripNoise(lines[i]);
    if (returnDepth === null && /^\s*return \{/.test(line)) returnDepth = depth + 1;
    if (returnDepth !== null && depth === returnDepth) {
      const key = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*):/);
      if (key) keys.push(key[1]);
    }
    depth += braceDelta(line);
    if (i > start && depth === 0) break;
  }
  return keys;
}

test("publicMajorityResults returns each object key exactly once", () => {
  const keys = majorityResultKeys();
  assert.ok(keys.includes("unanimous"), "the guard must actually see the function's keys");
  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
  assert.deepEqual(duplicates, [], `duplicate keys in publicMajorityResults: ${duplicates.join(", ")}`);
});
