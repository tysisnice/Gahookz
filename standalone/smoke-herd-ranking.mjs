import assert from "node:assert/strict";
import { buildHerdRankingResults } from "./server/herd-ranking.mjs";
import { readFile } from "node:fs/promises";

const answers = [
  { id: "answer-a", playerId: "player-a", text: "Alpha" },
  { id: "answer-b", playerId: "player-b", text: "Bravo" },
  { id: "answer-c", playerId: "player-c", text: "Charlie" },
  { id: "answer-d", playerId: "player-d", text: "Delta" }
];
const rankings = [
  { playerId: "player-a", answerIds: ["answer-b", "answer-c", "answer-d"] },
  { playerId: "player-b", answerIds: ["answer-a", "answer-c", "answer-d"] },
  { playerId: "player-c", answerIds: ["answer-a", "answer-b", "answer-d"] },
  { playerId: "player-d", answerIds: ["answer-a", "answer-b", "answer-c"] }
];

const result = buildHerdRankingResults({ answers, rankings });
assert.deepEqual(result.groups.map((group) => group.id), ["answer-a", "answer-b", "answer-c", "answer-d"]);
assert.deepEqual(result.groups.map((group) => group.voteScore), [9, 7, 5, 3]);
assert.deepEqual(result.groups.map((group) => group.answerPoints), [500, 300, 100, 0]);
assert.deepEqual(result.topGroupIds, ["answer-a", "answer-b", "answer-c"]);

const playerResult = (playerId) => result.playerResults.find((entry) => entry.playerId === playerId);
assert.deepEqual(result.playerResults.map((entry) => [entry.playerId, entry.answerPoints, entry.predictionPoints, entry.totalPoints]), [
  ["player-a", 500, 200, 700],
  ["player-b", 300, 267, 567],
  ["player-c", 100, 333, 433],
  ["player-d", 0, 500, 500]
]);
assert.equal(playerResult("player-d").matchedTopThree, 3);
assert.equal(playerResult("player-d").exactPlacements, 3);
assert.deepEqual(result.groups[0].votes.map((vote) => [vote.playerId, vote.rank]), [["player-b", 1], ["player-c", 1], ["player-d", 1]]);

const duplicateText = buildHerdRankingResults({
  answers: [
    { id: "duplicate-a", playerId: "one", text: "Same words" },
    { id: "duplicate-b", playerId: "two", text: "Same words" }
  ],
  rankings: [
    { playerId: "one", answerIds: ["duplicate-b"] },
    { playerId: "two", answerIds: ["duplicate-a"] }
  ]
});
assert.equal(duplicateText.groups.length, 2, "Identical text should remain two singular answers");
assert.notEqual(duplicateText.groups[0].authorIds[0], duplicateText.groups[1].authorIds[0]);

const selfSelected = buildHerdRankingResults({
  answers: [
    { id: "self-answer", playerId: "self-player", text: "My answer", imageDataUrl: "/media/TEST/0123456789abcdef0123456789abcdef" },
    { id: "other-answer", playerId: "other-player", text: "Other answer" }
  ],
  rankings: [{ playerId: "self-player", answerIds: ["self-answer", "other-answer"] }]
});
assert.equal(selfSelected.groups.find((group) => group.id === "self-answer")?.firstPlaceVotes, 1, "A player's own answer should be a valid Herd pick");
assert.equal(selfSelected.groups.find((group) => group.id === "self-answer")?.imageDataUrl, "/media/TEST/0123456789abcdef0123456789abcdef", "Herd scoring should preserve answer images");

const timedOut = buildHerdRankingResults({
  answers,
  rankings: rankings.map((ranking) => ({ ...ranking, answerIds: [], autoSubmitted: true }))
});
assert.deepEqual(timedOut.topGroupIds, [], "Timeout ballots must not invent a collective top three");
assert.equal(timedOut.bestAnswer, null);
assert(timedOut.groups.every((group) => group.answerPoints === 0));
assert(timedOut.playerResults.every((entry) => entry.predictionPoints === 0 && entry.totalPoints === 0));

const appSource = await readFile(new URL("./public/app.jsx", import.meta.url), "utf8");
const serverSource = await readFile(new URL("./server.js", import.meta.url), "utf8");
const styleSource = await readFile(new URL("./public/styles.css", import.meta.url), "utf8");
assert(appSource.includes("HERD_PROMPT_GENERATION_LIMIT = 5"));
assert(appSource.includes("Give me a Herd prompt"));
assert(appSource.includes("HerdRankingPanel") && appSource.includes("herd-choice-card"));
assert(!appSource.includes("draggable onDragStart"), "Herd should no longer require drag ranking");
assert(!appSource.includes("Mark these as similar"), "Manual similarity voting should be removed");
assert(appSource.includes("No collective top-three picks were made this round."), "Empty rounds should have a clear score explanation");
assert(appSource.includes("window.scrollTo({ top: 0, left: 0, behavior: \"auto\" })"), "Live phase changes should return the player to the active content");
assert(serverSource.includes("const validIds = herdAnswerEntries(room).map"), "Players should be able to include their own answer in their top three");
assert(!serverSource.includes("herdAnswerEntries(room).filter((answer) => answer.playerId !== player.id)"), "Herd ranking must not filter out the player's own answer");
assert(appSource.includes("ImageUploadDrawPicker") && appSource.includes("Optional answer image"), "Quiz prompts, Herd prompts, and Herd answers should share upload-or-draw image controls");
assert(styleSource.includes(".herd-ranked-voter.is-rank-1") && styleSource.includes(".herd-ranked-voter.is-rank-3"));
assert(styleSource.includes(".herd-reveal-list > li.is-empty"), "Empty Herd reveals should span the results card");

console.log(JSON.stringify({
  ok: true,
  scoring: result.playerResults.map(({ playerId, answerPoints, predictionPoints, totalPoints }) => ({ playerId, answerPoints, predictionPoints, totalPoints })),
  topThree: result.topGroupIds,
  duplicateAnswersRemainSingular: true,
  timeoutConsensusSuppressed: true
}, null, 2));
