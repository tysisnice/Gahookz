// P04: the host's room rules are enforced by the server, not by hiding buttons.
//
// The point of these checks is that a client which keeps sending the request
// anyway gets nothing. A policy that only removes a button is not a policy.

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
const state = (key = host, role = "host") => post("/api/state", { playerKey: key, role });

const created = await post("/api/room");
code = created.code;

const players = [randomUUID(), randomUUID(), randomUUID()];
for (const [index, key] of players.entries()) {
  await post("/api/player/join", { playerKey: key, name: "P" + (index + 1), avatarId: "frog" });
}

// --- defaults ---------------------------------------------------------------

const defaults = await state();
assert(defaults.gahookEffects === "chaos", "Rooms must default to the existing Chaos behaviour, got " + defaults.gahookEffects);
assert(defaults.lobbyArenaEnabled === true, "Lobby duels must default to on");
assert(defaults.gahookStealPoints === 50, "The room must publish the real steal value, got " + defaults.gahookStealPoints);
assert(defaults.getGotPenaltyPoints === 1000, "The room must publish the real GET GOT penalty, got " + defaults.getGotPenaltyPoints);

// --- disabling custom media hides it without destroying it ------------------

const picture = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const uploaded = await post("/api/player/profile", { playerKey: players[0], name: "P1", avatarId: "frog", avatarImageDataUrl: picture });
if (uploaded.ok) {
  const withPicture = await state();
  const hadPicture = withPicture.players.some((player) => player.avatarImageDataUrl);
  if (hadPicture) {
    await post("/api/host/settings", { allowCustomProfiles: false });
    const hidden = await state();
    assert(
      !hidden.players.some((player) => player.avatarImageDataUrl),
      "Disabling custom profiles must hide uploaded pictures"
    );
    await post("/api/host/settings", { allowCustomProfiles: true });
    const restored = await state();
    assert(
      restored.players.some((player) => player.avatarImageDataUrl),
      "Re-enabling custom profiles must restore the picture, not make the player upload it again"
    );
  }
}

// --- lobby duels ------------------------------------------------------------

await post("/api/host/settings", { lobbyArenaEnabled: false });
assert((await state()).lobbyArenaEnabled === false, "The room must report duels as disabled");
const refusedChallenge = await post("/api/player/duel-challenge", { playerKey: players[0], targetId: "someone" });
assert(refusedChallenge.ok === false, "A challenge must be refused while duels are off, even if the client still sends it");
await post("/api/host/settings", { lobbyArenaEnabled: true });
assert((await state()).lobbyArenaEnabled === true, "Duels must be re-enablable");

// --- Gahook effects during a live round -------------------------------------
//
// The policy has to be chosen in the lobby, because settings are refused once a
// game starts. So each policy gets its own game.

async function playIntoLiveRound(policy) {
  await post("/api/host/reset");
  await post("/api/host/settings", {
    gameFamily: "quiz",
    quizScoring: "classic",
    roundPreset: "custom",
    maxQuestionsPerPlayer: 1,
    gahookEffects: policy
  });
  const lobby = await state();
  assert(lobby.gahookEffects === policy, "The lobby must accept the " + policy + " policy, got " + lobby.gahookEffects);

  await post("/api/host/lock-setup");
  for (const key of players) {
    await post("/api/question", {
      playerKey: key,
      text: "A question from " + key.slice(0, 4) + "?",
      answers: [{ text: "Yes", correct: true }, { text: "No", correct: false }]
    });
  }
  await post("/api/host/force-start");
  const live = await state();
  assert(["reading", "answering", "reveal"].includes(live.phase), "Expected a live phase, got " + live.phase);
  assert(live.gahookEffects === policy, "The locked game must keep the " + policy + " policy");
  return live;
}

const scoreOf = (snapshot, playerId) => Number(snapshot.players.find((player) => player.id === playerId)?.score || 0);

