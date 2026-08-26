import fs from "node:fs";

const BASE_URL = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3102";
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const serverSource = fs.readFileSync(new URL("./server.js", import.meta.url), "utf8");
const appSource = fs.readFileSync(new URL("./public/app.jsx", import.meta.url), "utf8");
const presentationSource = fs.readFileSync(new URL("./public/client/presentation.jsx", import.meta.url), "utf8");
const audioSource = fs.readFileSync(new URL("./public/client/audio.js", import.meta.url), "utf8");
const formsSource = fs.readFileSync(new URL("./public/client/gahook-forms.js", import.meta.url), "utf8");
const stylesSource = fs.readFileSync(new URL("./public/styles.css", import.meta.url), "utf8");

function assert(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

function code(prefix = "") {
  let value = prefix.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
  while (value.length < 4) {
    value += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  }
  return value;
}

function key(label) {
  return label + "-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function rawPost(path, body) {
  const response = await fetch(BASE_URL + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  return { response, data };
}

async function post(path, body) {
  const { data } = await rawPost(path, body);
  if (!data.ok) {
    throw new Error(path + ": " + data.error);
  }
  return data;
}

async function expectError(path, body, expectedText) {
  const { data } = await rawPost(path, body);
  assert(!data.ok, path + " should have failed");
  assert(String(data.error || "").includes(expectedText), path + " failed with unexpected error: " + data.error);
  return data;
}

async function state(roomCode, role = "host", playerKey = "") {
  const { response, data } = await rawPost("/api/state", { code: roomCode, role, playerKey });
  assert(response.ok, "State request failed for " + roomCode);
  return data;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function findPlayer(snapshot, playerName) {
  return snapshot.players.find((player) => player.name === playerName);
}

async function hostPokeMany(roomCode, hostKey, playerId, count) {
  let latest = null;
  for (let index = 0; index < count; index += 1) {
    latest = await post("/api/host/poke", { code: roomCode, playerKey: hostKey, playerId });
  }
  return latest;
}

async function hostPokeUntilUltimate(roomCode, hostKey, playerId, timeoutMs = 6200) {
  const startedAt = Date.now();
  let latest = null;
  while (Date.now() - startedAt < timeoutMs) {
    latest = await post("/api/host/poke", { code: roomCode, playerKey: hostKey, playerId });
    if (latest.kind === "ultimate") {
      return latest;
    }
    await sleep(180);
  }
  throw new Error("Expected time-threshold Ultimate Gahook, latest kind was " + (latest?.kind || "none"));
}

function getFunctionSection(name) {
  const start = appSource.indexOf("function " + name);
  assert(start !== -1, "Missing " + name);
  const next = appSource.indexOf("\nfunction ", start + 1);
  return appSource.slice(start, next === -1 ? appSource.length : next);
}

function getReducerSection() {
  const start = appSource.indexOf("function reducer");
  const end = appSource.indexOf("\nfunction ", start + 1);
  assert(start !== -1 && end !== -1, "Could not inspect reducer");
  return appSource.slice(start, end);
}

function runClientGahookContractSmoke() {
  const reducer = getReducerSection();
  const playerView = getFunctionSection("PlayerView");
  const optimisticPayload = getFunctionSection("optimisticPokePayload");
  const selfGahook = getFunctionSection("triggerClientOnlySelfGahook");

  assert(reducer.includes('if (action.type === "OPTIMISTIC_POKE")'), "Reducer needs optimistic Gahook support");
  assert(reducer.includes('"local-poke-"'), "Optimistic Gahooks need local ids before the server echoes");
  assert(reducer.includes("ownPlayer?.id === poke.playerId"), "Optimistic Gahooks should affect the receiver immediately when it is the current player");
  assert(reducer.includes("preserveNewerPoke"), "Snapshots should preserve fresher local Gahooks instead of visually rolling back");
  assert(reducer.includes("isFreshLocalPoke") && reducer.includes("< 1600"), "Fresh local Gahooks need a short rollback-protection window");
  assert(reducer.includes("incomingPokeAt < currentPokeAt"), "Newer server Gahooks should replace local optimistic Gahooks");
  assert(reducer.includes("incomingSpecial") && reducer.includes("incomingOwnSpecial"), "Server Ultimate/Get Got/final events should override local optimism");

  assert(optimisticPayload.includes('"local-poke-"'), "Sender-side Gahooks need immediate optimistic payload ids");
  assert(optimisticPayload.includes('isActiveUltimate ? "ultimate" : "normal"'), "Sender-side optimism should only predict Ultimate for already-active Ultimate targets");

  assert(playerView.includes("activePokeRef.current = poke") && playerView.includes("setActivePoke(poke)"), "Incoming Gahooks should replace the active overlay immediately");
  assert(playerView.includes("clearPokeTimeout()"), "New Gahooks should clear the existing hide timer");
  assert(playerView.includes("renderId: ownPokeId + \"-\" + Date.now()"), "Normal Gahooks should force overlay remounts so animations restart");
  assert(playerView.includes("resetPokeSoundChannel()"), "Incoming Gahooks should reset the sound channel instead of layering stale audio");
  assert(playerView.includes("pokeAge > STALE_GAHOOK_MS"), "Stale Gahooks should be ignored instead of queued minutes later");
  assert(!playerView.includes("catchupCount"), "Normal Gahooks should not replay catch-up counters");
  assert(!appSource.includes("playCatchupGahookSound"), "Catch-up Gahook audio should stay removed");
  assert(playerView.includes("isUltimate && currentUltimateActive"), "Ultimate Gahooks should extend the active overlay rather than restarting it");
  assert(playerView.includes("playUltimateExtraGahookSound()"), "Extra Ultimate Gahooks should add immediate obnoxious feedback while active");
  assert(presentationSource.includes("function useQuickCounter") && presentationSource.includes("durationMs = 200"), "Ultimate counter should smooth jumps quickly on the client");
  assert(appSource.includes("GET_GOT_OVERLAY_MS = 3000"), "Get Got overlay should last three seconds");
  assert(appSource.includes("BOO_OVERLAY_MS = 1600"), "BOO overlay should be 0.2 seconds shorter than the celebration overlay");
  assert(selfGahook.includes('type: "OPTIMISTIC_POKE"') && selfGahook.includes("return true"), "Self Gahooks should be handled immediately on the client");
  for (const sectionName of ["ReadonlyPartyView", "PlayerWaitingLobby", "PlayerLobby", "PlayerGame"]) {
    assert(getFunctionSection(sectionName).includes("triggerClientOnlySelfGahook"), sectionName + " should avoid sending self Gahooks to the server");
  }
  assert(playerView.includes("<PokeJumpScare key={activePoke.renderId || activePoke.id}"), "Overlay key should use renderId so repeated Gahooks restart animations");
  const formComponents = { gorilla: "GorillaFace", koala: "KoalaFace", croc: "CrocFace", capybara: "CapybaraFace", chicken: "ChickenFace" };
  for (const form of Object.keys(formComponents)) {
    assert(formsSource.includes(`id: "${form}"`), `Missing ${form} Gahook form`);
    assert(presentationSource.includes(`function ${formComponents[form]}`), `Missing inline ${form} Gahook art`);
    assert(audioSource.includes(`form === "${form}"`), `Missing distinct ${form} Gahook sound`);
  }
  assert(presentationSource.includes("function PremiumFormEffects") && !presentationSource.includes("premium-form-name"), "Premium Gahooks should use themed background props without a character-name badge");
  assert(!presentationSource.includes("data-effect="), "Premium background props should be visual objects instead of floating sound-effect text");
  assert(presentationSource.includes('className="animal-pose animal-pose-a"') && presentationSource.includes('className="animal-pose animal-pose-b"'), "Premium animals should alternate between two character poses");
  assert(stylesSource.includes("premium-pose-a") && stylesSource.includes("premium-pose-b"), "Premium character poses need animated CSS transitions");
  assert(stylesSource.includes(".premium-effects-chicken > span") && stylesSource.includes(".premium-effects-croc > span") && stylesSource.includes(".premium-effects-koala > span"), "Each premium form should have character-specific object effects");
  assert(stylesSource.includes(".poke-overlay.is-premium-form .poke-scare-card > p"), "Premium sender labels should use a high-contrast treatment");
  assert(audioSource.includes("playSweep") && audioSource.includes("GET_GOT_SOUND_DURATION_SECONDS = 2.85"), "Premium forms and GET GOT should use richer scheduled audio effects");
  assert(presentationSource.includes("bananaCount = isGetGot ? 24") && stylesSource.includes("banana-rain-loop"), "GET GOT should continuously rain bananas for its full duration");
  assert(!presentationSource.includes("<img className={small ? \"poke-animal"), "Animal Gahooks should use inline art instead of raster images");
  assert(appSource.includes("function GahookFormPicker") && appSource.includes("/api/player/gahook-form"), "Player menus should offer an immediate Gahook form picker");
  assert(presentationSource.includes("GahookFormVisual") && presentationSource.includes('"is-form-" + gahookForm.id'), "The receiver overlay should render the sender's selected form");
  assert(playerView.includes('currentPoke?.kind === "get-got"') && playerView.includes("currentPoke.getGotUntil"), "GET GOT should block later Gahooks until its full overlay finishes");
  assert(appSource.includes("function RoomGetGotOverlay") && playerView.includes("lobby.roomPoke"), "GET GOT should be visible to the host and every other player");
  assert(reducer.includes("poke.pointsStolen") && reducer.includes("poke.senderPlayerId"), "Live score theft should update immediately on the client");
  assert(playerView.includes("/api/player/counter-poke") && playerView.includes('label: pokeActionBusy ? "Firing back..." : "Counter Gahook"'), "The receiver should be able to fire an earned Counter Gahook");
  assert(playerView.includes("/api/player/duel-challenge") && playerView.includes("/api/player/duel-accept"), "Counter overlays should support the two-step Gahook Arena challenge");
  assert(appSource.includes("function GahookDuelOverlay") && appSource.includes("function GahookDuelArena") && appSource.includes("function GahookArenaIntro"), "The client should provide participant, spectator, and room-wide Arena views");
  assert(appSource.includes("flickStrength") && appSource.includes("reclaim") && appSource.includes("gahook-arena-ball-tray"), "Arena Ballz should support tap, flick, block, and drag-to-reclaim gestures");
  assert(appSource.includes("/api/player/duel-react") && appSource.includes("GahookArenaCrowdControls"), "Spectators should be able to congratulate the winner and boo the loser");
  assert(audioSource.includes("playCounterGahookSound"), "Counter Gahooks should have dedicated audio feedback");

  return {
    checked: [
      "optimistic sender and receiver Gahook state",
      "snapshot rollback protection for fresh local Gahooks",
      "server special events override optimism",
      "overlay replacement and render-key reset",
      "sound-channel reset",
      "stale Gahook ignore without catch-up replay",
      "Ultimate overlay extension with extra feedback",
      "smooth Ultimate counter jumps",
      "six selectable sender-owned Gahook forms",
      "five dark premium themes with object effects and animated animal poses",
      "three-second GET GOT sound and banana barrage",
      "interactive Counter Gahook offers and Gahook Arena challenge",
      "three-hit Gahook Ballz combat and spectator arena",
      "non-interruptible room-wide GET GOT",
      "immediate 50-point Gahook theft"
    ]
  };
}

async function runGahookSmoke() {
  assert(!serverSource.includes("/api/player/banked-poke"), "Legacy banked-poke endpoint should stay removed");
  assert(serverSource.includes("ULTIMATE_GAHOOK_BASE_THRESHOLD_MS = 5000"), "Ultimate Gahook should start as a 5 second spam threshold");
  assert(serverSource.includes("ULTIMATE_GAHOOK_GRACE_MS = 1000"), "Ultimate overlay should stay for a full second after the last Gahook");
  assert(serverSource.includes("ultimateGahookThresholdMs = spam.thresholdMs + ULTIMATE_GAHOOK_THRESHOLD_STEP_MS"), "Ultimate threshold should increase after each Ultimate trigger");
  assert(serverSource.includes("function applyGetGot") && serverSource.includes("scorePenalty = applyGetGot(room, player)"), "Get Got should use one consistent hard trigger path");
  assert(serverSource.includes("COUNTER_GAHOOK_TRIGGER_COUNT = 10"), "Counter Gahook should unlock on the tenth consecutive Gahook");
  assert(serverSource.includes("COUNTER_GAHOOK_REPEAT_EVERY = 2"), "Counter Gahook should reappear every second Gahook after ten");
  assert(serverSource.includes("COUNTER_GAHOOK_OVERLAY_MS = 2750"), "Counter Gahook should last half a second longer");
  assert(serverSource.includes("GAHOOK_ARENA_BALL_BASE_MS = 3000") && serverSource.includes("GAHOOK_ARENA_BALL_MIN_MS = 1200"), "Arena Ballz should begin at a three-second cadence and accelerate");
  assert(serverSource.includes("GAHOOK_ARENA_TRAVEL_BASE_MS = 1050") && serverSource.includes("GAHOOK_ARENA_TRAVEL_MIN_MS = 620"), "Arena attacks should cross the screen in about one second and get faster");
  assert(serverSource.includes("GAHOOK_ARENA_HITS_TO_WIN = 3") && serverSource.includes("GAHOOK_DUEL_FINISH_MS = 10000"), "Arena matches should end after three hits and keep the result open for ten seconds");
  assert(serverSource.includes("function finishGahookDuel") && serverSource.includes("function publicGahookDuel"), "Duel outcomes and spectator state should be server-authoritative");
  const clientContract = runClientGahookContractSmoke();

  const roomCode = code("G");
  const hostKey = key("host");
  const target = { key: key("target"), name: "Target Terry", avatarId: "zap" };
  const secondTarget = { key: key("second-target"), name: "Backup Bea", avatarId: "frog" };
  const sender = { key: key("sender"), name: "Sender Sam", avatarId: "frog" };

  await post("/api/room", { code: roomCode, playerKey: hostKey });
  await post("/api/host/settings", { code: roomCode, playerKey: hostKey, maxQuestionsPerPlayer: 1 });
  await post("/api/player/join", { code: roomCode, playerKey: target.key, name: target.name, avatarId: target.avatarId });
  await post("/api/player/join", { code: roomCode, playerKey: secondTarget.key, name: secondTarget.name, avatarId: secondTarget.avatarId });
  await post("/api/player/join", { code: roomCode, playerKey: sender.key, name: sender.name, avatarId: sender.avatarId });
  await post("/api/player/gahook-form", { code: roomCode, playerKey: sender.key, gahookForm: "croc" });

  let counterResult = null;
  for (let index = 1; index <= 10; index += 1) {
    counterResult = await post("/api/player/poke", { code: roomCode, playerKey: sender.key, playerId: target.key });
    assert(Boolean(counterResult.counterAvailable) === (index === 10), "Counter offer cadence was wrong at Gahook " + index);
  }
  let targetLobbyState = await state(roomCode, "player", target.key);
  assert(targetLobbyState.ownCounterOffer?.spamCount === 10, "The receiver should see the tenth-hit Counter Gahook offer");
  const tenthOfferId = targetLobbyState.ownCounterOffer.id;
  await post("/api/player/counter-poke", { code: roomCode, playerKey: target.key, offerId: tenthOfferId });
  let senderLobbyState = await state(roomCode, "player", sender.key);
  assert(senderLobbyState.ownPoke?.kind === "counter", "The spammer should receive the interactive Counter Gahook");
  assert(senderLobbyState.ownPoke.duelChallengeUntil - senderLobbyState.ownPoke.createdAt === 2750, "Counter overlay should expose the extended 2.75 second challenge window");

  const challenge = await post("/api/player/duel-challenge", { code: roomCode, playerKey: sender.key });
  targetLobbyState = await state(roomCode, "player", target.key);
  assert(targetLobbyState.ownPoke?.kind === "duel-challenge" && targetLobbyState.ownPoke.duelId === challenge.duelId, "Counter recipient should be able to send a Gahook Arena challenge back");
  await post("/api/player/duel-accept", { code: roomCode, playerKey: target.key, duelId: challenge.duelId });
  senderLobbyState = await state(roomCode, "player", sender.key);
  assert(senderLobbyState.gahookDuel?.status === "active" && senderLobbyState.gahookDuel.ballStock[senderLobbyState.ownPlayer.id] === 1, "Both players should enter Gahook Arena with a Ball ready");
  assert(senderLobbyState.gahookDuel.hitsToWin === 3 && senderLobbyState.gahookDuel.introEndsAt > senderLobbyState.serverTime, "The Arena should publish its first-to-three rules and intro window");

  await sleep(2500);
  const firstAttack = await post("/api/player/duel-attack", { code: roomCode, playerKey: sender.key, duelId: challenge.duelId, x: 0.73, y: 0.21 });
  targetLobbyState = await state(roomCode, "player", target.key);
  assert(targetLobbyState.gahookDuel.attack.x === 0.73 && targetLobbyState.gahookDuel.attack.y === 0.21, "Arena attack coordinates should survive as normalized percentages");
  await post("/api/player/duel-block", { code: roomCode, playerKey: target.key, duelId: challenge.duelId, attackId: firstAttack.attackId, reclaim: true });
  targetLobbyState = await state(roomCode, "player", target.key);
  assert(targetLobbyState.gahookDuel.rally === 1 && targetLobbyState.gahookDuel.ballStock[targetLobbyState.ownPlayer.id] === 2, "Dragging a blocked Ball to the core should immediately add a Ball");
  let landedAttack = await post("/api/player/duel-attack", { code: roomCode, playerKey: target.key, duelId: challenge.duelId, x: -5, y: 8, flickStrength: 1 });
  assert(landedAttack.reactionWindowMs < 1000, "A flicked Arena Ball should cross the screen in under a second");
  senderLobbyState = await state(roomCode, "player", sender.key);
  assert(senderLobbyState.gahookDuel.attack.x === 0.08 && senderLobbyState.gahookDuel.attack.y === 0.92, "Extreme coordinates should be clamped to a reachable part of every screen");
  await sleep(1000);
  senderLobbyState = await state(roomCode, "player", sender.key);
  assert(senderLobbyState.gahookDuel.hits[senderLobbyState.ownPlayer.id] === 1 && senderLobbyState.gahookDuel.status === "active", "The first landed Ball should score one hit without ending the match");

  landedAttack = await post("/api/player/duel-attack", { code: roomCode, playerKey: target.key, duelId: challenge.duelId, x: 0.42, y: 0.34 });
  await sleep(1100);
  senderLobbyState = await state(roomCode, "player", sender.key);
  assert(senderLobbyState.gahookDuel.hits[senderLobbyState.ownPlayer.id] === 2, "The second landed Ball should leave the defender one hit from GET GOT");
  await sleep(1100);
  landedAttack = await post("/api/player/duel-attack", { code: roomCode, playerKey: target.key, duelId: challenge.duelId, x: 0.64, y: 0.28, flickStrength: 0.6 });
  await sleep(1000);
  const spectatorDuelState = await state(roomCode, "host", hostKey);
  assert(spectatorDuelState.gahookDuel?.status === "finished", "The third landed Arena Ball should resolve the match for players and spectators");
  assert(spectatorDuelState.gahookDuel.winnerId === targetLobbyState.ownPlayer.id && spectatorDuelState.gahookDuel.loserId === senderLobbyState.ownPlayer.id, "The player who lands three hits should win Gahook Arena");
  assert(spectatorDuelState.gahookDuel.players.length === 2, "The spectator arena should publish both player banners");
  assert(spectatorDuelState.gahookDuel.reactionEndsAt - spectatorDuelState.gahookDuel.finishedAt === 10000, "GET GOT and crowd reactions should stay open for ten seconds");

  await post("/api/player/duel-react", { code: roomCode, playerKey: secondTarget.key, duelId: challenge.duelId, reaction: "congrats" });
  await post("/api/player/duel-react", { code: roomCode, playerKey: secondTarget.key, duelId: challenge.duelId, reaction: "boo" });
  const reactedArenaState = await state(roomCode, "host", hostKey);
  assert(reactedArenaState.gahookDuel.reactionCounts.congrats === 1 && reactedArenaState.gahookDuel.reactionCounts.boos === 1, "The crowd should be able to congratulate the winner and boo the loser");

  await post("/api/host/lock-setup", { code: roomCode, playerKey: hostKey });
  await post("/api/question", {
    code: roomCode,
    playerKey: target.key,
    text: "Which button deserves chaos?",
    answers: [
      { text: "Red", correct: true },
      { text: "Blue", correct: false }
    ]
  });
  await post("/api/question", {
    code: roomCode,
    playerKey: secondTarget.key,
    text: "Which spare button deserves chaos?",
    answers: [
      { text: "Yellow", correct: true },
      { text: "Green", correct: false }
    ]
  });
  await post("/api/question", {
    code: roomCode,
    playerKey: sender.key,
    text: "Which sound deserves chaos?",
    answers: [
      { text: "Bonk", correct: true },
      { text: "Plink", correct: false }
    ]
  });
  await post("/api/player/ready", { code: roomCode, playerKey: target.key, ready: true });
  await post("/api/player/ready", { code: roomCode, playerKey: secondTarget.key, ready: true });
  await post("/api/player/ready", { code: roomCode, playerKey: sender.key, ready: true });
  await post("/api/host/start", { code: roomCode, playerKey: hostKey });

  let snapshot = await state(roomCode, "host", hostKey);
  assert(snapshot.phase === "reading", "Expected reading phase before Gahook smoke");

  const firstRoundPoke = await post("/api/player/round-poke", { code: roomCode, playerKey: sender.key, playerId: target.key });
  assert(firstRoundPoke.kind === "normal", "First player round Gahook should be normal");
  const receiverSnapshot = await state(roomCode, "player", target.key);
  assert(receiverSnapshot.ownPoke?.gahookForm === "croc", "The receiver should get the sender's selected Gahook form");
  assert(receiverSnapshot.ownPlayer.score === -50, "A live Gahook should immediately take 50 points from its target");
  await expectError("/api/player/round-poke", { code: roomCode, playerKey: sender.key, playerId: secondTarget.key }, "already used your Gahook");
  const senderSnapshot = await state(roomCode, "player", sender.key);
  assert(senderSnapshot.ownPlayer.gahookForm === "croc", "The selected Gahook form should persist on the sender");
  assert(senderSnapshot.ownPlayer.score === 50, "The sender should gain exactly 50 points from their one live Gahook");
  const targetPublicId = findPlayer(senderSnapshot, target.name).id;
  assert(senderSnapshot.ownGahookUses.round.includes(targetPublicId), "Round Gahook use should include first target");
  assert(senderSnapshot.ownGahookUses.questionTargetId === targetPublicId, "Question-wide Gahook use should identify the one target");
  await expectError("/api/player/round-poke", { code: roomCode, playerKey: sender.key, playerId: target.key }, "already used your Gahook");

  await sleep(1250);
  const ultimateTrigger = await hostPokeUntilUltimate(roomCode, hostKey, target.key);
  assert(ultimateTrigger.kind === "ultimate", "Spam for at least 5 seconds should trigger Ultimate Gahook");
  snapshot = await state(roomCode, "host", hostKey);
  let targetState = findPlayer(snapshot, target.name);
  assert(targetState.pokeCount >= 2, "Expected a live spam count after time-threshold Ultimate trigger");
  assert(targetState.latestPokeKind === "ultimate", "Expected Ultimate Gahook after the spam threshold");
  assert(targetState.ultimateGahookUntil > snapshot.serverTime, "Ultimate should have an active end time");
  assert(targetState.ultimateGahookUntil - snapshot.serverTime <= 1200, "Ultimate should last about one second after the latest Gahook");
  assert(targetState.ultimateGahookStack >= 2, "Ultimate stack should reflect the spam streak");
  const firstUltimateUntil = targetState.ultimateGahookUntil;

  await expectError("/api/player/round-poke", { code: roomCode, playerKey: sender.key, playerId: target.key }, "already used your Gahook");
  snapshot = await state(roomCode, "host", hostKey);
  targetState = findPlayer(snapshot, target.name);
  assert(targetState.ultimateGahookUntil === firstUltimateUntil, "Ultimate state must not bypass the sender's question-wide limit");

  const remainingToGetGot = Math.max(1, 50 - targetState.ultimateGahookStack);
  const getGot = await hostPokeMany(roomCode, hostKey, target.key, remainingToGetGot);
  assert(getGot.kind === "get-got", "Expected Get Got at Ultimate stack cap");
  assert(getGot.scorePenalty === 1000, "Get Got should apply active-game score penalty");
  snapshot = await state(roomCode, "host", hostKey);
  targetState = findPlayer(snapshot, target.name);
  assert(targetState.latestPokeKind === "get-got", "Latest poke should be Get Got");
  assert(targetState.pokeCount === 0, "Get Got should reset hidden Gahook counter");
  assert(targetState.ultimateGahookUntil === 0 && targetState.ultimateGahookStack === 0, "Get Got should clear Ultimate state");
  assert(targetState.score === -1050, "Target should lose one 50-point steal plus the 1000-point GET GOT penalty");
  assert(snapshot.roomPoke?.id && snapshot.roomPoke.kind === "get-got" && snapshot.roomPoke.targetName === target.name, "GET GOT should be published as a room-wide event");

  await post("/api/host/start", { code: roomCode, playerKey: hostKey });
  snapshot = await state(roomCode, "host", hostKey);
  assert(snapshot.phase === "finished", "Host start during a game should end it for final Gahook checks");

  const beforeCongrats = findPlayer(snapshot, target.name);
  const congrats = await post("/api/host/final-poke", { code: roomCode, playerKey: hostKey, playerId: target.key, finalKind: "congrats" });
  assert(congrats.kind === "congrats", "Final Congratulate should produce congrats kind");
  snapshot = await state(roomCode, "host", hostKey);
  targetState = findPlayer(snapshot, target.name);
  assert(targetState.latestPokeKind === "congrats", "Target should receive congrats final poke");
  assert(targetState.shamePokes === beforeCongrats.shamePokes, "Congratulate should not increment shame pokes");

  const boo = await post("/api/host/final-poke", { code: roomCode, playerKey: hostKey, playerId: target.key, finalKind: "boo" });
  assert(boo.kind === "boo", "Final Get Got should produce boo kind");
  snapshot = await state(roomCode, "host", hostKey);
  targetState = findPlayer(snapshot, target.name);
  assert(targetState.latestPokeKind === "boo", "Target should receive boo final poke");
  assert(targetState.shamePokes === beforeCongrats.shamePokes + 1, "Boo should increment shame pokes once");

  return {
    roomCode,
    clientContract,
    counterGahook: "interactive",
    targetScore: targetState.score,
    shamePokes: targetState.shamePokes,
    latestKind: targetState.latestPokeKind
  };
}

const gahooks = await runGahookSmoke();
console.log(JSON.stringify({ ok: true, baseUrl: BASE_URL, gahooks }, null, 2));
