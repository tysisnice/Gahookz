const BASE_URL = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3102";
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

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

async function snapshot(roomCode, playerKey, role = "host") {
  return (await request("/api/state", { code: roomCode, role, playerKey })).data;
}

async function addPlayers(roomCode, count, prefix) {
  const players = [];
  for (let index = 0; index < count; index += 1) {
    const player = { key: key(prefix + "-" + index), name: prefix + " " + (index + 1) };
    await post("/api/player/join", { code: roomCode, playerKey: player.key, name: player.name, avatarId: "fox" });
    players.push(player);
  }
  return players;
}

async function runRoomIntentSmoke() {
  const roomCode = code("I");
  const hostKey = key("intent-owner");
  const missingJoin = await request("/api/room", { code: roomCode, playerKey: key("intent-joiner"), intent: "join" });
  assert(missingJoin.response.status === 404 && missingJoin.data.roomMissing, "Join intent must not create a missing room");

  const created = await post("/api/room", { code: roomCode, playerKey: hostKey, intent: "host" });
  assert(created.created && created.role === "host", "Host intent should create a missing room");
  const collision = await request("/api/room", { code: roomCode, playerKey: key("other-host"), intent: "host" });
  assert(!collision.data.ok && collision.data.roomExists, "Host intent must reject another owner's room code");
  const rejoined = await post("/api/room", { code: roomCode, playerKey: hostKey, intent: "host" });
  assert(!rejoined.created && rejoined.role === "host", "A room owner should be able to rejoin with Host selected");
  const legacy = await post("/api/room", { code: roomCode, playerKey: key("legacy-join") });
  assert(legacy.role === "player", "Omitting intent must preserve the legacy create-or-join contract");
  return { roomCode };
}

async function runQuickPresetSmoke() {
  const roomCode = code("Q");
  const hostKey = key("quick-host");
  await post("/api/room", { code: roomCode, playerKey: hostKey, intent: "host" });
  await post("/api/host/settings", { code: roomCode, playerKey: hostKey, roundPreset: "quick" });
  const emptyState = await snapshot(roomCode, hostKey);
  assert(emptyState.plannedTotalQuestions === 0 && emptyState.estimatedDurationMs === 0, "An empty lobby should not advertise phantom rounds or duration");
  const players = await addPlayers(roomCode, 12, "Quick Player");
  let state = await snapshot(roomCode, hostKey);
  assert(state.roundPreset === "quick" && state.maxQuestionsPerPlayer === 1, "Quick should require one submission per player");
  assert(state.plannedTotalQuestions === 10 && state.selectedQuestionLimit === 10, "Quick should advertise a maximum of ten rounds");
  assert(state.estimatedDurationMs === 10 * 31000, "Quick Quiz duration should be based on ten selected rounds");

  await post("/api/host/lock-setup", { code: roomCode, playerKey: hostKey });
  for (const player of players) {
    await post("/api/question", {
      code: roomCode,
      playerKey: player.key,
      text: "A fair Quick question from " + player.name + "?",
      answers: [{ text: "Yes", correct: true }, { text: "No", correct: false }]
    });
    await post("/api/player/ready", { code: roomCode, playerKey: player.key, ready: true });
  }
  await post("/api/host/start", { code: roomCode, playerKey: hostKey });
  state = await snapshot(roomCode, hostKey);
  assert(state.totalQuestions === 10 && state.questionCount === 12, "Quick should retain all submissions but select only ten rounds");

  while (state.phase !== "finished") {
    await post("/api/host/skip", { code: roomCode, playerKey: hostKey });
    state = await snapshot(roomCode, hostKey);
  }
  await post("/api/host/new-game", { code: roomCode, playerKey: hostKey });
  state = await snapshot(roomCode, hostKey);
  assert(state.phase === "building", "New game should return directly to question building");
  assert(state.questionCount === 2 && state.unusedQuestionCount === 2, "The two unselected Quick questions should carry into the rematch");
  assert(state.players.filter((player) => player.questionsSubmitted === 1).length === 2, "Carried questions should satisfy their authors' rematch submission slot");
  return { roomCode, selected: 10, reused: 2 };
}

async function runStandardPresetSmoke() {
  const roomCode = code("S");
  const hostKey = key("standard-host");
  await post("/api/room", { code: roomCode, playerKey: hostKey, intent: "host" });
  await post("/api/host/settings", { code: roomCode, playerKey: hostKey, roundPreset: "standard" });
  const players = await addPlayers(roomCode, 20, "Standard Player");
  let state = await snapshot(roomCode, hostKey);
  assert(state.maxQuestionsPerPlayer === 1, "Standard should scale down to one submission at twenty players");
  assert(state.plannedTotalQuestions === 18 && state.selectedQuestionLimit === 18, "Standard should cap the selected game at eighteen rounds");
  await post("/api/host/lock-setup", { code: roomCode, playerKey: hostKey });
  const forced = await post("/api/host/force-start", { code: roomCode, playerKey: hostKey });
  assert(forced.generatedCount === players.length && forced.totalQuestions === 18, "Standard force-start should fill every author's slot but select only eighteen rounds");
  state = await snapshot(roomCode, hostKey);
  assert(state.questionCount === 20 && state.totalQuestions === 18, "Standard should keep two unused submissions available for reuse");
  return { roomCode, generated: forced.generatedCount, selected: forced.totalQuestions };
}