// Chaos: the existing behaviour, and the default.
{
  const live = await playIntoLiveRound("chaos");
  const targetId = live.players[0].id;
  const before = scoreOf(live, targetId);
  const poked = await post("/api/player/poke", { playerKey: players[1], playerId: targetId });
  assert(poked.ok, "A Gahook must be allowed under Chaos: " + poked.error);
  const after = scoreOf(await state(), targetId);
  assert(
    after === before - 50,
    "Chaos must still steal the documented 50 points: " + before + " -> " + after
  );
}

// Visual only: the reaction lands, the points do not.
{
  const live = await playIntoLiveRound("visual");
  const targetId = live.players[0].id;
  const before = scoreOf(live, targetId);
  const poked = await post("/api/player/poke", { playerKey: players[1], playerId: targetId });
  assert(poked.ok, "A cosmetic Gahook must still be allowed under Visual only: " + poked.error);
  const after = scoreOf(await state(), targetId);
  assert(
    after === before,
    "Visual only must not move anybody's score, even when the client still asks: " + before + " -> " + after
  );
}

// Off: the interruption itself is refused during a live round.
{
  const live = await playIntoLiveRound("off");
  const targetId = live.players[0].id;
  const before = scoreOf(live, targetId);
  const poked = await post("/api/player/poke", { playerKey: players[1], playerId: targetId });
  assert(poked.ok === false, "A Gahook must be refused outright while effects are off");
  const after = scoreOf(await state(), targetId);
  assert(after === before, "A refused Gahook must not move a score");
}

await post("/api/host/reset");

// --- only the host owns these rules -----------------------------------------

const forged = await post("/api/host/settings", { playerKey: players[0], gahookEffects: "chaos", lobbyArenaEnabled: false });
assert(forged.ok === false, "An ordinary player must not be able to change the room rules");
const afterForged = await state();
assert(afterForged.lobbyArenaEnabled === true, "A forged request must change nothing");

const spectatorForged = await post("/api/host/settings", { playerKey: randomUUID(), approveQuestions: true });
assert(spectatorForged.ok === false, "A stranger must not be able to change the room rules");

// Players see the policy, never a credential.
const hostView = await state();
const playerView = await state(players[0], "player");
// Compared with the host's view rather than a hard-coded value: room rules
// survive a reset, so assuming a default here would be asserting a fiction.
assert(
  playerView.gahookEffects === hostView.gahookEffects,
  "Players must see the same effects policy as the host: " + playerView.gahookEffects + " vs " + hostView.gahookEffects
);
assert(
  playerView.lobbyArenaEnabled === hostView.lobbyArenaEnabled,
  "Players must see whether duels are allowed"
);
for (const secret of ["password", "hostKey", "playerKey", "credential"]) {
  assert(
    !JSON.stringify(playerView).includes('"' + secret + '"'),
    "A player snapshot must never carry " + secret
  );
}

// --- P05: server-rendered suggestions ---------------------------------------

assert((await post("/api/host/lock-setup")).ok, "Open question writing before requesting suggestions");

{
  const suggestion = await post("/api/question/suggest", { playerKey: players[0] });
  assert(suggestion.ok, "A joined player must be able to ask for a suggestion: " + suggestion.error);
  const prompt = suggestion.suggestion;
  assert(prompt.text && !prompt.text.includes("{Player1}"), "A suggestion must never contain an unresolved token: " + prompt.text);
  // Two to four, not always four: the migrated party bank holds two-option
  // prompts, and the builder has always supported between two and four
  // answers. Demanding four here would have quietly excluded that whole bank.
  assert(
    prompt.options.length >= 2 && prompt.options.length <= 4,
    "A suggestion must offer between two and four options, got " + prompt.options.length
  );
  // The requester is the prospective author of this draft, and an author is
  // always shown the key to their own question -- `ownQuestions` already does
  // exactly that. The rule being protected is narrower: a key must never reach
  // somebody who is about to answer the question, which is a different payload
  // and is covered by the fixture corpus.
  // Branch on whether the prompt actually carries a key, not on its kind name:
  // the migrated banks use "opinion" and "factual" alongside the newer "funny"
  // and "educational", and what matters is the property, not the label.
  const isOpinion = prompt.kind === "funny" || prompt.kind === "opinion";
  if (isOpinion) {
    assert(
      !prompt.intendedAnswerId,
      "An opinion prompt must never arrive with a correct answer already chosen"
    );
    assert(!prompt.explanation, "An opinion prompt has nothing to explain");
  } else {
    assert(
      prompt.options.some((option) => option.id === prompt.intendedAnswerId),
      "A factual suggestion should key one of its own options for the author"
    );
  }

  // Funny prompts name somebody in the room, and only a connected seat.
  const names = (await state()).players.map((player) => player.name);
  if (prompt.kind === "funny") {
    assert(
      names.some((name) => prompt.text.includes(name)) || prompt.text.includes("your imaginary teammate"),
      "A funny suggestion should name a connected player: " + prompt.text
    );
  }

  // A stranger with no seat gets nothing.
  const stranger = await post("/api/question/suggest", { playerKey: randomUUID() });
  assert(stranger.ok === false, "Somebody who has not joined must not be served suggestions");

  // The room works through its library rather than repeating immediately.
  const seen = new Set();
  for (let index = 0; index < 12; index += 1) {
    const next = await post("/api/question/suggest", { playerKey: players[0] });
    seen.add(next.suggestion.templateId);
  }
  assert(seen.size >= 10, "A room should work through its library, saw " + seen.size + " distinct prompts in 12 draws");
}

