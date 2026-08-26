import assert from "node:assert/strict";

const BASE_URL = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3102";
const roomCode = ("H" + Math.random().toString(36).slice(2, 5)).toUpperCase().replace(/[^A-Z]/g, "X").padEnd(4, "X").slice(0, 4);
const hostKey = "herd-host-" + Date.now() + Math.random().toString(36).slice(2);
const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const players = [
  { label: "Alpha", name: "Alpha Alpaca", avatarId: "panda" },
  { label: "Bravo", name: "Bravo Bunny", avatarId: "bunny" },
  { label: "Charlie", name: "Charlie Capybara", avatarId: "turtle" },
  { label: "Delta", name: "Delta Dingo", avatarId: "fox" }
].map((player, index) => ({ ...player, key: "herd-player-" + index + "-" + Date.now() + Math.random().toString(36).slice(2) }));

async function request(path, body = null) {
  const response = await fetch(BASE_URL + path, body ? {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  } : undefined);
  const data = await response.json();
  return { response, data };
}

async function post(path, body) {
  const { data } = await request(path, body);
  assert.equal(data.ok, true, path + " failed: " + data.error);
  return data;
}

async function expectError(path, body, message) {
  const { data } = await request(path, body);
  assert.equal(data.ok, false, path + " should reject invalid data");
  assert.match(String(data.error || ""), message);
}

async function state(role = "host", playerKey = hostKey) {
  const query = new URLSearchParams({ code: roomCode, role, playerKey });
  const { response, data } = await request("/api/state?" + query);
  assert.equal(response.ok, true);
  return data;
}

async function waitForPhase(phase, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = await state();
    if (snapshot.phase === phase) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for phase " + phase + " in room " + roomCode);
}

await post("/api/room", { code: roomCode, playerKey: hostKey });
await post("/api/host/settings", { code: roomCode, playerKey: hostKey, gameMode: "herd", roundPreset: "quick", approveQuestions: false });
for (const player of players) {
  await post("/api/player/join", { code: roomCode, playerKey: player.key, name: player.name, avatarId: player.avatarId });
}
await post("/api/host/lock-setup", { code: roomCode, playerKey: hostKey });
for (let index = 0; index < players.length; index += 1) {
  const player = players[index];
  await post("/api/question", { code: roomCode, playerKey: player.key, text: "Round " + (index + 1) + ": name the funniest party disaster." });
  await post("/api/player/ready", { code: roomCode, playerKey: player.key, ready: true });
}
await post("/api/host/start", { code: roomCode, playerKey: hostKey });