async function runGahookAndTieSmoke() {
  const roomCode = code("G");
  const hostKey = key("gahook-host");
  await post("/api/room", { code: roomCode, playerKey: hostKey, intent: "host" });
  await post("/api/host/settings", { code: roomCode, playerKey: hostKey, roundPreset: "custom", maxQuestionsPerPlayer: 1 });
  const players = await addPlayers(roomCode, 3, "Gahook Player");
  await post("/api/host/lock-setup", { code: roomCode, playerKey: hostKey });
  await post("/api/host/force-start", { code: roomCode, playerKey: hostKey });
  let state = await snapshot(roomCode, players[0].key, "player");
  const senderId = state.ownPlayer.id;
  const firstTarget = state.players.find((player) => player.name === players[1].name);
  const secondTarget = state.players.find((player) => player.name === players[2].name);
  const first = await post("/api/player/round-poke", { code: roomCode, playerKey: players[0].key, playerId: firstTarget.id });
  assert(first.pointsStolen === 50, "The sender's one question Gahook should still steal 50 points");
  const rejected = await request("/api/player/round-poke", { code: roomCode, playerKey: players[0].key, playerId: secondTarget.id });
  assert(!rejected.data.ok && rejected.data.usedTargetId === firstTarget.id, "A second target in the same question must be rejected");
  state = await snapshot(roomCode, players[0].key, "player");
  assert(state.ownGahookUses.questionTargetId === firstTarget.id && state.ownGahookUses.question.length === 1, "Snapshot should expose the single used question target");
  assert(state.players.find((player) => player.id === senderId).score === 50, "Rejected Gahooks must not grant extra points");

  await post("/api/host/skip", { code: roomCode, playerKey: hostKey });
  await post("/api/host/skip", { code: roomCode, playerKey: hostKey });
  const revealRejected = await request("/api/player/poke", { code: roomCode, playerKey: players[0].key, playerId: secondTarget.id });
  assert(!revealRejected.data.ok, "Reveal must share the same question-wide Gahook claim");
  await post("/api/host/skip", { code: roomCode, playerKey: hostKey });
  const nextRound = await post("/api/player/round-poke", { code: roomCode, playerKey: players[0].key, playerId: secondTarget.id });
  assert(nextRound.pointsStolen === 50, "The Gahook claim should reset for the next question");

  // Finish with one clear leader and two tied last-place players.
  await post("/api/host/start", { code: roomCode, playerKey: hostKey });
  state = await snapshot(roomCode, hostKey);
  assert(state.winners.length === 1 && state.winner?.id === senderId, "A unique top score should produce one compatible winner");
  assert(state.losers.length === 2 && state.loser === null, "Tied last place should expose co-losers without choosing an arbitrary singular loser");
  assert(state.leaderboard.filter((player) => player.rank === 2).length === 2, "Tied scores should share a competition rank");
  return { roomCode, winner: state.winner.name, coLosers: state.losers.length };
}

async function runAllTiedSmoke() {
  const roomCode = code("T");
  const hostKey = key("tie-host");
  await post("/api/room", { code: roomCode, playerKey: hostKey, intent: "host" });
  await post("/api/host/settings", { code: roomCode, playerKey: hostKey, roundPreset: "custom", maxQuestionsPerPlayer: 1 });
  await addPlayers(roomCode, 2, "Tie Player");
  await post("/api/host/lock-setup", { code: roomCode, playerKey: hostKey });
  await post("/api/host/force-start", { code: roomCode, playerKey: hostKey });
  await post("/api/host/start", { code: roomCode, playerKey: hostKey });
  const state = await snapshot(roomCode, hostKey);
  assert(state.winners.length === 2 && state.losers.length === 0, "An all-tied game should be a shared win, not a shared loss");
  assert(state.winner === null && state.loser === null, "Singular compatibility fields should be null for an all-player tie");
  assert(state.leaderboard.every((player) => player.rank === 1), "All tied players should share rank one");
  return { roomCode, coWinners: state.winners.length };
}

const roomIntent = await runRoomIntentSmoke();
const quick = await runQuickPresetSmoke();
const standard = await runStandardPresetSmoke();
const gahookAndTies = await runGahookAndTieSmoke();
const allTied = await runAllTiedSmoke();

console.log(JSON.stringify({ ok: true, roomIntent, quick, standard, gahookAndTies, allTied }, null, 2));