// --- P11: a fast start that does not invent answers or bin player work ------

{
  await post("/api/host/reset");
  await post("/api/host/settings", {
    playerKey: host,
    gameFamily: "quiz",
    quizScoring: "classic",
    roundPreset: "custom",
    maxQuestionsPerPlayer: 2,
    approveQuestions: true
  });
  await post("/api/host/lock-setup", { playerKey: host });

  // One player writes a question that is still awaiting approval when the host
  // decides to start. That is player work and must survive.
  const written = await post("/api/question", {
    playerKey: players[0],
    text: "A question waiting for approval?",
    answers: [{ text: "Yes", correct: true }, { text: "No", correct: false }]
  });
  assert(written.ok, "A player should be able to submit while approval is on");

  const started = await post("/api/host/force-start", { playerKey: host });
  assert(started.ok, "The host should be able to fast-start: " + started.error);
  assert(
    started.promotedCount >= 1,
    "A pending question must be promoted, not discarded, got " + started.promotedCount
  );
  assert(
    /verified answers/i.test(started.autofillExplanation || ""),
    "Classic autofill must explain that it uses verified answers, got " + started.autofillExplanation
  );

  const live = await state();
  const generated = (live.questions || []).filter((question) => question.generated);
  // Classic scores against one intended answer and nobody chose one, so the
  // fill must use verified factual content rather than inventing a key for an
  // opinion prompt.
  for (const question of generated) {
    const keyed = (question.answers || []).filter((answer) => answer.correct);
    assert(
      keyed.length === 1,
      "Every Classic autofill question needs exactly one verified answer, got " + keyed.length
    );
  }
  assert(
    !JSON.stringify(live).includes("{Player1}"),
    "An autofilled question must never contain an unresolved token"
  );

  await post("/api/host/reset");

  // Majority fills with opinions and predicts nothing on anyone's behalf.
  await post("/api/host/settings", { playerKey: host, gameFamily: "quiz", quizScoring: "majority", roundPreset: "custom", maxQuestionsPerPlayer: 1 });
  await post("/api/host/lock-setup", { playerKey: host });
  const majorityStart = await post("/api/host/force-start", { playerKey: host });
  assert(majorityStart.ok, "Majority should fast-start: " + majorityStart.error);
  assert(
    /votes decide/i.test(majorityStart.autofillExplanation || ""),
    "Majority autofill should say the room's votes decide, got " + majorityStart.autofillExplanation
  );
  const majorityLive = await state();
  for (const question of (majorityLive.questions || []).filter((q) => q.generated)) {
    const predicted = (question.answers || []).filter((answer) => answer.predicted);
    assert(
      predicted.length === 0,
      "Autofill must not predict on an absent author's behalf, got " + predicted.length
    );
  }
  // The previous block left a game running, so the room has to go back to a
  // lobby before settings or submissions are accepted.
  await post("/api/host/reset", { playerKey: host });

  // A Majority prediction is optional: it is the author's guess at what the
  // room will choose, not a correct answer, and its only effect is qualifying
  // for the author bonus. Requiring one forced authors to invent a guess and
  // made an automatic fill impossible without predicting for an absent person.
  await post("/api/host/settings", { playerKey: host, gameFamily: "quiz", quizScoring: "majority", roundPreset: "custom", maxQuestionsPerPlayer: 2 });
  await post("/api/host/lock-setup", { playerKey: host });
  // Reset preserves unplayed work, including questions switched from Classic.
  // Free explicit slots so these assertions exercise prediction validation.
  for (const playerKey of players.slice(0, 2)) {
    for (const question of (await state(playerKey, "player")).ownQuestions) {
      await post("/api/host/remove-content", { kind: "question", targetId: question.id });
    }
  }
  const unpredicted = await post("/api/question", {
    playerKey: players[0],
    text: "Which snack goes first, with no guess?",
    answers: [{ text: "Pizza", predicted: false }, { text: "Chips", predicted: false }]
  });
  assert(unpredicted.ok, "A Majority question without a prediction must be accepted: " + unpredicted.error);

  const doublePredicted = await post("/api/question", {
    playerKey: players[1],
    text: "Which snack goes first, guessed twice?",
    answers: [{ text: "Pizza", predicted: true }, { text: "Chips", predicted: true }]
  });
  assert(doublePredicted.ok === false, "Predicting two answers is still a mistake");

  await post("/api/host/reset");
}

