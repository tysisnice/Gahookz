import assert from "node:assert/strict";
import test from "node:test";

import {
  PHASE_DURATIONS_MS,
  type GamePhase,
  nextPhase,
  remainingMs,
  resumeDeadline
} from "../src/index.ts";

// Seeded replay fixtures with a fake clock.
//
// A game is a sequence of transitions driven by time, so the failures worth
// catching are the ones where time misbehaves: a timer that fires late, a
// paused room resumed after a long gap, a duplicated advance, a command that
// arrives from a game that already ended. None of those are reachable by
// playing a real game at real speed, which is why they had no tests.

interface Replay {
  phase: GamePhase;
  questionIndex: number;
  endsAt: number | null;
}

function replay(questionCount: number, now: number): { state: Replay; advance: (at: number) => Replay } {
  const state: Replay = { phase: "building", questionIndex: 0, endsAt: null };
  return {
    state,
    advance(at: number) {
      const transition = nextPhase(
        { phase: state.phase, questionIndex: state.questionIndex, questionCount },
        at
      );
      state.phase = transition.phase;
      state.questionIndex = transition.questionIndex;
      state.endsAt = transition.endsAt;
      return state;
    }
  };
}

test("a whole three-round game replays to a deterministic finish", () => {
  const clock = { now: 1_788_000_000_000 };
  const game = replay(3, clock.now);
  const path: string[] = [];

  for (let step = 0; step < 12; step += 1) {
    const state = game.advance(clock.now);
    path.push(state.phase + ":" + state.questionIndex);
    if (state.phase === "finished") break;
    clock.now += PHASE_DURATIONS_MS[state.phase as "reading" | "answering" | "reveal"];
  }

  assert.deepEqual(path, [
    "reading:0", "answering:0", "reveal:0",
    "reading:1", "answering:1", "reveal:1",
    "reading:2", "answering:2", "reveal:2",
    "finished:2"
  ]);
});

test("the same seed and clock replay to the same game", () => {
  const run = () => {
    const clock = { now: 1_788_000_000_000 };
    const game = replay(4, clock.now);
    const path: string[] = [];
    for (let step = 0; step < 20; step += 1) {
      const state = game.advance(clock.now);
      path.push(state.phase + ":" + state.questionIndex + "@" + (state.endsAt ?? 0));
      if (state.phase === "finished") break;
      clock.now += 1_000;
    }
    return path;
  };
  assert.deepEqual(run(), run(), "a replay must be reproducible to be useful as evidence");
});

test("a timer that fires late does not skip a phase or show negative time", () => {
  const start = 1_788_000_000_000;
  const game = replay(2, start);
  game.advance(start);
  assert.equal(game.state.phase, "reading");

  // The timer fires a full minute late, as a throttled background tab does.
  const late = start + 60_000;
  const state = game.advance(late);
  assert.equal(state.phase, "answering", "the next phase is still the next phase");
  assert.equal(remainingMs(state.endsAt, late), PHASE_DURATIONS_MS.answering);
  assert.equal(remainingMs(state.endsAt, late + 999_999), 0, "an expired phase has no negative time");
});

test("a paused room resumes with the time it had left, however long it sat", () => {
  const start = 1_788_000_000_000;
  const endsAt = start + PHASE_DURATIONS_MS.answering;
  const pausedAt = start + 4_000;
  const left = remainingMs(endsAt, pausedAt);
  assert.equal(left, PHASE_DURATIONS_MS.answering - 4_000);

  // An hour later, resuming must give back the same ten seconds, not restart
  // the phase and not resume to a deadline that is already in the past.
  const resumedAt = pausedAt + 3_600_000;
  const resumed = resumeDeadline(left, resumedAt);
  assert.equal(remainingMs(resumed, resumedAt), left);
  assert.ok(resumed > resumedAt);
});

test("advancing a finished game twice changes nothing", () => {
  const at = 1_788_000_000_000;
  const game = replay(1, at);
  game.advance(at); // reading
  game.advance(at); // answering
  game.advance(at); // reveal
  const finished = { ...game.advance(at) };
  assert.equal(finished.phase, "finished");
  // A duplicated advance, a retried command, or two timers racing.
  const again = game.advance(at);
  assert.equal(again.phase, "finished");
  assert.equal(again.questionIndex, finished.questionIndex);
  assert.equal(again.endsAt, null);
});

test("a stale command from the previous game cannot reopen a round", () => {
  // The room has been reset, so it holds no questions. An advance arriving
  // from the game that just ended must not open a round nobody can answer.
  const at = 1_788_000_000_000;
  const emptied = replay(0, at);
  assert.equal(emptied.advance(at).phase, "finished");
  assert.equal(emptied.advance(at).phase, "finished");
});

test("every phase deadline is in the future when it is set", () => {
  const at = 1_788_000_000_000;
  const game = replay(5, at);
  for (let step = 0; step < 15; step += 1) {
    const state = game.advance(at);
    if (state.phase === "finished") break;
    assert.ok(
      state.endsAt !== null && state.endsAt > at,
      state.phase + " must end in the future, not immediately"
    );
  }
});
