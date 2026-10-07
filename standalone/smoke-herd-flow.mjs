import assert from "node:assert/strict";
import fs from "node:fs";

const BASE_URL = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");
const hostKey = "herd-host-" + Date.now() + Math.random().toString(36).slice(2);
const players = Array.from({ length: 5 }, (_, index) => ({
  key: "herd-player-" + index + "-" + Date.now() + Math.random().toString(36).slice(2),
  name: "Herd Player " + (index + 1)
}));


// Pre-reveal privacy: no snapshot may say which option another player chose.
function assertNoOtherChoicesVisible(snapshot, viewerPlayerId, label) {
  for (const selection of snapshot.answerSelections || []) {
    if (selection.playerId === viewerPlayerId) continue;
    assert.equal("answerId" in selection, false, label + ": another player's choice leaked before the reveal");
  }
  assert.equal(JSON.stringify(snapshot.answerSelections || []).includes("answerId"), viewerPlayerId ? (snapshot.answerSelections || []).some((s) => s.playerId === viewerPlayerId) : false, label + ": unexpected answerId in selections");
}

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

// Read the browser client as a whole. These assert properties of the client,
// so pinning them to app.jsx made them fail when the reveal moved into its own
// feature module without a single behavioural change.
const appSource = ["./public/app.jsx", ...fs.
  readdirSync(new URL("./public/client/", import.meta.url)).
  filter((name) => /\.(jsx|ts)$/.test(name) && !name.endsWith(".test.ts")).
  map((name) => "./public/client/" + name)].
  map((relative) => fs.readFileSync(new URL(relative, import.meta.url), "utf8")).
  join("\n");
const tutorialSource = fs.readFileSync(new URL("./public/client/tutorial.jsx", import.meta.url), "utf8");
const tutorialArtSource = fs.readFileSync(new URL("./public/client/tutorial-art.jsx", import.meta.url), "utf8");
assert(appSource.includes('available: true }];') && appSource.includes('id: "herd"'), "Herd should be selectable");
assert(appSource.includes("function PlayerHerdPreparation") && appSource.includes("/api/herd/answer"), "Herd needs a private answer-writing workspace");
assert(appSource.includes("function HerdRevealBreakdown") && appSource.includes("authoredPoints"), "Herd needs a dual-score reveal");
assert(tutorialSource.includes("herd: Object.freeze") && tutorialArtSource.includes("function HerdTutorialArtwork"), "Herd needs its own concise tutorial");

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

// Herd answers: text required, image optional. Images go through the same
// validation and room media store as question images.
const PNG_A = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==";
const PNG_B = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/F5gQ3wAAAABJRU5ErkJggg==";
const mediaStatus = async (url) => (await fetch(BASE_URL + url)).status;
let imageAnswer = null;
let moderatedImageUrl = "";

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
    if (player === players[0] && answerIndex === 0) {
      const base = { code, playerKey: player.key, questionId: assignment.questionId, text: player.name + " answer 1" };
      const oversize = await request("/api/herd/answer", { ...base, imageDataUrl: "data:image/png;base64," + "A".repeat(3000001) });
      assert.equal(oversize.data.ok, false, "An oversize Herd answer image must be rejected");
      const invalid = await request("/api/herd/answer", { ...base, imageDataUrl: "data:text/html;base64,PGI+aGk8L2I+" });
      assert.equal(invalid.data.ok, false, "A non-image Herd answer image must be rejected");
      const noText = await request("/api/herd/answer", { ...base, text: "", imageDataUrl: PNG_A });
      assert.equal(noText.data.ok, false, "An image-only Herd answer must be rejected: text is required");
      const accepted = await post("/api/herd/answer", { ...base, imageDataUrl: PNG_A });
      imageAnswer = { questionId: assignment.questionId, answerId: accepted.answerId };
      const own = await state("player", player.key);
      const stored = own.ownHerdAssignments.find((item) => item.answerId === accepted.answerId);
      assert(/^\/media\/[A-Z]{4}\/[a-f0-9]{32}$/.test(stored.imageDataUrl), "The author sees a media URL, not a data URL");
      assert.equal(await mediaStatus(stored.imageDataUrl), 200, "The stored Herd image should be served");
      // Re-saving the text without an image field keeps the stored image.
      await post("/api/herd/answer", base);
      assert.equal((await state("player", player.key)).ownHerdAssignments.find((item) => item.answerId === accepted.answerId).imageDataUrl, stored.imageDataUrl, "Re-saving text must keep the image");
      // Host moderation removes the image, and the blob is pruned.
      await post("/api/host/remove-content", { code, playerKey: hostKey, kind: "herd-answer", targetId: accepted.answerId });
      moderatedImageUrl = stored.imageDataUrl;
      assert.equal(await mediaStatus(moderatedImageUrl), 404, "Moderation must delete the Herd answer image");
      const review = (await state()).herdAnswerReview.find((item) => item.answerId === accepted.answerId);
      assert.equal(review.imageDataUrl, "", "Moderation clears the image from the snapshot");
      // The author writes a fresh answer with an image for the rest of the game.
      await post("/api/herd/answer", { ...base, imageDataUrl: PNG_A });
    }
  }
  await post("/api/player/ready", { code, playerKey: player.key, ready: true });
}

