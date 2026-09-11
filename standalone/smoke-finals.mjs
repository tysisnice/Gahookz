import fs from "node:fs";

const BASE_URL = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const app = fs.readFileSync(new URL("./public/app.jsx", import.meta.url), "utf8");
const presentation = fs.readFileSync(new URL("./public/client/presentation.jsx", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("./public/styles.css", import.meta.url), "utf8");
const server = fs.readFileSync(new URL("./server.js", import.meta.url), "utf8");

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

async function state(roomCode, role = "host", playerKey = "") {
  const response = await fetch(BASE_URL + "/api/state", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: roomCode, role, playerKey })
  });
  const data = await response.json();
  assert(response.ok, "State request failed for " + roomCode);
  return data;
}

async function skip(roomCode, hostKey) {
  await post("/api/host/skip", { code: roomCode, playerKey: hostKey });
}

function getFunctionSection(name) {
  const start = app.indexOf("function " + name);
  assert(start !== -1, "Missing " + name);
  const next = app.indexOf("\nfunction ", start + 1);
  return app.slice(start, next === -1 ? app.length : next);
}

function assertOrdered(body, labels, scope) {
  let lastIndex = -1;
  for (const label of labels) {
    const index = body.indexOf(label);
    assert(index !== -1, scope + " missing " + label);
    assert(index > lastIndex, scope + " has " + label + " in the wrong order");
    lastIndex = index;
  }
}

