import assert from "node:assert/strict";
import test from "node:test";
import { assertHerdDisplaySlots, buildHerdAnswerSlots } from "./herd-answers.mjs";

const ANSWER_META = [
  { id: "red", label: "Red", color: "#e6383a", shape: "triangle" },
  { id: "blue", label: "Blue", color: "#246bfe", shape: "diamond" },
  { id: "yellow", label: "Yellow", color: "#f2c230", shape: "circle" },
  { id: "green", label: "Green", color: "#20b26b", shape: "square" }
];

const PLAYERS = {
  "player-0": { name: "Ada", avatarId: "panda", avatarImageDataUrl: "" },
  "player-1": { name: "Bo", avatarId: "fox", avatarImageDataUrl: "/media/ABCD/1" },
  "player-2": { name: "Cy", avatarId: "owl", avatarImageDataUrl: "" },
  "player-3": { name: "Di", avatarId: "bee", avatarImageDataUrl: "" }
};

const options = {
  answerMeta: ANSWER_META,
  writerProfile: (playerId) => PLAYERS[playerId],
  fallbackAvatarId: "zap"
};

/**
 * A plan where the writing rotation and the displayed slots disagree on every
 * writer. If the server ever read `answerIndex` again, every id below would
 * come out wrong, which is the leak P02 exists to close.
 */
function crossedPlan() {
  return [
    { questionId: "q1", questionAuthorId: "player-9", answerAuthorId: "player-0", answerIndex: 0, displayIndex: 3 },
    { questionId: "q1", questionAuthorId: "player-9", answerAuthorId: "player-1", answerIndex: 1, displayIndex: 2 },
    { questionId: "q1", questionAuthorId: "player-9", answerAuthorId: "player-2", answerIndex: 2, displayIndex: 1 },
    { questionId: "q1", questionAuthorId: "player-9", answerAuthorId: "player-3", answerIndex: 3, displayIndex: 0 }
  ];
}

test("an answer's identity comes from its displayed slot, not the writing rotation", () => {
  const answers = buildHerdAnswerSlots(crossedPlan(), options);
  assert.deepEqual(answers.map((answer) => answer.id), ["red", "blue", "yellow", "green"]);
  // The writer who happened to be first in the rotation is shown last.
  assert.equal(answers.find((answer) => answer.authorId === "player-0").id, "green");
  assert.equal(answers.find((answer) => answer.authorId === "player-3").id, "red");
  assert.deepEqual(answers.map((answer) => answer.authorId), ["player-3", "player-2", "player-1", "player-0"]);
});

test("a question's answers are handed over in displayed order, one writer to a slot", () => {
  // The room renders this array in order, so the colours must come out in slot
  // order however the plan happened to list them.
  const shuffled = [...crossedPlan()].reverse();
  const answers = buildHerdAnswerSlots(shuffled, options);
  assert.deepEqual(answers.map((answer) => answer.id), ["red", "blue", "yellow", "green"]);
  assert.equal(new Set(answers.map((answer) => answer.authorId)).size, 4);
  assert.deepEqual(answers.map((answer) => answer.label), ["Red", "Blue", "Yellow", "Green"]);
});

test("a fresh answer carries its writer but no content and no answer key", () => {
  const answers = buildHerdAnswerSlots(crossedPlan(), options);
  for (const answer of answers) {
    assert.equal(answer.text, "");
    assert.equal(answer.correct, false);
    assert.equal(Object.prototype.hasOwnProperty.call(answer, "submittedAt"), false);
  }
  const bo = answers.find((answer) => answer.authorId === "player-1");
  assert.equal(bo.authorName, "Bo");
  assert.equal(bo.authorAvatarId, "fox");
  assert.equal(bo.authorAvatarImageDataUrl, "/media/ABCD/1");
});

test("a writer who has left still holds their slot", () => {
  // Dropping the slot would renumber every other answer on the question, and
  // the room has already been shown those colours.
  const plan = crossedPlan();
  plan[1].answerAuthorId = "player-gone";
  const answers = buildHerdAnswerSlots(plan, options);
  assert.deepEqual(answers.map((answer) => answer.id), ["red", "blue", "yellow", "green"]);
  const orphan = answers.find((answer) => answer.authorId === "player-gone");
  assert.equal(orphan.authorName, "Player");
  assert.equal(orphan.authorAvatarId, "zap");
});

test("fewer writers than slots fills the slots the plan chose", () => {
  const plan = [
    { questionId: "q2", answerAuthorId: "player-0", answerIndex: 0, displayIndex: 2 },
    { questionId: "q2", answerAuthorId: "player-1", answerIndex: 1, displayIndex: 0 }
  ];
  const answers = buildHerdAnswerSlots(plan, options);
  assert.deepEqual(answers.map((answer) => answer.id), ["red", "yellow"]);
});

test("no assignments means no answers rather than an empty slot", () => {
  assert.deepEqual(buildHerdAnswerSlots([], options), []);
  assert.deepEqual(buildHerdAnswerSlots(undefined, options), []);
});

test("a slot that does not exist is refused instead of becoming an answer with no id", () => {
  // `{ ...ANSWER_META[4] }` used to give an answer object with no id at all:
  // nobody could vote for it, no result could name it and moderation could not
  // see it. Raising the writer cap without adding a colour is the way in.
  for (const slot of [4, -1, 1.5, undefined, null, "0"]) {
    const plan = [{ questionId: "q3", answerAuthorId: "player-0", answerIndex: 0, displayIndex: slot }];
    assert.throws(() => buildHerdAnswerSlots(plan, options), /display slot/, `slot ${String(slot)} should be refused`);
  }
});

test("two writers in one slot, or one writer twice, is refused", () => {
  const sameSlot = [
    { questionId: "q4", answerAuthorId: "player-0", answerIndex: 0, displayIndex: 1 },
    { questionId: "q4", answerAuthorId: "player-1", answerIndex: 1, displayIndex: 1 }
  ];
  assert.throws(() => buildHerdAnswerSlots(sameSlot, options), /claim display slot/);

  // Writing is addressed by question and credential, so the second answer
  // would be unreachable: the writer would be told they had finished while one
  // of their two slots stayed blank.
  const sameWriter = [
    { questionId: "q4", answerAuthorId: "player-0", answerIndex: 0, displayIndex: 0 },
    { questionId: "q4", answerAuthorId: "player-0", answerIndex: 1, displayIndex: 1 }
  ];
  assert.throws(() => buildHerdAnswerSlots(sameWriter, options), /two answers on the same question/);
});

test("the display table must be able to seat every writer a question can take", () => {
  assert.equal(assertHerdDisplaySlots(ANSWER_META, 4), 4);
  assert.throws(() => assertHerdDisplaySlots(ANSWER_META, 5), /only 4 display slots/);
  assert.throws(() => assertHerdDisplaySlots([], 1), /at least one display slot/);
  assert.throws(() => assertHerdDisplaySlots([{ id: "red" }, { id: "red" }], 2), /its own non-empty id/);
  assert.throws(() => assertHerdDisplaySlots([{ label: "Red" }], 1), /its own non-empty id/);
});
