// Herd anonymity, measured through the running server rather than the engine.
//
// `packages/game-engine` decides which writer sits in which displayed slot and
// its tests prove, over seeded 4/5/8/20-player games, that the slot carries no
// information. None of that reaches a party unless the server spends the
// permutation it was given, so this suite plays a real five-player game over
// HTTP and attacks it the way a guest at the table would: watch one reveal,
// then try to name the writers of the next prompt.
import assert from "node:assert/strict";

const BASE_URL = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");
const stamp = () => Date.now() + Math.random().toString(36).slice(2);
const hostKey = "anon-host-" + stamp();
const players = Array.from({ length: 5 }, (_unused, index) => ({
  key: "anon-player-" + index + "-" + stamp(),
  name: "Writer " + (index + 1)
}));

// The four displayed slots, in the order the room renders them.
const DISPLAY_SLOTS = ["red", "blue", "yellow", "green"];
const REVIEW_KEYS = ["questionId", "answerId", "text", "imageDataUrl", "submitted", "question"];

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

await post("/api/room", { code, playerKey: hostKey, intent: "host" });
await post("/api/host/settings", { code, playerKey: hostKey, gameMode: "herd", roundPreset: "custom", maxQuestionsPerPlayer: 5 });
for (const player of players) {
  await post("/api/player/join", { code, playerKey: player.key, name: player.name, avatarId: "fox" });
}
await post("/api/host/lock-setup", { code, playerKey: hostKey });

// Each prompt is recognisable, so the writers of a prompt can be checked
// against the player who set it without trusting the payload to say so.
const promptOwner = new Map();
for (const [index, player] of players.entries()) {
  const text = "Prompt " + (index + 1) + " from " + player.name;
  await post("/api/question", { code, playerKey: player.key, text, answers: [] });
  const own = await state("player", player.key);
  player.id = own.ownPlayer.id;
  promptOwner.set(text, player.id);
  await post("/api/player/ready", { code, playerKey: player.key, ready: true });
}
await post("/api/host/start", { code, playerKey: hostKey });

let snapshot = await state();
assert.equal(snapshot.phase, "herd-writing");

// --- 1. The shared screen does not name writers while the room writes. ------
// The host screen during writing is the screen everybody is looking at, and it
// lists every answer as it arrives. Naming the writer there would hand the
// room the mapping the live vote depends on -- beside the same screen's promise
// that answers stay anonymous until the points.
assert(snapshot.herdAnswerReview.length > 0, "The host still receives the review list for moderation");
for (const item of snapshot.herdAnswerReview) {
  assert.deepEqual(
    Object.keys(item).sort(),
    [...REVIEW_KEYS].sort(),
    "The host's review list gained or lost a field: " + JSON.stringify(Object.keys(item)));
  assert.equal("answerAuthor" in item, false, "The host's review list named an answer's writer before the reveal");
  assert(item.answerId && item.questionId, "Moderation still addresses an answer by prompt and colour");
}
{
  // A writer's own list is the one place a writer is named, because the client
  // needs it to show them which answers are theirs to write.
  const own = await state("player", players[0].key);
  assert.equal(own.ownHerdAssignments.length, 4, "A writer should hold four prompts in a five-player room");
  for (const item of own.ownHerdAssignments) {
    assert.equal(item.answerAuthor?.id, own.ownPlayer.id, "A writer's own list must name only themselves");
  }
}

// --- 2. Write every answer, then play the game out. -------------------------
for (const player of players) {
  const own = await state("player", player.key);
  for (const assignment of own.ownHerdAssignments) {
    await post("/api/herd/answer", {
      code,
      playerKey: player.key,
      questionId: assignment.questionId,
      text: player.name + " wrote this for " + assignment.answerId
    });
  }
  await post("/api/player/ready", { code, playerKey: player.key, ready: true });
}
await post("/api/host/start", { code, playerKey: hostKey });

