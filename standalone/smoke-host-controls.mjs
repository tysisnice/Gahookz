// Host Skip and Pause, driven over HTTP through every phase of a Herd game.
//
// This exists because of two defects a host hit on a real room and neither the
// unit tests nor the other smoke scripts could see.
//
// 1. Pause answered 500 "Server error" in every live phase. `setGamePaused`
//    declared `const remainingMs` after calling the imported `remainingMs`
//    helper, so the whole function body sat in that binding's temporal dead
//    zone and the first line of the pause branch threw a ReferenceError.
//    Nothing asserted a *status code*, so the failure was invisible.
// 2. Skip did nothing at all during Herd's `herd-writing` phase. `skipPhase`
//    matched no branch, returned undefined, and the route replied `ok: true`
//    regardless, so the host had no way to tell the command had been dropped.
//
// Both are status-code bugs, so every assertion here checks the HTTP status as
// well as the body. A body-only check would have passed throughout.
import assert from "node:assert/strict";

const BASE_URL = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const unique = () => Date.now() + Math.random().toString(36).slice(2);
const hostKey = "controls-host-" + unique();
const players = Array.from({ length: 4 }, (_, index) => ({
  key: "controls-player-" + index + "-" + unique(),
  name: "Controls " + (index + 1)
}));

async function request(path, body) {
  const response = await fetch(BASE_URL + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: response.status, data: await response.json() };
}

function makeRoom() {
  return Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");
}

async function buildHerdRoom({ writeAnswers }) {
  const code = makeRoom();
  const post = async (path, body) => {
    const result = await request(path, { code, ...body });
    assert.equal(result.data.ok, true, path + " failed: " + result.data.error);
    return result.data;
  };
  await post("/api/room", { playerKey: hostKey, intent: "host" });
  await post("/api/host/settings", { playerKey: hostKey, gameMode: "herd", roundPreset: "custom", maxQuestionsPerPlayer: 5 });
  for (const player of players) {
    await post("/api/player/join", { playerKey: player.key, name: player.name, avatarId: "fox" });
  }
  await post("/api/host/lock-setup", { playerKey: hostKey });
  for (const [index, player] of players.entries()) {
    await post("/api/question", { playerKey: player.key, text: "Controls prompt " + (index + 1) + ": what happens next?", answers: [] });
    await post("/api/player/ready", { playerKey: player.key, ready: true });
  }
  await post("/api/host/start", { playerKey: hostKey });
  if (writeAnswers) {
    for (const player of players) {
      const own = await request("/api/state", { code, role: "player", playerKey: player.key });
      for (const [index, assignment] of own.data.ownHerdAssignments.entries()) {
        await post("/api/herd/answer", { playerKey: player.key, questionId: assignment.questionId, text: player.name + " answer " + (index + 1) });
      }
      await post("/api/player/ready", { playerKey: player.key, ready: true });
    }
  }
  return { code, post };
}

const phaseOf = async (code) => (await request("/api/state", { code, role: "host", playerKey: hostKey })).data.phase;

// --- Pause succeeds in every live phase, and reports a status, not a 500. ---
{
  const { code, post } = await buildHerdRoom({ writeAnswers: true });
  assert.equal(await phaseOf(code), "herd-writing");
  await post("/api/host/start", { playerKey: hostKey });

  const paused = [];
  for (const expected of ["reading", "answering", "reveal"]) {
    assert.equal(await phaseOf(code), expected, "expected to reach " + expected);

    const hold = await request("/api/host/pause", { code, playerKey: hostKey, paused: true });
    assert.equal(hold.status, 200, "Pause in " + expected + " answered " + hold.status + ": " + hold.data.error);
    assert.equal(hold.data.ok, true);
    assert.equal(hold.data.paused, true);

    const held = await request("/api/state", { code, role: "host", playerKey: hostKey });
    assert.equal(held.data.paused, true, "The room should report itself paused in " + expected);
    assert.equal(held.data.phase, expected, "Pausing must not change the phase");

    const resume = await request("/api/host/pause", { code, playerKey: hostKey, paused: false });
    assert.equal(resume.status, 200, "Resume in " + expected + " answered " + resume.status + ": " + resume.data.error);
    assert.equal(resume.data.paused, false);
    paused.push(expected);

    const skip = await request("/api/host/skip", { code, playerKey: hostKey });
    assert.equal(skip.status, 200, "Skip in " + expected + " answered " + skip.status);
    assert.equal(skip.data.ok, true);
  }
  assert.deepEqual(paused, ["reading", "answering", "reveal"]);
}

// --- Skip really ends the Herd writing phase, rather than quietly doing nothing. ---
{
  const { code } = await buildHerdRoom({ writeAnswers: false });
  assert.equal(await phaseOf(code), "herd-writing");

  const skip = await request("/api/host/skip", { code, playerKey: hostKey });
  assert.equal(skip.status, 200, "Skip in herd-writing answered " + skip.status + ": " + skip.data.error);
  assert.equal(skip.data.ok, true);
  assert.equal(await phaseOf(code), "reading", "Skip must leave herd-writing, not report success and stay");

  // Nobody wrote an answer, so every tile has to be filled for the round to be
  // playable at all. A skip that started an unplayable round would be worse
  // than the no-op it replaced. Answer text is withheld during `reading` by
  // design, so read it one skip later, in `answering`.
  await request("/api/host/skip", { code, playerKey: hostKey });
  const snapshot = await request("/api/state", { code, role: "host", playerKey: hostKey });
  assert.equal(snapshot.data.phase, "answering");
  const answers = snapshot.data.currentQuestion.answers;
  assert.equal(answers.length, 4);
  assert(answers.every((answer) => String(answer.text || "").trim().length > 0), "Skipping Herd writing must fill unwritten answers");
}

// --- A phase with nothing to skip refuses with a reason, not a silent ok. ---
{
  const code = makeRoom();
  await request("/api/room", { code, playerKey: hostKey, intent: "host" });
  const skip = await request("/api/host/skip", { code, playerKey: hostKey });
  assert.equal(skip.status, 400, "Skip in the lobby should be refused, not silently accepted");
  assert.equal(skip.data.ok, false);
  assert.match(skip.data.error, /\S/, "A refusal must say something the host can act on");

  const pause = await request("/api/host/pause", { code, playerKey: hostKey, paused: true });
  assert.equal(pause.status, 400, "Pause in the lobby should be refused with 400, never 500");
  assert.equal(pause.data.ok, false);
  assert.notEqual(pause.data.error, "Server error", "A refusal must never surface as a server fault");
}

console.log(JSON.stringify({ ok: true, baseUrl: BASE_URL, pausedPhases: ["reading", "answering", "reveal"], skippedSetupPhase: "herd-writing" }, null, 2));
