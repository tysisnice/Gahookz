// The role and phase privacy contract, as executable negative cases (P01, P02).
//
// Two rules are stated here once, over real HTTP, for every surface that can
// carry them:
//
//   1. Authority comes from the host credential. Every /api/host/ route refuses
//      every other caller, and a refusal changes nothing.
//   2. A snapshot is filtered by that credential and the phase, never by the
//      `role` string the client sends. Before the reveal, no payload a player,
//      a party screen or a stranger can obtain carries another writer's answer
//      or another player's choice -- and the event stream is a payload too.
//
// Both rules were true in the code before this suite existed and almost
// untested: two of the twenty host routes had a refusal case, and nothing
// checked an SSE frame at all. The point of a privacy contract is that it
// cannot quietly stop being true.
import assert from "node:assert/strict";
import { knownHostRoutes } from "./server/route-policy.mjs";

const BASE_URL = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2);
const code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");
const hostKey = "privacy-host-" + stamp;
const strangerKey = "privacy-stranger-" + stamp;
const players = Array.from({ length: 5 }, (_, index) => ({
  key: "privacy-player-" + index + "-" + stamp,
  name: "Privacy Player " + (index + 1),
  // A phrase that cannot occur anywhere else in a snapshot, so "is this text
  // present?" is a sound question to ask of a whole JSON payload.
  secret: "ZEBRAQUILL" + index + stamp.toUpperCase().replace(/[^A-Z0-9]/g, "")
}));

async function request(path, body) {
  const response = await fetch(BASE_URL + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: response.status, data: await response.json() };
}

async function post(path, body) {
  const result = await request(path, body);
  assert.equal(result.data.ok, true, path + " failed: " + result.data.error);
  return result.data;
}

async function snapshotFor(role, playerKey) {
  const result = await request("/api/state", { code, role, playerKey });
  assert.equal(result.status, 200, "A snapshot for role " + role + " was refused: " + result.data.error);
  return result.data;
}

// One state frame from the event stream, which is the same payload the browser
// actually lives on. The ticket is single-use, so each read asks for its own.
async function streamedSnapshot(role, playerKey) {
  const issued = await post("/api/events/ticket", { code, role, playerKey });
  const controller = new AbortController();
  const response = await fetch(
    BASE_URL + "/events?ticket=" + encodeURIComponent(issued.ticket) + "&room=" + code,
    { signal: controller.signal });
  assert.equal(response.status, 200, "The event stream refused a valid ticket for role " + role);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  try {
    while (!buffered.includes("\n\n")) {
      const { value, done } = await reader.read();
      if (done) break;
      buffered += decoder.decode(value, { stream: true });
    }
  } finally {
    controller.abort();
  }
  const frame = buffered.split("\n\n").find((block) => block.includes("event: state"));
  assert(frame, "The stream must open with a state frame, got: " + buffered.slice(0, 200));
  return JSON.parse(frame.slice(frame.indexOf("data: ") + "data: ".length));
}

// --- Setup: a five-writer Herd game, which is the richest private phase. ---
await post("/api/room", { code, playerKey: hostKey, intent: "host" });
await post("/api/host/settings", { code, playerKey: hostKey, gameMode: "herd", roundPreset: "custom", maxQuestionsPerPlayer: 5 });
for (const player of players) {
  await post("/api/player/join", { code, playerKey: player.key, name: player.name, avatarId: "fox" });
}
await post("/api/host/lock-setup", { code, playerKey: hostKey });
for (const [index, player] of players.entries()) {
  await post("/api/question", { code, playerKey: player.key, text: "Privacy prompt " + (index + 1) + ": what happens next?", answers: [] });
  await post("/api/player/ready", { code, playerKey: player.key, ready: true });
}
await post("/api/host/start", { code, playerKey: hostKey });
assert.equal((await snapshotFor("host", hostKey)).phase, "herd-writing");

