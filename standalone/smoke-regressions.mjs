import fs from "node:fs";

const BASE_URL = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
// Browser source and the shipped browser modules are each read as a whole.
// These checks protect properties of *the client*, not of one file: room
// credentials must not be durably stored or placed in a URL. Pinning them to
// app.jsx/app.js alone made them pass or fail on where a function happens to
// live, so extracting the network layer into client/net.ts broke them without
// changing any behaviour. Scanning every shipped module is the stronger check
// and keeps working as more code moves out of the two original files.
const browserSourceFiles = ["./public/app.jsx", ...fs.
  readdirSync(new URL("./public/client/", import.meta.url)).
  filter((name) => /\.(jsx|ts)$/.test(name) && !name.endsWith(".test.ts")).
  map((name) => "./public/client/" + name)];
const shippedModuleFiles = ["./public/app.js", ...fs.
  readdirSync(new URL("./public/client/", import.meta.url)).
  filter((name) => name.endsWith(".js")).
  map((name) => "./public/client/" + name)];

const readAll = (paths) => paths.
  map((relative) => fs.readFileSync(new URL(relative, import.meta.url), "utf8")).
  join("\n");

const app = readAll(browserSourceFiles);
const bundle = readAll(shippedModuleFiles);

// The browser cannot import the contracts package, so SNAPSHOT_SCHEMA_VERSION
// exists in both places. If they drift, clients silently refuse snapshots they
// could actually render, or render ones they cannot. Compared textually here
// because this file runs under plain node, without tsx.
{
  const contractsSource = fs.readFileSync(new URL("../packages/contracts/src/game.ts", import.meta.url), "utf8");
  const browserSource = fs.readFileSync(new URL("./public/app.jsx", import.meta.url), "utf8");
  const contractsVersion = /SNAPSHOT_SCHEMA_VERSION\s*=\s*(\d+)/.exec(contractsSource)?.[1];
  const browserVersion = /SNAPSHOT_SCHEMA_VERSION\s*=\s*(\d+)/.exec(browserSource)?.[1];
  if (!contractsVersion || !browserVersion || contractsVersion !== browserVersion) {
    throw new Error(
      "SNAPSHOT_SCHEMA_VERSION drifted: contracts=" + contractsVersion + " browser=" + browserVersion
    );
  }
}

// NOTE: there is no automated guard here for a browser constant that is
// referenced but never declared, and that gap is real. Removing a block from
// app.jsx also removed GAME_MODES, GAME_FAMILIES and ROUND_PRESETS while every
// check stayed green: esbuild transforms each file without resolving globals,
// and tsconfig.web does not type-check .jsx at all.
//
// A regex guard was written for exactly this and then removed, because it did
// not work and said nothing was wrong. Stripping string literals from JSX with
// a regular expression is not possible: prose containing an apostrophe, such
// as "the room's answers", opens a single-quoted string that swallows
// everything up to the next apostrophe, including the reference being checked.
// It reported success on a file with the constant deleted.
//
// The real fix is to type-check the browser source, which is P09 and P10 work.
// A parser-based lint would also do it, but that is a dependency decision for
// the owner in a project that deliberately has two runtime dependencies.

function assert(value, message) {
  if (!value) throw new Error(message);
}

function code(prefix = "") {
  let value = prefix.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
  while (value.length < 4) value += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  return value;
}

function key(label) {
  return label + "-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
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
  if (!result.data.ok) throw new Error(path + ": " + result.data.error);
  return result.data;
}

async function state(roomCode, role = "host", playerKey = "") {
  return request("/api/state", { code: roomCode, role, playerKey });
}

async function disconnectPlayer(roomCode, playerKey) {
  const controller = new AbortController();
  const issued = await post("/api/events/ticket", { code: roomCode, role: "player", playerKey });
  const response = await fetch(BASE_URL + "/events?ticket=" + encodeURIComponent(issued.ticket), { signal: controller.signal });
  assert(response.ok, "Expected the player event stream to connect before disconnecting");
  controller.abort();
  await new Promise((resolve) => setTimeout(resolve, 1100));
}

async function skip(roomCode, hostKey) {
  await post("/api/host/skip", { code: roomCode, playerKey: hostKey });
}