snapshot = await state();
assert.equal(snapshot.herdPreparation.completed, 20);
assert.equal(snapshot.canStart, true);
assert(snapshot.herdAnswerReview.every((assignment) => assignment.submitted), "The host should be able to review every completed answer");
await post("/api/host/start", { code, playerKey: hostKey });

let rounds = 0;
let sawImageVoting = false;
let revealedImageUrl = "";
let firstReveal = null;
while ((snapshot = await state()).phase !== "finished") {
  assert.equal(snapshot.phase, "reading");
  await post("/api/host/skip", { code, playerKey: hostKey });
  snapshot = await state();
  assert.equal(snapshot.phase, "answering");
  const choices = snapshot.currentQuestion.answers;
  assert.equal(choices.length, 4);
  if (snapshot.currentQuestion.id === imageAnswer.questionId) {
    const withImage = choices.find((answer) => answer.id === imageAnswer.answerId);
    assert(withImage.imageDataUrl.startsWith("/media/"), "Voting shows the answer image as a media URL");
    assert.equal(withImage.author, null, "The author stays hidden while voting");
    assert(choices.filter((answer) => answer.id !== imageAnswer.answerId).every((answer) => !answer.imageDataUrl), "Only the answer with an image carries one");
    const viewer = await state("player", players[1].key);
    assert.equal(viewer.currentQuestion.answers.find((answer) => answer.id === imageAnswer.answerId).author, null);
    sawImageVoting = true;
  }

  // Writing an answer and then voting for it would collect the voter's speed
  // points and the author's per-vote points from one choice. Check on the first
  // round, while the phase is already open for answers.
  if (rounds === 0) {
    let checkedSelfVote = false;
    for (const player of players) {
      const own = await state("player", player.key);
      const mine = own.currentQuestion.answers.find((answer) => answer.ownAnswer);
      if (!mine) continue;
      const rejected = await request("/api/answer", { code, playerKey: player.key, answerId: mine.id });
      assert.equal(rejected.data.ok, false, "A player must not be able to vote for their own Herd answer");
      assert.equal(rejected.data.ownAnswer, true, "A self-vote refusal should say why");
      checkedSelfVote = true;
      break;
    }
    assert(checkedSelfVote, "At least one player should have authored an answer on the opening question");
  }

  // Nobody may vote for an answer they wrote, so each player picks from their
  // own snapshot rather than the host's. This also exercises the per-viewer
  // ownAnswer flag the client relies on to disable the tile.
  //
  // Drive an exact three-vote winning group. Sending every player to their own
  // selectable[0] does not do that: one answer is hidden from whoever wrote it,
  // so "the first answer I may vote for" names different answers for different
  // players and the winning group size changed between runs as the per-game
  // player shuffle changed who authored what. Instead name one answer by id
  // from the host's view and send exactly three non-authors to it, rotating who
  // those three are so no player is shut out of scoring across the game.
  const targetId = (await state()).currentQuestion.answers[0].id;
  const votingOrder = players.map((_unused, index) => players[(index + rounds) % players.length]);
  let votesForTarget = 0;
  for (const player of votingOrder) {
    const own = await state("player", player.key);
    const selectable = own.currentQuestion.answers.filter((answer) => !answer.ownAnswer);
    assert(
      selectable.length >= 2,
      "A Herd voter must always have at least two answers they did not write"
    );
    assert(
      own.currentQuestion.answers.length - selectable.length <= 1,
      "A player can author at most one answer per Herd question"
    );
    const target = selectable.find((answer) => answer.id === targetId);
    const choice = target && votesForTarget < 3 ?
      target :
      selectable.find((answer) => answer.id !== targetId) || selectable[0];
    if (choice.id === targetId) votesForTarget += 1;
    await post("/api/answer", { code, playerKey: player.key, answerId: choice.id });
  }
  assert.equal(votesForTarget, 3, "Each round should be driven to an exact three-vote winning group");
  if (rounds === 0) {
    const hostView = await state();
    const partyView = await state("party", "");
    const ownView = await state("player", players[0].key);
    assert(hostView.answerSelections.length >= 4, "Pre-reveal snapshots still list who has answered");
    assertNoOtherChoicesVisible(hostView, "", "herd host");
    assertNoOtherChoicesVisible(partyView, "", "herd party");
    assertNoOtherChoicesVisible(ownView, ownView.ownPlayer.id, "herd player");
    assert(ownView.answerSelections.find((s) => s.isOwn)?.answerId, "A player still sees their own choice");
  }
  await post("/api/host/skip", { code, playerKey: hostKey });
  snapshot = await state();
  assert.equal(snapshot.phase, "reveal");
  assert(snapshot.currentQuestion.herdResults, "Herd reveal should publish its scoring result");
  if (rounds === 0) assert.equal(snapshot.answerSelections.filter((selection) => selection.answerId).length, 5, "The reveal shows every player's choice");
  assert(snapshot.currentQuestion.answers.every((answer) => answer.author && Number.isInteger(answer.authoredPoints)), "Answer writers and authored points should appear only at reveal");
  if (snapshot.currentQuestion.id === imageAnswer.questionId) {
    const revealed = snapshot.currentQuestion.answers.find((answer) => answer.id === imageAnswer.answerId);
    assert(revealed.imageDataUrl.startsWith("/media/") && revealed.author?.id, "The reveal shows the image and then names the author");
    revealedImageUrl = revealed.imageDataUrl;
    assert(snapshot.currentQuestion.herdResults.groups.find((group) => group.answerId === imageAnswer.answerId).imageDataUrl, "Reveal groups carry the image");
  }
  if (rounds === 0) firstReveal = snapshot.currentQuestion.herdResults;
  await post("/api/host/skip", { code, playerKey: hostKey });
  rounds += 1;
}

assert.equal(rounds, 5);
assert(sawImageVoting, "The image answer should have appeared in voting");
assert.equal(firstReveal.topCount, 3);
assert.equal(firstReveal.authorResults.find((result) => result.answerId === firstReveal.winningAnswerId).points, 300, "Three of five votes should award 300 authored points");
assert(firstReveal.playerResults.filter((result) => result.correct).every((result) => result.points > 0 && result.points <= 500), "Winning voters should earn no more than 500 speed points");
snapshot = await state();
assert.equal(snapshot.leaderboard.length, 5);
assert(snapshot.leaderboard.every((player) => player.score > 0), "Every player should be able to score through Herd votes or authored answers");

{
  // Kicking the author removes their Herd answer image too.
  const url = revealedImageUrl;
  assert.equal(await mediaStatus(url), 200, "The image is still stored before the kick");
  const ownerId = (await state("player", players[0].key)).ownPlayer.id;
  await post("/api/host/kick", { code, playerKey: hostKey, playerId: ownerId });
  assert.equal(await mediaStatus(url), 404, "Kicking the author must delete their Herd answer image");
}

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
