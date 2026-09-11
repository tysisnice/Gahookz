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
assert(afterReset.questionCount === 0, "Reset returns a clean lobby with nothing selected");
assert(
  Number(afterReset.savedQuestionCount || 0) === 8,
  "Reset must park the writing people did, not destroy it; got " + afterReset.savedQuestionCount
);

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

// --- P03 step 5: the saved bank is separate from the selected questions -----
//
// These were vacuous when first written: after a reset the room held no
// questions, so every count compared zero with zero. They only mean something
// because a reset now parks written content instead of discarding it.

await post("/api/host/settings", { gameFamily: "quiz", quizScoring: "classic", roundPreset: "custom", maxQuestionsPerPlayer: 3 });
const restored = await state();
assert(
  restored.questionCount === 8,
  "Settling on a family must bring its parked questions back, got " + restored.questionCount
);
const bankTotal = restored.questionCount + Number(restored.savedQuestionCount || 0);
assert(bankTotal === 8, "Nothing should be duplicated or lost on restore, got " + bankTotal);

// Shrinking the per-player quota parks the overflow rather than deleting it.
await post("/api/host/settings", { maxQuestionsPerPlayer: 1 });
const shrunk = await state();
assert(shrunk.questionCount === 4, "One question each from four players should stay selected, got " + shrunk.questionCount);
assert(
  shrunk.questionCount + Number(shrunk.savedQuestionCount || 0) === 8,
  "Shrinking the quota must lose nothing: " + shrunk.questionCount + " + " + shrunk.savedQuestionCount
);

// Raising it again brings them straight back.
await post("/api/host/settings", { maxQuestionsPerPlayer: 3 });
const raised = await state();
assert(raised.questionCount === 8, "Raising the quota must restore parked questions, got " + raised.questionCount);
assert(Number(raised.savedQuestionCount || 0) === 0, "Nothing should stay parked once it fits again");

// Switching family preserves the other family's drafts.
await post("/api/host/settings", { gameFamily: "herd" });
const onHerd = await state();
assert(onHerd.questionCount === 0, "Herd must not inherit Quiz questions, got " + onHerd.questionCount);
assert(
  Number(onHerd.savedQuestionCountOtherFamily || 0) === 8,
  "Quiz drafts must be retained while Herd is selected, got " + onHerd.savedQuestionCountOtherFamily
);

await post("/api/host/settings", { gameFamily: "quiz" });
const backOnQuiz = await state();
// Selecting Herd sets the per-player quota to one, and that quota survives the
// trip back. So the invariant to assert is that nothing was lost, not that
// everything is selected: the quota legitimately limits what this game plays.
assert(
  backOnQuiz.questionCount + Number(backOnQuiz.savedQuestionCount || 0) === 8,
  "Returning to Quiz must lose nothing: " + backOnQuiz.questionCount + " + " + backOnQuiz.savedQuestionCount
);
await post("/api/host/settings", { roundPreset: "custom", maxQuestionsPerPlayer: 3 });
const requota = await state();
assert(
  requota.questionCount === 8,
  "Restoring the quota must reselect every retained draft, got " + requota.questionCount
);

// --- P03 step 6: a stale Save is refused, and rules freeze at lock ----------

const current = await state();
const revision = Number(current.settingsRevision);
assert(Number.isFinite(revision), "The room must publish a settings revision");

const stale = await post("/api/host/settings", { settingsRevision: revision - 1, roundPreset: "quick" });
assert(stale.ok === false && stale.stale === true, "A stale Save must be refused");
const afterStale = await state();
assert(
  afterStale.roundPreset === current.roundPreset && afterStale.questionCount === current.questionCount,
  "A refused Save must leave the room completely unchanged"
);
assert(Number(afterStale.settingsRevision) === revision, "A refused Save must not advance the revision");

const fresh = await post("/api/host/settings", { settingsRevision: revision, roundPreset: "quick" });
assert(fresh.ok, "A Save carrying the current revision must be accepted");
assert(Number((await state()).settingsRevision) === revision + 1, "An accepted Save must advance the revision");

assert((await state()).lockedRules === null, "A lobby has no locked rules");
await post("/api/host/settings", { gameFamily: "quiz", quizScoring: "majority" });
await post("/api/host/lock-setup");
const locked = await state();
assert(locked.lockedRules, "Locking setup must freeze the rules for the game");
assert(locked.lockedRules.gameFamily === "quiz", "Locked rules must record the family");
assert(locked.lockedRules.quizScoring === "majority", "Locked rules must record the scoring in force");
assert(locked.lockedRules.gameMode === "majority", "Locked rules must carry the derived legacy mode");
assert(typeof locked.lockedRules.lockedAt === "number", "Locked rules must record when they froze");

const saveAfterLock = await post("/api/host/settings", { quizScoring: "classic" });
assert(saveAfterLock.ok === false, "Settings must be refused once the rules are locked");
assert((await state()).lockedRules.quizScoring === "majority", "Locked rules must not change after locking");

await post("/api/host/reset");
assert((await state()).lockedRules === null, "A reset clears the frozen rules");

// --- P06: Herd is actually short now ---------------------------------------

await post("/api/host/reset");
await post("/api/host/settings", { gameFamily: "quiz" });
await post("/api/host/settings", { gameFamily: "herd" });
const herdDefaults = await state();
assert(
  herdDefaults.roundPreset === "quick",
  "Choosing Herd should default to Quick so a first session is short, got " + herdDefaults.roundPreset
);

// Quick is a ceiling, not a quota: four players play four prompts.
assert(
  herdDefaults.plannedTotalQuestions === 4,
  "Four players on Quick should plan four rounds, got " + herdDefaults.plannedTotalQuestions
);

await post("/api/host/settings", { roundPreset: "standard" });
const fullRoom = await state();
assert(
  fullRoom.plannedTotalQuestions === 4,
  "Full room with four players is also four rounds, got " + fullRoom.plannedTotalQuestions
);

await post("/api/host/settings", { roundPreset: "custom", herdRoundTarget: 2 });
const custom = await state();
assert(
  custom.plannedTotalQuestions === 2,
  "A custom Herd length should be honoured, got " + custom.plannedTotalQuestions
);

// The bound is enforced server-side, not just by the input's max attribute.
await post("/api/host/settings", { herdRoundTarget: 999 });
const clamped = await state();
assert(
  Number(clamped.herdRoundTarget) <= 20,
  "A custom round target must be clamped server-side, got " + clamped.herdRoundTarget
);

await post("/api/host/settings", { gameFamily: "quiz", roundPreset: "standard" });

console.log(JSON.stringify({
  ok: true,
  checked: [
    "questions refused in the lobby",
    "settings refused outside the lobby",
    "submissions retained in building",
    "unused questions carried into a new game",
    "reset returns a clean lobby and parks the writing",
    "scoring changes do not disturb the roster",
    "legacy gameMode requests still work",
    "canonical gameFamily/quizScoring travel beside the derived gameMode",
    "Herd remembers the Quiz scoring choice",
    "contradictory old and new spellings are refused",
    "shrinking the quota parks overflow instead of deleting it",
    "raising the quota restores parked questions",
    "each family keeps its own drafts across a switch",
    "a stale Save is refused and changes nothing",
    "locking setup freezes the rules, and a reset clears them",
    "Herd defaults to Quick and Quick is a ceiling, not a quota",
    "a custom Herd length is honoured and clamped server-side"
  ]
}, null, 2));