async function runExactRoomLookupSmoke() {
  const roomCode = code("R");
  const missingCode = code("X");
  const hostKey = key("room-host");
  await post("/api/room", { code: roomCode, playerKey: hostKey });

  const missingState = await state(missingCode);
  assert(missingState.response.status === 404, "A missing room must return 404 even when only one room exists");
  assert(missingState.data.roomMissing, "A missing room response must identify the missing-room condition");

  const wrongRoomAction = await request("/api/host/settings", {
    code: missingCode,
    playerKey: hostKey,
    maxQuestionsPerPlayer: 5
  });
  assert(wrongRoomAction.response.status === 404 && wrongRoomAction.data.roomMissing, "Actions must never fall back to the only active room");

  const originalState = await state(roomCode, "host", hostKey);
  assert(originalState.data.maxQuestionsPerPlayer === 3, "A wrong-room action must not mutate the active room");
  assert(app.includes('sessionStorage.setItem(roomPasswordKey(cleanCode), password)'), "Room passwords should only persist for the current browser tab");
  assert(!app.includes('localStorage.setItem(roomPasswordKey(cleanCode), password)'), "Room passwords must not be durably stored in localStorage");
  assert(app.includes("navigateTo(buildWelcomePath(code))"), "Missing rooms should navigate to a code-only prefilled welcome URL");
  assert(app.includes('welcomePrefill.code || ""'), "Welcome room code should use the missing URL code prefill without inventing a Join code");
  assert(app.includes("Boolean(welcomePrefill.password || welcomePrefill.locked)"), "Welcome password controls should open for a password prefill, and for a room that refused this device");
  assert(app.includes('buildWelcomePath(code, { locked: true })'), "A room that refuses this device should return to the welcome form with its password field open");
  assert(bundle.includes("roomMissing") && bundle.includes("/api/events/ticket"), "The shipped browser bundle must include missing-room routing and scoped live-state tickets");
  assert(!bundle.includes('new EventSource("/events?" + params.toString())'), "The shipped browser must not place room credentials in its event-stream URL");

  return { roomCode, missingCode };
}

async function runGeneratedAnswerSmoke() {
  const roomCode = code("G");
  const hostKey = key("generated-host");
  const playerKey = key("generated-player");
  await post("/api/room", { code: roomCode, playerKey: hostKey });
  await post("/api/host/settings", { code: roomCode, playerKey: hostKey, maxQuestionsPerPlayer: 4 });
  await post("/api/player/join", { code: roomCode, playerKey, name: "Generated Player", avatarId: "zap" });
  await post("/api/host/lock-setup", { code: roomCode, playerKey: hostKey });
  const forced = await post("/api/host/force-start", { code: roomCode, playerKey: hostKey });
  assert(forced.generatedCount === 4, "Expected four generated quiz questions");

  const correctAnswerIds = [];
  let snapshot = (await state(roomCode, "host", hostKey)).data;
  while (snapshot.phase !== "finished") {
    await skip(roomCode, hostKey);
    snapshot = (await state(roomCode, "host", hostKey)).data;
    assert(snapshot.phase === "answering", "Generated quiz should advance to answering");
    await skip(roomCode, hostKey);
    snapshot = (await state(roomCode, "host", hostKey)).data;
    assert(snapshot.phase === "reveal", "Generated quiz should advance to reveal");
    correctAnswerIds.push(snapshot.currentQuestion.correctAnswerId);
    await skip(roomCode, hostKey);
    snapshot = (await state(roomCode, "host", hostKey)).data;
  }
  assert(new Set(correctAnswerIds).size === 4, "Generated correct answers should rotate across all four answer colours");
  return { roomCode, correctAnswerIds };
}

async function runConnectedVoteKickSmoke() {
  const roomCode = code("V");
  const hostKey = key("vote-host");
  const sender = { key: key("vote-sender"), name: "Vote Sender" };
  const target = { key: key("vote-target"), name: "Vote Target" };
  const offlinePlayers = Array.from({ length: 4 }, (_value, index) => ({ key: key("offline-" + index), name: "Offline " + index }));
  await post("/api/room", { code: roomCode, playerKey: hostKey });
  for (const player of [sender, target, ...offlinePlayers]) {
    await post("/api/player/join", { code: roomCode, playerKey: player.key, name: player.name, avatarId: "pop" });
  }
  const before = (await state(roomCode, "host", hostKey)).data;
  const targetId = before.players.find((player) => player.name === target.name).id;
  for (const player of offlinePlayers) await disconnectPlayer(roomCode, player.key);

  const vote = await post("/api/player/vote-kick", { code: roomCode, playerKey: sender.key, playerId: targetId });
  assert(vote.ok, "The connected electorate should be able to pass a vote kick");
  const after = (await state(roomCode, "host", hostKey)).data;
  assert(!after.players.some((player) => player.id === targetId), "Offline players must not inflate the vote-kick threshold");
  return { roomCode, remainingPlayers: after.players.length };
}