// --- 1. Every host route refuses everyone who is not the host. ---
//
// The route list is imported rather than retyped, so a new host route joins
// this matrix by existing. The refusal must be the host gate's own words: a
// route that happened to fail for a missing argument would otherwise pass for
// the wrong reason and hide a missing check.
{
  const routes = knownHostRoutes();
  assert(routes.length >= 20, "The host route table should still describe the whole host surface, saw " + routes.length);

  const impostors = [
    { label: "an ordinary player", playerKey: players[0].key },
    { label: "a stranger with no seat", playerKey: strangerKey },
    { label: "no credential at all", playerKey: "" },
    { label: "a player claiming to be the host", playerKey: players[1].key, role: "host" }];

  // The control that makes the matrix below mean something: one of the
  // credentials about to be refused twenty times over is a real, working one.
  // Without this, every refusal could be explained away by a bad key.
  await post("/api/room/chat", { code, playerKey: players[0].key, text: "An ordinary player's credential works." });

  // Everything but the clock: a refusal must not move the game on.
  const roomState = async () => {
    const { serverTime, ...rest } = await snapshotFor("host", hostKey);
    return JSON.stringify(rest);
  };
  const before = await roomState();
  for (const route of routes) {
    for (const impostor of impostors) {
      const payload = { code, playerKey: impostor.playerKey };
      if (impostor.role) payload.role = impostor.role;
      const refused = await request(route, payload);
      assert.equal(refused.data.ok, false, route + " accepted " + impostor.label);
      assert.equal(
        refused.data.error,
        "Only the host can do that.",
        route + " refused " + impostor.label + " for the wrong reason: " + refused.data.error);
      assert.equal(refused.status, 400, route + " should refuse " + impostor.label + " as a client error");
      assert.deepEqual(
        Object.keys(refused.data).sort(),
        ["error", "ok"],
        route + " leaked extra fields while refusing " + impostor.label + ": " + JSON.stringify(refused.data));
    }
  }

  assert.equal(
    await roomState(),
    before,
    "A barrage of refused host requests must leave the room exactly as it was");
}

// --- 2. The `role` string is a hint about layout, never a grant of authority. ---
{
  const asPlayer = await snapshotFor("player", players[0].key);
  for (const claimed of ["host", "room", "party", "guest", "admin"]) {
    const claimedView = await snapshotFor(claimed, players[0].key);
    assert.deepEqual(
      claimedView.herdAnswerReview,
      asPlayer.herdAnswerReview,
      "Asking for role " + claimed + " changed the moderation surface a player receives");
    assert.deepEqual(
      claimedView.ownHerdAssignments.map((item) => item.answerId).sort(),
      asPlayer.ownHerdAssignments.map((item) => item.answerId).sort(),
      "Asking for role " + claimed + " changed which answers a player owns");
  }
  assert.equal(asPlayer.herdAnswerReview.length, 0, "Only the host receives the Herd review list");
  assert((await snapshotFor("host", hostKey)).herdAnswerReview.length > 0, "The host must receive the Herd review list");
}

// --- 3. Writing is private: nobody but the author and the host sees the text. ---
const writtenBy = new Map();
for (const player of players) {
  const view = await snapshotFor("player", player.key);
  assert.equal(view.ownHerdAssignments.length, 4, player.name + " should hold four Herd prompts");
  for (const assignment of view.ownHerdAssignments) {
    assert.equal(
      assignment.answerAuthor.id,
      view.ownPlayer.id,
      "A writer's own assignments must only ever be their own answers");
  }
  const [first] = view.ownHerdAssignments;
  await post("/api/herd/answer", { code, playerKey: player.key, questionId: first.questionId, text: player.secret + " is the answer" });
  writtenBy.set(player.key, player.secret);
}

