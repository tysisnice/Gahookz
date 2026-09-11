// P03 step 1: lock the behaviour the selector merge must not break.
//
// Written before any UI or payload changed, so that "this still works" is a
// measurement rather than a hope.
//
// It also pins something the plan got wrong, which matters for how much P03
// has to do. The plan lists "settings can silently destroy questions" as a
// confirmed defect, citing `updateHostSettings()` clearing every question
// queue on a mode change. That code really is there, but it cannot run with
// questions present: questions are refused in `lobby`, and settings are
// refused anywhere else. The two states are mutually exclusive, so the wipe is
// unreachable today.
//
// It stops being unreachable the moment P03 and P04 land, because their whole
// point is a saved question bank that survives a family switch and a settings
// modal that edits rules while a bank exists. These assertions exist so that
// the day those states can overlap, the guard is already known to be needed.

import { randomUUID } from "node:crypto";

const BASE_URL = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";

function assert(value, message) {
  if (!value) throw new Error(message);
}

const host = randomUUID();
let code = "";

const post = async (path, body = {}) => {
  const response = await fetch(BASE_URL + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...(code ? { code } : {}), playerKey: host, ...body })
  });
  return response.json();
};
const state = () => post("/api/state", { playerKey: host, role: "host" });
const question = (playerKey, text) =>
  post("/api/question", {
    playerKey,
    text,
    answers: [{ text: "Yes", correct: true }, { text: "No", correct: false }]
  });

const created = await post("/api/room");
assert(created.ok, "Host must be able to create a room without an account");
code = created.code;

const players = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
for (const [index, key] of players.entries()) {
  const joined = await post("/api/player/join", { playerKey: key, name: "P" + (index + 1), avatarId: "frog" });
  assert(joined.ok, "Guests must be able to join without an account");
}

// --- the two states that cannot overlap ------------------------------------

assert((await state()).phase === "lobby", "A new room starts in the lobby");

const lobbySubmission = await question(players[0], "Submitted in the lobby?");
assert(
  lobbySubmission.ok === false,
  "Questions must not be accepted before the host locks the game options"
);

const settingsInLobby = await post("/api/host/settings", { gameMode: "quiz", roundPreset: "standard" });
assert(settingsInLobby.ok, "Settings must be editable in the lobby");

await post("/api/host/lock-setup");
assert((await state()).phase === "building", "Locking setup moves the room to question building");

const settingsAfterLock = await post("/api/host/settings", { gameMode: "majority" });
assert(
  settingsAfterLock.ok === false,
  "Settings must be refused once setup is locked, which is what makes the queue reset unreachable"
);

// --- questions accumulate in building, and survive a new game ---------------

for (const key of players) {
  for (let index = 0; index < 2; index += 1) {
    const submitted = await question(key, "Question " + index + " from " + key.slice(0, 4) + "?");
    assert(submitted.ok, "A player in building must be able to submit a question");
  }
}
const built = await state();
assert(built.questionCount === 8, "Every submission should be retained, got " + built.questionCount);

await post("/api/host/new-game");
const afterNewGame = await state();
assert(afterNewGame.phase === "building", "New game returns to building, not the lobby");
assert(
  afterNewGame.questionCount === 8,
  "Unused questions must carry into the next game, got " + afterNewGame.questionCount
);

const settingsDuringCarryover = await post("/api/host/settings", { gameMode: "herd" });
assert(
  settingsDuringCarryover.ok === false,
  "A carried-over bank lives in building, where settings are refused; this is the guard P03 must keep"
);

// --- a full reset clears the bank and returns to the lobby ------------------

await post("/api/host/reset");
const afterReset = await state();
assert(afterReset.phase === "lobby", "Reset returns to the lobby");
assert(afterReset.questionCount === 0, "Reset clears the question bank");

// --- switching scoring in an empty lobby disturbs nothing -------------------