/** One prompt as a guest at the table sees it after its reveal. */
const reveals = [];
let rounds = 0;
while ((snapshot = await state()).phase !== "finished") {
  assert.equal(snapshot.phase, "reading");
  const reading = snapshot.currentQuestion;

  // --- 3. The displayed slots are the identities, and they are complete. ----
  assert.deepEqual(
    reading.answers.map((answer) => answer.id),
    DISPLAY_SLOTS,
    "Round " + (rounds + 1) + " did not offer the four displayed slots in order");
  for (const answer of reading.answers) {
    assert.equal(answer.author, null, "A writer was named while the prompt was still being read out");
  }

  await post("/api/host/skip", { code, playerKey: hostKey });
  snapshot = await state();
  assert.equal(snapshot.phase, "answering");
  const answering = snapshot.currentQuestion;
  const textBySlot = new Map(answering.answers.map((answer) => [answer.id, answer.text]));
  assert.equal(new Set(textBySlot.values()).size, DISPLAY_SLOTS.length, "Two displayed slots carried the same answer");

  // --- 4. A refresh changes nothing about what is on screen. ----------------
  // Reconnecting mid-round reshuffling the answers would both confuse a voter
  // and hand away the mapping, because two orders of the same four answers can
  // be compared.
  {
    const refreshed = await state("player", players[0].key);
    assert.equal(refreshed.currentQuestion.id, answering.id, "A refresh moved to a different prompt");
    assert.equal(refreshed.currentQuestionIndex, snapshot.currentQuestionIndex, "A refresh renumbered the round");
    assert.deepEqual(
      refreshed.currentQuestion.answers.map((answer) => [answer.id, answer.text]),
      answering.answers.map((answer) => [answer.id, answer.text]),
      "A refresh reordered or relabelled the answers");
  }

  // Votes are only needed to reach the reveal, so each player picks the first
  // answer they did not write.
  for (const player of players) {
    const own = await state("player", player.key);
    const choice = own.currentQuestion.answers.find((answer) => !answer.ownAnswer);
    assert(choice, player.name + " had nothing to vote for");
    await post("/api/answer", { code, playerKey: player.key, answerId: choice.id });
  }

  await post("/api/host/skip", { code, playerKey: hostKey });
  snapshot = await state();
  assert.equal(snapshot.phase, "reveal");
  const revealed = snapshot.currentQuestion;

  // --- 5. The reveal names every writer, once, and never the prompt's own. --
  const writers = revealed.answers.map((answer) => answer.author?.id || "");
  assert.deepEqual(revealed.answers.map((answer) => answer.id), DISPLAY_SLOTS, "The reveal reordered the displayed slots");
  assert(writers.every(Boolean), "A displayed answer reached its reveal without a writer");
  assert.equal(new Set(writers).size, writers.length, "One writer was credited with two answers on the same prompt");
  const promptAuthorId = promptOwner.get(revealed.text);
  assert(promptAuthorId, "Could not recognise the prompt: " + revealed.text);
  assert.equal(writers.includes(promptAuthorId), false, "A five-player room should never ask an author to answer their own prompt");
  // The text each slot carried while the room voted is the text it reveals.
  for (const answer of revealed.answers) {
    assert.equal(answer.text, textBySlot.get(answer.id), "An answer's text changed between the vote and the reveal");
  }

  reveals.push({ promptAuthorId, writers });
  await post("/api/host/skip", { code, playerKey: hostKey });
  rounds += 1;
}

assert(reveals.length >= 4, "The attacks below need at least four revealed prompts, got " + reveals.length);

// --- 6. Watch one reveal, then try to name the next prompt's writers. -------
// The old allocator walked the roster from each prompt's author and displayed
// the writers in that order, so one reveal gave the whole roster and every
// later prompt followed from it. Replaying that attack against a real game
// should now do little better than guessing.
let predicted = { solved: 0, attempts: 0 };
{
  const [first, ...rest] = reveals;
  const roster = [first.promptAuthorId, ...first.writers];
  let solved = 0;
  let attempts = 0;
  for (const prompt of rest) {
    const anchor = roster.indexOf(prompt.promptAuthorId);
    assert(anchor >= 0, "The implied roster should contain every prompt author");
    prompt.writers.forEach((writerId, slot) => {
      attempts += 1;
      if (roster[(anchor + 1 + slot) % roster.length] === writerId) solved += 1;
    });
  }
  // The old server solved every attempt. Guessing solves about a fifth of
  // them, so three quarters is far below a leak and far above chance.
  assert(
    solved < attempts * 0.75,
    "One reveal still predicts later prompts (" + solved + " of " + attempts + " displayed slots named correctly)");
  predicted = { solved, attempts };
}

// --- 7. The seating is drawn again for every prompt, not once per game. -----
// One shuffle for the whole game would move the slots away from the writing
// rotation and still leave the room solvable: the same writers would keep the
// same relative order on every prompt. A single game is enough to see it --
// across seeded engine games the fewest reversed pairs ever seen was two.
let seating = { reversed: 0, comparable: 0 };
{
  let reversed = 0;
  let comparable = 0;
  for (let earlier = 0; earlier < reveals.length; earlier += 1) {
    for (let later = earlier + 1; later < reveals.length; later += 1) {
      const before = reveals[earlier].writers;
      const after = reveals[later].writers;
      for (let left = 0; left < before.length; left += 1) {
        for (let right = left + 1; right < before.length; right += 1) {
          const atLeft = after.indexOf(before[left]);
          const atRight = after.indexOf(before[right]);
          if (atLeft === -1 || atRight === -1) continue;
          comparable += 1;
          if (atLeft > atRight) reversed += 1;
        }
      }
    }
  }
  assert(comparable >= 20, "Too few shared writer pairs to judge the seating (" + comparable + ")");
  assert(
    reversed > 0,
    "Every pair of writers kept the same order on every prompt, so the seating looks drawn once per game");
  seating = { reversed, comparable };
}

console.log(
  "Herd anonymity smoke passed: " + rounds + " prompts played, writers unnamed until the reveal, " +
  predicted.solved + " of " + predicted.attempts + " slots named by replaying the old formula, " +
  seating.reversed + " of " + seating.comparable + " shared writer pairs reseated.");
