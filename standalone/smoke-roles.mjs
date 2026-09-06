const BASE_URL = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

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

async function post(path, body) {
  const response = await fetch(BASE_URL + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!data.ok) {
    throw new Error(path + ": " + data.error);
  }
  return data;
}

async function rawPost(path, body) {
  const response = await fetch(BASE_URL + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return {
    response,
    data: await response.json()
  };
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

async function runRoleSmoke() {
  const roomCode = code("R");
  const hostKey = key("host-player");
  const guestKey = key("guest-player");
  const secondGuestKey = key("second-guest-player");
  const lateBuildKey = key("late-build-player");
  const liveJoinKey = key("live-join-player");

  const created = await post("/api/room", { code: roomCode, playerKey: hostKey });
  assert(created.created, "Expected a fresh host-only room");

  let hostSnapshot = await state(roomCode, "host", hostKey);
  assert(hostSnapshot.isHost, "Host-only party view should identify the host");
  assert(!hostSnapshot.ownPlayer, "Host-only party view should not require the host to be a player yet");
  assert(Array.isArray(hostSnapshot.players) && hostSnapshot.players.length === 0, "Fresh room should have no players");

  await post("/api/host/settings", { code: roomCode, playerKey: hostKey, maxQuestionsPerPlayer: 1 });
  await post("/api/player/join", { code: roomCode, playerKey: guestKey, name: "Guest Gob", avatarId: "frog" });
  await post("/api/player/join", { code: roomCode, playerKey: secondGuestKey, name: "Guest Two", avatarId: "pizza" });

  const waitingGuestSnapshot = await state(roomCode, "player", guestKey);
  assert(waitingGuestSnapshot.phase === "lobby", "Players should wait in the setup lobby before question making");
  assert(waitingGuestSnapshot.players.length === 2, "Setup lobby should show every joined player");
  await expectError("/api/question", {
    code: roomCode,
    playerKey: guestKey,
    text: "Too early?",
    answers: [
      { text: "Yes", correct: true },
      { text: "No", correct: false }
    ]
  }, "Wait for the host");

  await post("/api/host/lock-setup", { code: roomCode, playerKey: hostKey, hostWillPlay: true });
  hostSnapshot = await state(roomCode, "host", hostKey);
  assert(hostSnapshot.phase === "building", "Locking setup should begin the question-making phase");
  await expectError("/api/host/settings", { code: roomCode, playerKey: hostKey, maxQuestionsPerPlayer: 2 }, "locked");
  await post("/api/player/join", { code: roomCode, playerKey: lateBuildKey, name: "Late Larry", avatarId: "owl" });
  const lateBuildSnapshot = await state(roomCode, "player", lateBuildKey);
  assert(lateBuildSnapshot.phase === "building" && lateBuildSnapshot.ownPlayer, "A late building-phase player should join question making immediately");

  await post("/api/player/join", { code: roomCode, playerKey: hostKey, name: "Host Hero", avatarId: "zap" });
  hostSnapshot = await state(roomCode, "player", hostKey);
  assert(hostSnapshot.isHost, "Host-as-player snapshot should retain host authority");
  assert(hostSnapshot.ownPlayer?.id && hostSnapshot.ownPlayer.id !== hostKey, "Host-as-player snapshot should expose a public id, not its private credential");
  assert(hostSnapshot.ownPlayer?.isHost, "Host player should be marked as host in public player state");

  const guestSnapshot = await state(roomCode, "player", guestKey);
  assert(!guestSnapshot.isHost, "Normal player snapshot should not gain host authority");
  assert(guestSnapshot.ownPlayer?.id && guestSnapshot.ownPlayer.id !== guestKey, "Normal player snapshot should expose a public id, not its private credential");
  assert(guestSnapshot.players.length === 4, "Normal player party state should see all players, including building-phase joiners");

  await post("/api/question", {
    code: roomCode,
    playerKey: hostKey,
    text: "Host-as-player question?",
    answers: [
      { text: "Correct", correct: true },
      { text: "Wrong", correct: false }
    ]
  });
  await post("/api/question", {
    code: roomCode,
    playerKey: guestKey,
    text: "Guest question?",
    answers: [
      { text: "Correct", correct: true },
      { text: "Wrong", correct: false }
    ]
  });
  await post("/api/question", {
    code: roomCode,
    playerKey: secondGuestKey,
    text: "Second guest question?",
    answers: [
      { text: "Correct", correct: true },
      { text: "Wrong", correct: false }
    ]
  });
  await post("/api/question", {
    code: roomCode,
    playerKey: lateBuildKey,
    text: "Late player question?",
    answers: [
      { text: "Correct", correct: true },
      { text: "Wrong", correct: false }
    ]
  });
  let editableGuestSnapshot = await state(roomCode, "player", guestKey);
  assert(editableGuestSnapshot.ownQuestions.length === 1, "Players should receive only their own editable questions");
  assert(editableGuestSnapshot.ownQuestions[0].text === "Guest question?", "Editable question should preserve its submitted text");
  assert(editableGuestSnapshot.ownQuestions[0].answers.some((answer) => answer.correct), "Editable question should preserve the correct answer");
  const guestQuestionId = editableGuestSnapshot.ownQuestions[0].id;
  await post("/api/question/edit", {
    code: roomCode,
    playerKey: guestKey,
    questionId: guestQuestionId,
    text: "Edited guest question?",
    imageDataUrl: "data:image/png;base64,iVBORw0KGgo=",
    answers: [
      { text: "New wrong", correct: false },
      { text: "New correct", correct: true }
    ]
  });
  editableGuestSnapshot = await state(roomCode, "player", guestKey);
  assert(editableGuestSnapshot.ownQuestions[0].id === guestQuestionId, "Editing should preserve the original question id and order");
  assert(editableGuestSnapshot.ownQuestions[0].text === "Edited guest question?", "Edited question text should be resubmitted");
  assert(editableGuestSnapshot.ownQuestions[0].imageDataUrl.startsWith("/media/" + roomCode + "/"), "Edited question should preserve its image as bounded room media");
  const editedImage = await fetch(BASE_URL + editableGuestSnapshot.ownQuestions[0].imageDataUrl);
  assert(editedImage.ok && editedImage.headers.get("content-type") === "image/png", "Edited question media should be served locally");
  assert(editableGuestSnapshot.ownQuestions[0].answers[1].correct, "Edited question should preserve the newly selected correct answer");
  await expectError("/api/question/edit", {
    code: roomCode,
    playerKey: secondGuestKey,
    questionId: guestQuestionId,
    text: "Not mine",
    answers: [
      { text: "No", correct: true },
      { text: "Also no", correct: false }
    ]
  }, "not yours");
  await post("/api/player/ready", { code: roomCode, playerKey: hostKey, ready: true });
  await post("/api/player/ready", { code: roomCode, playerKey: guestKey, ready: true });
  await post("/api/player/ready", { code: roomCode, playerKey: secondGuestKey, ready: true });
  await post("/api/player/ready", { code: roomCode, playerKey: lateBuildKey, ready: true });

  hostSnapshot = await state(roomCode, "player", hostKey);
  assert(hostSnapshot.canStart, "Host-as-player should see a startable room when everyone is ready");

  await post("/api/host/start", { code: roomCode, playerKey: hostKey });
  hostSnapshot = await state(roomCode, "player", hostKey);
  assert(hostSnapshot.phase === "reading", "Host-as-player should be able to start the game");
  assert(hostSnapshot.currentQuestion?.answers?.every((answer) => answer.text === ""), "Reading should hide answer text from host-as-player");

  await post("/api/host/skip", { code: roomCode, playerKey: hostKey });
  hostSnapshot = await state(roomCode, "player", hostKey);
  assert(hostSnapshot.phase === "answering", "Host-as-player should be able to skip to answering");
  assert(hostSnapshot.currentQuestion.answers.every((answer) => answer.text), "Answering should reveal answer text to host-as-player");

  await post("/api/player/join", { code: roomCode, playerKey: liveJoinKey, name: "Live Jenny", avatarId: "banana" });
  const liveJoinSnapshot = await state(roomCode, "player", liveJoinKey);
  assert(liveJoinSnapshot.phase === "answering", "A live joiner should enter the current answer phase");
  assert(liveJoinSnapshot.leaderboard.some((player) => player.name === "Live Jenny" && player.score === 0), "A live joiner should enter the leaderboard at zero points");

  await post("/api/answer", { code: roomCode, playerKey: hostKey, answerId: "red" });
  await post("/api/answer", { code: roomCode, playerKey: guestKey, answerId: "red" });
  await post("/api/answer", { code: roomCode, playerKey: secondGuestKey, answerId: "red" });
  await post("/api/answer", { code: roomCode, playerKey: lateBuildKey, answerId: "red" });
  await post("/api/answer", { code: roomCode, playerKey: liveJoinKey, answerId: "red" });
  await post("/api/host/skip", { code: roomCode, playerKey: hostKey });
  const revealSnapshot = await state(roomCode, "player", guestKey);
  assert(revealSnapshot.phase === "reveal", "Players should see reveal after host-as-player skip");
  assert(revealSnapshot.leaderboard.length === 5, "Reveal leaderboard should include building-phase and live joiners");

  await post("/api/player/poke", { code: roomCode, playerKey: guestKey, playerId: hostKey });
  await expectError("/api/player/poke", { code: roomCode, playerKey: guestKey, playerId: secondGuestKey }, "already used your Gahook");
  await expectError("/api/player/poke", { code: roomCode, playerKey: guestKey, playerId: hostKey }, "already used your Gahook");
  const afterRevealPoke = await state(roomCode, "player", guestKey);
  const hostPublicId = afterRevealPoke.players.find((player) => player.name === "Host Hero").id;
  assert(afterRevealPoke.ownGahookUses.reveal.includes(hostPublicId), "Reveal Gahook use should include first target");
  assert(afterRevealPoke.ownGahookUses.questionTargetId === hostPublicId, "Reveal should share the one question-wide target");

  await post("/api/host/start", { code: roomCode, playerKey: hostKey });
  hostSnapshot = await state(roomCode, "player", hostKey);
  assert(hostSnapshot.phase === "finished", "Host-as-player should be able to end the game immediately");
  assert(hostSnapshot.leaderboard.length === 5, "Finished host-as-player state should keep late joiners on the leaderboard");

  return {
    roomCode,
    hostPlayer: hostSnapshot.ownPlayer.name,
    finalPhase: hostSnapshot.phase,
    leaderboardCount: hostSnapshot.leaderboard.length
  };
}

async function runApprovalEditSmoke() {
  const roomCode = code("E");
  const hostKey = key("edit-host");
  const playerKey = key("edit-player");

  await post("/api/room", { code: roomCode, playerKey: hostKey });
  await post("/api/host/settings", { code: roomCode, playerKey: hostKey, maxQuestionsPerPlayer: 1, approveQuestions: true });
  await post("/api/player/join", { code: roomCode, playerKey, name: "Edit Erin", avatarId: "panda" });
  await post("/api/host/lock-setup", { code: roomCode, playerKey: hostKey });
  await post("/api/question", {
    code: roomCode,
    playerKey,
    text: "Pending edit question?",
    answers: [
      { text: "Correct", correct: true },
      { text: "Wrong", correct: false }
    ]
  });

  let playerSnapshot = await state(roomCode, "player", playerKey);
  assert(playerSnapshot.ownQuestions.length === 1 && playerSnapshot.ownQuestions[0].status === "pending", "Unapproved question should appear in the player's submitted list as pending");
  const questionId = playerSnapshot.ownQuestions[0].id;
  await post("/api/question/edit", {
    code: roomCode,
    playerKey,
    questionId,
    text: "Edited while pending?",
    answers: [
      { text: "Still correct", correct: true },
      { text: "Still wrong", correct: false }
    ]
  });
  playerSnapshot = await state(roomCode, "player", playerKey);
  assert(playerSnapshot.ownQuestions[0].status === "pending" && playerSnapshot.ownQuestions[0].text === "Edited while pending?", "Editing a pending question should replace it in the approval queue");

  let hostSnapshot = await state(roomCode, "host", hostKey);
  assert(hostSnapshot.pendingQuestions.length === 1 && hostSnapshot.pendingQuestions[0].text === "Edited while pending?", "Host approval should show the edited pending question");
  await post("/api/host/question/approve", { code: roomCode, playerKey: hostKey, questionId });
  await post("/api/player/ready", { code: roomCode, playerKey, ready: true });
  playerSnapshot = await state(roomCode, "player", playerKey);
  assert(playerSnapshot.ownQuestions[0].status === "submitted" && playerSnapshot.ownPlayer.ready, "Approved question should become submitted and allow Ready");

  await post("/api/question/edit", {
    code: roomCode,
    playerKey,
    questionId,
    text: "Edited after approval?",
    answers: [
      { text: "Correct again", correct: true },
      { text: "Wrong again", correct: false }
    ]
  });
  playerSnapshot = await state(roomCode, "player", playerKey);
  assert(playerSnapshot.ownQuestions[0].status === "pending", "Editing an approved question should return it to host approval");
  assert(!playerSnapshot.ownPlayer.ready, "Editing a submitted question should clear Ready state");

  return { roomCode, questionId, finalStatus: playerSnapshot.ownQuestions[0].status };
}

async function runHostPlayerActionsSmoke() {
  const roomCode = code("A");
  const hostKey = key("actions-host");
  const randomKey = key("actions-random");
  const nextHostKey = key("actions-next-host");
  const kickKey = key("actions-kick");

  await post("/api/room", { code: roomCode, playerKey: hostKey });
  await post("/api/player/join", { code: roomCode, playerKey: randomKey, name: "Needs Changing", avatarId: "zap" });
  await post("/api/player/join", { code: roomCode, playerKey: nextHostKey, name: "Future Host", avatarId: "frog" });
  await post("/api/player/join", { code: roomCode, playerKey: kickKey, name: "Kick Target", avatarId: "pizza" });

  let snapshot = await state(roomCode, "host", hostKey);
  const randomPublicId = snapshot.players.find((player) => player.name === "Needs Changing").id;
  const kickPublicId = snapshot.players.find((player) => player.name === "Kick Target").id;

  const randomized = await post("/api/host/randomize-player", { code: roomCode, playerKey: hostKey, playerId: randomKey });
  assert(randomized.name && randomized.name !== "Needs Changing", "Randomize should assign a different safe preset name");
  assert(randomized.avatarId && randomized.avatarId !== "zap", "Randomize should assign a different preset avatar");
  snapshot = await state(roomCode, "host", hostKey);
  const randomizedPlayer = snapshot.players.find((player) => player.id === randomPublicId);
  assert(randomizedPlayer?.name === randomized.name && randomizedPlayer?.avatarId === randomized.avatarId, "Randomized name and avatar should broadcast together");
  assert(!randomizedPlayer.avatarImageDataUrl, "Randomizing should clear a custom profile image");

  await post("/api/host/make-host", { code: roomCode, playerKey: hostKey, playerId: nextHostKey });
  const newHostSnapshot = await state(roomCode, "player", nextHostKey);
  assert(newHostSnapshot.isHost && newHostSnapshot.ownPlayer?.isHost, "Make host should transfer host authority to the selected player");
  await expectError("/api/host/kick", { code: roomCode, playerKey: hostKey, playerId: kickKey }, "Only the host");

  await post("/api/host/kick", { code: roomCode, playerKey: nextHostKey, playerId: kickKey });
  snapshot = await state(roomCode, "host", nextHostKey);
  assert(!snapshot.players.some((player) => player.id === kickPublicId), "Kick should remove the selected player immediately");
  assert(snapshot.bannedPlayers.some((player) => player.id === kickPublicId), "Kick should move the selected player into the banned list");

  return { roomCode, randomizedName: randomized.name, newHost: newHostSnapshot.ownPlayer.name, kicked: true };
}

async function runForceStartSmoke() {
  const results = {};
  for (const mode of ["quiz", "majority"]) {
    const roomCode = code(mode.slice(0, 1));
    const hostKey = key("force-" + mode + "-host");
    const firstKey = key("force-" + mode + "-first");
    const secondKey = key("force-" + mode + "-second");
    await post("/api/room", { code: roomCode, playerKey: hostKey });
    await post("/api/host/settings", { code: roomCode, playerKey: hostKey, gameMode: mode, maxQuestionsPerPlayer: 2, approveQuestions: true });
    await post("/api/player/join", { code: roomCode, playerKey: firstKey, name: "First Player", avatarId: "panda" });
    await post("/api/player/join", { code: roomCode, playerKey: secondKey, name: "Second Player", avatarId: "banana" });
    await post("/api/host/lock-setup", { code: roomCode, playerKey: hostKey });

    const questionPayload = mode === "majority"
      ? { text: "Which snack disappears first?", answers: [{ text: "Pizza", predicted: true }, { text: "Chips", predicted: false }] }
      : { text: "Which answer is definitely correct?", answers: [{ text: "This one", correct: true }, { text: "Not this one", correct: false }] };
    const submitted = await post("/api/question", { code: roomCode, playerKey: firstKey, ...questionPayload });
    await post("/api/host/question/approve", { code: roomCode, playerKey: hostKey, questionId: submitted.questionId });

    await expectError("/api/host/start", { code: roomCode, playerKey: hostKey }, "Every connected player");
    const forced = await post("/api/host/force-start", { code: roomCode, playerKey: hostKey });
    const expectedQuestionsEach = 2;
    const expectedGenerated = 3;
    const expectedTotal = 4;
    assert(forced.generatedCount === expectedGenerated, mode + " force start should generate the missing questions");
    assert(forced.totalQuestions === expectedTotal, mode + " force start should preserve completed questions and create defaults");

    const snapshot = await state(roomCode, "host", hostKey);
    assert(snapshot.phase === "reading", mode + " force start should begin the game immediately");
    assert(snapshot.totalQuestions === expectedTotal && snapshot.questionCount === expectedTotal, mode + " force start should expose the completed question set");
    assert(snapshot.players.every((player) => player.ready && player.questionsSubmitted === expectedQuestionsEach), mode + " force start should complete and ready every connected player");
    assert(snapshot.pendingQuestions.length === 0, mode + " force start should clear unresolved pending approvals");
    assert(snapshot.currentQuestion?.mode === mode, mode + " generated questions should match the selected game mode");
    results[mode] = { roomCode, generated: forced.generatedCount, total: forced.totalQuestions };
  }
  return results;
}

async function runHostPlayerExitAndResetSmoke() {
  const roomCode = code("X");
  const hostKey = key("unified-host");
  const guestKey = key("unified-guest");
  await post("/api/room", { code: roomCode, playerKey: hostKey });
  await post("/api/host/settings", { code: roomCode, playerKey: hostKey, maxQuestionsPerPlayer: 1, approveQuestions: true });
  await post("/api/player/join", { code: roomCode, playerKey: hostKey, name: "Playing Host", avatarId: "crown" });
  await post("/api/player/join", { code: roomCode, playerKey: guestKey, name: "Staying Guest", avatarId: "panda" });
  await post("/api/host/lock-setup", { code: roomCode, playerKey: hostKey, hostWillPlay: true });
  await post("/api/question", {
    code: roomCode,
    playerKey: hostKey,
    text: "This host question should be removed?",
    answers: [{ text: "Yes", correct: true }, { text: "No", correct: false }]
  });

  let snapshot = await state(roomCode, "host", hostKey);
  const hostPlayerId = snapshot.ownPlayer.id;
  assert(snapshot.pendingQuestions.some((question) => question.authorId === hostPlayerId), "Host question should enter the approval queue before exit");
  await post("/api/host/exit-player", { code: roomCode, playerKey: hostKey });
  snapshot = await state(roomCode, "host", hostKey);
  assert(snapshot.isHost && !snapshot.ownPlayer, "Exit as Player should preserve host authority while removing the host player");
  assert(!snapshot.players.some((player) => player.id === hostPlayerId), "Exit as Player should remove the host from the player list");
  assert(!snapshot.pendingQuestions.some((question) => question.authorId === hostPlayerId), "Exit as Player should delete the host player's pending questions");
  assert(snapshot.players.some((player) => player.name === "Staying Guest"), "Exit as Player should leave other players untouched");

  await post("/api/player/join", { code: roomCode, playerKey: hostKey, name: "Playing Host", avatarId: "crown" });
  snapshot = await state(roomCode, "host", hostKey);
  const rejoinedHostId = snapshot.ownPlayer.id;
  assert(snapshot.ownPlayer?.name === "Playing Host" && snapshot.ownPlayer?.avatarId === "crown", "A returning host should restore their previous profile");
  await post("/api/player/profile", { code: roomCode, playerKey: hostKey, name: "Fresh Host", avatarId: "frog", avatarImageDataUrl: "" });
  snapshot = await state(roomCode, "host", hostKey);
  assert(snapshot.ownPlayer?.id === rejoinedHostId, "Editing a profile should preserve the player's public identity");
  assert(snapshot.ownPlayer?.name === "Fresh Host" && snapshot.ownPlayer?.avatarId === "frog", "Profile edits should update name and avatar together");
  await post("/api/host/exit-player", { code: roomCode, playerKey: hostKey });

  await post("/api/host/reset", { code: roomCode, playerKey: hostKey });
  snapshot = await state(roomCode, "host", hostKey);
  assert(snapshot.phase === "lobby" && snapshot.isHost, "Reset should return the same host to a configurable lobby");
  await post("/api/host/settings", { code: roomCode, playerKey: hostKey, gameMode: "majority", maxQuestionsPerPlayer: 2 });
  snapshot = await state(roomCode, "host", hostKey);
  assert(snapshot.gameMode === "majority" && snapshot.maxQuestionsPerPlayer === 2, "Host should be able to choose the same question count options for Majority Rulz after reset");
  return { roomCode, phase: snapshot.phase, gameMode: snapshot.gameMode, profileEditedWithoutRejoin: true };
}

// Moderation is a release gate for an open audience, so the host controls are
// covered here alongside the other host powers.
async function runModerationSmoke() {
  const roomCode = code("M");
  const hostKey = key("mod-host");
  const offenderKey = key("mod-offender");
  const witnessKey = key("mod-witness");

  await post("/api/room", { code: roomCode, playerKey: hostKey });
  await post("/api/player/join", { code: roomCode, playerKey: hostKey, name: "Mod Host" });
  const offender = await post("/api/player/join", { code: roomCode, playerKey: offenderKey, name: "Offender" });
  await post("/api/player/join", { code: roomCode, playerKey: witnessKey, name: "Witness" });

  const posted = await post("/api/room/chat", { code: roomCode, playerKey: offenderKey, text: "content a host would remove" });
  const messageId = posted.message.id;

  const notHost = await rawPost("/api/host/remove-content", { code: roomCode, playerKey: witnessKey, kind: "chat", targetId: messageId });
  assert(!notHost.data.ok, "Only the host may remove content");

  await post("/api/host/remove-content", { code: roomCode, playerKey: hostKey, kind: "chat", targetId: messageId });
  const witnessView = await state(roomCode, "player", witnessKey);
  const removedMessage = witnessView.chatMessages.find((message) => message.id === messageId);
  assert(removedMessage?.removed === true, "A removed message should be marked removed for every player");
  assert(removedMessage.text === "", "A removed message must not carry its text to any client");

  const missing = await rawPost("/api/host/remove-content", { code: roomCode, playerKey: hostKey, kind: "chat", targetId: messageId });
  assert(!missing.data.ok, "Removing the same message twice should fail cleanly");

  // Reports notify the host without exposing the reporter to other players.
  await post("/api/player/report", {
    code: roomCode, playerKey: witnessKey, subjectKind: "player",
    subjectId: offender.player.id, subjectName: "Offender", reason: "harassment", note: "repeated abuse"
  });
  const hostView = await state(roomCode, "host", hostKey);
  assert(hostView.reports.length === 1, "The host should see an open report");
  assert(hostView.reports[0].reason === "harassment" && hostView.reports[0].reporterName === "Witness", "A report should carry its reason and reporter");
  const offenderView = await state(roomCode, "player", offenderKey);
  assert(Array.isArray(offenderView.reports) && offenderView.reports.length === 0, "Players must never see reports");

  await post("/api/host/remove-content", { code: roomCode, playerKey: hostKey, kind: "player-media", targetId: offender.player.id });
  await post("/api/host/report/resolve", { code: roomCode, playerKey: hostKey, reportId: hostView.reports[0].id });
  const settled = await state(roomCode, "host", hostKey);
  assert(settled.reports.length === 0, "A resolved report should leave the host's open list");

  return { roomCode, chatRemoval: true, reportingVisibleToHostOnly: true, mediaWipe: true };
}

const roles = await runRoleSmoke();
const moderation = await runModerationSmoke();
const questionEdits = await runApprovalEditSmoke();
const hostPlayerActions = await runHostPlayerActionsSmoke();
const forceStart = await runForceStartSmoke();
const hostPlayerLifecycle = await runHostPlayerExitAndResetSmoke();
console.log(JSON.stringify({ ok: true, baseUrl: BASE_URL, roles, moderation, questionEdits, hostPlayerActions, forceStart, hostPlayerLifecycle }, null, 2));