const expectedRoundScores = [500, 0, 0, 0];
for (let round = 0; round < players.length; round += 1) {
  await waitForPhase("reading");
  await post("/api/host/skip", { code: roomCode, playerKey: hostKey });
  await waitForPhase("answering");
  await post("/api/herd/draft", { code: roomCode, playerKey: players[0].key, answerText: players[0].label + " answer round " + (round + 1), imageDataUrl: TINY_PNG });
  for (let playerIndex = 1; playerIndex < players.length; playerIndex += 1) {
    const player = players[playerIndex];
    await post("/api/answer", { code: roomCode, playerKey: player.key, answerText: player.label + " answer round " + (round + 1) });
  }
  await post("/api/host/skip", { code: roomCode, playerKey: hostKey });
  await waitForPhase("ranking");

  const playerSnapshots = [];
  for (const player of players) {
    const snapshot = await state("player", player.key);
    const options = snapshot.currentQuestion.herdAnswerOptions;
    assert.equal(options.length, 4, "Each player should see every answer, including their own");
    const ownOption = options.find((option) => option.text.startsWith(player.label + " "));
    assert(ownOption?.isOwn, "A player's own answer should be clearly identified and selectable");
    assert.equal(options.filter((option) => option.isOwn).length, 1, "Only the viewer's answer should be marked as their own");
    const alphaOption = options.find((option) => option.text.startsWith("Alpha "));
    assert.match(alphaOption?.imageDataUrl || "", /^\/media\/[A-Z]{4}\/[a-f0-9]{32}$/i, "Uploaded Herd answer images should appear on ranking choices");
    playerSnapshots.push(snapshot);
  }

  const optionId = (playerIndex, label) => {
    const option = playerSnapshots[playerIndex].currentQuestion.herdAnswerOptions.find((answer) => answer.text.startsWith(label + " "));
    assert(option, "Missing " + label + " option for player " + playerIndex);
    return option.id;
  };
  const ballots = [
    [optionId(0, "Alpha")],
    [optionId(1, "Alpha")],
    [optionId(2, "Alpha")],
    [optionId(3, "Alpha")]
  ];
  await expectError("/api/herd/rank", { code: roomCode, playerKey: players[0].key, answerIds: [] }, /one favourite/i);
  await expectError("/api/herd/rank", { code: roomCode, playerKey: players[0].key, answerIds: [ballots[0][0], ballots[0][0]] }, /one favourite/i);
  for (let index = 0; index < players.length; index += 1) {
    await post("/api/herd/rank", { code: roomCode, playerKey: players[index].key, answerIds: ballots[index] });
  }

  const reveal = await waitForPhase("reveal");
  const groups = reveal.currentQuestion.herdResults.groups;
  assert.equal(groups[0].answerText.split(" ")[0], "Alpha");
  assert.deepEqual(groups.slice(0, 4).map((group) => group.voteScore), [3, 0, 0, 0]);
  assert.deepEqual(groups.slice(0, 4).map((group) => group.answerPoints), [500, 0, 0, 0]);
  assert.deepEqual(groups[0].voters.map((vote) => vote.rank), [1, 1, 1, 1]);
  assert.equal(groups[0].voters.filter((vote) => vote.eligible === false).length, 1, "The author's own favourite must be visible but ineligible");
  assert.match(groups[0].imageDataUrl || "", /^\/media\/[A-Z]{4}\/[a-f0-9]{32}$/i, "The reveal should retain the winning answer image");
  assert(groups.every((group) => group.voters.every((vote) => vote.player?.avatarId)), "Reveal votes should include player profile data");

  for (let index = 0; index < players.length; index += 1) {
    const snapshot = await state("player", players[index].key);
    const personal = snapshot.currentQuestion.herdResults.playerResults.find((entry) => entry.playerId === snapshot.ownPlayer.id);
    assert.equal(personal.totalPoints, expectedRoundScores[index]);
    assert.equal(personal.predictionPoints, 0);
  }

  const scoreBeforeRepeatState = reveal.leaderboard.map((entry) => entry.score);
  const repeatedState = await state();
  assert.deepEqual(repeatedState.leaderboard.map((entry) => entry.score), scoreBeforeRepeatState, "Reading reveal state twice must not score twice");

  await post("/api/question/vote", { code: roomCode, playerKey: players[0].key, good: true });
  await post("/api/question/vote", { code: roomCode, playerKey: players[1].key, good: false });
  await post("/api/question/vote", { code: roomCode, playerKey: players[3].key, good: true });
  const voted = await state();
  assert.equal(voted.currentQuestion.goodVotes, 2);
  assert.equal(voted.currentQuestion.badVotes, 1);
  assert.equal(voted.currentQuestion.voteSelections.length, 3, "The non-voter must remain an abstention");

  await post("/api/host/skip", { code: roomCode, playerKey: hostKey });
}

const finale = await waitForPhase("finished");
assert(finale.questionResults.bestAnswer, "Herd finale should include a best singular answer award");
assert.equal(finale.questionResults.bestAnswer.author.id, finale.players.find((player) => player.name === players[0].name).id);
assert.match(finale.questionResults.bestAnswer.text, /^Alpha answer/);
assert.equal(finale.questionResults.bestAnswer.firstPlaceVotes, 3);
assert.match(finale.questionResults.bestAnswer.imageDataUrl || "", /^\/media\/[A-Z]{4}\/[a-f0-9]{32}$/i, "The finale best-answer award should retain its image");
const scoresByName = new Map(finale.leaderboard.map((entry) => [entry.name, entry.score]));
players.forEach((player, index) => assert.equal(scoresByName.get(player.name), expectedRoundScores[index] * players.length));

console.log(JSON.stringify({
  ok: true,
  baseUrl: BASE_URL,
  roomCode,
  rounds: players.length,
  finalScores: Object.fromEntries(scoresByName),
  bestAnswer: finale.questionResults.bestAnswer
}, null, 2));
