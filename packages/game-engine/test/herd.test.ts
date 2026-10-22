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

// --- P02: anonymity ---------------------------------------------------------
// The old plan placed each writer at a displayed slot given by a fixed circular
// walk from the question's author. Because the room renders slots as Red, Blue,
// Yellow, Green in order, the colour of an answer named its author: watch one
// reveal, recover the offset, and every later question is solved.

/** Deterministic RNG so these tests describe behaviour, not luck. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

/** What the old circular formula predicted for a displayed slot. */
function legacyPrediction(playerIds: string[], authorId: string, slot: number, perQuestion: number): string {
  const anchor = playerIds.indexOf(authorId);
  const offset = playerIds.length - 1 >= perQuestion ? 1 : 0;
  return playerIds[(anchor + offset + slot) % playerIds.length] as string;
}

test("a displayed slot no longer names its author across a whole room", () => {
  for (const playerCount of [4, 5, 8, 20]) {
    const playerIds = Array.from({ length: playerCount }, (_u, i) => `player-${i}`);
    const questions = playerIds.map((authorId, i) => ({ id: `question-${i}`, authorId }));
    const perQuestion = Math.min(4, playerCount);

    let matches = 0;
    let total = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const plan = buildHerdAssignmentPlan(playerIds, questions, 4, seededRandom(seed));
      for (const question of questions) {
        for (const assignment of plan.byQuestionId[question.id] ?? []) {
          const predicted = legacyPrediction(playerIds, question.authorId, assignment.displayIndex, perQuestion);
          if (predicted === assignment.answerAuthorId) matches += 1;
          total += 1;
        }
      }
    }
    // A permutation coincides with the old formula sometimes; that is expected
    // and is why this asserts a rate rather than "never". Under the old plan
    // the rate was exactly 1. The formula names one of the n players for each
    // slot, so an unbiased seating scores 1/n. Measured 2026-10-22: 0.257,
    // 0.237, 0.129 and 0.050 for 4, 5, 8 and 20 players, against chances of
    // 0.250, 0.200, 0.125 and 0.050 -- so the margin below is roughly twice
    // the largest excess seen, not a number chosen to pass.
    const rate = matches / total;
    const chance = 1 / playerCount;
    assert.ok(
      rate < chance + 0.08,
      `${playerCount} players: displayed slot still predicts the author (rate ${rate.toFixed(3)}, chance ${chance.toFixed(3)})`
    );
  }
});

test("knowing one question's mapping does not reveal the next", () => {
  // Answers are handed back in display order, so the displayIndex sequence is
  // always 0,1,2,3 and comparing it proves nothing. What an attacker needs is
  // the mapping from a display slot to a position in the writing rotation,
  // because the rotation position is what identifies a player. That mapping
  // must differ from question to question.
  const playerIds = Array.from({ length: 8 }, (_u, i) => `player-${i}`);
  const questions = playerIds.map((authorId, i) => ({ id: `question-${i}`, authorId }));
  const rotationBySlot = (plan: ReturnType<typeof buildHerdAssignmentPlan>, id: string) =>
    (plan.byQuestionId[id] ?? []).map((a) => a.answerIndex).join(",");

  let identical = 0;
  for (let seed = 1; seed <= 100; seed += 1) {
    const plan = buildHerdAssignmentPlan(playerIds, questions, 4, seededRandom(seed));
    if (rotationBySlot(plan, "question-0") === rotationBySlot(plan, "question-1")) identical += 1;
  }
  // With 4 slots there are 24 permutations, so occasional agreement is
  // expected; systematic agreement is the bug.
  assert.ok(identical < 30, `permutations are shared between questions (${identical}/100 identical)`);
});

