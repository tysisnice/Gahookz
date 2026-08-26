import assert from "node:assert/strict";
import { buildHerdRankingResults } from "../server/herd-ranking.mjs";
import { readFile } from "node:fs/promises";

const answers = [
  { id: "answer-a", playerId: "player-a", text: "Alpha" },
  { id: "answer-b", playerId: "player-b", text: "Bravo" },
  { id: "answer-c", playerId: "player-c", text: "Charlie" },
  { id: "answer-d", playerId: "player-d", text: "Delta" }
];
const rankings = [
  { playerId: "player-a", answerIds: ["answer-a"] },
  { playerId: "player-b", answerIds: ["answer-a"] },
  { playerId: "player-c", answerIds: ["answer-a"] },
  { playerId: "player-d", answerIds: ["answer-b"] }
];

const result = buildHerdRankingResults({ answers, rankings });
assert.equal(result.selectionLimit, 1);
assert.deepEqual(result.groups.map((group) => group.id), ["answer-a", "answer-b", "answer-c", "answer-d"]);
assert.deepEqual(result.groups.map((group) => group.voteScore), [2, 1, 0, 0]);
assert.deepEqual(result.groups.map((group) => group.answerPoints), [500, 0, 0, 0]);
assert.deepEqual(result.topGroupIds, ["answer-a"]);
assert.equal(result.groups[0].rawVoteCount, 3);
assert.equal(result.groups[0].votes.find((vote) => vote.playerId === "player-a")?.eligible, false, "A self-vote may be displayed but must not help the answer win");

const playerResult = (playerId) => result.playerResults.find((entry) => entry.playerId === playerId);
assert.equal(playerResult("player-a").totalPoints, 500);
assert.equal(playerResult("player-b").totalPoints, 0);
assert(result.playerResults.every((entry) => entry.predictionPoints === 0), "One-favourite Herd should not award prediction points");

const tie = buildHerdRankingResults({
  answers,
  rankings: [
    { playerId: "player-a", answerIds: ["answer-b"] },
    { playerId: "player-b", answerIds: ["answer-a"] },
    { playerId: "player-c", answerIds: ["answer-d"] },
    { playerId: "player-d", answerIds: ["answer-c"] }
  ]
});
assert.deepEqual(tie.topGroupIds, ["answer-a", "answer-b", "answer-c", "answer-d"], "Equal favourite totals should share first place");
assert(tie.groups.every((group) => group.rank === 1 && group.answerPoints === 500));

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
  rankings: [{ playerId: "self-player", answerIds: ["self-answer"] }]
});
const selfGroup = selfSelected.groups.find((group) => group.id === "self-answer");
assert.equal(selfGroup?.rawVoteCount, 1, "A player's own answer should remain selectable");
assert.equal(selfGroup?.voteCount, 0, "A player's self-vote must not reward their answer");
assert.equal(selfSelected.bestAnswer, null);
assert.equal(selfGroup?.imageDataUrl, "/media/TEST/0123456789abcdef0123456789abcdef", "Herd scoring should preserve answer images");

const timedOut = buildHerdRankingResults({
  answers,
  rankings: rankings.map((ranking) => ({ ...ranking, answerIds: [], autoSubmitted: true }))
});
assert.deepEqual(timedOut.topGroupIds, [], "Timeout ballots must not invent a favourite");
assert.equal(timedOut.bestAnswer, null);
assert(timedOut.groups.every((group) => group.answerPoints === 0));
assert(timedOut.playerResults.every((entry) => entry.totalPoints === 0));

const appSource = await readFile(new URL("../../public/app.jsx", import.meta.url), "utf8");
const serverSource = await readFile(new URL("../../server.js", import.meta.url), "utf8");
const styleSource = await readFile(new URL("../../public/styles.css", import.meta.url), "utf8");
assert(appSource.includes("HERD_PROMPT_GENERATION_LIMIT = 5"));
assert(appSource.includes("Pick the best answer") && appSource.includes("Lock favourite"));
assert(appSource.includes("whatever you have written will be locked automatically"));
assert(serverSource.includes("const HERD_ANSWERING_MS = 35000"));
assert(serverSource.includes("lockHerdDraftAnswers(room)"));
assert(serverSource.includes("requiredPickCount = validIds.length ? 1 : 0"));
assert(!serverSource.includes("COUNTER_GAHOOK_TRIGGER_COUNT"), "Counter Gahooking should be disabled");
assert(appSource.includes("ImageUploadDrawPicker") && appSource.includes("Optional answer image"));
assert(styleSource.includes(".herd-best-answer-card") && styleSource.includes(".herd-choice-card.is-selected"));

console.log(JSON.stringify({
  ok: true,
  winner: result.bestAnswer?.answerText,
  winnerPoints: result.bestAnswer?.answerPoints,
  tieAware: true,
  selfVoteExcluded: true,
  timeoutConsensusSuppressed: true
}, null, 2));
