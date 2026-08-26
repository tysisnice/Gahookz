import assert from "node:assert/strict";
import test from "node:test";
import { addCareerStats, CAREER_STAT_KEYS, emptyCareerStats, matchCareerDelta, normaliseCareerStats } from "../src/index.ts";

test("career stats expose a stable twelve-stat public shape", () => {
  assert.equal(CAREER_STAT_KEYS.length, 12);
  assert.deepEqual(Object.keys(emptyCareerStats()), [...CAREER_STAT_KEYS]);
});

test("career values are bounded integers and high score is a maximum", () => {
  const first = matchCareerDelta({
    score: 920,
    placement: 1,
    playerCount: 5,
    roundStats: { answersSubmitted: 4.9, correctAnswers: 3, gahooksSent: -2 }
  });
  const second = matchCareerDelta({ score: 500, placement: 4, playerCount: 5 });
  const aggregate = addCareerStats(first, second);
  assert.equal(aggregate.gamesPlayed, 2);
  assert.equal(aggregate.wins, 1);
  assert.equal(aggregate.podiums, 1);
  assert.equal(aggregate.totalScore, 1420);
  assert.equal(aggregate.highScore, 920);
  assert.equal(aggregate.answersSubmitted, 4);
  assert.equal(aggregate.gahooksSent, 0);
  assert.deepEqual(normaliseCareerStats({ gamesPlayed: Number.NaN, wins: "3" }), {
    ...emptyCareerStats(),
    wins: 3
  });
});
