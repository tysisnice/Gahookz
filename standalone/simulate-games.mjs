import { buildHerdAssignmentPlan, buildHerdRoundResults } from "../packages/game-engine/src/index.ts";
import { buildMajorityResults } from "./server/majority.mjs";
import { quizPoints } from "./server/scoring.mjs";

const ANSWERING_MS = 14_000;
const GAME_SETS = Math.max(100, Math.min(25_000, Math.trunc(Number(process.env.GAHOOKZ_SIMULATION_GAMES) || 5_000)));

function assert(value, message) {
  if (!value) throw new Error(message);
}

function makeRandom(seed = 0x6a09e667) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

const random = makeRandom();
const integer = (minimum, maximum) => minimum + Math.floor(random() * (maximum - minimum + 1));
const summary = {
  quiz: { games: 0, rounds: 0, answers: 0 },
  majority: { games: 0, rounds: 0, answers: 0, ties: 0 },
  herd: { games: 0, rounds: 0, votes: 0, authoredAnswers: 0, ties: 0 }
};

for (let gameIndex = 0; gameIndex < GAME_SETS; gameIndex += 1) {
  const playerCount = integer(1, 20);
  const playerIds = Array.from({ length: playerCount }, (_value, index) => "p" + gameIndex + "-" + index);
  const roundCount = integer(1, Math.min(20, Math.max(1, playerCount * 2)));

  summary.quiz.games += 1;
  for (let round = 0; round < roundCount; round += 1) {
    summary.quiz.rounds += 1;
    for (const _playerId of playerIds) {
      const correct = random() < 0.48;
      const elapsedMs = integer(0, ANSWERING_MS);
      const points = quizPoints(correct, elapsedMs, ANSWERING_MS);
      assert(Number.isInteger(points), "Quiz points must be integral");
      assert(correct ? points >= 500 && points <= 1_000 : points === 0, "Quiz points left their documented bounds");
      summary.quiz.answers += 1;
    }
  }

  summary.majority.games += 1;
  for (let round = 0; round < roundCount; round += 1) {
    const answers = ["red", "blue", "yellow", "green"].map((id) => ({ id, text: id }));
    const selections = playerIds.map((playerId, index) => ({
      playerId,
      answerId: answers[integer(0, answers.length - 1)].id,
      elapsedMs: integer(0, ANSWERING_MS),
      answeredAt: round * 100_000 + index
    }));
    const result = buildMajorityResults({
      answers,
      selections,
      eligiblePlayerIds: playerIds,
      predictedAnswerId: answers[integer(0, answers.length - 1)].id,
      authorId: playerIds[integer(0, playerIds.length - 1)],
      answeringMs: ANSWERING_MS
    });
    assert(result.answeredCount === playerCount, "Majority lost a valid selection");
    assert(result.groups.find((group) => group.answerId === result.winningAnswerId)?.count === result.topCount, "Majority winner did not have the top vote count");
    assert(result.playerResults.every((entry) => entry.points >= 0 && entry.points <= 1_000), "Majority voter points escaped Quiz bounds");
    assert(result.authorBonus === 0 || result.authorBonus === 100, "Majority author bonus changed unexpectedly");
    if (result.authorBonusAwarded) assert(result.unanimous && result.predictionMatched, "Majority bonus was awarded without unanimous prediction success");
    summary.majority.rounds += 1;
    summary.majority.answers += result.answeredCount;
    if (result.tiedByVotes) summary.majority.ties += 1;
  }

  summary.herd.games += 1;
  const questions = playerIds.map((authorId, index) => ({ id: "q" + gameIndex + "-" + index, authorId }));
  const assignmentPlan = buildHerdAssignmentPlan(playerIds, questions);
  const expectedPerQuestion = Math.min(4, playerCount);
  assert(assignmentPlan.assignments.length === questions.length * expectedPerQuestion, "Herd assignment count drifted");
  for (const question of questions) {
    const assignments = assignmentPlan.byQuestionId[question.id] || [];
    assert(assignments.length === expectedPerQuestion, "Herd question was not assigned to the target writer count");
    assert(new Set(assignments.map((item) => item.answerAuthorId)).size === assignments.length, "Herd assigned one player twice on a question");
    if (playerCount >= 5) assert(assignments.every((item) => item.answerAuthorId !== question.authorId), "Herd assigned a large-room author their own prompt");
  }
  const loads = Object.values(assignmentPlan.byPlayerId).map((assignments) => assignments.length);
  assert(Math.max(...loads) - Math.min(...loads) <= 1, "Herd answer-writing load is not balanced");

  for (const question of questions) {
    const answerAssignments = assignmentPlan.byQuestionId[question.id] || [];
    const answers = answerAssignments.map((assignment, index) => ({ id: "a" + index, text: "answer " + index, authorId: assignment.answerAuthorId }));
    const selections = playerIds.flatMap((playerId, index) => {
      const legal = answers.filter((answer) => answer.authorId !== playerId);
      if (!legal.length) return [];
      const selected = legal[integer(0, legal.length - 1)];
      assert(selected.authorId !== playerId, "Herd simulation must never self-vote");
      return { playerId, answerId: selected.id, elapsedMs: integer(0, ANSWERING_MS), answeredAt: gameIndex * 1_000_000 + index };
    });
    const result = buildHerdRoundResults({ answers, selections, eligiblePlayerIds: playerIds, answeringMs: ANSWERING_MS });
    assert(result.answeredCount === selections.length, "Herd lost a valid vote");
    assert(!selections.length ? result.winningAnswerId === null : result.groups.find((group) => group.id === result.winningAnswerId)?.count === result.topCount, "Herd favourite did not have the top vote count");
    assert(result.playerResults.every((entry) => entry.points >= 0 && entry.points <= 500), "Herd voter score escaped the 500-point cap");
    assert(result.authorResults.every((entry) => entry.points >= 0 && entry.points <= 500), "Herd author score escaped the 500-point cap");
    assert(result.authorResults.reduce((total, entry) => total + entry.voteCount, 0) === selections.length, "Herd authored vote totals do not reconcile");
    summary.herd.rounds += 1;
    summary.herd.votes += result.answeredCount;
    summary.herd.authoredAnswers += answers.length;
    if (result.tiedByVotes) summary.herd.ties += 1;
  }
}

console.log(JSON.stringify({
  ok: true,
  seed: "0x6a09e667",
  simulatedGames: GAME_SETS * 3,
  summary
}, null, 2));