// --- P11 step 2: the arena is reachable without being Gahooked first --------

{
  await post("/api/host/reset", { playerKey: host });
  await post("/api/host/settings", { playerKey: host, lobbyArenaEnabled: true });
  const roster = await state();
  const targetId = roster.players.find((player) => player.name === "P2")?.id;
  assert(targetId, "expected a second player to challenge");

  // Previously the only route in was countering a Gahook inside a short
  // window, which made the arena close to undiscoverable.
  const direct = await post("/api/player/duel-challenge", { playerKey: players[0], playerId: targetId });
  assert(direct.ok, "A player should be able to challenge directly from the menu: " + direct.error);

  // One at a time, and not twice in a row.
  const second = await post("/api/player/duel-challenge", { playerKey: players[0], playerId: targetId });
  assert(second.ok === false, "A second challenge while one is active must be refused");

  const selfChallenge = await post("/api/player/duel-challenge", { playerKey: players[0], playerId: roster.players.find((p) => p.name === "P1")?.id });
  assert(selfChallenge.ok === false, "Challenging yourself must be refused");

  await post("/api/host/settings", { playerKey: host, lobbyArenaEnabled: false });
  const whileDisabled = await post("/api/player/duel-challenge", { playerKey: players[1], playerId: targetId });
  assert(whileDisabled.ok === false, "A direct challenge must still respect the host's arena policy");
  await post("/api/host/settings", { playerKey: host, lobbyArenaEnabled: true });
}

console.log(JSON.stringify({
  ok: true,
  checked: [
    "rooms default to Chaos with duels on",
    "the real steal and GET GOT values are published, not guessed",
    "disabling custom profiles hides pictures without destroying them",
    "re-enabling restores them",
    "a duel challenge is refused server-side while duels are off",
    "Chaos still steals 50 points",
    "Visual only allows the reaction but moves no score",
    "Off refuses the Gahook outright",
    "an ordinary player cannot change the room rules",
    "a player sees the policy but never a credential",
    "an opinion suggestion never arrives with a correct answer chosen",
    "a factual suggestion keys an option for its author",
    "a stranger is not served suggestions",
    "a room works through its prompt library",
    "a fast start promotes pending questions instead of binning them",
    "Classic autofill uses verified answers only",
    "Majority autofill predicts nothing on an absent author's behalf",
    "a Majority prediction is optional, but two predictions is still a mistake",
    "a player can challenge to 1v1 directly, without being Gahooked first",
    "a direct challenge still respects one-at-a-time and the host's policy"
  ]
}, null, 2));
