// P06 step 2: question/author rotation by stable ID across rematches.
//
// The selection policy lives in question-selection.mjs (extracted from
// server.js, which cannot be imported without starting the HTTP server).
// The mode rules it calls back into are supplied here in miniature so the
// rotation behaviour is proven without the whole game engine.

import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanQuestionRoundState,
  recordPlayedQuestionPlays,
  fairRoundRobinQuestions,
  selectQuestionsForGame } from
"./question-selection.mjs";

function quizQuestion(id, authorId) {
  return {
    id,
    authorId,
    text: "Question " + id + "?",
    mode: "quiz",
    answers: [
      { id: id + "-yes", text: "Yes", correct: true },
      { id: id + "-no", text: "No", correct: false }
    ]
  };
}

// A miniature of the server's mode rules, matching server.js behaviour for
// ready quiz questions: ready when a correct answer exists, cap per preset,
// and scoring fields applied on selection.
const rules = {
  questionReadyForMode: (room, question) =>
    question.mode !== "herd" &&
    question.answers.some((answer) => answer.id === (question.intendedAnswerId || question.answers.find((a) => a.correct)?.id)),
  maximumRoundsForPreset: (room) =>
    room.roundCap ?? (room.roundPreset === "quick" ? 8 : Number.POSITIVE_INFINITY),
  applyQuestionScoring: (room, question) => {
    question.intendedAnswerId ??= question.answers.find((answer) => answer.correct)?.id || "";
    question.mode = room.gameMode;
  }
};

function makeRoom(questions, roundPreset = "quick") {
  const players = {};
  const eligiblePlayerIds = [];
  for (const authorId of new Set(questions.map((question) => question.authorId))) {
    players[authorId] = { id: authorId, connected: true };
    eligiblePlayerIds.push(authorId);
  }
  return {
    gameMode: "quiz",
    roundPreset,
    lockedRules: null,
    players,
    eligiblePlayerIds,
    questions,
    questionPlayCounts: {},
    game: { playedQuestionIds: [] }
  };
}

// Stand in for the server's resetLobby: bank this game's plays, park the
// unplayed remainder as carried-over, and replace the game state. The play
// counts live on the room, so they survive.
function rematchCycle(room, selected) {
  room.game.playedQuestionIds = selected.map((question) => question.id);
  recordPlayedQuestionPlays(room);
  const playedIds = new Set(room.game.playedQuestionIds);
  room.questions = room.questions.map((question) =>
    cleanQuestionRoundState(question, playedIds.has(question.id) ? {} : { carriedOver: true }));
  room.game = { playedQuestionIds: [] };
}

test("recordPlayedQuestionPlays banks each played question exactly once per rematch cycle", () => {
  const questions = [quizQuestion("q1", "A"), quizQuestion("q2", "B")];
  const room = makeRoom(questions, "standard");
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const selected = selectQuestionsForGame(room, room.eligiblePlayerIds, rules);
    rematchCycle(room, selected);
  }
  assert.equal(room.questionPlayCounts.q1, 3);
  assert.equal(room.questionPlayCounts.q2, 3);
});

test("authors with never-played questions go before an author whose only question already played", () => {
  // Author A has one question that played in game 1. Authors B and C have
  // never-played questions. With a two-round cap, the old random
  // round-robin could re-pick A's played question; rotation must not.
  const questions = [quizQuestion("q1", "A"), quizQuestion("q2", "B"), quizQuestion("q3", "C")];
  const room = makeRoom(questions);
  room.roundCap = 2;
  const first = selectQuestionsForGame(room, ["A"], rules);
  assert.equal(first.length, 1, "Only author A is eligible in game 1");
  rematchCycle(room, first);
  assert.equal(room.questionPlayCounts.q1, 1);

  const second = selectQuestionsForGame(room, room.eligiblePlayerIds, rules);
  assert.equal(second.length, 2);
  assert.ok(second.every((question) => question.authorId !== "A"),
    "Never-played authors go first; got " + second.map((q) => q.id).join(","));
});

test("carried-over questions keep first refusal even against fresher ones", () => {
  // q1 played in game 1 but was not selected in game 2 (capped), so a reset
  // parks it as carriedOver. In game 3 it must still be selected even though
  // q2 and q3 have never played: missing a capped game is a stronger claim
  // than freshness.
  const questions = [quizQuestion("q1", "A"), quizQuestion("q2", "A"), quizQuestion("q3", "A")];
  const room = makeRoom(questions);
  room.roundCap = 2;
  room.questionPlayCounts.q1 = 1;
  room.questions = [
    cleanQuestionRoundState(questions[0], { carriedOver: true }),
    cleanQuestionRoundState(questions[1]),
    cleanQuestionRoundState(questions[2])
  ];
  const selected = selectQuestionsForGame(room, room.eligiblePlayerIds, rules);
  assert.equal(selected.length, 2, "The cap selects two of the three");
  assert.ok(selected.some((question) => question.id === "q1"),
    "Carried-over question keeps first refusal over never-played ones");
  // Selection clears the carried-over marker: it has now had its turn.
  assert.ok(selected.every((question) => question.carriedOver === undefined));
});

test("rotation spreads plays evenly across a capped bank over repeated rematches", () => {
  // 4 authors x 3 questions, 8-round cap: each game plays 8 and parks 4.
  // Rotation must keep the spread even: no question reaches three plays
  // before every question has reached one, and after three full rematches
  // every question has played exactly twice.
  const authors = ["A", "B", "C", "D"];
  const questions = [];
  for (const authorId of authors) {
    for (let index = 0; index < 3; index += 1) {
      questions.push(quizQuestion(authorId + index, authorId));
    }
  }
  const room = makeRoom(questions);
  const seen = new Set();
  for (let cycle = 0; cycle < 3; cycle += 1) {
    const selected = selectQuestionsForGame(room, room.eligiblePlayerIds, rules);
    assert.equal(selected.length, 8, "The cap still selects exactly eight questions");
    rematchCycle(room, selected);
    const counts = questions.map((question) => room.questionPlayCounts[question.id] || 0);
    const spread = Math.max(...counts) - Math.min(...counts);
    assert.ok(spread <= 1,
      "Play spread across the bank stayed within one after rematch " + (cycle + 1) + ", got " + spread);
    for (const question of selected) seen.add(question.id);
  }
  assert.equal(seen.size, 12, "Every question in the bank had its turn within three rematches");
  for (const question of questions) {
    assert.equal(room.questionPlayCounts[question.id], 2,
      "Question " + question.id + " played exactly twice across three games");
  }
});

test("fairRoundRobinQuestions orders an author's bucket by play count", () => {
  const questions = [quizQuestion("q1", "A"), quizQuestion("q2", "A"), quizQuestion("q3", "A")];
  const room = makeRoom(questions, "standard");
  room.questionPlayCounts.q2 = 2;
  room.questionPlayCounts.q3 = 1;
  const selected = fairRoundRobinQuestions(room, room.questions, 3);
  assert.equal(selected[0].id, "q1", "Least-played question leads the bucket");
  assert.equal(selected[1].id, "q3");
  assert.equal(selected[2].id, "q2");
});