async function runFinalEligibilitySmoke() {
  const roomCode = code("E");
  const hostKey = key("eligibility-host");
  const players = [
    { key: key("winner"), name: "Eligible Winner" },
    { key: key("loser"), name: "Eligible Loser" },
    { key: key("other"), name: "Eligible Other" }
  ];
  await post("/api/room", { code: roomCode, playerKey: hostKey });
  await post("/api/host/settings", { code: roomCode, playerKey: hostKey, maxQuestionsPerPlayer: 1 });
  for (const player of players) {
    await post("/api/player/join", { code: roomCode, playerKey: player.key, name: player.name, avatarId: "crown" });
  }
  await post("/api/host/lock-setup", { code: roomCode, playerKey: hostKey });
  for (const player of players) {
    await post("/api/question", {
      code: roomCode,
      playerKey: player.key,
      text: player.name + " eligibility question?",
      answers: [{ text: "Correct", correct: true }, { text: "Wrong", correct: false }]
    });
    await post("/api/player/ready", { code: roomCode, playerKey: player.key, ready: true });
  }
  await post("/api/host/start", { code: roomCode, playerKey: hostKey });

  let snapshot = (await state(roomCode, "host", hostKey)).data;
  let round = 0;
  while (snapshot.phase !== "finished") {
    assert(snapshot.phase === "reading", "Eligibility smoke expected a reading phase");
    await skip(roomCode, hostKey);
    snapshot = (await state(roomCode, "host", hostKey)).data;
    assert(snapshot.phase === "answering", "Eligibility smoke expected an answering phase");
    if (round === 0) {
      await post("/api/answer", { code: roomCode, playerKey: players[0].key, answerId: "red" });
    }
    await post("/api/answer", { code: roomCode, playerKey: players[1].key, answerId: "blue" });
    await post("/api/answer", { code: roomCode, playerKey: players[2].key, answerId: "blue" });
    if (round === 0) await disconnectPlayer(roomCode, players[0].key);
    if (round === 2) await disconnectPlayer(roomCode, players[1].key);
    snapshot = (await state(roomCode, "host", hostKey)).data;
    if (snapshot.phase === "answering") {
      await skip(roomCode, hostKey);
      snapshot = (await state(roomCode, "host", hostKey)).data;
    }
    assert(snapshot.phase === "reveal", "Eligibility smoke expected a reveal phase");
    await skip(roomCode, hostKey);
    snapshot = (await state(roomCode, "host", hostKey)).data;
    round += 1;
  }

  assert(snapshot.leaderboard.length === 3, "Final leaderboard should retain everyone eligible at game start");
  assert(snapshot.leaderboard[0].name === players[0].name, "An eligible winner must remain eligible after disconnecting");
  assert(snapshot.losers?.some((player) => player.name === players[1].name), "An eligible co-loser must not evade final placement by disconnecting");
  return { roomCode, winner: snapshot.leaderboard[0].name, losers: snapshot.losers.map((player) => player.name) };
}

