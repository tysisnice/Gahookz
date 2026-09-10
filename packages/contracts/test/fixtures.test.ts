import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ApiErrorSchema,
  HealthResponseSchema,
  PublicSnapshotBaseSchema,
  normaliseGameSettings
} from "../src/index.ts";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const load = (name: string): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(path.join(dir, name + ".json"), "utf8")) as Record<string, unknown>;
const names = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));

test("the fixture corpus covers every role and phase it claims to", () => {
  for (const required of [
    "health",
    "lobby.host", "lobby.player", "lobby.spectator",
    "building.host", "reading.host", "answering.host", "reveal.host", "finished.host",
    "herd-writing.player",
    "error.room-missing", "error.unknown-action", "error.not-host",
    "reconnect.player"
  ]) {
    assert.ok(names.includes(required), "missing fixture: " + required);
  }
});

// The reason this corpus exists: the health schema was strict and narrower
// than what the server actually sends, so it rejected a healthy server. A
// captured real response is the only thing that catches that.
test("a captured health response satisfies the health schema", () => {
  const parsed = HealthResponseSchema.safeParse(load("health"));
  assert.equal(parsed.success, true, parsed.success ? "" : JSON.stringify(parsed.error.issues));
});

test("every captured snapshot satisfies the public snapshot contract", () => {
  for (const name of names.filter((n) => !n.startsWith("error.") && n !== "health")) {
    const parsed = PublicSnapshotBaseSchema.safeParse(load(name));
    assert.equal(parsed.success, true, name + ": " + (parsed.success ? "" : JSON.stringify(parsed.error.issues)));
  }
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
  // Real snapshots still carry only the legacy gameMode. Normalisation has to
  // widen them without complaint until the server emits the canonical pair.
  for (const name of names.filter((n) => !n.startsWith("error.") && n !== "health")) {
    const result = normaliseGameSettings(load(name));
    assert.equal(result.ok, true, name + " must normalise");
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
  for (const name of ["answering.player", "reading.player"]) {
    if (!names.includes(name)) continue;
    const question = load(name)["currentQuestion"] as Record<string, unknown> | null;
    if (!question) continue;
    assert.ok(
      question["correctAnswerId"] === null || question["correctAnswerId"] === undefined,
      name + " exposes correctAnswerId while players are still answering"
    );
    for (const answer of (question["answers"] as Array<Record<string, unknown>>) || []) {
      assert.ok(!("correct" in answer), name + " marks a live answer as correct before reveal");
    }
  }
});

test("answer authorship stays hidden before reveal", () => {
  // This is the anonymity property Herd depends on, and it must hold in every
  // mode: who wrote an answer is not knowable while people are still voting.
  for (const name of ["answering.player", "answering.host", "reading.player", "herd-writing.player"]) {
    if (!names.includes(name)) continue;
    const question = load(name)["currentQuestion"] as Record<string, unknown> | null;
    for (const answer of (question?.["answers"] as Array<Record<string, unknown>>) || []) {
      assert.equal(answer["author"], null, name + " exposes an answer author before reveal");
      assert.ok(!("authorId" in answer), name + " exposes an answer authorId before reveal");
      assert.ok(!("authorName" in answer), name + " exposes an answer authorName before reveal");
    }
  }
});

test("a player's own questions still show them their own answer key", () => {
  // The counterpart to the checks above: withholding must not go so far that an
  // author cannot see the question they wrote.
  const own = load("answering.player")["ownQuestions"] as Array<Record<string, unknown>> | undefined;
  if (own?.length) {
    const answers = (own[0]!["answers"] as Array<Record<string, unknown>>) || [];
    assert.ok(answers.some((a) => a["correct"] === true), "an author must see their own intended answer");
  }
});