function runFinalUiContractSmoke() {
  const gameLeaderboard = getFunctionSection("GameLeaderboardPanel");
  assert(gameLeaderboard.includes('"reveal-leaderboard-panel", "game-leaderboard-panel"'), "Shared phase leaderboard should retain the reveal leaderboard visual shell");
  assert(gameLeaderboard.includes("<LeaderboardList") && gameLeaderboard.includes("actionLabel={actionLabel}"), "Shared phase leaderboard should own the reusable standings rows and action label");

  const hostGame = getFunctionSection("HostGame");
  assert(hostGame.includes('lobby.phase === "reading" || lobby.phase === "answering"'), "Host read and answer phases should share the live leaderboard");
  assert(hostGame.includes("{roundActive ? <GameLeaderboardPanel"), "Host active rounds should render the shared phase leaderboard");

  const playerGame = getFunctionSection("PlayerGame");
  assert(playerGame.includes('lobby.phase === "reading" || lobby.phase === "answering"'), "Player read and answer phases should share the live leaderboard");
  assert(playerGame.includes("{roundActive ? <GameLeaderboardPanel") && playerGame.includes("usedPokeIds={questionUseIds(lobby)}"), "Player active-round leaderboard should preserve one-Gahook actions");

  const reveal = getFunctionSection("RoundRevealSummary");
  assert(reveal.includes("<GameLeaderboardPanel"), "Reveal voting should use the same shared phase leaderboard");

  const finished = getFunctionSection("FinishedScreen");
  assertOrdered(finished, ["<FinalSpotlightRow", "final-party-grid", "<GameLeaderboardPanel", "<FinalShameRow"], "Host final screen");
  assert(finished.includes('title="Final leaderboard"') && finished.includes("limit={0}"), "Host final should show the full shared leaderboard");
  assert(finished.includes("onPoke={booPlayer}") && finished.includes('actionLabel="Boo"'), "Host final leaderboard actions should be clearly labelled Boo");
  assert(finished.includes("Reset Lobby"), "Host final screen needs a Reset Lobby button");
  assert(finished.includes('finalKind: "boo"'), "Host final leaderboard Gahooks should use the boo final action");
  assert(finished.includes('finals.winners.length > 1 ? "Joint winners " : "Winner "') && finished.includes("finals.winners.map((winner) => winner.name)"), "Host winner announcement should speak every tied winner");

  const readonly = getFunctionSection("ReadonlyFinishedScreen");
  assertOrdered(readonly, ["<FinalSpotlightRow", "final-party-grid", "<GameLeaderboardPanel", "<FinalShameRow"], "Readonly party final screen");
  assert(readonly.includes('title="Final leaderboard"') && readonly.includes("limit={0}"), "Readonly final should use the full shared leaderboard");
  assert(readonly.includes("Back to player view"), "Readonly final party view needs a way back to player controls");

  const partyFinal = getFunctionSection("PartyFinalScoreboard");
  assertOrdered(partyFinal, ["<FinalSpotlightRow", "<GameLeaderboardPanel", "<FinalShameRow"], "Player final screen");
  assert(partyFinal.includes("apiPath=\"/api/player/final-poke\""), "Player final screen should let players send final pokes");
  assert(partyFinal.includes('finalKind: "boo"') && partyFinal.includes('actionLabel="Boo"'), "Player final leaderboard actions should explicitly use Boo");
  assert(partyFinal.includes('title="Final leaderboard"') && partyFinal.includes("limit={0}"), "Player final should show the full shared leaderboard");
  assert(!partyFinal.includes("Restart game"), "Player final screen should not use old Restart game wording");

  const winnerStage = getFunctionSection("FinalSpotlightRow");
  assert(winnerStage.includes('className="winner-band finale-winner-stage"'), "Finale should lead with the restored winner-band celebration stage");
  assert(winnerStage.includes("finals.winners.map") && winnerStage.includes('title={isTie ? "Joint winner" : "Champion"}'), "Winner stage should render every tied winner clearly");
  assert(winnerStage.includes("<FinalGahookCard compact"), "Winner celebration cards should stay compact and rewarding");

  const partyAwards = getFunctionSection("FinalShameRow");
  assert(partyAwards.includes('className="finale-party-awards final-shame-row"') && partyAwards.includes("finale-awards-grid"), "Best, last-place, and question moments should be secondary compact party awards");
  assert(partyAwards.includes("Party awards") && partyAwards.includes('"Joint last place" : "Last place legend"'), "Party awards should use playful, tie-aware last-place language");
  assert(partyAwards.includes('buttonLabel="Send a boo"') && partyAwards.includes("<FinalGahookCard compact"), "Negative finale actions should stay compact and honestly labelled");

  assert(app.includes('buttonLabel="Congratulate"') && app.includes('finalKind="congrats"'), "Final celebration cards need Congratulate actions");
  assert(app.includes('buttonLabel="Send a boo"') && app.includes('finalKind="boo"'), "Final party awards need explicit Boo actions");
  assert(!app.includes("const [countdown"), "Final action buttons should not have a countdown");
  assert(presentation.includes("BirdIcon") && presentation.includes("ThumbsUpIcon"), "Congratulate overlay needs bird/thumbs-up visuals");
  assert(presentation.includes("BananaIcon") && presentation.includes('isBoo ? "BOO"'), "BOO overlay needs bananas and BOO text");
  assert(presentation.includes('isCongrats || isBoo ? "by " + fromName'), "Final overlays should name who congratulated or booed the player");
  assert(app.includes("finals.winners.map") && app.includes("finals.losers.map"), "Final cards should render every tied winner and loser");
  assert(app.includes('detail={(winner.congratulationsCount || 0) + " congratulations"}'), "Winner cards should show their own congratulations counter");
  assert(app.includes("getPokeFlashClass"), "Final actions should visibly flash cards and leaderboard rows");
  assert(css.includes(".game-leaderboard-panel") && css.includes(".reveal-round-summary .game-leaderboard-panel"), "Shared leaderboard needs consistent phase spacing styles");
  assert(css.includes(".finale-winner-stage") && css.includes(".finale-party-awards"), "Winner stage and compact party awards need distinct finale hierarchy styling");
  assert(css.includes(".final-gahook-card.is-winner") && css.includes(".final-gahook-card.is-best"), "Winner and best-question cards need celebration styling");
  assert(css.includes(".final-gahook-card.is-loser") && css.includes(".final-gahook-card.is-worst"), "Last-place and worst-question cards need secondary award styling");
  assert(css.includes(".poke-overlay.is-congrats .poke-scare-card"), "Congratulations overlay should have centered layout styling");
  assert(css.includes(".poke-overlay.is-ultimate-congrats") && css.includes(".ultimate-congrats-extra"), "Ultimate Congratulations needs a distinct celebration overlay");
  assert(presentation.includes('isUltimateCongrats ? "ULTIMATE CONGRATULATIONS"'), "Ultimate Congratulations overlay needs explicit headline text");
  assert(server.includes("ULTIMATE_CONGRATS_TRIGGER_COUNT = 8") && server.includes("ULTIMATE_CONGRATS_MIN_SENDERS = 3"), "Ultimate Congratulations should require a real crowd pile-on");

  return {
    checked: [
      "host final layout order",
      "readonly party final layout order",
      "player final layout order",
      "shared read, answer, reveal, and finale leaderboard",
      "winner-stage and compact party-awards hierarchy",
      "tie-aware winner presentation and speech",
      "clearly labelled Congratulate and Boo actions",
      "no final countdown",
      "final visible feedback hooks",
      "celebration and shame overlay assets",
      "winner congratulations counter and Ultimate Congratulations",
      "winner/best and party-award styling hooks"
    ]
  };
}