test("every displayed slot is reachable by every rotation position", () => {
  // A permutation that never moved position 0 out of slot 0 would still leak.
  const playerIds = Array.from({ length: 8 }, (_u, i) => `player-${i}`);
  const questions = playerIds.map((authorId, i) => ({ id: `question-${i}`, authorId }));
  const seen = new Set<string>();
  for (let seed = 1; seed <= 200; seed += 1) {
    const plan = buildHerdAssignmentPlan(playerIds, questions, 4, seededRandom(seed));
    for (const question of questions) {
      for (const a of plan.byQuestionId[question.id] ?? []) seen.add(`${a.answerIndex}->${a.displayIndex}`);
    }
  }
  for (let position = 0; position < 4; position += 1) {
    for (let slot = 0; slot < 4; slot += 1) {
      assert.ok(seen.has(`${position}->${slot}`), `rotation position ${position} never appeared in slot ${slot}`);
    }
  }
});

/**
 * The attack that needs no notes beyond counting. Each prompt is revealed in
 * display order, and after each reveal the room knows how many answers every
 * player has had shown. If the displayed order followed the writing rotation,
 * the player who had written fewest so far would be seated first every time.
 *
 * Only prompts where some writer has strictly written less than another can
 * say anything, so the rest are not counted, and the baseline is the chance of
 * guessing a least-loaded writer at random from that prompt's writers.
 */
function workloadLeak(
  playerIds: string[],
  questions: { id: string; authorId: string }[],
  slotOf: (assignment: { answerIndex: number; displayIndex: number }) => number,
  seeds = 120
) {
  let hits = 0;
  let prompts = 0;
  let chance = 0;
  for (let seed = 1; seed <= seeds; seed += 1) {
    const plan = buildHerdAssignmentPlan(playerIds, questions, 4, seededRandom(seed));
    const written = new Map(playerIds.map((playerId) => [playerId, 0]));
    for (const question of questions) {
      const seated = [...(plan.byQuestionId[question.id] ?? [])].sort((a, b) => slotOf(a) - slotOf(b));
      const loads = seated.map((a) => written.get(a.answerAuthorId) ?? 0);
      const fewest = Math.min(...loads);
      const sharingFewest = loads.filter((load) => load === fewest).length;
      if (sharingFewest < seated.length) {
        prompts += 1;
        chance += sharingFewest / seated.length;
        if ((written.get(seated[0]?.answerAuthorId as string) ?? 0) === fewest) hits += 1;
      }
      for (const a of seated) written.set(a.answerAuthorId, (written.get(a.answerAuthorId) ?? 0) + 1);
    }
  }
  return { rate: prompts ? hits / prompts : 0, chance: prompts ? chance / prompts : 0, prompts };
}

test("the first displayed slot does not say who has written least", () => {
  for (const playerCount of [5, 8, 12, 20]) {
    const playerIds = Array.from({ length: playerCount }, (_u, i) => `player-${i}`);
    const questions = playerIds.map((authorId, i) => ({ id: `question-${i}`, authorId }));

    const seated = workloadLeak(playerIds, questions, (a) => a.displayIndex);
    assert.ok(seated.prompts > 100, `${playerCount} players: too few prompts to measure (${seated.prompts})`);
    // Measured 2026-10-22: 0.519, 0.483, 0.456, 0.477 against chances of
    // 0.500, 0.481, 0.482, 0.485 -- indistinguishable from guessing.
    assert.ok(
      seated.rate <= seated.chance + 0.15,
      `${playerCount} players: the first displayed slot leaks workload (rate ${seated.rate.toFixed(3)}, chance ${seated.chance.toFixed(3)})`
    );

    // Why the assertion above is not vacuous: the writing rotation really does
    // carry this information, because the allocator hands each prompt to its
    // least-loaded writers in order. Measured the same day: 1.000, 0.820,
    // 0.755, 0.750. If this stops holding, the rotation has stopped leaking
    // workload and this demonstration needs replacing -- it is not a licence
    // to display the rotation.
    const rotation = workloadLeak(playerIds, questions, (a) => a.answerIndex);
    assert.ok(
      rotation.rate > rotation.chance + 0.2,
      `${playerCount} players: the writing rotation no longer leaks workload (rate ${rotation.rate.toFixed(3)}), so this test can no longer prove itself non-vacuous`
    );
  }
});

