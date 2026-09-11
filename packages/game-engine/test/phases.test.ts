import assert from "node:assert/strict";
import test from "node:test";

import {
  PHASE_DURATIONS_MS,
  estimatedDurationMs,
  nextPhase,
  plannedRounds,
  remainingMs,
  resumeDeadline
} from "../src/index.ts";

const NOW = 1_788_000_000_000;

test("a round runs reading, answering, reveal, then the next question", () => {
  const state = { phase: "reading" as const, questionIndex: 0, questionCount: 3 };
  const answering = nextPhase(state, NOW);
  assert.equal(answering.phase, "answering");
  assert.equal(answering.endsAt, NOW + PHASE_DURATIONS_MS.answering);

  const reveal = nextPhase({ ...state, phase: "answering" }, NOW);
  assert.equal(reveal.phase, "reveal");

  const nextRound = nextPhase({ ...state, phase: "reveal" }, NOW);
  assert.equal(nextRound.phase, "reading");
  assert.equal(nextRound.questionIndex, 1, "the reveal should open the next question");
});

test("the last reveal finishes the game", () => {
  const finished = nextPhase({ phase: "reveal", questionIndex: 2, questionCount: 3 }, NOW);
  assert.equal(finished.phase, "finished");
  assert.equal(finished.endsAt, null);
  assert.equal(finished.questionIndex, 2);
});

test("a game with no questions finishes instead of opening an empty round", () => {
  const finished = nextPhase({ phase: "lobby", questionIndex: 0, questionCount: 0 }, NOW);
  assert.equal(finished.phase, "finished");
});

test("a finished game never reports an index past its own questions", () => {
  // A reveal screen reads this index; letting it run past the end is how a
  // finished room tries to render a question that does not exist.
  const finished = nextPhase({ phase: "reveal", questionIndex: 99, questionCount: 3 }, NOW);
  assert.equal(finished.phase, "finished");
  assert.ok(finished.questionIndex <= 2);
});

test("time remaining is never negative", () => {
  assert.equal(remainingMs(NOW + 5_000, NOW), 5_000);
  // A timer that fires late, or a tab waking from sleep, used to put a
  // negative number on the countdown.
  assert.equal(remainingMs(NOW - 5_000, NOW), 0);
  assert.equal(remainingMs(null, NOW), 0);
  assert.equal(remainingMs(Number.NaN, NOW), 0);
});

test("resuming gives back the time that was left, not a fresh phase", () => {
  const left = 4_200;
  assert.equal(resumeDeadline(left, NOW), NOW + left);
  // However long the room sat paused, resuming must not land in the past.
  assert.ok(resumeDeadline(-1, NOW) >= NOW);
});

test("planned rounds respect both what was written and the cap", () => {
  assert.equal(plannedRounds(20, 8), 8, "the cap wins when more was written");
  assert.equal(plannedRounds(4, 8), 4, "Quick is a ceiling, not a quota");
  assert.equal(plannedRounds(20, Number.POSITIVE_INFINITY), 20, "Full room plays everything");
  assert.equal(plannedRounds(0, 8), 0);
  assert.equal(plannedRounds(-3, 8), 0);
});

test("the duration estimate is built from the real phase timers", () => {
  const perRound = PHASE_DURATIONS_MS.reading + PHASE_DURATIONS_MS.answering + PHASE_DURATIONS_MS.reveal;
  assert.equal(estimatedDurationMs(8), 8 * perRound);
  assert.equal(estimatedDurationMs(0), 0);
});

test("the transition depends only on its arguments", () => {
  // Same state and same clock, same answer -- which is what makes a late
  // timer or a replayed command testable at all.
  const state = { phase: "answering" as const, questionIndex: 1, questionCount: 5 };
  assert.deepEqual(nextPhase(state, NOW), nextPhase(state, NOW));
  assert.notDeepEqual(nextPhase(state, NOW), nextPhase(state, NOW + 1_000));
});
