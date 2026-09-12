import assert from "node:assert/strict";

const BASE_URL = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";
const roomCode = ("M" + Math.random().toString(36).slice(2, 5)).toUpperCase().replace(/[^A-Z]/g, "X").padEnd(4, "X").slice(0, 4);
const hostKey = "majority-host-" + Date.now() + Math.random().toString(36).slice(2);
const players = ["Alpha", "Bravo", "Charlie", "Delta"].map((label, index) => ({
  label,
  name: label + " Player",
  key: "majority-player-" + index + "-" + Date.now() + Math.random().toString(36).slice(2)
}));

async function request(path, body = null) {
  const response = await fetch(BASE_URL + path, body ? {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  } : undefined);
  return { response, data: await response.json() };
}

async function post(path, body) {
  const { data } = await request(path, body);
  assert.equal(data.ok, true, path + " failed: " + data.error);
  return data;
}

async function expectError(path, body, expectedPattern) {
  const { data } = await request(path, body);
  assert.equal(data.ok, false, path + " unexpectedly succeeded");
  assert.match(data.error || "", expectedPattern);
}

async function state(role = "host", playerKey = hostKey) {
  const { response, data } = await request("/api/state", { code: roomCode, role, playerKey });
  assert.equal(response.ok, true);
  return data;
}

async function waitForPhase(phase, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = await state();
    if (snapshot.phase === phase) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error("Timed out waiting for phase " + phase + " in room " + roomCode);
}

await post("/api/room", { code: roomCode, playerKey: hostKey });
await post("/api/host/settings", {
  code: roomCode,
  playerKey: hostKey,
  gameMode: "majority",
  roundPreset: "quick",
  approveQuestions: true
});
for (const player of players) {
  await post("/api/player/join", {
    code: roomCode,
    playerKey: player.key,
    name: player.name,
    avatarId: "panda"
  });
}
await post("/api/host/lock-setup", { code: roomCode, playerKey: hostKey });

// A prediction is optional now; that acceptance case lives in
// smoke-room-rules.mjs, where it does not spend a player's quota and change
// what the rest of this file is testing.

// Two predictions is still a mistake: there is only one guess to make.
await expectError("/api/question", {
  code: roomCode,
  playerKey: players[0].key,
  text: "Which snack disappears first?",
  answers: [
    { text: "Pizza", predicted: true },
    { text: "Hot chips", predicted: true }
  ]
}, /predict only one answer/i);
await expectError("/api/question", {
  code: roomCode,
  playerKey: players[0].key,
  text: "Which snack disappears first?",
  answers: [
    { text: "Pizza", predicted: true },
    { text: "Hot chips", predicted: false },
    { text: "Chocolate", predicted: false },
    { text: "Cheese", predicted: false },
    { text: "Popcorn", predicted: false }
  ]
}, /four answers or fewer/i);

for (const player of players) {
  const submitted = await post("/api/question", {
    code: roomCode,
    playerKey: player.key,
    text: player.label + ": which snack disappears first?",
    answers: [
      { text: "Pizza", predicted: true },
      { text: "Hot chips", predicted: false },
      { text: "Chocolate", predicted: false },
      { text: "Cheese", predicted: false }
    ]
  });
  const pending = await state();
  const pendingQuestion = pending.pendingQuestions.find((question) => question.id === submitted.questionId);
  assert.equal(pendingQuestion.answers.find((answer) => answer.predicted)?.text, "Pizza", "Host approval should show the author's prediction");
  await post("/api/host/question/approve", { code: roomCode, playerKey: hostKey, questionId: submitted.questionId });
  await post("/api/player/ready", { code: roomCode, playerKey: player.key, ready: true });
}

await post("/api/host/start", { code: roomCode, playerKey: hostKey });

for (let round = 0; round < players.length; round += 1) {
  await waitForPhase("reading");
  await post("/api/host/skip", { code: roomCode, playerKey: hostKey });
  const answering = await waitForPhase("answering");
  assert.equal(answering.currentQuestion.mode, "majority");
  assert.equal(answering.currentQuestion.answers.some((answer) => answer.correct), false, "No answer should be marked correct before the room votes");
  assert.equal(answering.currentQuestion.answers.some((answer) => answer.predicted), false, "The author's prediction should stay hidden while players answer");

  if (round === 0) {
    await post("/api/answer", { code: roomCode, playerKey: players[0].key, answerId: "blue" });
    await post("/api/answer", { code: roomCode, playerKey: players[1].key, answerId: "blue" });
    await new Promise((resolve) => setTimeout(resolve, 25));
    await post("/api/answer", { code: roomCode, playerKey: players[2].key, answerId: "red" });
    await post("/api/answer", { code: roomCode, playerKey: players[3].key, answerId: "red" });
  } else {
    for (const player of players) {
      await post("/api/answer", { code: roomCode, playerKey: player.key, answerId: "red" });
    }
  }

  const reveal = await waitForPhase("reveal");
  const results = reveal.currentQuestion.majorityResults;
  assert(results, "Majority reveal should include its vote result");
  if (round === 0) {
    assert.equal(results.tiedByVotes, true);
    assert.equal(results.tieBrokenBySpeed, true);
    assert.equal(results.winningAnswerId, "blue", "The quickest option should break a vote tie");
    assert.equal(results.authorBonus, 0);
  } else {
    assert.equal(results.winningAnswerId, "red");
    assert.equal(results.unanimous, true);
    assert.equal(results.predictionMatched, true);
    assert.equal(results.authorBonus, 100);
    assert.equal(results.authorBonusAwarded, true);
  }
  assert.equal(reveal.currentQuestion.correctAnswerId, results.winningAnswerId);
  assert.equal(reveal.currentQuestion.answers.filter((answer) => answer.correct).length, 1);
  assert(results.playerResults.every((result) => result.points >= 0 && result.points <= 1000));

  const scoresBeforeRepeat = reveal.leaderboard.map((entry) => entry.score);
  const repeated = await state();
  assert.deepEqual(repeated.leaderboard.map((entry) => entry.score), scoresBeforeRepeat, "Reading reveal state twice must not score Majority twice");

  await post("/api/host/skip", { code: roomCode, playerKey: hostKey });
}

const finale = await waitForPhase("finished");
assert.equal(finale.gameMode, "majority");
assert.equal(finale.totalQuestions, players.length);
assert(finale.leaderboard.some((player) => player.score > 0));

console.log(JSON.stringify({
  ok: true,
  baseUrl: BASE_URL,
  roomCode,
  rounds: players.length,
  finalScores: Object.fromEntries(finale.leaderboard.map((player) => [player.name, player.score]))
}, null, 2));
