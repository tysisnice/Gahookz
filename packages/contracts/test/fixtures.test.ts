import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ApiErrorSchema,
  GAME_PHASES,
  HealthResponseSchema,
  PublicSnapshotSchema,
  PublicSnapshotBaseSchema,
  TOLERATED_SNAPSHOT_KEYS,
  normaliseGameSettings,
  undescribedSnapshotKeys
} from "../src/index.ts";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const load = (name: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(path.join(dir, name + ".json"), "utf8")) as Record<string, unknown>;
const names = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
const snapshots = names.filter((name) => !name.startsWith("error.") && !name.startsWith("health"));
const phases = GAME_PHASES as readonly string[];

/**
 * The phase a fixture's name claims, e.g. `majority-reveal.host` claims
 * `reveal` and `herd-writing.player` claims `herd-writing`. A mode prefix is
 * stripped only when what remains is actually a phase, so the `herd-writing`
 * phase is not mistaken for a Herd-mode capture of a `writing` phase.
 */
const claimedPhase = (name: string): string => {
  const head = name.split(".")[0] as string;
  if (phases.includes(head)) return head;
  const withoutMode = head.replace(/^(majority|herd)-/, "");
  if (phases.includes(withoutMode)) return withoutMode;
  // A reconnect is a fresh read for a role that already exists, captured in
  // the lobby because that is where a returning player lands.
  if (head === "reconnect") return "lobby";
  throw new Error("fixture " + name + " does not name a phase");
};

test("the fixture corpus covers every role and phase it claims to", () => {
  for (const required of [
    "health",
    "lobby.host", "lobby.player", "lobby.spectator",
    "building.host", "building.player", "building.author",
    "reading.host", "answering.host", "reveal.host", "finished.host",
    "herd-writing.player", "herd-writing.host", "herd-answering.player", "herd-reveal.host",
    "majority-answering.player", "majority-reveal.host",
    "error.room-missing", "error.unknown-action", "error.not-host",
    "reconnect.player"
  ]) {
    assert.ok(names.includes(required), "missing fixture: " + required);
  }
});

// A fixture that is not what its name says stops being evidence, and the test
// above cannot tell: it only reads the file names. Three did not match on
// 2026-10-22 -- both `building` files held a `lobby` snapshot, so the building
// phase was never covered at all, and `lobby.spectator` was captured with the
// host's own credential, so it recorded `isHost: true`.
test("every fixture was captured in the phase its name claims", () => {
  for (const name of snapshots) {
    assert.equal(load(name)["phase"], claimedPhase(name), name + " was not captured in the phase it claims");
  }
});

test("only the host fixtures were captured as the host", () => {
  for (const name of snapshots) {
    const role = name.split(".").slice(1).join(".");
    assert.equal(
      load(name)["isHost"], role === "host",
      name + " records isHost " + String(load(name)["isHost"]) + ", which contradicts its role"
    );
  }
});

test("the corpus reaches every phase of the game", () => {
  const covered = new Set(snapshots.map(claimedPhase));
  for (const phase of phases) {
    assert.ok(covered.has(phase), "no fixture covers the " + phase + " phase");
  }
});

// The reason this corpus exists: the health schema was strict and narrower
// than what the server actually sends, so it rejected a healthy server. A
// captured real response is the only thing that catches that.
//
// Two are kept. `health` comes from the disposable server these captures run
// against, where there is no release or revision to report; `health.built` is
// the September capture from a built container, which reports both. The schema
// has to accept each, and a new capture must not quietly replace the only
// evidence that it accepts the other.
test("every captured health response satisfies the health schema", () => {
  const captured = names.filter((name) => name.startsWith("health"));
  assert.ok(captured.length >= 2, "keep both a development and a built health capture");
  for (const name of captured) {
    const parsed = HealthResponseSchema.safeParse(load(name));
    assert.equal(parsed.success, true, name + ": " + (parsed.success ? "" : JSON.stringify(parsed.error.issues)));
  }
  assert.equal(load("health.built")["release"] !== "development", true, "health.built should carry a real release");
});

test("every captured snapshot satisfies the public snapshot contract", () => {
  for (const name of snapshots) {
    const parsed = PublicSnapshotBaseSchema.safeParse(load(name));
    assert.equal(parsed.success, true, name + ": " + (parsed.success ? "" : JSON.stringify(parsed.error.issues)));
  }
});