test("with four players there is no workload to leak, and that is why it is not asserted", () => {
  // Everybody writes on every prompt, so no writer is ever behind another and
  // the attack above has nothing to measure. Recorded rather than skipped
  // quietly, so a reader does not think four players were forgotten.
  const playerIds = Array.from({ length: 4 }, (_u, i) => `player-${i}`);
  const questions = playerIds.map((authorId, i) => ({ id: `question-${i}`, authorId }));
  assert.equal(workloadLeak(playerIds, questions, (a) => a.displayIndex).prompts, 0);
});

/** Writer pairs seated in one order on one prompt and the other order on another. */
function reseatedPairs(plan: ReturnType<typeof buildHerdAssignmentPlan>, questionIds: string[]) {
  const seating = questionIds.map((id) =>
    [...(plan.byQuestionId[id] ?? [])].sort((a, b) => a.displayIndex - b.displayIndex).map((a) => a.answerAuthorId)
  );
  let reversed = 0;
  let comparable = 0;
  for (let first = 0; first < seating.length; first += 1) {
    for (let second = first + 1; second < seating.length; second += 1) {
      const earlier = seating[first] as string[];
      const later = seating[second] as string[];
      for (let x = 0; x < earlier.length; x += 1) {
        for (let y = x + 1; y < earlier.length; y += 1) {
          const atX = later.indexOf(earlier[x] as string);
          const atY = later.indexOf(earlier[y] as string);
          if (atX === -1 || atY === -1) continue;
          comparable += 1;
          if (atX > atY) reversed += 1;
        }
      }
    }
  }
  return { reversed, comparable };
}

test("writers who share two prompts are not seated in the same order twice", () => {
  // The defect this closes is one shuffle for the whole game. That would move
  // the slots away from the rotation and still leave the room solvable: the
  // same relative order would repeat on every prompt, so watching one reveal
  // would order everybody for the rest of the game.
  for (const playerCount of [4, 5, 8, 20]) {
    const playerIds = Array.from({ length: playerCount }, (_u, i) => `player-${i}`);
    const questions = playerIds.map((authorId, i) => ({ id: `question-${i}`, authorId }));
    const questionIds = questions.map((question) => question.id);

    let reversed = 0;
    let comparable = 0;
    let gamesWithNoReversal = 0;
    for (let seed = 1; seed <= 120; seed += 1) {
      const plan = buildHerdAssignmentPlan(playerIds, questions, 4, seededRandom(seed));
      const pairs = reseatedPairs(plan, questionIds);
      reversed += pairs.reversed;
      comparable += pairs.comparable;
      if (pairs.reversed === 0) gamesWithNoReversal += 1;
    }
    const rate = reversed / comparable;
    // One shuffle per game scores 0. An independent shuffle per prompt scores
    // a half. Measured 2026-10-22: 0.49 to 0.53 across these room sizes.
    assert.ok(
      rate > 0.35 && rate < 0.65,
      `${playerCount} players: shared writers keep their order too often (reversal rate ${rate.toFixed(3)})`
    );
    // A single game is enough to see it, which is what the server-level check
    // relies on: the fewest reversed pairs seen in 2000 games was two.
    assert.equal(gamesWithNoReversal, 0, `${playerCount} players: a whole game seated every shared pair the same way`);
  }
});

test("the permutation does not disturb workload balance or author exclusion", () => {
  for (const playerCount of [4, 5, 8, 12, 20]) {
    const playerIds = Array.from({ length: playerCount }, (_u, i) => `player-${i}`);
    const questions = playerIds.map((authorId, i) => ({ id: `question-${i}`, authorId }));
    for (let seed = 1; seed <= 25; seed += 1) {
      const plan = buildHerdAssignmentPlan(playerIds, questions, 4, seededRandom(seed));
      const expected = Math.min(4, playerCount);
      for (const playerId of playerIds) {
        assert.equal(plan.byPlayerId[playerId]?.length, expected, "workload must stay even");
      }
      for (const question of questions) {
        const forQuestion = plan.byQuestionId[question.id] ?? [];
        assert.equal(forQuestion.length, expected);
        // Every displayed slot used exactly once, and in display order.
        const slots = forQuestion.map((a) => a.displayIndex);
        assert.deepEqual([...slots].sort((x, y) => x - y), slots, "answers must be in display order");
        assert.equal(new Set(slots).size, expected, "each display slot must be used once");
        if (playerCount >= 5) {
          assert.ok(!forQuestion.some((a) => a.answerAuthorId === question.authorId), "author must not answer their own prompt");
        }
      }
    }
  }
});

