import assert from "node:assert/strict";
import test from "node:test";

import { HERD_MAX_AUTHOR_POINTS, buildHerdRoundResults } from "../src/index.ts";

// P11 step 5: a developer-only experiment, with worked examples.
//
// The 2026-09-07 review suggested two alternatives to the current rules. This
// file exists so those can be compared against real numbers and *recorded*,
// rather than quietly folded into the UI work. Nothing here changes scoring.
// The current rules are what ships until an explicit decision is made.

const answering = 10_000;

function round(selections: Array<[string, string, number]>, answers: string[], eligible: string[]) {
  return buildHerdRoundResults({
    answers: answers.map((id, index) => ({ id, text: "Answer " + index, authorId: "author-" + id })),
    selections: selections.map(([playerId, answerId, elapsedMs]) => ({ playerId, answerId, elapsedMs })),
    eligiblePlayerIds: eligible,
    answeringMs: answering
  });
}

test("EXPERIMENT: a two-way tie today has exactly one winner", () => {
  const results = round(
    [["p1", "red", 3_000], ["p2", "blue", 3_000]],
    ["red", "blue"],
    ["p1", "p2"]
  );
  // Today: one winner, chosen by the stable answer order once speed ties.
  assert.equal(results.winningAnswerId, "red");
  assert.equal(results.tieBreakReason, "order");
  // A shared-winner rule would instead pay both authors and both voters. The
  // difference is one player being told they lost a coin flip they could not
  // see, versus two players both being right.
  const authorsPaid = results.authorResults.filter((entry) => entry.winner).length;
  assert.equal(authorsPaid, 1, "recorded for comparison: today exactly one author is marked winner");
});

test("EXPERIMENT: a three-way tie pays one of three", () => {
  const results = round(
    [["p1", "red", 2_000], ["p2", "blue", 2_000], ["p3", "yellow", 2_000]],
    ["red", "blue", "yellow"],
    ["p1", "p2", "p3"]
  );
  assert.equal(results.tiedByVotes, true);
  assert.equal(results.tieBreakReason, "order");
  assert.equal(results.authorResults.filter((entry) => entry.winner).length, 1);
});

test("EXPERIMENT: no votes pays nobody and claims no winner", () => {
  const results = round([], ["red"], ["p1", "p2"]);
  assert.equal(results.winningAnswerId, null);
  assert.equal(results.tieBreakReason, "none");
  assert.deepEqual(results.authorResults.map((entry) => entry.points), [0]);
});

test("EXPERIMENT: the authored-point denominator includes the author", () => {
  // Today an answer's author points are votes / eligiblePlayerCount, and the
  // eligible count includes the author, who cannot vote for themselves. So the
  // maximum an author can earn is capped below the nominal maximum in a small
  // room, through no fault of their answer.
  const results = round(
    [["p2", "red", 1_000], ["p3", "red", 1_000], ["p4", "red", 1_000]],
    ["red"],
    ["p1", "p2", "p3", "p4"]
  );
  const author = results.authorResults[0]!;
  assert.equal(results.eligiblePlayerCount, 4);
  assert.equal(author.voteCount, 3, "every player who could vote for it did");
  // 3/4 of the maximum, not the whole thing, despite unanimous support among
  // those able to vote.
  assert.equal(author.points, Math.round(HERD_MAX_AUTHOR_POINTS * 3 / 4));
  assert.ok(
    author.points < HERD_MAX_AUTHOR_POINTS,
    "recorded: a unanimously chosen answer still cannot reach the maximum"
  );

  // The alternative denominator would be eligible voters excluding the author,
  // which pays the full maximum for the same result.
  const excludingAuthor = Math.round(HERD_MAX_AUTHOR_POINTS * 3 / 3);
  assert.equal(excludingAuthor, HERD_MAX_AUTHOR_POINTS, "for comparison only; not implemented");
});

test("the shipped rules are unchanged by this file", () => {
  // A guard against exactly the thing the plan warns about: an experiment
  // quietly becoming a rebalance. If scoring changes, this fails and somebody
  // has to decide deliberately.
  const results = round(
    [["p1", "red", 1_000], ["p2", "red", 2_000], ["p3", "blue", 500]],
    ["red", "blue"],
    ["p1", "p2", "p3"]
  );
  assert.equal(results.winningAnswerId, "red");
  assert.equal(results.tieBreakReason, "none");
  assert.deepEqual(results.playerResults.map((entry) => entry.points), [475, 450, 0]);
  assert.deepEqual(results.authorResults.map((entry) => entry.points), [333, 167]);
});