{
  const viewers = [
    { label: "another writer", snapshot: await snapshotFor("player", players[1].key), own: players[1] },
    { label: "a party screen", snapshot: await snapshotFor("room", strangerKey), own: null },
    { label: "a stranger", snapshot: await snapshotFor("guest", strangerKey), own: null }];

  for (const viewer of viewers) {
    const payload = JSON.stringify(viewer.snapshot);
    for (const player of players) {
      if (viewer.own && player.key === viewer.own.key) {
        assert(payload.includes(player.secret), "A writer must still see their own answer (" + viewer.label + ")");
        continue;
      }
      assert.equal(
        payload.includes(player.secret),
        false,
        viewer.label + " can read " + player.name + "'s answer before the reveal");
    }
    assert.deepEqual(viewer.snapshot.herdAnswerReview, [], viewer.label + " received the host's review list");
  }

  // The probe is only trustworthy if it can see the text when it is allowed to.
  const hostPayload = JSON.stringify(await snapshotFor("host", hostKey));
  for (const player of players) {
    assert(hostPayload.includes(player.secret), "The host must be able to moderate " + player.name + "'s answer");
  }
}

// --- 4. The event stream is filtered exactly like the snapshot it replaces. ---
{
  const streamed = await streamedSnapshot("player", players[1].key);
  const payload = JSON.stringify(streamed);
  assert.equal(streamed.phase, "herd-writing", "The stream frame should describe the live phase");
  assert(payload.includes(players[1].secret), "A writer's own answer must survive the stream");
  for (const player of players) {
    if (player.key === players[1].key) continue;
    assert.equal(payload.includes(player.secret), false, "The event stream leaked " + player.name + "'s answer to another writer");
  }
  assert.deepEqual(streamed.herdAnswerReview, [], "The event stream leaked the host's review list to a player");

  const streamedStranger = JSON.stringify(await streamedSnapshot("room", strangerKey));
  for (const player of players) {
    assert.equal(streamedStranger.includes(player.secret), false, "The event stream leaked " + player.name + "'s answer to a party screen");
  }
}

// --- 5. Answering is private; the reveal is not, and that is the difference. ---
{
  for (const player of players) {
    const view = await snapshotFor("player", player.key);
    for (const assignment of view.ownHerdAssignments) {
      if (assignment.submitted) continue;
      await post("/api/herd/answer", { code, playerKey: player.key, questionId: assignment.questionId, text: player.name + " filler answer" });
    }
    await post("/api/player/ready", { code, playerKey: player.key, ready: true });
  }
  await post("/api/host/start", { code, playerKey: hostKey });
  await post("/api/host/skip", { code, playerKey: hostKey });
  const answering = await snapshotFor("host", hostKey);
  assert.equal(answering.phase, "answering", "The game should reach answering: " + answering.phase);

  const choices = answering.currentQuestion.answers;
  for (const [index, player] of players.entries()) {
    const own = await snapshotFor("player", player.key);
    const mine = own.currentQuestion.answers.find((answer) => answer.ownAnswer);
    const pick = choices.find((answer) => answer.id !== mine?.id) || choices[index % choices.length];
    const answered = await request("/api/answer", { code, playerKey: player.key, answerId: pick.id });
    if (!answered.data.ok) continue;
  }

  // Mid-answering, a player knows who has answered but not what they chose --
  // in the snapshot and in the stream alike.
  for (const [label, snapshot] of [
    ["snapshot", await snapshotFor("player", players[2].key)],
    ["event stream", await streamedSnapshot("player", players[2].key)]]) {
    const own = snapshot.ownPlayer.id;
    const selections = snapshot.answerSelections || [];
    assert(selections.length > 1, "The " + label + " should still say who has answered");
    for (const selection of selections) {
      if (selection.playerId === own) {
        assert(selection.answerId, "A player must keep their own choice in the " + label);
        continue;
      }
      assert.equal("answerId" in selection, false, "The " + label + " leaked another player's Herd choice before the reveal");
    }
  }

  // Herd answer authorship is a reveal feature, so it must appear at the
  // reveal. This is what proves section 3 measured a real boundary rather than
  // a payload that never carries authorship at all.
  while ((await snapshotFor("host", hostKey)).phase !== "reveal") {
    await post("/api/host/skip", { code, playerKey: hostKey });
  }
  const reveal = await snapshotFor("player", players[2].key);
  assert(
    reveal.currentQuestion.answers.some((answer) => answer.author?.id),
    "The reveal must attribute Herd answers, or section 3 proved nothing");
}

console.log("Privacy contract smoke passed: host authority, role claims, writing privacy, stream parity and reveal attribution.");
