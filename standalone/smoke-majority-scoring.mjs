import assert from "node:assert/strict";
import { buildMajorityResults, MAJORITY_AUTHOR_BONUS } from "./server/majority.mjs";

const answers = [
  { id: "red", label: "Red", text: "Pizza" },
  { id: "blue", label: "Blue", text: "Tacos" },
  { id: "yellow", label: "Yellow", text: "Chips" },
  { id: "green", label: "Green", text: "Cake" }
];

const majority = buildMajorityResults({
  answers,
  eligiblePlayerIds: ["author", "b", "c", "d"],
  predictedAnswerId: "red",
  authorId: "author",
  selections: [
    { playerId: "author", answerId: "red", elapsedMs: 1000, answeredAt: 1010 },
    { playerId: "b", answerId: "red", elapsedMs: 4000, answeredAt: 1040 },
    { playerId: "c", answerId: "red", elapsedMs: 7000, answeredAt: 1070 },
    { playerId: "d", answerId: "blue", elapsedMs: 500, answeredAt: 1005 }
  ]
});

assert.equal(majority.winningAnswerId, "red");
assert.equal(majority.topCount, 3);
assert.equal(majority.playerResults.find((result) => result.playerId === "author")?.points, 964);
assert.equal(majority.playerResults.find((result) => result.playerId === "d")?.points, 0);
assert.equal(majority.authorBonus, 0);

const speedTie = buildMajorityResults({
  answers,
  eligiblePlayerIds: ["a", "b", "c", "d"],
  predictedAnswerId: "blue",
  authorId: "a",
  selections: [
    { playerId: "a", answerId: "red", elapsedMs: 900, answeredAt: 1090 },
    { playerId: "b", answerId: "red", elapsedMs: 4000, answeredAt: 1400 },
    { playerId: "c", answerId: "blue", elapsedMs: 600, answeredAt: 1060 },
    { playerId: "d", answerId: "blue", elapsedMs: 8000, answeredAt: 1800 }
  ]
});

assert.equal(speedTie.tiedByVotes, true);
assert.equal(speedTie.tieBrokenBySpeed, true);
assert.equal(speedTie.winningAnswerId, "blue", "The tied option with the quickest pick should win");

const unanimousPrediction = buildMajorityResults({
  answers,
  eligiblePlayerIds: ["author", "b", "c"],
  predictedAnswerId: "yellow",
  authorId: "author",
  selections: [
    { playerId: "author", answerId: "yellow", elapsedMs: 0 },
    { playerId: "b", answerId: "yellow", elapsedMs: 7000 },
    { playerId: "c", answerId: "yellow", elapsedMs: 14000 }
  ]
});

assert.equal(unanimousPrediction.unanimous, true);
assert.equal(unanimousPrediction.authorBonusAwarded, true);
assert.equal(unanimousPrediction.authorBonus, MAJORITY_AUTHOR_BONUS);
assert.deepEqual(unanimousPrediction.playerResults.map((result) => result.points), [1000, 750, 500]);

const missingPlayer = buildMajorityResults({
  answers,
  eligiblePlayerIds: ["author", "b", "c"],
  predictedAnswerId: "yellow",
  authorId: "author",
  selections: [
    { playerId: "author", answerId: "yellow", elapsedMs: 1000 },
    { playerId: "b", answerId: "yellow", elapsedMs: 2000 }
  ]
});

assert.equal(missingPlayer.unanimous, false, "A timeout must prevent the everyone-picked bonus");
assert.equal(missingPlayer.authorBonus, 0);

console.log("Majority Rulz scoring smoke passed.");
