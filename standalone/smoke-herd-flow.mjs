import assert from "node:assert/strict";
import fs from "node:fs";

const BASE_URL = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3102";
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");
const hostKey = "herd-host-" + Date.now() + Math.random().toString(36).slice(2);
const players = Array.from({ length: 5 }, (_, index) => ({
  key: "herd-player-" + index + "-" + Date.now() + Math.random().toString(36).slice(2),
  name: "Herd Player " + (index + 1)
}));

async function request(path, body) {
  const response = await fetch(BASE_URL + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return { response, data: await response.json() };
}

async function post(path, body) {
  const result = await request(path, body);
  assert.equal(result.data.ok, true, path + " failed: " + result.data.error);
  return result.data;
}

async function state(role = "host", playerKey = hostKey) {
  const result = await request("/api/state", { code, role, playerKey });
  assert.equal(result.response.ok, true, "State failed: " + result.data.error);
  return result.data;
}

const appSource = fs.readFileSync(new URL("./public/app.jsx", import.meta.url), "utf8");
const tutorialSource = fs.readFileSync(new URL("./public/client/tutorial.jsx", import.meta.url), "utf8");
assert(appSource.includes('available: true }];') && appSource.includes('id: "herd"'), "Herd should be selectable");
assert(appSource.includes("function PlayerHerdPreparation") && appSource.includes("/api/herd/answer"), "Herd needs a private answer-writing workspace");
assert(appSource.includes("function HerdRevealBreakdown") && appSource.includes("authoredPoints"), "Herd needs a dual-score reveal");
assert(tutorialSource.includes("herd: Object.freeze") && tutorialSource.includes("function HerdTutorialArtwork"), "Herd needs its own concise tutorial");

await post("/api/room", { code, playerKey: hostKey, intent: "host" });
await post("/api/host/settings", { code, playerKey: hostKey, gameMode: "herd", roundPreset: "custom", maxQuestionsPerPlayer: 5 });
for (const player of players) {
  await post("/api/player/join", { code, playerKey: player.key, name: player.name, avatarId: "fox" });
}
let snapshot = await state();
assert.equal(snapshot.gameMode, "herd");
assert.equal(snapshot.maxQuestionsPerPlayer, 1, "Herd should always use one prompt per player");
await post("/api/host/lock-setup", { code, playerKey: hostKey });
for (const [index, player] of players.entries()) {
  await post("/api/question", { code, playerKey: player.key, text: "Herd prompt " + (index + 1) + ": what happens next?", answers: [] });
  await post("/api/player/ready", { code, playerKey: player.key, ready: true });
}
await post("/api/host/start", { code, playerKey: hostKey });
snapshot = await state();
assert.equal(snapshot.phase, "herd-writing");
assert.equal(snapshot.herdPreparation.total, 20, "Five players should create four answers for each of five prompts");
assert.equal(snapshot.totalQuestions, 5);

for (const player of players) {
  const playerState = await state("player", player.key);
  assert.equal(playerState.ownHerdAssignments.length, 4, "Every five-player Herd writer should receive four prompts");
  assert.equal(playerState.ownHerdAssignments.some((assignment) => assignment.question.author.id === playerState.ownPlayer.id), false, "Players should not answer their own prompt when four other writers are available");
  for (const [answerIndex, assignment] of playerState.ownHerdAssignments.entries()) {
    await post("/api/herd/answer", {
      code,
      playerKey: player.key,
      questionId: assignment.questionId,
      text: player.name + " answer " + (answerIndex + 1)
    });
  }
  await post("/api/player/ready", { code, playerKey: player.key, ready: true });
}

snapshot = await state();
assert.equal(snapshot.herdPreparation.completed, 20);
assert.equal(snapshot.canStart, true);
assert(snapshot.herdAnswerReview.every((assignment) => assignment.submitted), "The host should be able to review every completed answer");
await post("/api/host/start", { code, playerKey: hostKey });

let rounds = 0;
let firstReveal = null;
while ((snapshot = await state()).phase !== "finished") {
  assert.equal(snapshot.phase, "reading");
  await post("/api/host/skip", { code, playerKey: hostKey });
  snapshot = await state();
  assert.equal(snapshot.phase, "answering");
  const choices = snapshot.currentQuestion.answers;
  assert.equal(choices.length, 4);
  for (const [index, player] of players.entries()) {
    const answerId = rounds === 0 && index >= 3 ? choices[1].id : choices[0].id;
    await post("/api/answer", { code, playerKey: player.key, answerId });
  }
  await post("/api/host/skip", { code, playerKey: hostKey });
  snapshot = await state();
  assert.equal(snapshot.phase, "reveal");
  assert(snapshot.currentQuestion.herdResults, "Herd reveal should publish its scoring result");
  assert(snapshot.currentQuestion.answers.every((answer) => answer.author && Number.isInteger(answer.authoredPoints)), "Answer writers and authored points should appear only at reveal");
  if (rounds === 0) firstReveal = snapshot.currentQuestion.herdResults;
  await post("/api/host/skip", { code, playerKey: hostKey });
  rounds += 1;
}

assert.equal(rounds, 5);
assert.equal(firstReveal.topCount, 3);
assert.equal(firstReveal.authorResults.find((result) => result.answerId === firstReveal.winningAnswerId).points, 300, "Three of five votes should award 300 authored points");
assert(firstReveal.playerResults.filter((result) => result.correct).every((result) => result.points > 0 && result.points <= 500), "Winning voters should earn no more than 500 speed points");
snapshot = await state();
assert.equal(snapshot.leaderboard.length, 5);
assert(snapshot.leaderboard.every((player) => player.score > 0), "Every player should be able to score through Herd votes or authored answers");

console.log(JSON.stringify({
  ok: true,
  baseUrl: BASE_URL,
  code,
  players: players.length,
  assignments: 20,
  rounds,
  firstWinningVotes: firstReveal.topCount,
  finalScores: Object.fromEntries(snapshot.leaderboard.map((player) => [player.name, player.score]))
}, null, 2));