async function runFinalApiSmoke() {
  const roomCode = code("F");
  const hostKey = key("final-host");
  const players = Array.from({ length: 4 }, (_item, index) => ({
    key: key("final-p" + index),
    name: "Final P" + (index + 1),
    avatarId: ["zap", "frog", "pizza", "rocket"][index]
  }));

  await post("/api/room", { code: roomCode, playerKey: hostKey });
  await post("/api/host/settings", { code: roomCode, playerKey: hostKey, maxQuestionsPerPlayer: 1 });

  for (const player of players) {
    await post("/api/player/join", { code: roomCode, playerKey: player.key, name: player.name, avatarId: player.avatarId });
  }
  await post("/api/host/lock-setup", { code: roomCode, playerKey: hostKey });

  for (const player of players) {
    await post("/api/question", {
      code: roomCode,
      playerKey: player.key,
      text: player.name + " final smoke question?",
      answers: [
        { text: "Correct", correct: true },
        { text: "Wrong", correct: false }
      ]
    });
    await post("/api/player/ready", { code: roomCode, playerKey: player.key, ready: true });
  }

  await post("/api/host/start", { code: roomCode, playerKey: hostKey });
  let snapshot = await state(roomCode, "host", hostKey);

  while (snapshot.phase !== "finished") {
    assert(snapshot.phase === "reading", "Final smoke expected reading phase, got " + snapshot.phase);
    await skip(roomCode, hostKey);

    snapshot = await state(roomCode, "host", hostKey);
    assert(snapshot.phase === "answering", "Final smoke expected answering phase, got " + snapshot.phase);
    for (const player of players) {
      await post("/api/answer", { code: roomCode, playerKey: player.key, answerId: "red" });
    }
    await skip(roomCode, hostKey);

    snapshot = await state(roomCode, "host", hostKey);
    assert(snapshot.phase === "reveal", "Final smoke expected reveal phase, got " + snapshot.phase);
    const authorName = snapshot.currentQuestion?.authorName || "";
    for (const player of players) {
      await post("/api/question/vote", {
        code: roomCode,
        playerKey: player.key,
        good: !authorName.includes("P4")
      });
    }
    await skip(roomCode, hostKey);
    snapshot = await state(roomCode, "host", hostKey);
  }

  assert(snapshot.leaderboard.length === 4, "Final leaderboard should include all players");
  assert(snapshot.questionResults.best, "Final state missing best question/prompt result");
  assert(snapshot.questionResults.worst, "Final state missing worst question/prompt result");
  assert(snapshot.questionResults.worst.voteScore < 0, "Worst question should have a negative vote score");

  const playerSnapshot = await state(roomCode, "player", players[0].key);
  assert(playerSnapshot.phase === "finished", "Player final snapshot should be finished");
  assert(playerSnapshot.leaderboard.length === 4, "Player final snapshot should include leaderboard");
  assert(playerSnapshot.questionResults.best && playerSnapshot.questionResults.worst, "Player final snapshot should include best/worst results");

  const winner = snapshot.leaderboard[0];
  const loser = snapshot.leaderboard[snapshot.leaderboard.length - 1];
  const congrats = await post("/api/player/final-poke", { code: roomCode, playerKey: players[0].key, playerId: winner.id, finalKind: "congrats" });
  assert(congrats.kind === "congrats", "Player Congratulate final poke should return congrats kind");
  const boo = await post("/api/player/final-poke", { code: roomCode, playerKey: players[1].key, playerId: loser.id, finalKind: "boo" });
  assert(boo.kind === "boo", "Player Get Got final poke should return boo kind");

  let ultimateCongrats = null;
  for (let index = 0; index < 7; index += 1) {
    ultimateCongrats = await post("/api/player/final-poke", { code: roomCode, playerKey: players[index % 3].key, playerId: winner.id, finalKind: "congrats" });
  }
  assert(ultimateCongrats.kind === "ultimate-congrats", "A rapid three-person celebration pile-on should trigger Ultimate Congratulations");

  const afterPokes = await state(roomCode, "host", hostKey);
  const updatedWinner = afterPokes.players.find((player) => player.id === winner.id);
  const updatedLoser = afterPokes.players.find((player) => player.id === loser.id);
  assert(updatedWinner.latestPokeKind === "ultimate-congrats" || updatedWinner.id === updatedLoser.id, "Winner should receive Ultimate Congratulations");
  assert(updatedWinner.congratulationsCount >= 8, "Winner congratulations counter should include every celebration click");
  assert(updatedWinner.ultimateCongratulationsUntil > afterPokes.serverTime, "Ultimate Congratulations should remain active after the latest click");
  assert(updatedWinner.ultimateCongratulationsStack >= 8, "Ultimate Congratulations should publish its live stack");
  assert(updatedLoser.latestPokeKind === "boo", "Loser should receive boo final poke");
  assert(updatedLoser.shamePokes >= 1, "Boo final poke should increment shame pokes");

  const finalLeaderboardBoo = await post("/api/player/final-poke", { code: roomCode, playerKey: players[2].key, playerId: winner.id, finalKind: "boo" });
  assert(finalLeaderboardBoo.kind === "boo", "Final leaderboard Gahook buttons should be backed by a valid boo action");

  const reset = await post("/api/host/reset", { code: roomCode, playerKey: hostKey });
  assert(reset.ok, "Reset Lobby endpoint should accept the host action");
  const resetSnapshot = await state(roomCode, "host", hostKey);
  assert(resetSnapshot.phase === "lobby", "Reset Lobby should return the room to the lobby phase");
  assert(resetSnapshot.players.length === 4, "Reset Lobby should keep joined players in the room");
  assert(resetSnapshot.players.every((player) => player.score === 0 && !player.ready), "Reset Lobby should clear scores and ready state");
  assert(resetSnapshot.players.every((player) => player.congratulationsCount === 0), "Reset Lobby should clear congratulations counters");
  assert(resetSnapshot.questionCount === 0 && resetSnapshot.pendingQuestions.length === 0, "Reset Lobby should clear submitted and pending questions");

  return {
    roomCode,
    leaderboardCount: resetSnapshot.leaderboard.length,
    bestScore: afterPokes.questionResults.best.voteScore,
    worstScore: afterPokes.questionResults.worst.voteScore,
    loserLatestKind: updatedLoser.latestPokeKind
  };
}