async function runQuestionVoteIntegritySmoke() {
  const roomCode = code("Q");
  const hostKey = key("question-vote-host");
  const players = Array.from({ length: 3 }, (_value, index) => ({
    key: key("question-voter-" + index),
    name: "Question Voter " + (index + 1)
  }));

  await post("/api/room", { code: roomCode, playerKey: hostKey });
  await post("/api/host/settings", { code: roomCode, playerKey: hostKey, roundPreset: "custom", maxQuestionsPerPlayer: 1 });
  for (const player of players) {
    await post("/api/player/join", { code: roomCode, playerKey: player.key, name: player.name, avatarId: "pop" });
  }
  await post("/api/host/lock-setup", { code: roomCode, playerKey: hostKey });
  await post("/api/host/force-start", { code: roomCode, playerKey: hostKey });

  await skip(roomCode, hostKey);
  await skip(roomCode, hostKey);
  let snapshot = (await state(roomCode, "host", hostKey)).data;
  assert(snapshot.phase === "reveal", "Vote integrity smoke expected the first reveal phase");
  const votedQuestionId = snapshot.currentQuestion.id;

  const missingVote = await request("/api/question/vote", { code: roomCode, playerKey: players[1].key });
  assert(!missingVote.data.ok && /Good or Nah/i.test(missingVote.data.error || ""), "A missing vote choice must be rejected instead of becoming Nah");
  const malformedVote = await request("/api/question/vote", { code: roomCode, playerKey: players[1].key, good: "true" });
  assert(!malformedVote.data.ok && /Good or Nah/i.test(malformedVote.data.error || ""), "A non-boolean vote choice must be rejected");

  snapshot = (await state(roomCode, "host", hostKey)).data;
  assert(snapshot.currentQuestion.goodVotes === 0 && snapshot.currentQuestion.badVotes === 0, "Rejected votes must not change the ballot totals");
  assert(snapshot.currentQuestion.voteSelections.length === 0, "Rejected votes must not appear in public vote selections");

  await post("/api/question/vote", { code: roomCode, playerKey: players[0].key, good: true });
  await disconnectPlayer(roomCode, players[0].key);
  snapshot = (await state(roomCode, "host", hostKey)).data;
  assert(snapshot.currentQuestion.goodVotes === 1 && snapshot.currentQuestion.badVotes === 0, "A valid ballot must survive the voter's later disconnect");
  const preservedBallot = snapshot.currentQuestion.voteSelections.find((selection) => selection.player?.name === players[0].name);
  assert(preservedBallot?.value === 1 && preservedBallot.player.connected === false, "Public vote selections must retain a disconnected voter's valid ballot");

  const offlineVote = await request("/api/question/vote", { code: roomCode, playerKey: players[0].key, good: false });
  assert(!offlineVote.data.ok && /Reconnect/i.test(offlineVote.data.error || ""), "A disconnected player must not cast or replace a ballot");
  await post("/api/question/vote", { code: roomCode, playerKey: players[1].key, good: false });

  snapshot = (await state(roomCode, "host", hostKey)).data;
  assert(snapshot.phase === "reveal", "An abstaining connected player must not count as having voted for early advance");
  assert(snapshot.currentQuestion.goodVotes === 1 && snapshot.currentQuestion.badVotes === 1, "Only the explicit Good and Nah ballots should count");
  assert(snapshot.currentQuestion.voteSelections.length === 2, "The abstaining player must not appear in vote selections");
  assert(!snapshot.currentQuestion.voteSelections.some((selection) => selection.player?.name === players[2].name), "A nonvoter must remain an abstention");

  while (snapshot.phase !== "finished") {
    await skip(roomCode, hostKey);
    snapshot = (await state(roomCode, "host", hostKey)).data;
  }

  assert(snapshot.questionResults.best?.id === votedQuestionId, "The voted question should remain eligible for final question results");
  assert(snapshot.questionResults.worst?.id === votedQuestionId, "Zero-ballot questions must be excluded from final question results");
  assert(snapshot.questionResults.best.goodVotes === 1 && snapshot.questionResults.best.badVotes === 1, "Final question results must count only valid explicit ballots");

  const emptyRoomCode = code("A");
  const emptyHostKey = key("abstention-host");
  const abstainerKey = key("only-abstainer");
  await post("/api/room", { code: emptyRoomCode, playerKey: emptyHostKey });
  await post("/api/host/settings", { code: emptyRoomCode, playerKey: emptyHostKey, roundPreset: "custom", maxQuestionsPerPlayer: 1 });
  await post("/api/player/join", { code: emptyRoomCode, playerKey: abstainerKey, name: "Only Abstainer", avatarId: "frog" });
  await post("/api/host/lock-setup", { code: emptyRoomCode, playerKey: emptyHostKey });
  await post("/api/host/force-start", { code: emptyRoomCode, playerKey: emptyHostKey });

  let emptySnapshot = (await state(emptyRoomCode, "host", emptyHostKey)).data;
  while (emptySnapshot.phase !== "finished") {
    await skip(emptyRoomCode, emptyHostKey);
    emptySnapshot = (await state(emptyRoomCode, "host", emptyHostKey)).data;
  }
  assert(emptySnapshot.questionResults.best === null && emptySnapshot.questionResults.worst === null, "An all-abstention game must not invent best or worst question results");

  return {
    roomCode,
    validGoodVotes: snapshot.questionResults.best.goodVotes,
    validBadVotes: snapshot.questionResults.best.badVotes,
    abstentionRoomCode: emptyRoomCode
  };
}

const exactRoomLookup = await runExactRoomLookupSmoke();
const generatedAnswers = await runGeneratedAnswerSmoke();
const connectedVoteKick = await runConnectedVoteKickSmoke();
const finalEligibility = await runFinalEligibilitySmoke();
const questionVoteIntegrity = await runQuestionVoteIntegritySmoke();

console.log(JSON.stringify({ ok: true, exactRoomLookup, generatedAnswers, connectedVoteKick, finalEligibility, questionVoteIntegrity }, null, 2));
