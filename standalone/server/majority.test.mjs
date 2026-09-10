import assert from "node:assert/strict";
import test from "node:test";

import { buildMajorityResults } from "./majority.mjs";

// Majority carried the same defect as Herd: any tie with a winner was reported
// as broken by speed, including a tie that only the stable answer order could
// separate. The reveal shows this text to players, so it was telling them
// something untrue about their own game.
test("a Majority vote tie reports the rule that actually broke it", () => {
  const base = {
    answers: [{ id: "red" }, { id: "blue" }],
    eligiblePlayerIds: ["p1", "p2"],
    answeringMs: 10_000
  };

  const byOrder = buildMajorityResults({
    ...base,
    selections: [
      { playerId: "p1", answerId: "red", elapsedMs: 3_000 },
      { playerId: "p2", answerId: "blue", elapsedMs: 3_000 }
    ]
  });
  assert.equal(byOrder.tiedByVotes, true);
  assert.equal(byOrder.tieBreakReason, "order");
  assert.equal(byOrder.tieBrokenBySpeed, false, "an order tie-break is not a speed win");

  const bySpeed = buildMajorityResults({
    ...base,
    selections: [
      { playerId: "p1", answerId: "red", elapsedMs: 5_000 },
      { playerId: "p2", answerId: "blue", elapsedMs: 1_000 }
    ]
  });
  assert.equal(bySpeed.tieBreakReason, "fastest");
  assert.equal(bySpeed.tieBrokenBySpeed, true);
  assert.equal(bySpeed.winningAnswerId, "blue");

  const clear = buildMajorityResults({
    ...base,
    eligiblePlayerIds: ["p1", "p2", "p3"],
    selections: [
      { playerId: "p1", answerId: "red", elapsedMs: 1_000 },
      { playerId: "p2", answerId: "red", elapsedMs: 2_000 },
      { playerId: "p3", answerId: "blue", elapsedMs: 100 }
    ]
  });
  assert.equal(clear.tiedByVotes, false);
  assert.equal(clear.tieBreakReason, "none");
  assert.equal(clear.tieBrokenBySpeed, false);
});

test("no votes leaves no winner and no tie-break story", () => {
  const results = buildMajorityResults({
    answers: [{ id: "red" }, { id: "blue" }],
    selections: [],
    eligiblePlayerIds: ["p1", "p2"],
    answeringMs: 10_000
  });
  assert.equal(results.winningAnswerId, null);
  assert.equal(results.tiedByVotes, false);
  assert.equal(results.tieBreakReason, "none");
});
