import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error -- hand-written browser module without type declarations
import * as subjects from "./report-subjects.js";

const { REMOVABLE_SUBJECT_KINDS, canRemoveSubject, removalRequestFor } = subjects as {
  REMOVABLE_SUBJECT_KINDS: readonly string[];
  canRemoveSubject: (kind: unknown) => boolean;
  removalRequestFor: (report: unknown) => { kind: string; targetId: string; questionId?: string };
};

test("the host can remove a reported answer or question, and nothing else", () => {
  // Chat has its own button, a room report has no subject to remove, and a
  // reported player is dealt with from the player card.
  assert.deepEqual([...REMOVABLE_SUBJECT_KINDS], ["answer", "question"]);
  assert.equal(canRemoveSubject("answer"), true);
  assert.equal(canRemoveSubject("question"), true);
  for (const kind of ["chat", "room", "player", "drawing", "", null, undefined]) {
    assert.equal(canRemoveSubject(kind), false, String(kind) + " should not offer Remove");
  }
});

test("a reported answer is named by its prompt as well as its own id", () => {
  // The defect this guards: answer ids are colour names every prompt reuses, so
  // removing "blue" without naming the question blanked "blue" everywhere.
  assert.deepEqual(removalRequestFor({ subjectKind: "answer", subjectId: "q-17:blue" }), {
    kind: "herd-answer",
    questionId: "q-17",
    targetId: "blue"
  });
});

test("the prompt is split off at the last colon, not the first", () => {
  // Question ids are server-generated and may carry a colon; colour names never do.
  assert.deepEqual(removalRequestFor({ subjectKind: "answer", subjectId: "herd:seed:4:green" }), {
    kind: "herd-answer",
    questionId: "herd:seed:4",
    targetId: "green"
  });
});

test("a subject with no prompt is sent as an answer id the server will refuse", () => {
  for (const subjectId of ["blue", ":blue", ""]) {
    const request = removalRequestFor({ subjectKind: "answer", subjectId });
    assert.equal(request.kind, "herd-answer", subjectId);
    assert.equal(request.questionId, undefined, "no prompt may be invented for " + JSON.stringify(subjectId));
  }
});

test("a reported question is sent by its own id, colons and all", () => {
  assert.deepEqual(removalRequestFor({ subjectKind: "question", subjectId: "herd:seed:4" }), {
    kind: "question",
    targetId: "herd:seed:4"
  });
});

test("a malformed report cannot throw on the host's screen", () => {
  assert.deepEqual(removalRequestFor(null), { kind: "herd-answer", targetId: "" });
  assert.deepEqual(removalRequestFor({}), { kind: "herd-answer", targetId: "" });
});