// The base schema above pins eleven fields and passes the rest through, so it
// cannot say when the answer key, the answer text or an author's name becomes
// visible -- which is the part of this payload that matters. The discriminated
// schema says it per phase.
test("every captured snapshot satisfies the contract for its own phase", () => {
  for (const name of snapshots) {
    const parsed = PublicSnapshotSchema.safeParse(load(name));
    assert.equal(parsed.success, true, name + ": " + (parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 3))));
  }
});

test("no snapshot field is left undecided", () => {
  // Every key is either described by the contract or listed as knowingly
  // tolerated. A new server field therefore fails here by name instead of
  // being waved through, which is how fifteen of them went unnoticed.
  for (const name of snapshots) {
    assert.deepEqual(undescribedSnapshotKeys(load(name)), [], name + " carries an undecided field");
  }
});

test("a missing required field is a failure, an unknown added field is not", () => {
  // The distinction P01 step 5 asks for, stated as a test. Forward-compatible
  // additions must not break an older reader; a required field going missing
  // must not pass as one.
  const healthy = load("reveal.host");
  const withAddition = { ...healthy, aFieldFromALaterRelease: { nested: true } };
  assert.equal(
    PublicSnapshotSchema.safeParse(withAddition).success, true,
    "an unknown added field must be tolerated rather than rejected"
  );
  assert.deepEqual(
    undescribedSnapshotKeys(withAddition), ["aFieldFromALaterRelease"],
    "a tolerated addition must still be reported as undecided"
  );

  const { stateVersion: _removed, ...withoutRequired } = healthy;
  assert.equal(
    PublicSnapshotSchema.safeParse(withoutRequired).success, false,
    "a missing required field must fail"
  );

  const withWrongType = { ...healthy, stateVersion: "7" };
  assert.equal(
    PublicSnapshotSchema.safeParse(withWrongType).success, false,
    "a required field of the wrong type must fail"
  );
});

test("the tolerated list stays an honest record of what is not described", () => {
  const seen = new Set<string>();
  for (const name of snapshots) for (const key of Object.keys(load(name))) seen.add(key);
  const stale = TOLERATED_SNAPSHOT_KEYS.filter((key) => !seen.has(key));
  assert.deepEqual(stale, [], "tolerated field(s) no fixture contains: " + stale.join(", "));
});

test("every captured error satisfies the error contract", () => {
  for (const name of names.filter((n) => n.startsWith("error."))) {
    const parsed = ApiErrorSchema.safeParse(load(name));
    assert.equal(parsed.success, true, name + ": " + (parsed.success ? "" : JSON.stringify(parsed.error.issues)));
  }
});

test("a missing room is reported as missing, not as a broken lobby", () => {
  const missing = load("error.room-missing");
  assert.equal(missing["ok"], false);
  assert.equal(missing["roomMissing"], true);
});

test("settings normalisation accepts every captured snapshot", () => {
  // Snapshots now carry the canonical pair as well as the legacy `gameMode`,
  // so normalisation has to accept both together without calling it a
  // contradiction -- the case that matters while clients migrate.
  for (const name of snapshots) {
    const snapshot = load(name);
    const result = normaliseGameSettings(snapshot);
    assert.equal(result.ok, true, name + " must normalise");
    assert.ok(snapshot["gameFamily"] && snapshot["quizScoring"], name + " should carry the canonical settings pair");
  }
});

test("a locked game records the rules it was locked into", () => {
  for (const name of snapshots) {
    const snapshot = load(name);
    if (claimedPhase(name) === "lobby") continue;
    const locked = snapshot["lockedRules"] as Record<string, unknown> | null;
    assert.ok(locked, name + " is mid-game without any locked rules");
    assert.equal(locked["gameMode"], snapshot["gameMode"], name + " disagrees with its own locked mode");
  }
});

test("no fixture contains a credential", () => {
  // Captured from a live server, so this is checked rather than assumed.
  for (const name of names) {
    const text = JSON.stringify(load(name));
    for (const secret of ["playerKey", "password", "ticket", "credential", "hostKey"]) {
      assert.ok(!text.includes('"' + secret + '"'), name + " leaks " + secret);
    }
  }
});

// A blunt substring scan is the wrong test here and reported a false alarm:
// `ownQuestions` legitimately carries `correct` flags, because those are the
// viewer's *own* submitted questions and they wrote the answers. And a Quiz
// question is deliberately credited to its author by name. The properties that
// actually matter are narrower, so they are asserted precisely.
test("the answer key is withheld from players before reveal", () => {
  for (const name of snapshots) {
    if (claimedPhase(name) === "reveal" || claimedPhase(name) === "finished") continue;
    const question = load(name)["currentQuestion"] as Record<string, unknown> | null;
    if (!question) continue;
    assert.equal(question["correctAnswerId"], null, name + " exposes correctAnswerId before the reveal");
    for (const answer of (question["answers"] as Array<Record<string, unknown>>) || []) {
      assert.ok(!("correct" in answer), name + " marks a live answer as correct before reveal");
    }
  }
});

