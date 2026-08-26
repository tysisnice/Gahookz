import assert from "node:assert/strict";
import test from "node:test";
import { buildHerdAssignmentPlan, buildHerdRoundResults } from "../src/index.ts";

test("Herd assignment plans are balanced for every supported room size", () => {
  for (let playerCount = 1; playerCount <= 20; playerCount += 1) {
    const playerIds = Array.from({ length: playerCount }, (_, index) => `player-${index}`);
    const questions = playerIds.map((authorId, index) => ({ id: `question-${index}`, authorId }));
    const plan = buildHerdAssignmentPlan(playerIds, questions);
    const expectedPerQuestion = Math.min(4, playerCount);
    assert.equal(plan.assignments.length, playerCount * expectedPerQuestion);
    for (const question of questions) assert.equal(plan.byQuestionId[question.id]?.length, expectedPerQuestion);
    for (const playerId of playerIds) assert.equal(plan.byPlayerId[playerId]?.length, expectedPerQuestion);
    if (playerCount >= 5) assert.equal(plan.assignments.some((assignment) => assignment.answerAuthorId === assignment.questionAuthorId), false);
  }
});

test("four players answer all four prompts, while five answer everyone else's", () => {
  const four = ["a", "b", "c", "d"];
  const fourPlan = buildHerdAssignmentPlan(four, four.map((authorId) => ({ id: `q-${authorId}`, authorId })));
  assert.deepEqual(new Set(fourPlan.byPlayerId.a?.map((assignment) => assignment.questionId)), new Set(["q-a", "q-b", "q-c", "q-d"]));
  const five = ["a", "b", "c", "d", "e"];
  const fivePlan = buildHerdAssignmentPlan(five, five.map((authorId) => ({ id: `q-${authorId}`, authorId })));
  assert.equal(fivePlan.byPlayerId.a?.length, 4);
  assert.equal(fivePlan.byPlayerId.a?.some((assignment) => assignment.questionId === "q-a"), false);
});

test("Herd scoring splits voting and authored points and breaks vote ties by speed", () => {
  const results = buildHerdRoundResults({
    answers: [
      { id: "red", text: "A goose", authorId: "author-a" },
      { id: "blue", text: "More cheese", authorId: "author-b" }
    ],
    selections: [
      { playerId: "p1", answerId: "red", elapsedMs: 4_000 },
      { playerId: "p2", answerId: "red", elapsedMs: 5_000 },
      { playerId: "p3", answerId: "blue", elapsedMs: 1_000 },
      { playerId: "p4", answerId: "blue", elapsedMs: 2_000 }
    ],
    eligiblePlayerIds: ["p1", "p2", "p3", "p4"],
    answeringMs: 10_000
  });
  assert.equal(results.winningAnswerId, "blue");
  assert.equal(results.tieBrokenBySpeed, true);
  assert.deepEqual(results.playerResults.map((result) => result.points), [0, 0, 475, 450]);
  assert.deepEqual(results.authorResults.map((result) => result.points), [250, 250]);
});

test("an answer earns the full authored maximum when the whole room picks it", () => {
  const results = buildHerdRoundResults({
    answers: [{ id: "red", text: "Tuesday", authorId: "author" }],
    selections: [
      { playerId: "p1", answerId: "red", elapsedMs: 0 },
      { playerId: "p2", answerId: "red", elapsedMs: 14_000 }
    ],
    eligiblePlayerIds: ["p1", "p2"]
  });
  assert.deepEqual(results.playerResults.map((result) => result.points), [500, 250]);
  assert.equal(results.authorResults[0]?.points, 500);
});