// --- P02: honest tie reasons ------------------------------------------------

test("a tie broken by the stable answer order says so", () => {
  // Identical counts, identical fastest, identical average: only the order of
  // the answers separates them. The old code called this a speed tie-break.
  const results = buildHerdRoundResults({
    answers: [
      { id: "red", text: "A", authorId: "a" },
      { id: "blue", text: "B", authorId: "b" }
    ],
    selections: [
      { playerId: "p1", answerId: "red", elapsedMs: 3_000 },
      { playerId: "p2", answerId: "blue", elapsedMs: 3_000 }
    ],
    eligiblePlayerIds: ["p1", "p2"],
    answeringMs: 10_000
  });
  assert.equal(results.tiedByVotes, true);
  assert.equal(results.tieBreakReason, "order");
  assert.equal(results.tieBrokenBySpeed, false, "order is not speed");
  assert.equal(results.winningAnswerId, "red");
});

test("a tie broken by the fastest single vote says fastest", () => {
  const results = buildHerdRoundResults({
    answers: [
      { id: "red", text: "A", authorId: "a" },
      { id: "blue", text: "B", authorId: "b" }
    ],
    selections: [
      { playerId: "p1", answerId: "red", elapsedMs: 5_000 },
      { playerId: "p2", answerId: "blue", elapsedMs: 1_000 }
    ],
    eligiblePlayerIds: ["p1", "p2"],
    answeringMs: 10_000
  });
  assert.equal(results.tieBreakReason, "fastest");
  assert.equal(results.tieBrokenBySpeed, true);
  assert.equal(results.winningAnswerId, "blue");
});

test("a tie with equal fastest advances to the average", () => {
  const results = buildHerdRoundResults({
    answers: [
      { id: "red", text: "A", authorId: "a" },
      { id: "blue", text: "B", authorId: "b" }
    ],
    selections: [
      { playerId: "p1", answerId: "red", elapsedMs: 1_000 },
      { playerId: "p2", answerId: "red", elapsedMs: 9_000 },
      { playerId: "p3", answerId: "blue", elapsedMs: 1_000 },
      { playerId: "p4", answerId: "blue", elapsedMs: 3_000 }
    ],
    eligiblePlayerIds: ["p1", "p2", "p3", "p4"],
    answeringMs: 10_000
  });
  assert.equal(results.tieBreakReason, "average");
  assert.equal(results.tieBrokenBySpeed, true);
  assert.equal(results.winningAnswerId, "blue");
});

test("three tied groups report the rule that actually separated the winner", () => {
  const results = buildHerdRoundResults({
    answers: [
      { id: "red", text: "A", authorId: "a" },
      { id: "blue", text: "B", authorId: "b" },
      { id: "yellow", text: "C", authorId: "c" }
    ],
    selections: [
      { playerId: "p1", answerId: "red", elapsedMs: 2_000 },
      { playerId: "p2", answerId: "blue", elapsedMs: 2_000 },
      { playerId: "p3", answerId: "yellow", elapsedMs: 2_000 }
    ],
    eligiblePlayerIds: ["p1", "p2", "p3"],
    answeringMs: 10_000
  });
  assert.equal(results.topCount, 1);
  assert.equal(results.tiedByVotes, true);
  // All three share fastest and average, so only the answer order separates.
  assert.equal(results.tieBreakReason, "order");
  assert.equal(results.tieBrokenBySpeed, false);
});