const ui = runFinalUiContractSmoke();
const api = await runFinalApiSmoke();

console.log(JSON.stringify({ ok: true, baseUrl: BASE_URL, ui, api }, null, 2));

// --- P10: the reveal must describe the rules it actually uses ---------------

{
  // The Majority author bonus is stricter than it reads: it needs *every*
  // eligible voter to choose the author's prediction, not merely the largest
  // group. Copy that says "perfect prediction" without saying that teaches
  // people a rule the game does not have.
  assert(
    app.includes("needs every voter to choose their prediction"),
    "The Majority reveal must state the real author-bonus condition"
  );
  assert(
    app.includes("results.authorBonusValue"),
    "The bonus value must come from the server, not be written into the copy"
  );
  assert(
    !app.includes("The most popular answer is correct for this round"),
    "A vote winner is not a fact and must not be described as correct"
  );
  assert(
    app.includes("The room's most-voted answer wins this round"),
    "The Majority reveal should say the most-voted answer wins"
  );

  // Herd scores two different things, earned differently.
  assert(
    app.includes("Points for your vote") && app.includes("Points for your answer"),
    "The Herd reveal must separate vote points from authored points"
  );
  assert(
    app.includes("round-score-total"),
    "The reveal must show a round total that reconciles with the leaderboard"
  );
}