test("answer authorship stays hidden before reveal", () => {
  // This is the anonymity property Herd depends on, and it must hold in every
  // mode: who wrote an answer is not knowable while people are still voting.
  for (const name of snapshots) {
    if (claimedPhase(name) === "reveal" || claimedPhase(name) === "finished") continue;
    const question = load(name)["currentQuestion"] as Record<string, unknown> | null;
    for (const answer of (question?.["answers"] as Array<Record<string, unknown>>) || []) {
      assert.equal(answer["author"], null, name + " exposes an answer author before reveal");
      assert.ok(!("authorId" in answer), name + " exposes an answer authorId before reveal");
      assert.ok(!("authorName" in answer), name + " exposes an answer authorName before reveal");
    }
  }
});

test("a Herd reveal names every writer and what their answer earned", () => {
  const question = load("herd-reveal.host")["currentQuestion"] as Record<string, unknown>;
  const answers = question["answers"] as Array<Record<string, unknown>>;
  assert.ok(answers.length > 0, "a Herd reveal should carry answers");
  for (const answer of answers) {
    assert.ok((answer["author"] as Record<string, unknown>)?.["id"], "a Herd answer must be attributed at the reveal");
    assert.ok(Number.isInteger(answer["authoredPoints"]), "a Herd author must be told what their answer earned");
  }
});

test("a player's own questions still show them their own answer key", () => {
  // The counterpart to the checks above: withholding must not go so far that an
  // author cannot see the question they wrote. This went unchecked for a month
  // because no captured player had ever submitted a question, so `ownQuestions`
  // was empty everywhere and the assertion below never ran. Hence the first line.
  const own = load("building.author")["ownQuestions"] as Array<Record<string, unknown>>;
  assert.equal(own.length > 0, true, "the corpus must contain a player who authored a question");
  const answers = (own[0]!["answers"] as Array<Record<string, unknown>>) || [];
  assert.ok(answers.some((a) => a["correct"] === true), "an author must see their own intended answer");
});

test("a Majority author's prediction is kept distinct from a Quiz answer key", () => {
  // Both are "the answer the author had in mind", and they mean opposite
  // things: a Quiz key is right or wrong, a Majority prediction only decides
  // the author bonus. Nothing may present one as the other.
  const own = load("majority-building.author")["ownQuestions"] as Array<Record<string, unknown>>;
  const answers = (own[0]?.["answers"] as Array<Record<string, unknown>>) || [];
  assert.ok(answers.some((a) => a["predicted"] === true), "a Majority author must see their own prediction");
  assert.ok(!answers.some((a) => a["correct"] === true), "a Majority question has no correct answer");

  const results = (load("majority-reveal.host")["currentQuestion"] as Record<string, unknown>)["majorityResults"] as Record<string, unknown>;
  assert.ok(results["predictedAnswerId"], "a Majority reveal publishes the prediction it was scored against");
  assert.equal(typeof results["predictionMatched"], "boolean");
});

test("a reveal explains its tie truthfully", () => {
  const reasons = new Set<string>();
  for (const name of snapshots) {
    const question = load(name)["currentQuestion"] as Record<string, unknown> | null;
    for (const key of ["majorityResults", "herdResults"]) {
      const results = question?.[key] as Record<string, unknown> | null;
      if (!results) continue;
      reasons.add(results["tieBreakReason"] as string);
      assert.ok(
        !results["tieBrokenBySpeed"] || results["tieBreakReason"] === "fastest" || results["tieBreakReason"] === "average",
        name + " says speed broke a tie that " + String(results["tieBreakReason"]) + " actually settled"
      );
      assert.ok(
        results["tieBreakReason"] === "none" || results["tiedByVotes"],
        name + " explains a tie-break for a round that was not tied"
      );
    }
  }
  // Without this the three assertions above can pass on a corpus where every
  // round had a clear winner, which is the one case that needs no explaining.
  assert.ok(reasons.has("none"), "the corpus should contain a round with a clear winner");
  assert.ok([...reasons].some((reason) => reason !== "none"), "the corpus should contain a round decided by a real tie-break");
});
