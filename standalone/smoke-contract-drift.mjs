// Real responses, validated against the contracts (P01 steps 2 and 5).
//
// The contracts package used to be checked only against a committed fixture
// corpus, and nothing checked that the corpus still resembled the server. By
// 2026-10-22 it did not: the server had been sending `gameFamily`,
// `quizScoring`, `lockedRules`, `settingsRevision` and eleven more fields for
// some time, every fixture predated them, and the test suite was green
// throughout -- because the snapshot schema passed unknown keys through and
// the fixtures were never recaptured.
//
// So this suite takes the live server as the authority on three questions:
//
//   1. does every snapshot the server actually produces, in every phase of all
//      three modes, satisfy the phase-discriminated contract?
//   2. does it send any field the contract neither describes nor knowingly
//      tolerates -- that is, has anything appeared that nobody has decided about?
//   3. has the committed corpus drifted from the live shape, in either direction?
//
// Question 3 is the one that failed silently before. It is asked by comparing
// the fresh capture with the files on disk, and the answer is actionable:
// `npm run capture:fixtures` against a disposable server.
import assert from "node:assert/strict";
import fs from "node:fs";

import { captureFixtures, FIXTURE_DIR } from "./capture-fixtures.mjs";
import {
  ApiErrorSchema,
  HealthResponseSchema,
  PublicSnapshotSchema,
  undescribedSnapshotKeys
} from "../packages/contracts/src/index.ts";

const BASE_URL = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";

const issues = (parsed) => JSON.stringify(parsed.error.issues.slice(0, 3));
const live = await captureFixtures(BASE_URL);
const names = Object.keys(live).sort();
const snapshotNames = names.filter((name) => !name.startsWith("error.") && !name.startsWith("health"));
assert(snapshotNames.length >= 30, "The capture journey should reach every phase of all three modes");

// --- 1. Every live snapshot satisfies the phase-discriminated contract ------
const health = HealthResponseSchema.safeParse(live["health"]);
assert.equal(health.success, true, "A live health response must satisfy its schema: " + (health.success ? "" : issues(health)));

for (const name of names.filter((entry) => entry.startsWith("error."))) {
  const parsed = ApiErrorSchema.safeParse(live[name]);
  assert.equal(parsed.success, true, name + " must satisfy the error contract: " + (parsed.success ? "" : issues(parsed)));
}

for (const name of snapshotNames) {
  const parsed = PublicSnapshotSchema.safeParse(live[name]);
  assert.equal(parsed.success, true, name + " does not satisfy the contract for its phase: " + (parsed.success ? "" : issues(parsed)));
}

// --- 2. Nothing undecided ---------------------------------------------------
for (const name of snapshotNames) {
  const extra = undescribedSnapshotKeys(live[name]);
  assert.deepEqual(
    extra, [],
    name + " carries field(s) the contract neither describes nor tolerates: " + extra.join(", ") +
    ". Describe them in PublicSnapshotSchema or add them to TOLERATED_SNAPSHOT_KEYS on purpose."
  );
}

// --- 3. The committed corpus still matches the live shape -------------------
const committed = {};
for (const file of fs.readdirSync(FIXTURE_DIR).filter((entry) => entry.endsWith(".json"))) {
  committed[file.replace(/\.json$/, "")] = JSON.parse(fs.readFileSync(new URL(file, FIXTURE_DIR), "utf8"));
}

const missingFiles = names.filter((name) => !(name in committed));
assert.deepEqual(missingFiles, [], "The journey now produces fixture(s) that were never committed: " + missingFiles.join(", ") + ". Run npm run capture:fixtures.");

const keysOf = (payloads) => {
  const keys = new Set();
  for (const name of Object.keys(payloads)) {
    if (name.startsWith("error.") || name.startsWith("health")) continue;
    for (const key of Object.keys(payloads[name])) keys.add(key);
  }
  return keys;
};
const liveKeys = keysOf(live);
const committedKeys = keysOf(committed);
const appeared = [...liveKeys].filter((key) => !committedKeys.has(key)).sort();
const vanished = [...committedKeys].filter((key) => !liveKeys.has(key)).sort();
assert.deepEqual(appeared, [], "The server now sends snapshot field(s) no fixture has: " + appeared.join(", ") + ". Run npm run capture:fixtures.");
assert.deepEqual(vanished, [], "The fixtures still carry snapshot field(s) the server no longer sends: " + vanished.join(", ") + ". Run npm run capture:fixtures.");

// Phase membership is part of the shape: a fixture named for a phase it was
// not captured in is how the corpus lied about covering the building phase.
for (const name of snapshotNames) {
  assert.equal(
    live[name]["phase"], committed[name]["phase"],
    name + " was captured in phase " + live[name]["phase"] + " but the committed fixture is " + committed[name]["phase"]
  );
}

// --- The phase gates, in words, so a failure reads like the defect ----------
for (const name of snapshotNames) {
  const snapshot = live[name];
  const question = snapshot["currentQuestion"];
  if (!question) continue;
  const revealed = snapshot["phase"] === "reveal" || snapshot["phase"] === "finished";

  if (!revealed) {
    assert.equal(question.correctAnswerId, null, name + ": the answer key reached a client before the reveal");
    for (const answer of question.answers) {
      assert.equal(answer.author, null, name + ": an answer author was named before the reveal");
      assert.equal("correct" in answer, false, name + ": an answer was marked correct before the reveal");
    }
  }
  if (snapshot["phase"] === "reading") {
    assert(question.answers.length > 0, name + ": the reading phase should list the answer shapes");
    for (const answer of question.answers) {
      assert.equal(answer.text, "", name + ": answer text appeared while the question was still being read out");
    }
  }
  if (revealed && question.mode === "herd") {
    for (const answer of question.answers) {
      assert(answer.author?.id, name + ": a Herd answer was not attributed at the reveal");
      assert(Number.isInteger(answer.authoredPoints), name + ": a Herd author was not told what their answer earned");
    }
  }
  for (const results of [question.majorityResults, question.herdResults]) {
    if (!results) continue;
    assert(
      !results.tieBrokenBySpeed || results.tieBreakReason === "fastest" || results.tieBreakReason === "average",
      name + ": the reveal says speed broke a tie that " + results.tieBreakReason + " actually settled"
    );
    assert(
      results.tieBreakReason === "none" || results.tiedByVotes,
      name + ": the reveal explains a tie-break for a round that was not tied"
    );
  }
}

const reasons = new Set();
for (const name of snapshotNames) {
  for (const results of [live[name]?.currentQuestion?.majorityResults, live[name]?.currentQuestion?.herdResults]) {
    if (results) reasons.add(results.tieBreakReason);
  }
}
// A corpus where every round had a clear winner never exercises the tie rules,
// which is why the capture splits the vote deliberately.
assert(reasons.size >= 2 && !(reasons.size === 1 && reasons.has("none")), "The journey should produce a real tie as well as a clear winner, saw: " + [...reasons].join(", "));

console.log("Contract drift smoke passed: " + snapshotNames.length + " live snapshots satisfy their phase contract, " +
  liveKeys.size + " snapshot fields accounted for, corpus matches the server, tie reasons seen: " + [...reasons].sort().join("/") + ".");