test("an uncontested winner is not reported as a tie at all", () => {
  const results = buildHerdRoundResults({
    answers: [
      { id: "red", text: "A", authorId: "a" },
      { id: "blue", text: "B", authorId: "b" }
    ],
    selections: [
      { playerId: "p1", answerId: "red", elapsedMs: 1_000 },
      { playerId: "p2", answerId: "red", elapsedMs: 2_000 },
      { playerId: "p3", answerId: "blue", elapsedMs: 500 }
    ],
    eligiblePlayerIds: ["p1", "p2", "p3"],
    answeringMs: 10_000
  });
  assert.equal(results.tiedByVotes, false);
  assert.equal(results.tieBreakReason, "none");
  assert.equal(results.tieBrokenBySpeed, false);
});

test("no votes means no winner and no tie-break story", () => {
  const results = buildHerdRoundResults({
    answers: [{ id: "red", text: "A", authorId: "a" }],
    selections: [],
    eligiblePlayerIds: ["p1", "p2"],
    answeringMs: 10_000
  });
  assert.equal(results.winningAnswerId, null);
  assert.equal(results.tiedByVotes, false);
  assert.equal(results.tieBreakReason, "none");
  assert.equal(results.tieBrokenBySpeed, false);
});

// --- P06: short, balanced Herd ----------------------------------------------

test("writing load stays within one across every supported size and length", () => {
  // The capped case is the one that used to fail: a twenty-player room playing
  // eight rounds gave some writers four answers and others none, because the
  // circular walk anchored on question authors that clustered in roster order.
  for (const playerCount of [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20]) {
    const playerIds = Array.from({ length: playerCount }, (_u, i) => `player-${i}`);
    for (const rounds of [playerCount, Math.min(8, playerCount), Math.min(3, playerCount), 1]) {
      for (let seed = 1; seed <= 12; seed += 1) {
        const questions = Array.from({ length: rounds }, (_u, i) => ({
          id: `question-${i}`,
          authorId: playerIds[i % playerCount] as string
        }));
        const plan = buildHerdAssignmentPlan(playerIds, questions, 4, seededRandom(seed));
        const loads = playerIds.map((id) => plan.byPlayerId[id]?.length ?? 0);
        const spread = Math.max(...loads) - Math.min(...loads);
        assert.ok(
          spread <= 1,
          `${playerCount} players over ${rounds} rounds (seed ${seed}): load spread ${spread}`
        );
      }
    }
  }
});

test("a capped game still fills every question with distinct writers", () => {
  const playerIds = Array.from({ length: 20 }, (_u, i) => `player-${i}`);
  // Authors clustered at the front of the roster, which is what a capped
  // selection actually produces.
  const questions = Array.from({ length: 8 }, (_u, i) => ({
    id: `question-${i}`,
    authorId: playerIds[i] as string
  }));
  for (let seed = 1; seed <= 20; seed += 1) {
    const plan = buildHerdAssignmentPlan(playerIds, questions, 4, seededRandom(seed));
    for (const question of questions) {
      const writers = (plan.byQuestionId[question.id] ?? []).map((a) => a.answerAuthorId);
      assert.equal(writers.length, 4, question.id + " must be fully answered");
      assert.equal(new Set(writers).size, 4, question.id + " must have distinct writers");
      assert.ok(!writers.includes(question.authorId), "a prompt's author must not answer it");
    }
  }
});

test("small rooms keep their documented fallbacks", () => {
  // Below five players the roster is too small to exclude the author as well
  // as fill four slots, and that is the existing, documented behaviour.
  for (const playerCount of [2, 3, 4]) {
    const playerIds = Array.from({ length: playerCount }, (_u, i) => `player-${i}`);
    const questions = playerIds.map((authorId, i) => ({ id: `question-${i}`, authorId }));
    const plan = buildHerdAssignmentPlan(playerIds, questions, 4, seededRandom(3));
    assert.equal(plan.targetAnswersPerQuestion, playerCount, "every player answers in a small room");
    for (const question of questions) {
      const writers = (plan.byQuestionId[question.id] ?? []).map((a) => a.answerAuthorId);
      assert.equal(new Set(writers).size, writers.length, "writers must still be distinct");
    }
  }
});