const before = await state();
const toMajority = await post("/api/host/settings", { gameMode: "majority" });
assert(toMajority.ok, "Switching to Majority must be allowed in the lobby");
const afterMajority = await state();
assert(
  afterMajority.players.length === before.players.length,
  "Changing the scoring rule must not remove anybody from the room"
);
assert(afterMajority.gameMode === "majority", "The room should report the requested mode");

const backToQuiz = await post("/api/host/settings", { gameMode: "quiz" });
assert(backToQuiz.ok, "Switching back to Classic must be allowed");
assert((await state()).gameMode === "quiz", "The room should report the restored mode");

const toHerd = await post("/api/host/settings", { gameMode: "herd" });
assert(toHerd.ok, "Switching to Herd must be allowed");
assert((await state()).gameMode === "herd", "The room should report Herd");

// --- legacy spellings keep working ------------------------------------------

const legacy = await post("/api/host/settings", { gameMode: "majority" });
assert(legacy.ok, "The legacy gameMode field must keep working during the migration");
assert((await state()).gameMode === "majority", "A legacy gameMode request must still take effect");

// --- the canonical pair travels beside the derived legacy field ------------

const canonicalChecks = [
  [{ gameMode: "quiz" }, "quiz", "classic", "quiz"],
  [{ gameMode: "majority" }, "quiz", "majority", "majority"],
  [{ gameMode: "herd" }, "herd", null, "herd"],
  [{ gameFamily: "quiz", quizScoring: "classic" }, "quiz", "classic", "quiz"],
  [{ quizScoring: "majority" }, "quiz", "majority", "majority"],
  [{ gameFamily: "herd" }, "herd", null, "herd"]
];
for (const [request, family, scoring, legacy] of canonicalChecks) {
  const applied = await post("/api/host/settings", request);
  assert(applied.ok, "Settings request must be accepted: " + JSON.stringify(request));
  const snapshot = await state();
  assert(snapshot.gameFamily === family, JSON.stringify(request) + " should give family " + family + ", got " + snapshot.gameFamily);
  assert(snapshot.gameMode === legacy, JSON.stringify(request) + " should derive gameMode " + legacy + ", got " + snapshot.gameMode);
  if (scoring) {
    assert(snapshot.quizScoring === scoring, JSON.stringify(request) + " should give scoring " + scoring + ", got " + snapshot.quizScoring);
  }
}

// Selecting Herd hides the Majority toggle but must remember its position, so
// a host who had Majority on gets it back when they return to Quiz.
await post("/api/host/settings", { gameFamily: "quiz", quizScoring: "majority" });
await post("/api/host/settings", { gameFamily: "herd" });
const whileHerd = await state();
assert(whileHerd.quizScoring === "majority", "Herd must remember the Quiz scoring choice, got " + whileHerd.quizScoring);
await post("/api/host/settings", { gameFamily: "quiz" });
const backToQuizAgain = await state();
assert(backToQuizAgain.quizScoring === "majority", "Returning to Quiz must restore Majority, not reset to Classic");
assert(backToQuizAgain.gameMode === "majority", "The derived legacy field must follow the restored scoring");

// Contradictory old and new spellings are refused rather than silently resolved.
const contradiction = await post("/api/host/settings", { gameMode: "herd", gameFamily: "quiz" });
assert(contradiction.ok === false, "A contradictory settings request must be refused, not guessed at");

console.log(JSON.stringify({
  ok: true,
  checked: [
    "questions refused in the lobby",
    "settings refused outside the lobby",
    "submissions retained in building",
    "unused questions carried into a new game",
    "reset clears the bank and returns to the lobby",
    "scoring changes do not disturb the roster",
    "legacy gameMode requests still work",
    "canonical gameFamily/quizScoring travel beside the derived gameMode",
    "Herd remembers the Quiz scoring choice",
    "contradictory old and new spellings are refused"
  ]
}, null, 2));
