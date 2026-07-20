import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicPlayerId,
  getCredentialForPlayer,
  getPlayerByCredential,
  initialiseRoomAuth,
  isCredentialBanned,
  isHostCredential,
  registerPlayerCredential,
  resolvePlayer,
  unbanPlayerCredential,
  unregisterPlayerCredential } from
"./server/auth.mjs";
import { allActivePlayersAnswered as roomAllActivePlayersAnswered, allActivePlayersProgressReady as roomAllActivePlayersProgressReady, phaseProgressKey as roomPhaseProgressKey } from "./server/gameplay.mjs";
import { buildHerdRankingResults } from "./server/herd-ranking.mjs";
import { customGahookOptions, normaliseCustomGahook, publicCustomGahook } from "./server/custom-gahook.mjs";
import { initialiseRoomMedia, pruneRoomMedia, serveRoomMedia, storeRoomImage } from "./server/media.mjs";
import { presentPlayer } from "./server/presentation.mjs";
import { MAX_ACTIVE_ROOMS, MAX_PLAYERS_PER_ROOM } from "./server/room.mjs";
import { gameEligiblePlayers, quizPoints, scorePlacements } from "./server/scoring.mjs";
import { addChatMessage, addWhiteboardStroke, clearWhiteboard, clearWhiteboardForPlayer, initialiseRoomSocial, publicChatMessages, publicWhiteboardStrokes } from "./server/social.mjs";
import { readJson, sendJson, writeSseState } from "./server/transport.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
let releaseInfo = readReleaseInfo();
const envPort = typeof process !== "undefined" ? process.env?.PORT : "";
const requestedPort = Number(globalThis.GAHOOKZ_PORT || envPort || 3001);
const PORT = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort <= 65535 ? requestedPort : 3001;
const HOST = cleanHost(process.env.HOST) || "0.0.0.0";
const DEV_RELOAD_ENABLED = process.env.GAHOOKZ_DEV_RELOAD === "1";

const READING_MS = 5000;
const ANSWERING_MS = 14000;
const HERD_ANSWERING_MS = 30000;
const HERD_RANKING_MS = 45000;
const HERD_REVEAL_MS = 18000;
const REVEAL_MS = 12000;
const ULTIMATE_GAHOOK_GRACE_MS = 1000;
const ULTIMATE_GAHOOK_BASE_THRESHOLD_MS = 5000;
const ULTIMATE_GAHOOK_THRESHOLD_STEP_MS = 1000;
const ULTIMATE_GAHOOK_SPAM_IDLE_MS = 1200;
const ULTIMATE_GAHOOK_MAX_STACK = 50;
const COUNTER_GAHOOK_TRIGGER_COUNT = 5;
const COUNTER_GAHOOK_SPAM_IDLE_MS = 1200;
const ULTIMATE_CONGRATS_GRACE_MS = 1000;
const ULTIMATE_CONGRATS_TRIGGER_COUNT = 8;
const ULTIMATE_CONGRATS_MIN_SENDERS = 3;
const ULTIMATE_CONGRATS_THRESHOLD_MS = 5000;
const ULTIMATE_CONGRATS_SPAM_IDLE_MS = 1200;
const ULTIMATE_CONGRATS_MAX_STACK = 50;
const GET_GOT_SCORE_PENALTY = 1000;
const GAHOOK_STEAL_POINTS = 50;
const STATE_BROADCAST_MS = 30;
const PROGRESS_SETTLE_MS = 200;
const PROGRESS_FORCE_ADVANCE_MS = 5000;
const ROOM_EXPIRE_MS = 5 * 60 * 1000;
const LIVE_GAME_PHASES = ["reading", "answering", "ranking", "reveal"];
const DEFAULT_QUESTIONS_PER_PLAYER = 3;
const MIN_QUESTIONS_PER_PLAYER = 1;
const MAX_QUESTIONS_PER_PLAYER = 5;
const ROUND_PRESETS = ["quick", "standard", "custom"];
const DEFAULT_ROUND_PRESET = "standard";
const QUICK_MAX_ROUNDS = 10;
const STANDARD_MAX_ROUNDS = 18;
const MAX_IMAGE_CHARS = 3000000;
const MAX_AVATAR_IMAGE_CHARS = 1500000;
const GAHOOK_FORMS = ["monkey", "gorilla", "koala", "croc", "capybara", "chicken", "custom"];
const GAME_MODES = ["quiz", "herd", "oddball"];
const DEFAULT_GAME_MODE = "quiz";
const HERD_ANSWER_MAX = 60;
const ODDBALL_POINTS = 900;
const ODDBALL_SOLO_BONUS = 300;

const ANSWER_META = [
{ id: "red", label: "Red", color: "#e6383a", shape: "triangle" },
{ id: "blue", label: "Blue", color: "#246bfe", shape: "diamond" },
{ id: "yellow", label: "Yellow", color: "#f2c230", shape: "circle" },
{ id: "green", label: "Green", color: "#20b26b", shape: "square" }];

const AVATAR_PRESETS = [
"zap", "pop", "star", "bolt", "disco", "rocket", "crown", "pizza", "gamepad", "gem",
"panda", "tiger", "koala", "fox", "frog", "owl", "whale", "bee", "bunny", "turtle",
"poop", "caseoh", "banana"];

const SAFE_PLAYER_NAMES = [
"Captain Waffles", "Disco Potato", "Professor Pickle", "Turbo Biscuit", "Sneaky Teapot",
"Cosmic Noodle", "Mighty Muffin", "Bouncy Spoon", "Sir Sprinkles", "Agent Pancake",
"Happy Cactus", "Fancy Socks", "Jolly Keyboard", "Tiny Thunder", "Velvet Banana",
"Clever Crumpet", "Daring Donut", "Mystery Toast", "Electric Apricot", "Brave Pudding",
"Sunny Sidekick", "Polite Pirate", "Groovy Turnip", "Noble Nugget", "Quick Quokka",
"Major Marshmallow", "Doctor Doodle", "Rocket Parsnip", "Chill Pretzel", "Super Sandwich"];

const GENERATED_QUIZ_PRESETS = [
{ text: "Which planet is known as the Red Planet?", answers: ["Mars", "Venus", "Jupiter", "Neptune"] },
{ text: "What is the largest ocean on Earth?", answers: ["Pacific", "Atlantic", "Indian", "Arctic"] },
{ text: "Which animal is famous for changing colour?", answers: ["Chameleon", "Penguin", "Dolphin", "Giraffe"] },
{ text: "How many sides does a hexagon have?", answers: ["Six", "Five", "Seven", "Eight"] },
{ text: "What do bees collect from flowers?", answers: ["Nectar", "Sand", "Pebbles", "Cheese"] },
{ text: "Which instrument usually has black and white keys?", answers: ["Piano", "Trumpet", "Drums", "Violin"] },
{ text: "What is the fastest land animal?", answers: ["Cheetah", "Horse", "Ostrich", "Kangaroo"] },
{ text: "Which month has an extra day in a leap year?", answers: ["February", "April", "June", "November"] },
{ text: "What is frozen water called?", answers: ["Ice", "Steam", "Mist", "Cloud"] },
{ text: "Which shape has exactly three sides?", answers: ["Triangle", "Square", "Circle", "Pentagon"] },
{ text: "What is the capital city of Japan?", answers: ["Tokyo", "Seoul", "Beijing", "Bangkok"] },
{ text: "Which food is traditionally used to make guacamole?", answers: ["Avocado", "Potato", "Apple", "Cucumber"] },
{ text: "Which metal is liquid near room temperature?", answers: ["Mercury", "Iron", "Copper", "Silver"] },
{ text: "How many minutes are in two hours?", answers: ["120", "90", "100", "180"] },
{ text: "Which country is home to the pyramids of Giza?", answers: ["Egypt", "Mexico", "Greece", "India"] },
{ text: "What gas do plants absorb from the air?", answers: ["Carbon dioxide", "Oxygen", "Helium", "Hydrogen"] },
{ text: "Which animal is the largest living mammal?", answers: ["Blue whale", "Elephant", "Giraffe", "Hippopotamus"] },
{ text: "What is the main ingredient in hummus?", answers: ["Chickpeas", "Rice", "Potatoes", "Lentils"] },
{ text: "Which continent contains the South Pole?", answers: ["Antarctica", "Europe", "Asia", "Africa"] },
{ text: "How many colours are traditionally named in a rainbow?", answers: ["Seven", "Five", "Six", "Eight"] },
{ text: "Which organ pumps blood around the body?", answers: ["Heart", "Lungs", "Liver", "Kidneys"] },
{ text: "What is the square root of 81?", answers: ["Nine", "Eight", "Seven", "Ten"] }];

const GENERATED_HERD_PRESETS = [
"Name a snack that disappears too quickly.",
"What is the funniest excuse for being late?",
"Name something everyone checks before leaving home.",
"What food would improve almost any party?",
"Name something people pretend to understand.",
"What is the worst thing to hear from a driver?",
"Name a tiny problem that makes people furious.",
"What would be a terrible name for a boat?",
"Name something that should never be sticky.",
"What is the funniest fake job title?",
"Name something people always lose.",
"What is the most dramatic household object?"];

const GENERATED_ODDBALL_PRESETS = [
{ text: "Which snack has the strangest party energy?", answers: ["Pickles", "Cold pizza", "Dry cereal", "Tiny cakes"] },
{ text: "Which object would make the worst roommate?", answers: ["Printer", "Lamp", "Beanbag", "Toaster"] },
{ text: "Which prize would cause the quietest applause?", answers: ["One sock", "Tiny spoon", "Mystery key", "Wet coupon"] },
{ text: "Which vehicle is funniest for a dramatic arrival?", answers: ["Forklift", "Scooter", "Boat", "Tiny train"] },
{ text: "Which fake job sounds most believable?", answers: ["Cloud inspector", "Snack lawyer", "Chair detective", "Vibe plumber"] },
{ text: "Which item is least useful in an action movie?", answers: ["Kazoo", "Feather", "Nice hat", "Salad spinner"] },
{ text: "Which smell would ruin a heroic entrance?", answers: ["Old cheese", "Wet carpet", "Egg", "Banana peel"] },
{ text: "Which word sounds most like a secret password?", answers: ["Plonk", "Noodle", "Chair", "Mega"] }];

const FUNNY_CODES = [
"GOOK", "BONK", "YEET", "ZOOT", "NOOB", "BOOP", "WOOT", "YOIN", "GONK", "DOOF",
"POOP", "FART", "BURP", "GOOF", "MOOP", "ZONK", "WOMP", "GLOP", "BORK", "MEEP",
"HONK", "CHON", "BLAP", "DUNK", "SUSY", "YUCK", "WACK", "PFFT", "GULP", "NOMS"];


const lobbies = new Map();
let nextClientId = 1;
const clients = new Map();
const devReloadClients = new Set();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://" + req.headers.host);

  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true, serverTime: Date.now(), release: releaseInfo.version, builtAt: releaseInfo.builtAt });
      return;
    }

    if (req.method === "GET" && url.pathname === "/__dev/client.js") {
      serveDevReloadClient(res);
      return;
    }

    if (DEV_RELOAD_ENABLED && req.method === "GET" && url.pathname === "/__dev/events") {
      handleDevReloadEvents(req, res);
      return;
    }

    if (DEV_RELOAD_ENABLED && req.method === "POST" && url.pathname === "/__dev/reload") {
      releaseInfo = readReleaseInfo();
      triggerDevReload();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/events") {
      handleEvents(req, res, url);
      return;
    }

    if (req.method === "GET" && serveRoomMedia(url, res, lobbies)) {
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/lobby") {
      const room = getLobbyFromCode(url.searchParams.get("code"));
      if (!room) {
        sendJson(res, 404, { ok: false, error: "That room does not exist.", roomMissing: true });
        return;
      }
      sendJson(res, 200, { ok: true, code: room.code, phase: room.phase, hasPassword: roomHasPassword(room) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/state") {
      const role = cleanText(url.searchParams.get("role"), 12) || "guest";
      const playerKey = cleanText(url.searchParams.get("playerKey"), 80);
      const room = getLobbyFromCode(url.searchParams.get("code"));
      if (!room) {
        sendJson(res, 404, { ok: false, error: "That room does not exist.", roomMissing: true });
        return;
      }
      sendJson(res, 200, buildSnapshot(room, role, playerKey));
      return;
    }

    if (req.method === "POST" && url.pathname.startsWith("/api/")) {
      const payload = await readJson(req);
      const result = handleAction(url.pathname, payload);
      sendJson(res, result.ok ? 200 : result.roomMissing ? 404 : 400, result);
      return;
    }

    serveStatic(url, res);
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || "Server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log("Gahookz " + releaseInfo.version + " running on http://" + HOST + ":" + PORT + "/");
});

function readReleaseInfo() {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(publicDir, "release.json"), "utf8"));
    return {
      version: String(parsed.version || "unknown"),
      builtAt: String(parsed.builtAt || "")
    };
  } catch {
    return { version: "development", builtAt: "" };
  }
}

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(signal + " received; closing Gahookz connections.");

  for (const client of clients.values()) {
    client.res.end();
  }
  clients.clear();
  for (const response of devReloadClients) {
    response.end();
  }
  devReloadClients.clear();

  const forceExit = setTimeout(() => process.exit(1), 10000);
  forceExit.unref();
  server.close((error) => {
    clearTimeout(forceExit);
    if (error) {
      console.error("Gahookz shutdown failed:", error);
      process.exit(1);
    }
    process.exit(0);
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

function handleEvents(req, res, url) {
  const role = cleanText(url.searchParams.get("role"), 12) || "guest";
  const playerKey = cleanText(url.searchParams.get("playerKey"), 80);
  const room = getLobbyFromCode(url.searchParams.get("code"));
  if (!room) {
    sendJson(res, 404, { ok: false, error: "That room does not exist.", roomMissing: true });
    return;
  }
  const id = nextClientId++;
  clearRoomExpiry(room);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });

  const client = { id, role, playerKey, code: room.code, res };
  clients.set(id, client);
  room.hadLiveClient = true;
  if (playerKey && playerKey === room.hostKey) {
    room.hadHostLiveClient = true;
  }

  const connectedPlayer = getPlayerByCredential(room, playerKey);
  if (connectedPlayer) {
    connectedPlayer.connected = true;
    connectedPlayer.lastSeenAt = Date.now();
    broadcastState(room);
  } else {
    sendState(client);
  }

  const heartbeat = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(id);

    setTimeout(() => {
      const closingPlayer = getPlayerByCredential(room, playerKey);
      if (closingPlayer) {
          if (!hasLivePlayerClient(playerKey, room.code) && getPlayerByCredential(room, playerKey)) {
            closingPlayer.connected = false;
            closingPlayer.dashRunning = false;
            if (room.phase === "lobby" && room.roundPreset !== "custom") {
              room.maxQuestionsPerPlayer = questionsPerPlayerForPreset(room, room.roundPreset);
            }
            if (room.phase === "answering" && allActivePlayersAnswered(room)) {
            windowedTransitionAfterAnswers(room);
          } else if (room.phase === "ranking" && allActivePlayersRanked(room)) {
            windowedTransitionToReveal(room);
          } else if (room.game.waitingForProgress && allActivePlayersProgressReady(room)) {
            scheduleProgressAdvance(room);
          } else {
            broadcastState(room);
          }
        }
      }
      scheduleRoomExpiry(room);
    }, 900);
  });
}

function handleAction(pathname, payload) {
  if (pathname === "/api/room") {
    return createRoomAction(payload);
  }

  const room = getLobbyFromCode(payload?.code);
  if (!room) {
    return { ok: false, error: "That room does not exist.", roomMissing: true };
  }

  return handleRoomAction(room, pathname, payload);
}

function handleRoomAction(room, pathname, payload) {
  if (pathname === "/api/player/join") {
    return joinPlayer(room, payload);
  }
  if (pathname === "/api/question") {
    return submitQuestion(room, payload);
  }
  if (pathname === "/api/question/edit") {
    return editQuestion(room, payload);
  }
  if (pathname === "/api/player/ready") {
    return setReady(room, payload);
  }
  if (pathname === "/api/player/name") {
    return updatePlayerName(room, payload);
  }
  if (pathname === "/api/player/profile") {
    return updatePlayerProfile(room, payload);
  }
  if (pathname === "/api/player/custom-gahook") {
    return updatePlayerCustomGahook(room, payload);
  }
  if (pathname === "/api/player/gahook-form") {
    return updatePlayerGahookForm(room, payload);
  }
  if (pathname === "/api/room/chat") {
    return postRoomChat(room, payload);
  }
  if (pathname === "/api/room/whiteboard/stroke") {
    return postRoomWhiteboardStroke(room, payload);
  }
  if (pathname === "/api/room/whiteboard/clear") {
    return clearRoomWhiteboard(room, payload);
  }
  if (pathname === "/api/player/dash") {
    return updatePlayerDash(room, payload);
  }
  if (pathname === "/api/player/poke") {
    return pokeFromPlayer(room, payload);
  }
  if (pathname === "/api/player/round-poke") {
    return roundPokeFromPlayer(room, payload);
  }
  if (pathname === "/api/player/shame-poke") {
    return shamePokeFromPlayer(room, payload);
  }
  if (pathname === "/api/player/final-poke") {
    return finalPokeFromPlayer(room, payload);
  }
  if (pathname === "/api/player/vote-kick") {
    return voteKickFromPlayer(room, payload);
  }
  if (pathname === "/api/player/progress") {
    return acknowledgeProgress(room, payload);
  }
  if (pathname === "/api/answer") {
    return submitAnswer(room, payload);
  }
  if (pathname === "/api/herd/rank") {
    return submitHerdRanking(room, payload);
  }
  if (pathname === "/api/question/vote") {
    return voteQuestion(room, payload);
  }
  if (pathname === "/api/host/start") {
    const hostCheck = requireHost(room, payload);
    if (!hostCheck.ok) {
      return hostCheck;
    }
    if (LIVE_GAME_PHASES.includes(room.phase)) {
      finishGameNow(room);
      return { ok: true };
    }
    if (room.phase !== "building") {
      return { ok: false, error: room.phase === "lobby" ? "Lock in the game options first." : "This game cannot be started right now." };
    }
    const check = getStartCheck(room);
    if (!check.ok) {
      return check;
    }
    startGame(room);
    return { ok: true };
  }
  if (pathname === "/api/host/force-start") {
    const hostCheck = requireHost(room, payload);
    if (!hostCheck.ok) {
      return hostCheck;
    }
    return forceStartGame(room);
  }
  if (pathname === "/api/host/lock-setup") {
    const hostCheck = requireHost(room, payload);
    if (!hostCheck.ok) {
      return hostCheck;
    }
    return lockSetup(room, payload);
  }
  if (pathname === "/api/host/skip") {
    const hostCheck = requireHost(room, payload);
    if (!hostCheck.ok) {
      return hostCheck;
    }
    skipPhase(room);
    return { ok: true };
  }
  if (pathname === "/api/host/pause") {
    const hostCheck = requireHost(room, payload);
    if (!hostCheck.ok) {
      return hostCheck;
    }
    return setGamePaused(room, payload);
  }
  if (pathname === "/api/host/poke") {
    const hostCheck = requireHost(room, payload);
    if (!hostCheck.ok) {
      return hostCheck;
    }
    const hostPlayer = getPlayerByCredential(room, room.hostKey);
    let claimKey = "";
    if (hostPlayer && LIVE_GAME_PHASES.includes(room.phase)) {
      const target = resolvePlayer(room, cleanText(payload?.playerId, 80));
      if (!target || !target.connected) return { ok: false, error: "That player is not connected." };
      if (target.id === hostPlayer.id) return { ok: false, error: "Choose someone else to Gahook." };
      const claim = claimQuestionGahookUse(room, hostPlayer.id, target.id);
      if (!claim.ok) return claim;
      claimKey = claim.key;
    }
    const result = pokePlayer(room, payload, hostPlayer?.name || "Host", { allowPhases: ["lobby", "building", "reading", "answering", "ranking", "reveal", "finished"], gahookForm: hostPlayer?.gahookForm || "monkey", senderPlayer: hostPlayer });
    if (!result.ok && claimKey) delete room.game.pokeUses[claimKey];
    return result;
  }
  if (pathname === "/api/host/final-poke") {
    const hostCheck = requireHost(room, payload);
    if (!hostCheck.ok) {
      return hostCheck;
    }
    return finalPokeFromHost(room, payload);
  }
  if (pathname === "/api/host/settings") {
    const hostCheck = requireHost(room, payload);
    if (!hostCheck.ok) {
      return hostCheck;
    }
    return updateHostSettings(room, payload);
  }
  if (pathname === "/api/host/kick") {
    const hostCheck = requireHost(room, payload);
    if (!hostCheck.ok) {
      return hostCheck;
    }
    return kickPlayer(room, payload);
  }
  if (pathname === "/api/host/unban") {
    const hostCheck = requireHost(room, payload);
    if (!hostCheck.ok) {
      return hostCheck;
    }
    return unbanPlayer(room, payload);
  }
  if (pathname === "/api/host/make-host") {
    const hostCheck = requireHost(room, payload);
    if (!hostCheck.ok) {
      return hostCheck;
    }
    return transferHost(room, payload);
  }
  if (pathname === "/api/host/randomize-player" || pathname === "/api/host/randomize-avatar") {
    const hostCheck = requireHost(room, payload);
    if (!hostCheck.ok) {
      return hostCheck;
    }
    return randomizePlayerIdentity(room, payload);
  }
  if (pathname === "/api/host/exit-player") {
    const hostCheck = requireHost(room, payload);
    if (!hostCheck.ok) {
      return hostCheck;
    }
    return exitHostAsPlayer(room);
  }
  if (pathname === "/api/host/question/approve") {
    const hostCheck = requireHost(room, payload);
    if (!hostCheck.ok) {
      return hostCheck;
    }
    return approveQuestion(room, payload);
  }
  if (pathname === "/api/host/question/reject") {
    const hostCheck = requireHost(room, payload);
    if (!hostCheck.ok) {
      return hostCheck;
    }
    return rejectQuestion(room, payload);
  }
  if (pathname === "/api/host/reset") {
    const hostCheck = requireHost(room, payload);
    if (!hostCheck.ok) {
      return hostCheck;
    }
    resetLobby(room);
    return { ok: true };
  }
  if (pathname === "/api/host/new-game") {
    const hostCheck = requireHost(room, payload);
    if (!hostCheck.ok) {
      return hostCheck;
    }
    resetLobby(room, { phase: "building", reuseUnusedQuestions: true });
    return { ok: true };
  }
  return { ok: false, error: "Unknown action." };
}

function createRoomAction(payload) {
  const requestedCode = normaliseRoomCode(payload?.code);
  const playerKey = cleanText(payload?.playerKey, 80);
  const password = cleanPassword(payload?.password);
  const passwordEnabled = Boolean(payload?.passwordEnabled || password);
  const existingRoom = requestedCode ? lobbies.get(requestedCode) : null;
  const requestedIntent = cleanText(payload?.intent, 12).toLowerCase();
  const intent = requestedIntent === "join" || requestedIntent === "host" ? requestedIntent : "";

  if (!playerKey) {
    return { ok: false, error: "This device needs a host key." };
  }
  if (intent === "join" && !requestedCode) {
    return { ok: false, error: "Enter a room code to join.", roomMissing: true };
  }
  if (intent === "join" && !existingRoom) {
    return { ok: false, error: "That room does not exist.", roomMissing: true };
  }
  if (intent === "host" && existingRoom && existingRoom.hostKey !== playerKey) {
    return { ok: false, error: "That room code is already in use. Choose another code.", roomExists: true };
  }
  if (intent === "host" && existingRoom && existingRoom.hostKey === playerKey) {
    clearRoomExpiry(existingRoom);
    scheduleRoomExpiry(existingRoom, { awaitingConnection: true });
    return {
      ok: true,
      code: existingRoom.code,
      role: "host",
      created: false,
      roomUrl: "/" + existingRoom.code
    };
  }
  if (!existingRoom && passwordEnabled && !password) {
    return { ok: false, error: "Enter a room password first." };
  }
  if (!existingRoom && lobbies.size >= MAX_ACTIVE_ROOMS) {
    return { ok: false, error: "The server has reached its active room limit. Try again shortly." };
  }

  if (existingRoom) {
    if (roomHasPassword(existingRoom) && !verifyRoomPassword(existingRoom, password)) {
      return { ok: false, error: "Wrong password.", wrongPassword: true };
    }
    clearRoomExpiry(existingRoom);
    scheduleRoomExpiry(existingRoom, { awaitingConnection: true });
    return {
      ok: true,
      code: existingRoom.code,
      role: playerKey && existingRoom.hostKey === playerKey ? "host" : "player",
      created: false,
      roomUrl: "/" + existingRoom.code
    };
  }

  const room = createLobby(requestedCode || generateRoomCode());
  room.hostKey = playerKey;
  if (passwordEnabled) {
    setRoomPassword(room, password);
  }
  scheduleRoomExpiry(room, { awaitingConnection: true });
  return {
    ok: true,
    code: room.code,
    role: "host",
    created: true,
    roomUrl: "/" + room.code
  };
}

function createLobby(code) {
  const room = makeLobby(code);
  lobbies.set(room.code, room);
  return room;
}

function getLobbyFromCode(value) {
  const code = normaliseRoomCode(value);
  return code ? lobbies.get(code) : null;
}

function joinPlayer(room, payload) {
  const code = normaliseRoomCode(payload?.code);
  const name = cleanText(payload?.name, 24);
  const playerKey = cleanText(payload?.playerKey, 80);
  const avatarId = normaliseAvatarId(payload?.avatarId);
  const avatarImageDataUrl = room.allowCustomProfiles === false ? "" : validateAvatarImage(room, payload?.avatarImageDataUrl);
  const requestedGahookForm = normaliseGahookForm(payload?.gahookForm);
  const gahookForm = room.allowCustomGahooks === false && requestedGahookForm === "custom" ? "monkey" : requestedGahookForm;
  const password = cleanPassword(payload?.password);

  if (code !== room.code) {
    return { ok: false, error: "That lobby code does not match." };
  }
  if (roomHasPassword(room) && !verifyRoomPassword(room, password)) {
    return { ok: false, error: "Wrong password.", wrongPassword: true };
  }
  if (!name) {
    return { ok: false, error: "Choose a name first." };
  }
  if (!playerKey) {
    return { ok: false, error: "This device needs a player key." };
  }
  if (isCredentialBanned(room, playerKey)) {
    return { ok: false, error: "You're banned.", banned: true };
  }

  const existing = getPlayerByCredential(room, playerKey);
  if (room.phase === "finished" && !existing) {
    return { ok: false, error: "This game has finished. Wait for the host to reset the lobby." };
  }
  if (!existing && Object.keys(room.players).length >= MAX_PLAYERS_PER_ROOM) {
    return { ok: false, error: "This lobby is full (20 players maximum).", roomFull: true };
  }

  const player = existing ?? {
    id: createPublicPlayerId(),
    name,
    score: 0,
    avatarId,
    gahookForm,
    customGahook: publicCustomGahook(),
    dashTopScore: 0,
    dashScore: 0,
    dashPlayerY: 0,
    dashRunning: false,
    dashRunId: "",
    dashUpdatedAt: 0,
    connected: true,
    ready: false,
    questionsSubmitted: 0,
    pokeCount: 0,
    latestPoke: null,
    congratulationsCount: 0,
    ultimateCongratulationsUntil: 0,
    ultimateCongratulationsStack: 0,
    ultimateCongratulationsId: "",
    ultimateCongratulationsTimer: null,
    congratulationsSpamStartedAt: 0,
    congratulationsSpamCount: 0,
    congratulationsSpamSenderIds: [],
    lastCongratulationsAt: 0,
    ultimateGahookUntil: 0,
    ultimateGahookStack: 0,
    ultimateGahookId: "",
    ultimateGahookTimer: null,
    ultimateGahookThresholdMs: ULTIMATE_GAHOOK_BASE_THRESHOLD_MS,
    gahookSpamStartedAt: 0,
    gahookSpamCount: 0,
    lastGahookAt: 0,
    avatarImageDataUrl,
    joinedAt: Date.now()
  };

  if (room.phase === "lobby" || !existing) {
    player.name = name;
    player.avatarId = avatarId;
    player.avatarImageDataUrl = avatarImageDataUrl;
    player.gahookForm = gahookForm;
  }

  player.customGahook = publicCustomGahook(player);
  player.connected = true;
  player.lastSeenAt = Date.now();
  room.players[player.id] = player;
  if (!existing) {
    registerPlayerCredential(room, playerKey, player.id);
    if (LIVE_GAME_PHASES.includes(room.phase) && Array.isArray(room.game.eligiblePlayerIds)) {
      room.game.eligiblePlayerIds.push(player.id);
    }
  }
  if (room.phase === "lobby" && room.roundPreset !== "custom") {
    room.maxQuestionsPerPlayer = questionsPerPlayerForPreset(room, room.roundPreset);
  }

  broadcastState(room, { immediate: true });
  return { ok: true, player: publicPlayer(room, player) };
}

function updatePlayerDash(room, payload) {
  const player = getPayloadPlayer(room, payload);
  if (!player || !player.connected) {
    return { ok: false, error: "Join the room before playing Gahook Dash." };
  }
  if (room.phase !== "lobby" && room.phase !== "building") {
    return { ok: false, error: "Gahook Dash is available while the room is waiting." };
  }

  const score = Math.max(0, Math.min(999999, Math.floor(Number(payload?.score) || 0)));
  const playerY = Math.max(-260, Math.min(0, Number(payload?.playerY) || 0));
  player.dashScore = score;
  player.dashTopScore = Math.max(Number(player.dashTopScore) || 0, score);
  player.dashPlayerY = playerY;
  player.dashRunning = Boolean(payload?.running);
  player.dashRunId = cleanText(payload?.runId, 60);
  player.dashUpdatedAt = Date.now();
  broadcastState(room);
  return { ok: true, topScore: player.dashTopScore };
}

function pokeFromPlayer(room, payload) {
  const sender = getPayloadPlayer(room, payload);
  if (!sender || !sender.connected) {
    return { ok: false, error: "Join the lobby before Gahooking someone." };
  }

  const playerId = cleanText(payload?.playerId, 80);
  const target = resolvePlayer(room, playerId);
  let claimKey = "";
  if (LIVE_GAME_PHASES.includes(room.phase)) {
    if (!target || !target.connected) {
      return { ok: false, error: "That player is not connected." };
    }
    if (target.id === sender.id) {
      return { ok: false, error: "Choose someone else to Gahook." };
    }
    const useClaim = claimQuestionGahookUse(room, sender.id, target.id);
    if (!useClaim.ok) return useClaim;
    claimKey = useClaim.key;
  }
  const result = pokePlayer(room, { playerId: target?.id || playerId }, sender.name, { allowPhases: ["lobby", "building", "reading", "answering", "ranking", "reveal", "finished"], gahookForm: sender.gahookForm, senderPlayer: sender });
  if (!result.ok && claimKey) delete room.game.pokeUses[claimKey];
  return result;
}

function roundPokeFromPlayer(room, payload) {
  const sender = getPayloadPlayer(room, payload);
  if (!sender || !sender.connected) {
    return { ok: false, error: "Join the game before Gahooking." };
  }
  if (room.phase !== "reading" && room.phase !== "answering" && room.phase !== "ranking") {
    return { ok: false, error: "Gahooks are only available during a question round." };
  }

  const playerId = cleanText(payload?.playerId, 80);
  const target = resolvePlayer(room, playerId);
  if (!target || !target.connected) {
    return { ok: false, error: "That player is not connected." };
  }
  if (target.id === sender.id) {
    return { ok: false, error: "Choose someone else to Gahook." };
  }
  const useClaim = claimQuestionGahookUse(room, sender.id, target.id);
  if (!useClaim.ok) {
    return useClaim;
  }

  const result = pokePlayer(room, { playerId: target.id }, sender.name, { allowPhases: ["reading", "answering", "ranking"], skipBroadcast: true, gahookForm: sender.gahookForm, senderPlayer: sender });
  if (!result.ok) delete room.game.pokeUses[useClaim.key];
  if (result.ok) {
    broadcastState(room, { immediate: true });
  }
  return result;
}

function claimQuestionGahookUse(room, senderId, targetId) {
  if (!senderId || !targetId) {
    return { ok: false, error: "Choose someone to Gahook." };
  }
  room.game.pokeUses = room.game.pokeUses || {};
  const index = room.game.currentQuestionIndex;
  const key = "question:" + index + ":" + senderId;
  const existingTargetId = room.game.pokeUses[key];
  if (existingTargetId) {
    return {
      ok: false,
      error: "You already used your Gahook for this question.",
      usedTargetId: existingTargetId
    };
  }
  room.game.pokeUses[key] = targetId;
  return { ok: true, key, targetId };
}

function shamePokeFromPlayer(room, payload) {
  const sender = getPayloadPlayer(room, payload);
  if (!sender || !sender.connected) {
    return { ok: false, error: "Join before joining the final Gahook pile-on." };
  }
  if (room.phase !== "finished") {
    return { ok: false, error: "The shame Gahook opens at the end." };
  }

  const loser = getLoser(room);
  if (!loser) {
    return { ok: false, error: "No loser to Gahook." };
  }

  return pokePlayer(room, { playerId: loser.id }, sender.name, { allowPhase: "finished", gahookForm: sender.gahookForm, senderPlayer: sender });
}

function finalPokeFromPlayer(room, payload) {
  const sender = getPayloadPlayer(room, payload);
  if (!sender || !sender.connected) {
    return { ok: false, error: "Join before joining the final Gahook pile-on." };
  }
  return finalPokeTarget(room, payload, sender.name, sender.id, sender.gahookForm, sender);
}

function finalPokeFromHost(room, payload) {
  const sender = getPlayerByCredential(room, room.hostKey);
  return finalPokeTarget(room, payload, sender?.name || "Host", sender?.id || "host", sender?.gahookForm || "monkey", sender);
}

function finalPokeTarget(room, payload, fromName, senderId = "", gahookForm = "monkey", senderPlayer = null) {
  if (room.phase !== "finished") {
    return { ok: false, error: "Final Gahooks open at the end." };
  }
  const playerId = cleanText(payload?.playerId, 80);
  const target = resolvePlayer(room, playerId);
  if (!target) {
    return { ok: false, error: "Choose someone to Gahook." };
  }
  const finalKind = cleanText(payload?.finalKind, 20);
  if (finalKind === "congrats") {
    return pokePlayer(room, { playerId: target.id }, fromName, { allowPhase: "finished", kindOverride: "congrats", message: "CONGRATULATIONS", senderId, senderPlayer });
  }
  if (finalKind === "boo") {
    return pokePlayer(room, { playerId: target.id }, fromName, { allowPhase: "finished", kindOverride: "boo", message: "BOO", senderId, senderPlayer });
  }
  return pokePlayer(room, { playerId: target.id }, fromName, { allowPhase: "finished", gahookForm, senderId, senderPlayer });
}

function voteKickFromPlayer(room, payload) {
  const sender = getPayloadPlayer(room, payload);
  if (!sender || !sender.connected) {
    return { ok: false, error: "Join before voting to kick." };
  }
  const playerId = cleanText(payload?.playerId, 80);
  const target = resolvePlayer(room, playerId);
  if (!target) {
    return { ok: false, error: "Choose a player to vote kick." };
  }
  if (target.id === sender.id) {
    return { ok: false, error: "You cannot vote kick yourself." };
  }
  if (getCredentialForPlayer(room, target.id) === room.hostKey) {
    return { ok: false, error: "The host cannot be vote kicked." };
  }

  room.voteKicks[target.id] = room.voteKicks[target.id] || {};
  room.voteKicks[target.id][sender.id] = true;
  const eligibleVoterIds = new Set(
    Object.values(room.players).
    filter((player) => player.connected && player.id !== target.id).
    map((player) => player.id)
  );
  const votes = Object.keys(room.voteKicks[target.id]).filter((id) => eligibleVoterIds.has(id)).length;
  const needed = Math.floor(eligibleVoterIds.size / 2) + 1;
  if (votes >= needed) {
    return kickPlayer(room, { playerId: target.id }, { allowHostKick: false, reason: "vote" });
  }
  broadcastState(room, { immediate: true });
  return { ok: true, votes, needed };
}

function registerCounterGahook(room, target, senderPlayer, now) {
  if (!target?.id || !senderPlayer?.id || senderPlayer.id === target.id) {
    return false;
  }
  room.counterGahookStreaks = room.counterGahookStreaks || {};
  const previous = room.counterGahookStreaks[target.id];
  const continues = previous?.senderId === senderPlayer.id && now - (previous.lastAt || 0) <= COUNTER_GAHOOK_SPAM_IDLE_MS;
  const count = continues ? (previous.count || 0) + 1 : 1;
  if (count >= COUNTER_GAHOOK_TRIGGER_COUNT) {
    delete room.counterGahookStreaks[target.id];
    return true;
  }
  room.counterGahookStreaks[target.id] = {
    senderId: senderPlayer.id,
    count,
    lastAt: now
  };
  return false;
}

function clearCounterGahookStreak(room, targetId) {
  if (room.counterGahookStreaks && targetId) {
    delete room.counterGahookStreaks[targetId];
  }
}

function applyCounterGahook(room, defender, attacker, now, options = {}) {
  resetGahookSpam(defender);
  defender.pokeCount = 0;
  let pointsStolen = 0;
  if (LIVE_GAME_PHASES.includes(room.phase)) {
    pointsStolen = GAHOOK_STEAL_POINTS;
    attacker.score = Number(attacker.score || 0) - pointsStolen;
    defender.score = Number(defender.score || 0) + pointsStolen;
  }
  attacker.latestPoke = {
    id: crypto.randomUUID(),
    createdAt: now,
    from: defender.name,
    targetName: attacker.name,
    gahookForm: normaliseGahookForm(defender.gahookForm),
    customGahook: normaliseGahookForm(defender.gahookForm) === "custom" ? publicCustomGahook(defender) : null,
    kind: "counter",
    ultimateStack: 0,
    ultimateUntil: 0,
    scorePenalty: 0,
    pointsStolen,
    message: "COUNTER GAHOOK!"
  };
  const counterPoke = {
    ...attacker.latestPoke,
    pokeId: attacker.latestPoke.id,
    playerId: attacker.id,
    senderPlayerId: defender.id,
    scoreAdjustment: pointsStolen * 2
  };
  if (!options.skipBroadcast) {
    broadcastState(room, { immediate: true });
  }
  return {
    ok: true,
    pokeId: attacker.latestPoke.id,
    kind: "counter",
    countered: true,
    pointsStolen,
    counterPoke
  };
}

function pokePlayer(room, payload, fromName, options = {}) {
  const allowedPhases = options.allowPhases || (options.allowPhase ? [options.allowPhase] : []);
  if (room.phase !== "lobby" && !allowedPhases.includes(room.phase)) {
    return { ok: false, error: "Gahooks are not available right now." };
  }

  const playerId = cleanText(payload?.playerId, 80);
  const player = resolvePlayer(room, playerId);

  if (!player || !player.connected) {
    return { ok: false, error: "That player is not connected." };
  }

  const now = Date.now();
  const specialKind = cleanText(options.kindOverride, 20);
  const messageOverride = cleanText(options.message, 40);
  const isFinalSpecial = specialKind === "congrats" || specialKind === "boo";
  const senderPlayer = options.senderPlayer;
  const gahookForm = normaliseGahookForm(options.gahookForm);
  const customGahook = !isFinalSpecial && gahookForm === "custom" ? publicCustomGahook(senderPlayer) : null;
  let kind = isFinalSpecial ? specialKind : "normal";
  let ultimateStack = 0;
  let ultimateUntil = 0;
  let scorePenalty = 0;
  let pointsStolen = 0;

  if (!isFinalSpecial && senderPlayer?.id && senderPlayer.id !== player.id) {
    if (registerCounterGahook(room, player, senderPlayer, now)) {
      return applyCounterGahook(room, player, senderPlayer, now, options);
    }
  } else if (!isFinalSpecial) {
    clearCounterGahookStreak(room, player.id);
  }

  if (!isFinalSpecial && LIVE_GAME_PHASES.includes(room.phase) && senderPlayer?.id && senderPlayer.id !== player.id) {
    pointsStolen = GAHOOK_STEAL_POINTS;
    player.score = Number(player.score || 0) - pointsStolen;
    senderPlayer.score = Number(senderPlayer.score || 0) + pointsStolen;
  }

  if (specialKind === "congrats") {
    player.congratulationsCount = (player.congratulationsCount || 0) + 1;
    const celebration = registerCongratulationsSpam(player, now, options.senderId);
    const activeUltimateCongrats = (player.ultimateCongratulationsUntil || 0) > now;
    const crowdTriggered = celebration.count >= ULTIMATE_CONGRATS_TRIGGER_COUNT && celebration.senderCount >= ULTIMATE_CONGRATS_MIN_SENDERS;
    const sustainedTriggered = celebration.elapsedMs >= ULTIMATE_CONGRATS_THRESHOLD_MS && celebration.count >= 4;
    if (activeUltimateCongrats || crowdTriggered || sustainedTriggered) {
      kind = "ultimate-congrats";
      if (!activeUltimateCongrats) {
        player.ultimateCongratulationsId = crypto.randomUUID();
        player.ultimateCongratulationsStack = Math.min(ULTIMATE_CONGRATS_MAX_STACK, Math.max(1, celebration.count));
      } else {
        player.ultimateCongratulationsStack = Math.min(ULTIMATE_CONGRATS_MAX_STACK, (player.ultimateCongratulationsStack || 0) + 1);
      }
      player.ultimateCongratulationsUntil = now + ULTIMATE_CONGRATS_GRACE_MS;
      ultimateStack = player.ultimateCongratulationsStack;
      ultimateUntil = player.ultimateCongratulationsUntil;
      scheduleUltimateCongratulationsReset(player, room);
    }
  } else if (!isFinalSpecial) {
    clearExpiredUltimateGahook(player);
    const spam = registerGahookSpam(player, now);
    player.pokeCount = spam.count;
    const activeUltimate = (player.ultimateGahookUntil || 0) > now;
    if (activeUltimate) {
      kind = "ultimate";
      player.ultimateGahookStack = Math.min(ULTIMATE_GAHOOK_MAX_STACK, (player.ultimateGahookStack || 0) + 1);
      ultimateStack = player.ultimateGahookStack;
      if (ultimateStack >= ULTIMATE_GAHOOK_MAX_STACK) {
        kind = "get-got";
        scorePenalty = applyGetGot(room, player);
      } else {
        player.ultimateGahookUntil = now + ULTIMATE_GAHOOK_GRACE_MS;
        ultimateUntil = player.ultimateGahookUntil;
        scheduleUltimateGahookReset(player, room);
      }
    } else if (spam.elapsedMs >= spam.thresholdMs) {
      kind = "ultimate";
      player.ultimateGahookId = crypto.randomUUID();
      player.ultimateGahookUntil = now + ULTIMATE_GAHOOK_GRACE_MS;
      player.ultimateGahookStack = Math.min(ULTIMATE_GAHOOK_MAX_STACK, Math.max(1, spam.count));
      player.ultimateGahookThresholdMs = spam.thresholdMs + ULTIMATE_GAHOOK_THRESHOLD_STEP_MS;
      ultimateStack = player.ultimateGahookStack;
      if (ultimateStack >= ULTIMATE_GAHOOK_MAX_STACK) {
        kind = "get-got";
        scorePenalty = applyGetGot(room, player);
        ultimateUntil = 0;
      } else {
        ultimateUntil = player.ultimateGahookUntil;
        scheduleUltimateGahookReset(player, room);
      }
    }
  }

  player.shamePokes = room.phase === "finished" && specialKind !== "congrats" ? (player.shamePokes || 0) + 1 : player.shamePokes || 0;
  player.latestPoke = {
    id: crypto.randomUUID(),
    senderPlayerId: senderPlayer?.id || cleanText(options.senderId, 80),
    createdAt: now,
    from: cleanText(fromName, 24) || "Someone",
    targetName: player.name,
    gahookForm,
    customGahook,
    kind,
    ultimateStack,
    ultimateUntil,
    scorePenalty,
    pointsStolen,
    message: messageOverride || (kind === "get-got" ? "GET GOT" : "")
  };
  clearWhiteboardForPlayer(room, player.id);

  if (kind === "get-got") {
    room.latestRoomPoke = {
      ...player.latestPoke,
      targetId: player.id,
      targetName: player.name,
      targetAvatarId: player.avatarId,
      targetAvatarImageDataUrl: player.avatarImageDataUrl || ""
    };
  }

  if (!options.skipBroadcast) {
    broadcastState(room, { immediate: true });
  }
  return { ok: true, pokeId: player.latestPoke.id, kind, scorePenalty, pointsStolen };
}

function registerCongratulationsSpam(player, now, senderId = "") {
  const lastAt = player.lastCongratulationsAt || 0;
  if (!lastAt || now - lastAt > ULTIMATE_CONGRATS_SPAM_IDLE_MS) {
    player.congratulationsSpamStartedAt = now;
    player.congratulationsSpamCount = 1;
    player.congratulationsSpamSenderIds = [];
  } else {
    player.congratulationsSpamStartedAt = player.congratulationsSpamStartedAt || lastAt || now;
    player.congratulationsSpamCount = (player.congratulationsSpamCount || 0) + 1;
  }
  if (senderId && !player.congratulationsSpamSenderIds.includes(senderId)) player.congratulationsSpamSenderIds.push(senderId);
  player.lastCongratulationsAt = now;
  return {
    count: player.congratulationsSpamCount,
    senderCount: player.congratulationsSpamSenderIds.length,
    elapsedMs: now - player.congratulationsSpamStartedAt
  };
}

function scheduleUltimateCongratulationsReset(player, room) {
  if (player.ultimateCongratulationsTimer) clearTimeout(player.ultimateCongratulationsTimer);
  const celebrationId = player.ultimateCongratulationsId;
  const playerId = player.id;
  const delay = Math.max(0, (player.ultimateCongratulationsUntil || Date.now()) - Date.now());
  player.ultimateCongratulationsTimer = setTimeout(() => {
    const livePlayer = room.players[playerId];
    if (!livePlayer || livePlayer.ultimateCongratulationsId !== celebrationId) return;
    clearUltimateCongratulationsState(livePlayer, true);
    broadcastState(room, { immediate: true });
  }, delay);
}

function clearUltimateCongratulationsState(player, clearLatest = false) {
  if (player.ultimateCongratulationsTimer) clearTimeout(player.ultimateCongratulationsTimer);
  player.ultimateCongratulationsTimer = null;
  player.ultimateCongratulationsUntil = 0;
  player.ultimateCongratulationsStack = 0;
  player.ultimateCongratulationsId = "";
  player.congratulationsSpamStartedAt = 0;
  player.congratulationsSpamCount = 0;
  player.congratulationsSpamSenderIds = [];
  player.lastCongratulationsAt = 0;
  if (clearLatest && player.latestPoke?.kind === "ultimate-congrats") player.latestPoke = null;
}

function applyGetGot(room, player) {
  let scorePenalty = 0;
  if (LIVE_GAME_PHASES.includes(room.phase)) {
    player.score -= GET_GOT_SCORE_PENALTY;
    scorePenalty = GET_GOT_SCORE_PENALTY;
  }
  if (player.ultimateGahookTimer) {
    clearTimeout(player.ultimateGahookTimer);
  }
  player.ultimateGahookTimer = null;
  player.ultimateGahookUntil = 0;
  player.ultimateGahookStack = 0;
  player.ultimateGahookId = "";
  player.pokeCount = 0;
  resetGahookSpam(player);
  return scorePenalty;
}

function getUltimateGahookThreshold(player) {
  const threshold = Number(player.ultimateGahookThresholdMs || 0);
  return threshold >= ULTIMATE_GAHOOK_BASE_THRESHOLD_MS ? threshold : ULTIMATE_GAHOOK_BASE_THRESHOLD_MS;
}

function registerGahookSpam(player, now) {
  const lastAt = player.lastGahookAt || 0;
  if (!lastAt || now - lastAt > ULTIMATE_GAHOOK_SPAM_IDLE_MS) {
    player.gahookSpamStartedAt = now;
    player.gahookSpamCount = 1;
  } else {
    player.gahookSpamStartedAt = player.gahookSpamStartedAt || lastAt || now;
    player.gahookSpamCount = (player.gahookSpamCount || 0) + 1;
  }
  player.lastGahookAt = now;
  const thresholdMs = getUltimateGahookThreshold(player);
  return {
    count: player.gahookSpamCount || 1,
    elapsedMs: now - (player.gahookSpamStartedAt || now),
    thresholdMs
  };
}

function resetGahookSpam(player) {
  player.gahookSpamStartedAt = 0;
  player.gahookSpamCount = 0;
  player.lastGahookAt = 0;
}

function resetUltimateGahookThreshold(player) {
  player.ultimateGahookThresholdMs = ULTIMATE_GAHOOK_BASE_THRESHOLD_MS;
}

function scheduleUltimateGahookReset(player, room) {
  if (player.ultimateGahookTimer) {
    clearTimeout(player.ultimateGahookTimer);
  }
  const ultimateId = player.ultimateGahookId;
  const playerId = player.id;
  const delay = Math.max(0, (player.ultimateGahookUntil || Date.now()) - Date.now());
  player.ultimateGahookTimer = setTimeout(() => {
    finishUltimateGahook(room, playerId, ultimateId);
  }, delay);
}

function finishUltimateGahook(room, playerId, ultimateId) {
  const player = room.players[playerId];
  if (!player || player.ultimateGahookId !== ultimateId) {
    return;
  }
  clearUltimateGahookState(player, true);
  broadcastState(room, { immediate: true });
}

function clearExpiredUltimateGahook(player) {
  if ((player.ultimateGahookUntil || 0) > 0 && player.ultimateGahookUntil <= Date.now()) {
    clearUltimateGahookState(player, true);
  }
}

function clearUltimateGahookState(player, resetCounter = false) {
  if (player.ultimateGahookTimer) {
    clearTimeout(player.ultimateGahookTimer);
  }
  player.ultimateGahookTimer = null;
  player.ultimateGahookUntil = 0;
  player.ultimateGahookStack = 0;
  player.ultimateGahookId = "";
  resetGahookSpam(player);
  if (resetCounter) {
    player.pokeCount = 0;
    player.latestPoke = null;
  }
}

function submitQuestion(room, payload) {
  const player = getPayloadPlayer(room, payload);
  if (!player) {
    return { ok: false, error: "Join the lobby before adding questions." };
  }
  if (room.phase !== "building") {
    return { ok: false, error: room.phase === "lobby" ? "Wait for the host to lock in the game options." : "Questions are locked once the quiz starts." };
  }
  if (countQuestionSlotsForPlayer(room, player.id) >= room.maxQuestionsPerPlayer) {
    return { ok: false, error: "You already added enough questions." };
  }

  try {
    const question = normaliseQuestion(room, payload, player);
    if (room.approveQuestions) {
      room.pendingQuestions.push(question);
    } else {
      room.questions.push(question);
    }
    player.questionsSubmitted = countQuestionsForPlayer(room, player.id);
    broadcastState(room, { immediate: true });
    return { ok: true, questionId: question.id, pending: room.approveQuestions };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function editQuestion(room, payload) {
  const player = getPayloadPlayer(room, payload);
  if (!player) {
    return { ok: false, error: "Join the lobby before editing questions." };
  }
  if (room.phase !== "building") {
    return { ok: false, error: "Questions can only be edited while players are making them." };
  }

  const questionId = cleanText(payload?.questionId, 80);
  const submittedIndex = room.questions.findIndex((question) => question.id === questionId && question.authorId === player.id);
  const pendingIndex = room.pendingQuestions.findIndex((question) => question.id === questionId && question.authorId === player.id);
  if (submittedIndex < 0 && pendingIndex < 0) {
    return { ok: false, error: "That question is not yours to edit." };
  }

  const original = submittedIndex >= 0 ? room.questions[submittedIndex] : room.pendingQuestions[pendingIndex];
  try {
    const edited = {
      ...normaliseQuestion(room, payload, player),
      id: original.id,
      createdAt: original.createdAt,
      editedAt: Date.now()
    };

    if (room.approveQuestions) {
      if (submittedIndex >= 0) room.questions.splice(submittedIndex, 1);
      if (pendingIndex >= 0) {
        room.pendingQuestions.splice(pendingIndex, 1, edited);
      } else {
        room.pendingQuestions.push(edited);
      }
    } else if (submittedIndex >= 0) {
      room.questions.splice(submittedIndex, 1, edited);
    } else {
      room.pendingQuestions.splice(pendingIndex, 1);
      room.questions.push(edited);
    }

    player.ready = false;
    player.questionsSubmitted = countQuestionsForPlayer(room, player.id);
    broadcastState(room, { immediate: true });
    return { ok: true, pending: room.approveQuestions, question: publicEditableQuestion(room, edited, room.approveQuestions ? "pending" : "submitted") };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function setReady(room, payload) {
  const player = getPayloadPlayer(room, payload);
  if (!player) {
    return { ok: false, error: "Join the lobby before readying up." };
  }
  if (room.phase !== "building") {
    return { ok: false, error: room.phase === "lobby" ? "Question making has not started yet." : "The quiz is already running." };
  }

  const ready = Boolean(payload?.ready);
  if (ready && countQuestionsForPlayer(room, player.id) < room.maxQuestionsPerPlayer) {
    return { ok: false, error: "Add your required questions before marking ready." };
  }
  if (ready && countPendingQuestionsForPlayer(room, player.id) > 0) {
    return { ok: false, error: "Wait for the host to approve your questions first." };
  }

  player.ready = ready;
  player.questionsSubmitted = countQuestionsForPlayer(room, player.id);
  broadcastState(room, { immediate: true });
  return { ok: true };
}

function updatePlayerName(room, payload) {
  const player = getPayloadPlayer(room, payload);
  const name = cleanText(payload?.name, 24);
  if (!player) {
    return { ok: false, error: "Join the game before changing your name." };
  }
  if (!name) {
    return { ok: false, error: "Enter a name first." };
  }

  player.name = name;
  broadcastState(room, { immediate: true });
  return { ok: true, player: publicPlayer(room, player) };
}

function updatePlayerProfile(room, payload) {
  const player = getPayloadPlayer(room, payload);
  const name = cleanText(payload?.name, 24);
  if (!player) {
    return { ok: false, error: "Join the game before changing your profile." };
  }
  if (!name) {
    return { ok: false, error: "Enter a name first." };
  }

  const avatarId = normaliseAvatarId(payload?.avatarId);
  if (room.allowCustomProfiles === false && cleanText(payload?.avatarImageDataUrl, 40)) {
    return { ok: false, error: "Custom profile pictures are disabled in this room." };
  }
  const avatarImageDataUrl = room.allowCustomProfiles === false ? "" : validateAvatarImage(room, payload?.avatarImageDataUrl);
  player.name = name;
  player.avatarId = avatarId;
  player.avatarImageDataUrl = avatarImageDataUrl;

  [...room.questions, ...room.pendingQuestions, ...room.quizQuestions].forEach((question) => {
    if (question.authorId !== player.id) return;
    question.authorName = name;
    question.authorAvatarId = avatarId;
    question.authorAvatarImageDataUrl = avatarImageDataUrl;
  });

  broadcastState(room, { immediate: true });
  return { ok: true, player: publicPlayer(room, player) };
}

function updatePlayerCustomGahook(room, payload) {
  const player = getPayloadPlayer(room, payload);
  if (!player) {
    return { ok: false, error: "Join the game before creating a custom Gahook." };
  }
  if (room.allowCustomGahooks === false) {
    return { ok: false, error: "Custom Gahooks are disabled in this room." };
  }
  if (room.phase !== "lobby" && room.phase !== "building") {
    return { ok: false, error: "Custom Gahooks can be edited while the room is waiting." };
  }
  pruneRoomMedia(room);
  let customGahook;
  try {
    customGahook = normaliseCustomGahook(room, payload?.customGahook, player.customGahook);
  } catch (error) {
    pruneRoomMedia(room);
    return { ok: false, error: error.message || "That custom Gahook is not valid." };
  }
  player.customGahook = customGahook;
  pruneRoomMedia(room);
  broadcastState(room, { immediate: true });
  return { ok: true, customGahook: publicCustomGahook(player), gahookForm: normaliseGahookForm(player.gahookForm) };
}

function postRoomChat(room, payload) {
  const auth = getSocialActor(room, payload);
  if (!auth.ok) return auth;
  const result = addChatMessage(room, auth.actor, payload?.text, auth.rateKey);
  if (result.ok) broadcastState(room, { immediate: true });
  return result;
}

function postRoomWhiteboardStroke(room, payload) {
  const auth = getSocialActor(room, payload);
  if (!auth.ok) return auth;
  const result = addWhiteboardStroke(room, auth.actor, payload?.stroke, auth.rateKey);
  if (result.ok) broadcastState(room, { immediate: true });
  return result;
}

function clearRoomWhiteboard(room, payload) {
  const auth = getSocialActor(room, payload);
  if (!auth.ok) return auth;
  const result = clearWhiteboard(room, auth.actor, auth.rateKey);
  if (result.ok) broadcastState(room, { immediate: true });
  return result;
}

function getSocialActor(room, payload) {
  const playerKey = cleanText(payload?.playerKey, 80);
  const player = getPlayerByCredential(room, playerKey);
  if (player) return { ok: true, actor: player, rateKey: playerKey };
  if (isHostCredential(room, playerKey)) {
    return {
      ok: true,
      actor: { id: "host", name: "Host", avatarId: "crown", avatarImageDataUrl: "" },
      rateKey: playerKey
    };
  }
  return { ok: false, error: "Join the room before using its chat or whiteboard." };
}

function updatePlayerGahookForm(room, payload) {
  const player = getPayloadPlayer(room, payload);
  if (!player) {
    return { ok: false, error: "Join the game before choosing a Gahook." };
  }
  const requestedForm = normaliseGahookForm(payload?.gahookForm);
  if (requestedForm === "custom" && room.allowCustomGahooks === false) {
    return { ok: false, error: "Custom Gahooks are disabled in this room." };
  }
  player.gahookForm = requestedForm;
  broadcastState(room, { immediate: true });
  return { ok: true, gahookForm: player.gahookForm };
}

function updateHostSettings(room, payload) {
  if (room.phase !== "lobby") {
    return { ok: false, error: "Settings are locked once the quiz starts." };
  }

  const nextMode = normaliseGameMode(payload?.gameMode, room.gameMode);
  if (nextMode !== room.gameMode) {
    room.gameMode = nextMode;
    room.questions = [];
    room.pendingQuestions = [];
    room.quizQuestions = [];
    Object.values(room.players).forEach((player) => {
      player.ready = false;
      player.questionsSubmitted = 0;
    });
  }

  const hasPreset = Object.prototype.hasOwnProperty.call(payload || {}, "roundPreset") ||
    Object.prototype.hasOwnProperty.call(payload || {}, "questionPreset");
  const hasCustomLimit = Object.prototype.hasOwnProperty.call(payload || {}, "maxQuestionsPerPlayer");
  const presetValue = payload?.roundPreset ?? payload?.questionPreset;
  const nextPreset = hasPreset ?
    normaliseRoundPreset(presetValue, room.roundPreset) :
    hasCustomLimit ? "custom" : normaliseRoundPreset(room.roundPreset, DEFAULT_ROUND_PRESET);
  room.roundPreset = nextPreset;
  const nextLimit = questionsPerPlayerForPreset(room, nextPreset, payload?.maxQuestionsPerPlayer);
  room.maxQuestionsPerPlayer = nextLimit;
  const keptByPlayer = {};
  room.questions = room.questions.filter((question) => {
    const nextCount = (keptByPlayer[question.authorId] || 0) + 1;
    if (nextCount > nextLimit) return false;
    keptByPlayer[question.authorId] = nextCount;
    return true;
  });
  const pendingKeptByPlayer = {};
  room.pendingQuestions = room.pendingQuestions.filter((question) => {
    const approvedCount = keptByPlayer[question.authorId] || 0;
    pendingKeptByPlayer[question.authorId] = (pendingKeptByPlayer[question.authorId] || 0) + 1;
    return approvedCount + pendingKeptByPlayer[question.authorId] <= nextLimit;
  });
  if (typeof payload?.approveQuestions === "boolean") {
    const wasApproving = room.approveQuestions;
    room.approveQuestions = Boolean(payload.approveQuestions);
    if (wasApproving && !room.approveQuestions) {
      const stillPending = [];
      room.pendingQuestions.forEach((question) => {
        if (countQuestionsForPlayer(room, question.authorId) < room.maxQuestionsPerPlayer) {
          room.questions.push(question);
        } else {
          stillPending.push(question);
        }
      });
      room.pendingQuestions = stillPending;
    }
  }
  if (typeof payload?.allowCustomProfiles === "boolean") {
    room.allowCustomProfiles = payload.allowCustomProfiles;
    if (!room.allowCustomProfiles) {
      Object.values(room.players).forEach(player => { player.avatarImageDataUrl = ""; });
    }
  }
  if (typeof payload?.allowCustomGahooks === "boolean") {
    room.allowCustomGahooks = payload.allowCustomGahooks;
    if (!room.allowCustomGahooks) {
      Object.values(room.players).forEach(player => {
        if (normaliseGahookForm(player.gahookForm) === "custom") player.gahookForm = "monkey";
      });
    }
  }
  if (payload?.promptStyle === "fun" || payload?.promptStyle === "education") {
    room.promptStyle = payload.promptStyle;
  }
  Object.values(room.players).forEach((player) => {
    player.questionsSubmitted = countQuestionsForPlayer(room, player.id);
    if (countQuestionsForPlayer(room, player.id) < room.maxQuestionsPerPlayer || countPendingQuestionsForPlayer(room, player.id) > 0) {
      player.ready = false;
    }
  });
  broadcastState(room, { immediate: true });
  return {
    ok: true,
    roundPreset: room.roundPreset,
    maxQuestionsPerPlayer: room.maxQuestionsPerPlayer,
    plannedTotalQuestions: plannedQuestionCount(room),
    estimatedDurationMs: estimatedGameDurationMs(room),
    approveQuestions: room.approveQuestions,
    gameMode: room.gameMode,
    allowCustomProfiles: room.allowCustomProfiles !== false,
    allowCustomGahooks: room.allowCustomGahooks !== false,
    promptStyle: room.promptStyle || "fun"
  };
}

function lockSetup(room, payload) {
  if (room.phase !== "lobby") {
    return { ok: false, error: "Game options are already locked." };
  }

  const activePlayers = Object.values(room.players).filter((player) => player.connected);
  const hostWillPlay = Boolean(payload?.hostWillPlay || getPlayerByCredential(room, room.hostKey));
  if (activePlayers.length === 0 && !hostWillPlay) {
    return { ok: false, error: "Wait for a player to join, or choose to join as a player." };
  }

  if (room.roundPreset !== "custom") {
    room.maxQuestionsPerPlayer = questionsPerPlayerForPreset(room, room.roundPreset);
  }

  room.phase = "building";
  room.phaseEndsAt = null;
  Object.values(room.players).forEach((player) => {
    player.ready = false;
    player.questionsSubmitted = 0;
  });
  broadcastState(room, { immediate: true });
  return { ok: true, phase: room.phase };
}

function kickPlayer(room, payload, options = {}) {
  const requestedPlayerId = cleanText(payload?.playerId, 80);
  const kickedPlayer = resolvePlayer(room, requestedPlayerId);
  if (!kickedPlayer) {
    return { ok: false, error: "Choose a player to kick." };
  }
  const playerId = kickedPlayer.id;
  if (getCredentialForPlayer(room, playerId) === room.hostKey && !options.allowHostKick) {
    return { ok: false, error: "Give host to someone else before kicking the host." };
  }

  const activeGamePhase = ["reading", "answering", "ranking", "reveal"].includes(room.phase);
  const currentIndex = room.game.currentQuestionIndex;
  const currentQuestion = getCurrentQuestion(room);
  const removedCurrentQuestion = activeGamePhase && currentQuestion?.authorId === playerId;
  const removedBeforeCurrent = activeGamePhase ?
  room.quizQuestions.slice(0, Math.max(0, currentIndex)).filter((question) => question.authorId === playerId).length :
  0;

  const kickedCredential = getCredentialForPlayer(room, playerId);
  room.bannedPlayers[playerId] = {
    id: kickedPlayer.id,
    name: kickedPlayer.name,
    avatarId: kickedPlayer.avatarId,
    avatarImageDataUrl: kickedPlayer.avatarImageDataUrl || "",
    kickedAt: Date.now(),
    credential: kickedCredential
  };
  clearUltimateGahookState(kickedPlayer);
  clearUltimateCongratulationsState(kickedPlayer, true);
  unregisterPlayerCredential(room, playerId, { ban: true });
  delete room.players[playerId];
  room.questions = room.questions.filter((question) => question.authorId !== playerId);
  room.pendingQuestions = room.pendingQuestions.filter((question) => question.authorId !== playerId);
  room.quizQuestions = room.quizQuestions.filter((question) => question.authorId !== playerId);
  delete room.game.answers[playerId];
  delete room.game.rankings?.[playerId];
  delete room.voteKicks[playerId];
  Object.values(room.voteKicks).forEach((votes) => delete votes[playerId]);

  if (activeGamePhase && room.game.firstAnswerPlayerId === playerId) {
    room.game.firstAnswerPlayerId = null;
  }
  if (activeGamePhase) {
    const nextIndex = Math.max(0, currentIndex - removedBeforeCurrent);
    if (removedCurrentQuestion || currentIndex >= room.quizQuestions.length) {
      beginQuestion(room, Math.min(nextIndex, room.quizQuestions.length));
      return { ok: true };
    }
    room.game.currentQuestionIndex = nextIndex;
    if (room.phase === "answering" && allActivePlayersAnswered(room)) {
      windowedTransitionAfterAnswers(room);
    } else if (room.phase === "ranking" && allActivePlayersRanked(room)) {
      windowedTransitionToReveal(room);
    }
  }

  broadcastState(room, { immediate: true });
  return { ok: true };
}

function unbanPlayer(room, payload) {
  const playerId = cleanText(payload?.playerId, 80);
  if (!playerId || !room.bannedPlayers[playerId]) {
    return { ok: false, error: "Choose a banned player to unban." };
  }
  const bannedPlayer = room.bannedPlayers[playerId];
  unbanPlayerCredential(room, bannedPlayer.credential);
  delete room.bannedPlayers[playerId];
  broadcastState(room, { immediate: true });
  return { ok: true };
}

function transferHost(room, payload) {
  const playerId = cleanText(payload?.playerId, 80);
  const player = resolvePlayer(room, playerId);
  if (!player) {
    return { ok: false, error: "Choose a player to make host." };
  }
  if (!player.connected) {
    return { ok: false, error: "That player needs to be connected before becoming host." };
  }
  room.hostKey = getCredentialForPlayer(room, player.id);
  broadcastState(room, { immediate: true });
  return { ok: true, playerId: player.id };
}

function randomizePlayerIdentity(room, payload) {
  const playerId = cleanText(payload?.playerId, 80);
  const player = resolvePlayer(room, playerId);
  if (!player) {
    return { ok: false, error: "Choose a player to randomize." };
  }
  const avatarChoices = AVATAR_PRESETS.filter((avatarId) => avatarId !== player.avatarId);
  const nameChoices = SAFE_PLAYER_NAMES.filter((name) => name !== player.name);
  const nextAvatar = avatarChoices[crypto.randomInt(0, avatarChoices.length)];
  const nextName = nameChoices[crypto.randomInt(0, nameChoices.length)];
  player.name = nextName;
  player.avatarId = nextAvatar;
  player.avatarImageDataUrl = "";
  [room.questions, room.pendingQuestions, room.quizQuestions].forEach((questions) => {
    questions.forEach((question) => {
      if (question.authorId === player.id) {
        question.authorName = nextName;
        question.authorAvatarId = nextAvatar;
        question.authorAvatarImageDataUrl = "";
      }
    });
  });
  broadcastState(room, { immediate: true });
  return { ok: true, name: nextName, avatarId: nextAvatar };
}

function exitHostAsPlayer(room) {
  if (room.phase !== "lobby" && room.phase !== "building") {
    return { ok: false, error: "Reset the lobby before exiting as a player." };
  }
  const player = getPlayerByCredential(room, room.hostKey);
  if (!player) {
    return { ok: true, removed: false };
  }

  const playerId = player.id;
  clearUltimateGahookState(player);
  clearUltimateCongratulationsState(player, true);
  room.questions = room.questions.filter((question) => question.authorId !== playerId);
  room.pendingQuestions = room.pendingQuestions.filter((question) => question.authorId !== playerId);
  room.quizQuestions = room.quizQuestions.filter((question) => question.authorId !== playerId);
  delete room.game.answers[playerId];
  delete room.voteKicks[playerId];
  Object.values(room.voteKicks).forEach((votes) => delete votes[playerId]);
  unregisterPlayerCredential(room, playerId);
  delete room.players[playerId];
  broadcastState(room, { immediate: true });
  return { ok: true, removed: true, playerId };
}

function approveQuestion(room, payload) {
  if (room.phase !== "building") {
    return { ok: false, error: "Question approvals are only available while players are making questions." };
  }
  const questionId = cleanText(payload?.questionId, 80);
  const index = room.pendingQuestions.findIndex((question) => question.id === questionId);
  if (index < 0) {
    return { ok: false, error: "That pending question is gone." };
  }
  const [question] = room.pendingQuestions.splice(index, 1);
  if (countQuestionsForPlayer(room, question.authorId) >= room.maxQuestionsPerPlayer) {
    room.pendingQuestions.splice(index, 0, question);
    return { ok: false, error: "That player already has enough approved questions." };
  }
  room.questions.push(question);
  const player = room.players[question.authorId];
  if (player) {
    player.questionsSubmitted = countQuestionsForPlayer(room, player.id);
    if (player.questionsSubmitted < room.maxQuestionsPerPlayer) {
      player.ready = false;
    }
  }
  broadcastState(room, { immediate: true });
  return { ok: true };
}

function rejectQuestion(room, payload) {
  if (room.phase !== "building") {
    return { ok: false, error: "Question approvals are only available while players are making questions." };
  }
  const questionId = cleanText(payload?.questionId, 80);
  const index = room.pendingQuestions.findIndex((question) => question.id === questionId);
  if (index < 0) {
    return { ok: false, error: "That pending question is gone." };
  }
  const [question] = room.pendingQuestions.splice(index, 1);
  const player = room.players[question.authorId];
  if (player) {
    player.ready = false;
    player.questionsSubmitted = countQuestionsForPlayer(room, player.id);
  }
  broadcastState(room, { immediate: true });
  return { ok: true };
}

function submitAnswer(room, payload) {
  const player = getPayloadPlayer(room, payload);
  if (!player) {
    return { ok: false, error: "Join the lobby before answering." };
  }
  if (room.phase !== "answering") {
    return { ok: false, error: "Answers are not open right now." };
  }
  if (room.game.answers[player.id]) {
    return { ok: false, error: "Answer already locked." };
  }

  const question = getCurrentQuestion(room);
  const mode = question?.mode || room.gameMode || DEFAULT_GAME_MODE;

  if (mode === "herd") {
    return submitHerdAnswer(room, payload, player);
  }

  const answerId = cleanText(payload?.answerId, 20);
  const selected = question?.answers.find((answer) => answer.id === answerId);
  if (!selected) {
    return { ok: false, error: "That answer does not exist." };
  }

  if (mode === "oddball") {
    if (!room.game.firstAnswerPlayerId) {
      room.game.firstAnswerPlayerId = player.id;
    }

    room.game.answers[player.id] = {
      answerId,
      oddball: null,
      points: null,
      answeredAt: Date.now()
    };

    broadcastState(room, { immediate: true });
    if (allActivePlayersAnswered(room)) {
      windowedTransitionAfterAnswers(room);
    }
    return { ok: true, answerId };
  }

  const elapsedMs = clamp(Date.now() - room.game.answerOpenedAt, 0, ANSWERING_MS);
  const correct = selected.correct;
  const points = quizPoints(correct, elapsedMs, ANSWERING_MS);

  if (!room.game.firstAnswerPlayerId) {
    room.game.firstAnswerPlayerId = player.id;
  }

  player.score += points;
  room.game.answers[player.id] = {
    answerId,
    correct,
    points,
    elapsedMs,
    answeredAt: Date.now()
  };

  broadcastState(room, { immediate: true });

  if (allActivePlayersAnswered(room)) {
    windowedTransitionAfterAnswers(room);
  }

  return { ok: true, correct, points };
}

function submitHerdAnswer(room, payload, player) {
  const answerText = cleanText(payload?.answerText, HERD_ANSWER_MAX);
  const normalizedAnswer = normaliseHerdAnswer(answerText);
  if (!answerText || !normalizedAnswer) {
    return { ok: false, error: "Type an answer first." };
  }
  const imageDataUrl = validateImage(room, payload?.imageDataUrl);

  if (!room.game.firstAnswerPlayerId) {
    room.game.firstAnswerPlayerId = player.id;
  }

  room.game.answers[player.id] = {
    id: "herd-answer-" + player.id,
    answerText,
    normalizedAnswer,
    imageDataUrl,
    points: null,
    answeredAt: Date.now()
  };

  broadcastState(room, { immediate: true });
  if (allActivePlayersAnswered(room)) {
    windowedTransitionAfterAnswers(room);
  }
  return { ok: true, answerText, imageDataUrl };
}

function herdAnswerEntries(room) {
  return Object.entries(room.game.answers || {}).
  filter(([playerId, answer]) => Boolean(room.players[playerId] && answer?.answerText)).
  map(([playerId, answer]) => ({
    id: answer.id || "herd-answer-" + playerId,
    playerId,
    text: answer.answerText,
    imageDataUrl: answer.imageDataUrl || "",
    normalizedAnswer: answer.normalizedAnswer || normaliseHerdAnswer(answer.answerText)
  }));
}

function allActivePlayersRanked(room) {
  const activePlayers = Object.values(room.players).filter((player) => player.connected);
  return activePlayers.length > 0 && activePlayers.every((player) => room.game.rankings?.[player.id]);
}

function submitHerdRanking(room, payload) {
  const player = getPayloadPlayer(room, payload);
  if (!player) return { ok: false, error: "Join the game before ranking answers." };
  if (room.phase !== "ranking" || (getCurrentQuestion(room)?.mode || room.gameMode) !== "herd") {
    return { ok: false, error: "Herd rankings are not open right now." };
  }
  if (room.game.rankings?.[player.id]) return { ok: false, error: "Ranking already locked." };

  const validIds = herdAnswerEntries(room).map((answer) => answer.id);
  const requiredPickCount = Math.min(3, validIds.length);
  const incomingIds = Array.isArray(payload?.answerIds) ? payload.answerIds.map((id) => cleanText(id, 100)) : [];
  if (incomingIds.length !== requiredPickCount || new Set(incomingIds).size !== requiredPickCount || incomingIds.some((id) => !validIds.includes(id))) {
    return { ok: false, error: requiredPickCount === 3 ? "Choose exactly three answers." : "Choose every available answer." };
  }

  room.game.rankings = room.game.rankings || {};
  room.game.rankings[player.id] = {
    playerId: player.id,
    answerIds: incomingIds,
    submittedAt: Date.now(),
    autoSubmitted: false
  };
  broadcastState(room, { immediate: true });
  if (allActivePlayersRanked(room)) windowedTransitionToReveal(room);
  return { ok: true };
}

function ensureMissingHerdRankings(room) {
  room.game.rankings = room.game.rankings || {};
  Object.values(room.players).filter((player) => player.connected).forEach((player) => {
    if (!room.game.rankings[player.id]) {
      room.game.rankings[player.id] = {
        playerId: player.id,
        answerIds: [],
        submittedAt: Date.now(),
        autoSubmitted: true
      };
    }
  });
}

function scoreHerdRound(room) {
  const question = getCurrentQuestion(room);
  if (!question || question.herdScored) return;
  ensureMissingHerdRankings(room);
  const result = buildHerdRankingResults({
    answers: herdAnswerEntries(room),
    rankings: Object.values(room.game.rankings || {})
  });
  result.playerResults.forEach((playerResult) => {
    const player = room.players[playerResult.playerId];
    if (player) player.score += playerResult.totalPoints;
    if (room.game.answers[playerResult.playerId]) {
      room.game.answers[playerResult.playerId].points = playerResult.totalPoints;
      room.game.answers[playerResult.playerId].herdBreakdown = playerResult;
    }
  });
  question.herdScored = true;
  question.herdResults = result;
}

function scoreOddballRound(room) {
  const question = getCurrentQuestion(room);
  if (!question || question.oddballScored) {
    return;
  }

  const groupsByAnswer = {};
  question.answers.forEach((answer) => {
    groupsByAnswer[answer.id] = {
      answerId: answer.id,
      label: answer.label,
      color: answer.color,
      shape: answer.shape,
      text: answer.text,
      playerIds: []
    };
  });

  Object.entries(room.game.answers).forEach(([playerId, answer]) => {
    if (groupsByAnswer[answer.answerId]) {
      groupsByAnswer[answer.answerId].playerIds.push(playerId);
    }
  });

  const answeredGroups = Object.values(groupsByAnswer).
  filter((group) => group.playerIds.length > 0).
  map((group) => ({ ...group, count: group.playerIds.length })).
  sort((a, b) => a.count - b.count || a.text.localeCompare(b.text));
  const lowCount = answeredGroups[0]?.count || 0;
  const winningAnswerIds = new Set(answeredGroups.filter((group) => group.count === lowCount).map((group) => group.answerId));

  Object.entries(room.game.answers).forEach(([playerId, answer]) => {
    const player = room.players[playerId];
    const oddball = Boolean(answer.answerId && winningAnswerIds.has(answer.answerId));
    const solo = oddball && lowCount === 1;
    const points = oddball ? ODDBALL_POINTS + (solo ? ODDBALL_SOLO_BONUS : 0) : 0;
    answer.oddball = oddball;
    answer.solo = solo;
    answer.points = points;
    if (player && points) {
      player.score += points;
    }
  });

  question.oddballScored = true;
  question.oddballResults = {
    groups: Object.values(groupsByAnswer).
    map((group) => ({ ...group, count: group.playerIds.length })).
    sort((a, b) => a.count - b.count || a.text.localeCompare(b.text)),
    lowCount,
    winnerIds: Object.entries(room.game.answers).
    filter(([_playerId, answer]) => answer.oddball).
    map(([playerId]) => playerId)
  };
}

function validQuestionVoteEntries(question) {
  return Object.entries(question?.votes || {}).filter(([_playerId, value]) => value === 1 || value === -1);
}

function voteQuestion(room, payload) {
  const player = getPayloadPlayer(room, payload);
  if (!player) {
    return { ok: false, error: "Join the game before voting." };
  }
  if (!player.connected) {
    return { ok: false, error: "Reconnect before voting." };
  }
  if (room.phase !== "reveal") {
    return { ok: false, error: "Voting opens after answers are revealed." };
  }

  const question = getCurrentQuestion(room);
  if (!question) {
    return { ok: false, error: "No question to vote on." };
  }
  if (typeof payload?.good !== "boolean") {
    return { ok: false, error: "Choose Good or Nah before voting." };
  }

  question.votes = question.votes || {};
  question.votes[player.id] = payload.good === true ? 1 : -1;
  if (!room.paused && (question.mode || room.gameMode) !== "herd" && allConnectedPlayersVoted(room, question)) {
    scheduleVoteAdvance(room, question);
    return { ok: true };
  }
  broadcastState(room, { immediate: true });
  return { ok: true };
}

function allConnectedPlayersVoted(room, question) {
  const activePlayers = Object.values(room.players).filter((candidate) => candidate.connected);
  const voterIds = new Set(validQuestionVoteEntries(question).map(([playerId]) => playerId));
  return activePlayers.length > 0 && activePlayers.every((candidate) => voterIds.has(candidate.id));
}

function scheduleVoteAdvance(room, question) {
  if (room.game.voteAdvanceQuestionId === question.id) return;
  clearPhaseTimer(room);
  room.game.voteAdvanceQuestionId = question.id;
  room.game.waitingForProgress = false;
  room.phaseEndsAt = Date.now() + 300;
  broadcastState(room, { immediate: true });
  room.phaseTimer = setTimeout(() => {
    if (room.phase !== "reveal" || getCurrentQuestion(room)?.id !== question.id || !allConnectedPlayersVoted(room, question)) return;
    room.game.voteAdvanceQuestionId = "";
    beginQuestion(room, room.game.currentQuestionIndex + 1);
  }, 300);
}

function makeLobby(code = generateRoomCode()) {
  return initialiseRoomSocial(initialiseRoomMedia(initialiseRoomAuth({
    code: normaliseRoomCode(code) || generateRoomCode(),
    hostKey: "",
    phase: "lobby",
    phaseEndsAt: null,
    phaseTimer: null,
    paused: false,
    pausedAt: null,
    pausedRemainingMs: 0,
    pausedWaitingForProgress: false,
    stateVersion: 0,
    broadcastTimer: null,
    expireTimer: null,
    hadLiveClient: false,
    hadHostLiveClient: false,
    passwordHash: "",
    passwordSalt: "",
    gameMode: DEFAULT_GAME_MODE,
    approveQuestions: false,
    allowCustomProfiles: true,
    allowCustomGahooks: true,
    promptStyle: "fun",
    roundPreset: DEFAULT_ROUND_PRESET,
    maxQuestionsPerPlayer: DEFAULT_QUESTIONS_PER_PLAYER,
    players: {},
    bannedPlayers: {},
    voteKicks: {},
    counterGahookStreaks: {},
    latestRoomPoke: null,
    questions: [],
    pendingQuestions: [],
    quizQuestions: [],
    game: {
      currentQuestionIndex: -1,
      answerOpenedAt: null,
      answers: {},
      rankings: {},
      herdRankingOrder: [],
      firstAnswerPlayerId: null,
      pokeUses: {},
      progressReady: {},
      waitingForProgress: false,
      progressSettleTimer: null,
      progressFallbackTimer: null,
      eligiblePlayerIds: null,
      playedQuestionIds: []
    }
  })));
}

function generateRoomCode() {
  const shuffled = shuffle([...FUNNY_CODES]);
  const available = shuffled.find((code) => !lobbies.has(code));
  if (available) {
    return available;
  }

  for (let attempt = 0; attempt < 200; attempt += 1) {
    const code = Array.from({ length: 4 }, () => String.fromCharCode(65 + crypto.randomInt(0, 26))).join("");
    if (!lobbies.has(code)) {
      return code;
    }
  }

  return crypto.randomUUID().slice(0, 4).toUpperCase();
}

function normaliseRoomCode(value) {
  const code = String(value ?? "").
  replace(/[^a-z]/gi, "").
  slice(0, 4).
  toUpperCase();
  return code.length === 4 ? code : "";
}

function normaliseGameMode(value, fallback = DEFAULT_GAME_MODE) {
  const mode = cleanText(value, 20).toLowerCase();
  return GAME_MODES.includes(mode) ? mode : fallback;
}

function cleanHost(value) {
  const host = String(value || "").trim();
  return /^[a-z0-9.:-]+$/i.test(host) ? host : "";
}

function cleanText(value, maxLength = 180) {
  return String(value ?? "").
  replace(/\s+/g, " ").
  trim().
  slice(0, maxLength);
}

function cleanPassword(value) {
  return String(value ?? "").trim().slice(0, 80);
}

function roomHasPassword(room) {
  return Boolean(room?.passwordHash);
}

function setRoomPassword(room, password) {
  room.passwordSalt = crypto.randomBytes(16).toString("hex");
  room.passwordHash = hashRoomPassword(password, room.passwordSalt);
}

function hashRoomPassword(password, salt) {
  return crypto.createHash("sha256").update(String(salt || "") + "\n" + String(password || "")).digest("hex");
}

function verifyRoomPassword(room, password) {
  if (!roomHasPassword(room)) {
    return true;
  }
  if (!password) {
    return false;
  }
  const incoming = hashRoomPassword(password, room.passwordSalt);
  const expected = room.passwordHash || "";
  return incoming.length === expected.length && crypto.timingSafeEqual(Buffer.from(incoming), Buffer.from(expected));
}

function normaliseAvatarId(value) {
  const avatarId = cleanText(value, 20).toLowerCase();
  return AVATAR_PRESETS.includes(avatarId) ? avatarId : AVATAR_PRESETS[0];
}

function normaliseGahookForm(value) {
  const form = cleanText(value, 20).toLowerCase();
  return GAHOOK_FORMS.includes(form) ? form : GAHOOK_FORMS[0];
}

function normaliseRoundPreset(value, fallback = DEFAULT_ROUND_PRESET) {
  const preset = cleanText(value, 20).toLowerCase();
  return ROUND_PRESETS.includes(preset) ? preset : ROUND_PRESETS.includes(fallback) ? fallback : DEFAULT_ROUND_PRESET;
}

function connectedSetupPlayerCount(room) {
  return Object.values(room.players || {}).filter((player) => player.connected).length;
}

function setupPlayerCount(room) {
  return Math.max(1, connectedSetupPlayerCount(room));
}

function standardQuestionsPerPlayer(playerCount) {
  return clamp(Math.floor(STANDARD_MAX_ROUNDS / Math.max(1, playerCount)), 1, 3);
}

function questionsPerPlayerForPreset(room, preset = room.roundPreset, customLimit = room.maxQuestionsPerPlayer) {
  const normalisedPreset = normaliseRoundPreset(preset);
  if (normalisedPreset === "quick") return 1;
  if (normalisedPreset === "standard") return standardQuestionsPerPlayer(setupPlayerCount(room));
  return clamp(Number(customLimit || room.maxQuestionsPerPlayer || DEFAULT_QUESTIONS_PER_PLAYER), MIN_QUESTIONS_PER_PLAYER, MAX_QUESTIONS_PER_PLAYER);
}

function maximumRoundsForPreset(room) {
  if (room.roundPreset === "quick") return QUICK_MAX_ROUNDS;
  if (room.roundPreset === "standard") return STANDARD_MAX_ROUNDS;
  return Number.POSITIVE_INFINITY;
}

function plannedQuestionCount(room) {
  if (LIVE_GAME_PHASES.includes(room.phase) || room.phase === "finished") {
    return room.quizQuestions.length;
  }
  const playerCount = connectedSetupPlayerCount(room);
  if (playerCount === 0) return 0;
  const submittedTotal = playerCount * questionsPerPlayerForPreset(room);
  return Math.min(submittedTotal, maximumRoundsForPreset(room));
}

function estimatedGameDurationMs(room) {
  const perRound = room.gameMode === "herd" ?
    READING_MS + HERD_ANSWERING_MS + HERD_RANKING_MS + HERD_REVEAL_MS :
    READING_MS + ANSWERING_MS + REVEAL_MS;
  return plannedQuestionCount(room) * perRound;
}

function normaliseQuestion(room, payload, player) {
  if (room.gameMode === "herd") {
    return normaliseHerdQuestion(room, payload, player);
  }
  if (room.gameMode === "oddball") {
    return normaliseOddballQuestion(room, payload, player);
  }

  const text = cleanText(payload?.text, 180);
  if (text.length < 4) {
    throw new Error("Question needs a little more text.");
  }

  const incomingAnswers = Array.isArray(payload?.answers) ? payload.answers.slice(0, 4) : [];
  const usableAnswers = incomingAnswers.
  map((answer) => ({ text: cleanText(answer?.text, 80), correct: Boolean(answer?.correct) })).
  filter((answer) => answer.text);

  if (usableAnswers.length < 2) {
    throw new Error("Add at least two answers.");
  }
  if (usableAnswers.length > 4) {
    throw new Error("Use four answers or fewer.");
  }

  const correctCount = usableAnswers.filter((answer) => answer.correct).length;
  if (correctCount !== 1) {
    throw new Error("Choose one correct answer.");
  }

  const answers = usableAnswers.map((answer, index) => ({
    ...ANSWER_META[index],
    text: answer.text,
    correct: Boolean(answer.correct)
  }));

  return {
    id: crypto.randomUUID(),
    mode: "quiz",
    text,
    answers,
    imageDataUrl: validateImage(room, payload?.imageDataUrl),
    authorId: player.id,
    authorName: player.name,
    authorAvatarId: player.avatarId,
    authorAvatarImageDataUrl: player.avatarImageDataUrl || "",
    createdAt: Date.now()
  };
}

function normaliseOddballQuestion(room, payload, player) {
  const text = cleanText(payload?.text, 180);
  if (text.length < 4) {
    throw new Error("Oddball prompt needs a little more text.");
  }

  const incomingAnswers = Array.isArray(payload?.answers) ? payload.answers.slice(0, 4) : [];
  const usableAnswers = incomingAnswers.
  map((answer) => ({ text: cleanText(answer?.text, 80) })).
  filter((answer) => answer.text);

  if (usableAnswers.length < 2) {
    throw new Error("Add at least two Oddball options.");
  }
  if (usableAnswers.length > 4) {
    throw new Error("Use four options or fewer.");
  }

  const answers = usableAnswers.map((answer, index) => ({
    ...ANSWER_META[index],
    text: answer.text,
    correct: false
  }));

  return {
    id: crypto.randomUUID(),
    mode: "oddball",
    text,
    answers,
    imageDataUrl: validateImage(room, payload?.imageDataUrl),
    authorId: player.id,
    authorName: player.name,
    authorAvatarId: player.avatarId,
    authorAvatarImageDataUrl: player.avatarImageDataUrl || "",
    createdAt: Date.now()
  };
}

function normaliseHerdQuestion(room, payload, player) {
  const text = cleanText(payload?.text, 180);
  if (text.length < 4) {
    throw new Error("Prompt needs a little more text.");
  }

  return {
    id: crypto.randomUUID(),
    mode: "herd",
    text,
    answers: [],
    imageDataUrl: validateImage(room, payload?.imageDataUrl),
    authorId: player.id,
    authorName: player.name,
    authorAvatarId: player.avatarId,
    authorAvatarImageDataUrl: player.avatarImageDataUrl || "",
    createdAt: Date.now()
  };
}

function normaliseHerdAnswer(value) {
  return cleanText(value, HERD_ANSWER_MAX).
  toLowerCase().
  replace(/[^a-z0-9 ]+/g, "").
  replace(/\s+/g, " ").
  trim();
}

function validateImage(room, value) {
  return storeRoomImage(room, value, { maxChars: MAX_IMAGE_CHARS, label: "Image" });
}

function validateAvatarImage(room, value) {
  return storeRoomImage(room, value, { maxChars: MAX_AVATAR_IMAGE_CHARS, label: "Profile picture" });
}

function getPayloadPlayer(room, payload) {
  const playerKey = cleanText(payload?.playerKey, 80);
  return getPlayerByCredential(room, playerKey);
}

function requireHost(room, payload) {
  const playerKey = cleanText(payload?.playerKey, 80);
  if (!isHostCredential(room, playerKey)) {
    return { ok: false, error: "Only the host can do that." };
  }
  return { ok: true };
}

function countQuestionsForPlayer(room, playerId) {
  return room.questions.filter((question) => question.authorId === playerId).length;
}

function countPendingQuestionsForPlayer(room, playerId) {
  return room.pendingQuestions.filter((question) => question.authorId === playerId).length;
}

function countQuestionSlotsForPlayer(room, playerId) {
  return countQuestionsForPlayer(room, playerId) + countPendingQuestionsForPlayer(room, playerId);
}

function publicPlayers(room) {
  return Object.values(room.players).
  map((player) => publicPlayer(room, player)).
  sort((a, b) => {
    if (a.connected !== b.connected) {
      return a.connected ? -1 : 1;
    }
    return a.joinedAt - b.joinedAt;
  });
}

function publicBannedPlayers(room) {
  return Object.values(room.bannedPlayers || {}).
  map((player) => ({
    id: player.id,
    name: player.name,
    avatarId: normaliseAvatarId(player.avatarId),
    avatarImageDataUrl: player.avatarImageDataUrl || "",
    kickedAt: player.kickedAt || 0
  })).
  sort((a, b) => b.kickedAt - a.kickedAt);
}

function publicQuestionAuthor(room, question) {
  const livePlayer = room.players[question.authorId];
  return {
    id: question.authorId,
    name: question.authorName,
    avatarId: normaliseAvatarId(livePlayer?.avatarId || question.authorAvatarId),
    avatarImageDataUrl: livePlayer?.avatarImageDataUrl || question.authorAvatarImageDataUrl || ""
  };
}

function publicPendingQuestion(room, question) {
  return {
    id: question.id,
    mode: question.mode || room.gameMode || DEFAULT_GAME_MODE,
    text: question.text,
    imageDataUrl: question.imageDataUrl,
    authorId: question.authorId,
    authorName: question.authorName,
    author: publicQuestionAuthor(room, question),
    answers: (question.answers || []).map((answer) => ({
      id: answer.id,
      label: answer.label,
      color: answer.color,
      shape: answer.shape,
      text: answer.text,
      correct: answer.correct
    })),
    createdAt: question.createdAt
  };
}

function publicPendingQuestionsForPlayer(room, playerId) {
  if (!playerId) {
    return [];
  }
  return room.pendingQuestions.
  filter((question) => question.authorId === playerId).
  map((question) => publicPendingQuestion(room, question));
}

function publicEditableQuestion(room, question, status = "submitted") {
  return {
    id: question.id,
    mode: question.mode || room.gameMode || DEFAULT_GAME_MODE,
    text: question.text,
    imageDataUrl: question.imageDataUrl || "",
    answers: (question.answers || []).map((answer) => ({
      id: answer.id,
      label: answer.label,
      text: answer.text,
      correct: Boolean(answer.correct)
    })),
    status,
    createdAt: question.createdAt,
    editedAt: question.editedAt || 0
  };
}

function publicOwnQuestions(room, playerId) {
  if (!playerId) return [];
  return [
  ...room.questions.filter((question) => question.authorId === playerId).map((question) => publicEditableQuestion(room, question, "submitted")),
  ...room.pendingQuestions.filter((question) => question.authorId === playerId).map((question) => publicEditableQuestion(room, question, "pending"))].
  sort((a, b) => a.createdAt - b.createdAt);
}

function publicPlayer(room, player) {
  return presentPlayer(room, player, {
    avatarId: normaliseAvatarId(player.avatarId),
    submitted: countQuestionsForPlayer(room, player.id),
    pending: countPendingQuestionsForPlayer(room, player.id),
    isHost: getCredentialForPlayer(room, player.id) === room.hostKey
  });
}

function publicOwnGahookUses(room, playerId) {
  const index = room.game.currentQuestionIndex;
  const targetId = room.game.pokeUses?.["question:" + index + ":" + playerId] || "";
  const usedTargets = targetId && room.players[targetId] ? [targetId] : [];

  return {
    question: usedTargets,
    questionTargetId: usedTargets[0] || "",
    // Keep the old phase-specific arrays during the client migration. They now
    // describe the same single use shared by the whole question.
    round: usedTargets,
    reveal: usedTargets
  };
}

function publicAnswerSelections(room, viewerPlayerId = "") {
  if (!["answering", "reveal"].includes(room.phase)) {
    return [];
  }
  const hiddenAuthorId = room.phase === "answering" ? getCurrentQuestion(room)?.authorId : "";
  const selections = Object.entries(room.game.answers || {}).
  filter(([playerId, answer]) => Boolean(
    room.players[playerId] &&
    answer?.answerId &&
    (playerId !== hiddenAuthorId || playerId === viewerPlayerId)
  )).
  map(([playerId, answer]) => ({
    playerId,
    answerId: answer.answerId,
    answeredAt: answer.answeredAt || 0
  })).
  sort((a, b) => a.answeredAt - b.answeredAt);
  if (room.phase === "reveal") return selections;
  return selections.map((selection) => ({
    playerId: selection.playerId,
    answerId: selection.answerId,
    answeredAt: selection.answeredAt,
    isOwn: selection.playerId === viewerPlayerId
  }));
}

function getStartCheck(room) {
  if (room.phase !== "building") {
    return { ok: false, error: room.phase === "lobby" ? "Lock in the game options first." : "The quiz is already running." };
  }

  const activePlayers = Object.values(room.players).filter((player) => player.connected);
  if (activePlayers.length === 0) {
    return { ok: false, error: "At least one player needs to join." };
  }
  if (room.questions.length === 0) {
    return { ok: false, error: "Add at least one question first." };
  }
  if (room.pendingQuestions.length > 0) {
    return { ok: false, error: "Approve or reject pending questions first." };
  }

  const waitingOn = activePlayers.filter(
    (player) => !player.name || !player.ready || countQuestionsForPlayer(room, player.id) < room.maxQuestionsPerPlayer || countPendingQuestionsForPlayer(room, player.id) > 0
  );
  if (waitingOn.length > 0) {
    return { ok: false, error: "Every connected player needs their questions submitted and ready status." };
  }

  return { ok: true };
}

function makeGeneratedQuestion(room, player, generatedIndex) {
  const mode = room.gameMode || DEFAULT_GAME_MODE;
  let payload;
  if (mode === "herd") {
    payload = { text: GENERATED_HERD_PRESETS[generatedIndex % GENERATED_HERD_PRESETS.length] };
  } else if (mode === "oddball") {
    const preset = GENERATED_ODDBALL_PRESETS[generatedIndex % GENERATED_ODDBALL_PRESETS.length];
    payload = { text: preset.text, answers: preset.answers.map((text) => ({ text })) };
  } else {
    const preset = GENERATED_QUIZ_PRESETS[generatedIndex % GENERATED_QUIZ_PRESETS.length];
    const correctIndex = generatedIndex % preset.answers.length;
    const rotatedAnswers = preset.answers.map(
      (_text, index) => preset.answers[(index - correctIndex + preset.answers.length) % preset.answers.length]
    );
    payload = { text: preset.text, answers: rotatedAnswers.map((text, index) => ({ text, correct: index === correctIndex })) };
  }
  return { ...normaliseQuestion(room, payload, player), generated: true };
}

function forceStartGame(room) {
  if (room.phase !== "building") {
    return { ok: false, error: room.phase === "lobby" ? "Lock in the game options first." : "This game cannot be force started right now." };
  }
  const activePlayers = Object.values(room.players).filter((player) => player.connected);
  if (activePlayers.length === 0) {
    return { ok: false, error: "At least one connected player is needed to force start." };
  }

  room.pendingQuestions = [];
  let generatedCount = 0;
  activePlayers.forEach((player) => {
    const missingCount = Math.max(0, room.maxQuestionsPerPlayer - countQuestionsForPlayer(room, player.id));
    for (let index = 0; index < missingCount; index += 1) {
      room.questions.push(makeGeneratedQuestion(room, player, generatedCount));
      generatedCount += 1;
    }
    player.questionsSubmitted = countQuestionsForPlayer(room, player.id);
    player.ready = true;
  });

  if (room.questions.length === 0) {
    return { ok: false, error: "Could not generate questions for this game." };
  }
  startGame(room);
  return { ok: true, generatedCount, totalQuestions: room.quizQuestions.length };
}

function cleanQuestionRoundState(question, options = {}) {
  const {
    votes: _votes,
    herdScored: _herdScored,
    herdResults: _herdResults,
    oddballScored: _oddballScored,
    oddballResults: _oddballResults,
    carriedOver: _carriedOver,
    ...base
  } = question;
  return {
    ...base,
    answers: Array.isArray(question.answers) ? question.answers.map((answer) => ({ ...answer })) : [],
    ...(options.carriedOver ? { carriedOver: true } : {})
  };
}

function fairRoundRobinQuestions(candidates, limit, alreadySelected = new Set()) {
  if (limit <= 0) return [];
  const byAuthor = new Map();
  candidates.forEach((question) => {
    if (alreadySelected.has(question.id)) return;
    const bucket = byAuthor.get(question.authorId) || [];
    bucket.push(question);
    byAuthor.set(question.authorId, bucket);
  });
  const authorIds = shuffle([...byAuthor.keys()]);
  authorIds.forEach((authorId) => byAuthor.set(authorId, shuffle(byAuthor.get(authorId))));
  const selected = [];
  let depth = 0;
  while (selected.length < limit) {
    let addedAtDepth = false;
    for (const authorId of authorIds) {
      const question = byAuthor.get(authorId)?.[depth];
      if (!question) continue;
      selected.push(question);
      alreadySelected.add(question.id);
      addedAtDepth = true;
      if (selected.length >= limit) break;
    }
    if (!addedAtDepth) break;
    depth += 1;
  }
  return selected;
}

function selectQuestionsForGame(room, eligiblePlayerIds) {
  const eligible = new Set(eligiblePlayerIds);
  const candidates = room.questions.filter((question) => eligible.has(question.authorId));
  const maximumRounds = maximumRoundsForPreset(room);
  const limit = Number.isFinite(maximumRounds) ? Math.min(maximumRounds, candidates.length) : candidates.length;
  const selectedIds = new Set();
  // Questions that missed a previous capped game get first refusal on the rematch.
  // The round-robin selector still spreads those questions fairly across authors.
  const carried = fairRoundRobinQuestions(candidates.filter((question) => question.carriedOver), limit, selectedIds);
  const remaining = fairRoundRobinQuestions(candidates, limit - carried.length, selectedIds);
  return shuffle([...carried, ...remaining]).map((question) => cleanQuestionRoundState(question));
}

function startGame(room) {
  clearPhaseTimer(room);
  room.latestRoomPoke = null;
  room.paused = false;
  room.pausedAt = null;
  room.pausedRemainingMs = 0;
  room.pausedWaitingForProgress = false;
  room.game.eligiblePlayerIds = Object.values(room.players).
  filter((player) => player.connected).
  map((player) => player.id);
  room.game.playedQuestionIds = [];
  room.quizQuestions = selectQuestionsForGame(room, room.game.eligiblePlayerIds);
  Object.values(room.players).forEach((player) => {
    clearUltimateGahookState(player, true);
    clearUltimateCongratulationsState(player, true);
    resetUltimateGahookThreshold(player);
    player.score = 0;
    player.shamePokes = 0;
    player.congratulationsCount = 0;
    player.dashScore = 0;
    player.dashPlayerY = 0;
    player.dashRunning = false;
    player.dashRunId = "";
    player.dashUpdatedAt = 0;
  });
  beginQuestion(room, 0);
}

function finishGameNow(room) {
  clearPhaseTimer(room);
  room.paused = false;
  room.pausedAt = null;
  room.pausedRemainingMs = 0;
  room.pausedWaitingForProgress = false;
  if (room.quizQuestions.length === 0) {
    const eligiblePlayerIds = Array.isArray(room.game.eligiblePlayerIds) ?
      room.game.eligiblePlayerIds :
      Object.values(room.players).filter((player) => player.connected).map((player) => player.id);
    room.quizQuestions = selectQuestionsForGame(room, eligiblePlayerIds);
  }
  room.phase = "finished";
  room.phaseEndsAt = null;
  room.game.currentQuestionIndex = Math.max(0, room.game.currentQuestionIndex);
  Object.values(room.players).forEach(resetUltimateGahookThreshold);
  broadcastState(room, { immediate: true });
}

function beginQuestion(room, index) {
  clearPhaseTimer(room);
  resetProgressWait(room);

  if (index >= room.quizQuestions.length) {
    room.phase = "finished";
    room.phaseEndsAt = null;
    room.game.currentQuestionIndex = room.quizQuestions.length - 1;
    room.game.answers = {};
    Object.values(room.players).forEach(resetUltimateGahookThreshold);
    broadcastState(room, { immediate: true });
    return;
  }

  room.phase = "reading";
  room.phaseEndsAt = Date.now() + READING_MS;
  room.game.currentQuestionIndex = index;
  room.game.answerOpenedAt = null;
  room.game.answers = {};
  room.game.rankings = {};
  room.game.herdRankingOrder = [];
  room.game.firstAnswerPlayerId = null;
  room.game.pokeUses = {};
  room.game.voteAdvanceQuestionId = "";
  const question = getCurrentQuestion(room);
  if (question && !question.votes) {
    question.votes = {};
  }

  broadcastState(room, { immediate: true });
  room.phaseTimer = setTimeout(() => waitForProgressThen(room, "reading"), READING_MS);
}

function beginAnswering(room) {
  if (room.phase !== "reading") {
    return;
  }

  clearPhaseTimer(room);
  resetProgressWait(room);
  room.phase = "answering";
  const isHerd = (getCurrentQuestion(room)?.mode || room.gameMode) === "herd";
  const durationMs = isHerd ? HERD_ANSWERING_MS : ANSWERING_MS;
  room.phaseEndsAt = Date.now() + durationMs;
  room.game.answerOpenedAt = Date.now();

  broadcastState(room, { immediate: true });
  room.phaseTimer = setTimeout(() => isHerd ? beginHerdRanking(room) : waitForProgressThen(room, "answering"), durationMs);
}

function beginHerdRanking(room) {
  if (room.phase !== "answering") return;
  clearPhaseTimer(room);
  resetProgressWait(room);
  room.phase = "ranking";
  room.phaseEndsAt = Date.now() + HERD_RANKING_MS;
  room.game.rankings = {};
  room.game.herdRankingOrder = shuffle(herdAnswerEntries(room).map((answer) => answer.id));
  broadcastState(room, { immediate: true });
  room.phaseTimer = setTimeout(() => transitionToReveal(room), HERD_RANKING_MS);
}

function transitionToReveal(room) {
  if (room.phase !== "answering" && room.phase !== "ranking") {
    return;
  }

  clearPhaseTimer(room);
  resetProgressWait(room);
  const question = getCurrentQuestion(room);
  const mode = question?.mode || room.gameMode || DEFAULT_GAME_MODE;
  if (mode === "herd") {
    scoreHerdRound(room);
  } else if (mode === "oddball") {
    scoreOddballRound(room);
  }
  room.game.playedQuestionIds = room.game.playedQuestionIds || [];
  if (question?.id && !room.game.playedQuestionIds.includes(question.id)) {
    room.game.playedQuestionIds.push(question.id);
  }
  room.phase = "reveal";
  const revealDuration = mode === "herd" ? HERD_REVEAL_MS : REVEAL_MS;
  room.phaseEndsAt = Date.now() + revealDuration;

  broadcastState(room, { immediate: true });
  room.phaseTimer = setTimeout(() => waitForProgressThen(room, "reveal"), revealDuration);
}

function phaseProgressKey(room, phase = room.phase, index = room.game.currentQuestionIndex) {
  return roomPhaseProgressKey(room, phase, index);
}

function resetProgressWait(room) {
  clearProgressTimers(room);
  room.game.progressReady = {};
  room.game.waitingForProgress = false;
}

function allActivePlayersProgressReady(room) {
  return roomAllActivePlayersProgressReady(room);
}

function waitForProgressThen(room, phase) {
  if (room.phase !== phase) {
    return;
  }
  room.game.waitingForProgress = true;
  if (allActivePlayersProgressReady(room)) {
    scheduleProgressAdvance(room);
  } else {
    scheduleProgressFallback(room);
    broadcastState(room, { immediate: true });
  }
}

function scheduleProgressAdvance(room) {
  clearProgressSettleTimer(room);
  clearProgressFallbackTimer(room);
  const phase = room.phase;
  const index = room.game.currentQuestionIndex;
  room.game.waitingForProgress = true;
  broadcastState(room, { immediate: true });
  room.game.progressSettleTimer = setTimeout(() => {
    if (room.phase !== phase || room.game.currentQuestionIndex !== index || !allActivePlayersProgressReady(room)) {
      if (room.phase === phase && room.game.currentQuestionIndex === index) {
        scheduleProgressFallback(room);
      }
      return;
    }
    advanceCurrentPhase(room);
  }, PROGRESS_SETTLE_MS);
}

function scheduleProgressFallback(room) {
  clearProgressFallbackTimer(room);
  const phase = room.phase;
  const index = room.game.currentQuestionIndex;
  room.game.progressFallbackTimer = setTimeout(() => {
    if (room.phase !== phase || room.game.currentQuestionIndex !== index) {
      return;
    }
    advanceCurrentPhase(room);
  }, PROGRESS_FORCE_ADVANCE_MS);
}

function advanceCurrentPhase(room) {
  if (room.paused) {
    return;
  }
  if (room.phase === "reading") {
    beginAnswering(room);
  } else if (room.phase === "answering") {
    transitionAfterAnswers(room);
  } else if (room.phase === "ranking") {
    transitionToReveal(room);
  } else if (room.phase === "reveal") {
    beginQuestion(room, room.game.currentQuestionIndex + 1);
  }
}

function acknowledgeProgress(room, payload) {
  const player = getPayloadPlayer(room, payload);
  if (!player || !player.connected) {
    return { ok: false, error: "Join before syncing progress." };
  }
  const phase = cleanText(payload?.phase, 20);
  const questionIndex = Number(payload?.questionIndex);
  if (phase !== room.phase || questionIndex !== room.game.currentQuestionIndex) {
    return { ok: true, ignored: true };
  }
  room.game.progressReady[player.id] = phaseProgressKey(room, phase, questionIndex);
  if (room.game.waitingForProgress && allActivePlayersProgressReady(room)) {
    scheduleProgressAdvance(room);
  } else {
    broadcastState(room, { immediate: true });
  }
  return { ok: true };
}

function transitionAfterAnswers(room) {
  const mode = getCurrentQuestion(room)?.mode || room.gameMode || DEFAULT_GAME_MODE;
  if (mode === "herd") beginHerdRanking(room);
  else transitionToReveal(room);
}

function windowedTransitionAfterAnswers(room) {
  clearPhaseTimer(room);
  if (room.paused) return;
  room.phaseTimer = setTimeout(() => transitionAfterAnswers(room), PROGRESS_SETTLE_MS);
}

function windowedTransitionToReveal(room) {
  clearPhaseTimer(room);
  if (room.paused) {
    return;
  }
  room.phaseTimer = setTimeout(() => transitionToReveal(room), PROGRESS_SETTLE_MS);
}

function setGamePaused(room, payload) {
  if (!LIVE_GAME_PHASES.includes(room.phase)) {
    return { ok: false, error: "The game can only be paused during a question." };
  }
  const paused = typeof payload?.paused === "boolean" ? payload.paused : !room.paused;
  if (paused === room.paused) {
    return { ok: true, paused: room.paused };
  }

  if (paused) {
    const now = Date.now();
    room.pausedRemainingMs = room.phaseEndsAt ? Math.max(0, room.phaseEndsAt - now) : 0;
    room.pausedWaitingForProgress = Boolean(room.game.waitingForProgress);
    room.paused = true;
    room.pausedAt = now;
    room.phaseEndsAt = null;
    clearPhaseTimer(room);
    broadcastState(room, { immediate: true });
    return { ok: true, paused: true };
  }

  const remainingMs = Math.max(0, Number(room.pausedRemainingMs || 0));
  const wasWaiting = Boolean(room.pausedWaitingForProgress);
  room.paused = false;
  room.pausedAt = null;
  room.pausedRemainingMs = 0;
  room.pausedWaitingForProgress = false;

  if (room.phase === "answering" && allActivePlayersAnswered(room)) {
    room.game.waitingForProgress = false;
    broadcastState(room, { immediate: true });
    windowedTransitionAfterAnswers(room);
    return { ok: true, paused: false };
  }
  if (room.phase === "ranking" && allActivePlayersRanked(room)) {
    room.game.waitingForProgress = false;
    broadcastState(room, { immediate: true });
    windowedTransitionToReveal(room);
    return { ok: true, paused: false };
  }
  if (wasWaiting) {
    room.game.waitingForProgress = true;
    if (allActivePlayersProgressReady(room)) {
      scheduleProgressAdvance(room);
    } else {
      scheduleProgressFallback(room);
      broadcastState(room, { immediate: true });
    }
    return { ok: true, paused: false };
  }

  room.game.waitingForProgress = false;
  room.phaseEndsAt = Date.now() + remainingMs;
  room.phaseTimer = setTimeout(() => {
    if (room.phase === "ranking") transitionToReveal(room);
    else if (room.phase === "answering" && (getCurrentQuestion(room)?.mode || room.gameMode) === "herd") beginHerdRanking(room);
    else waitForProgressThen(room, room.phase);
  }, remainingMs);
  broadcastState(room, { immediate: true });
  return { ok: true, paused: false };
}

function skipPhase(room) {
  if (room.phase === "reading") {
    beginAnswering(room);
  } else if (room.phase === "answering") {
    transitionAfterAnswers(room);
  } else if (room.phase === "ranking") {
    transitionToReveal(room);
  } else if (room.phase === "reveal") {
    beginQuestion(room, room.game.currentQuestionIndex + 1);
  }
}

function resetLobby(room, options = {}) {
  clearPhaseTimer(room);
  clearProgressTimers(room);
  clearBroadcastTimer(room);
  clearRoomExpiry(room);
  const playedQuestionIds = new Set(room.game?.playedQuestionIds || []);
  const reusableQuestions = options.reuseUnusedQuestions ? room.questions.
    filter((question) => !playedQuestionIds.has(question.id) && (question.mode || room.gameMode) === room.gameMode).
    map((question) => cleanQuestionRoundState(question, { carriedOver: true })) : [];
  Object.values(room.players).forEach((player) => {
    clearUltimateGahookState(player);
    clearUltimateCongratulationsState(player, true);
    resetUltimateGahookThreshold(player);
    player.score = 0;
    player.ready = false;
    player.pokeCount = 0;
    player.latestPoke = null;
    player.shamePokes = 0;
    player.congratulationsCount = 0;
    player.dashScore = 0;
    player.dashPlayerY = 0;
    player.dashRunning = false;
    player.dashRunId = "";
    player.dashUpdatedAt = 0;
  });
  const fresh = makeLobby(room.code);
  room.phase = options.phase === "building" ? "building" : "lobby";
  room.phaseEndsAt = null;
  room.phaseTimer = null;
  room.paused = false;
  room.pausedAt = null;
  room.pausedRemainingMs = 0;
  room.pausedWaitingForProgress = false;
  room.voteKicks = {};
  room.counterGahookStreaks = {};
  room.questions = reusableQuestions;
  room.pendingQuestions = [];
  room.quizQuestions = [];
  room.latestRoomPoke = null;
  room.game = fresh.game;
  Object.values(room.players).forEach((player) => {
    player.questionsSubmitted = countQuestionsForPlayer(room, player.id);
  });
  broadcastState(room, { immediate: true });
}

function clearPhaseTimer(room) {
  if (room.phaseTimer) {
    clearTimeout(room.phaseTimer);
    room.phaseTimer = null;
  }
  clearProgressTimers(room);
}

function clearProgressSettleTimer(room) {
  if (room.game?.progressSettleTimer) {
    clearTimeout(room.game.progressSettleTimer);
    room.game.progressSettleTimer = null;
  }
}

function clearProgressFallbackTimer(room) {
  if (room.game?.progressFallbackTimer) {
    clearTimeout(room.game.progressFallbackTimer);
    room.game.progressFallbackTimer = null;
  }
}

function clearProgressTimers(room) {
  clearProgressSettleTimer(room);
  clearProgressFallbackTimer(room);
}

function getCurrentQuestion(room) {
  return room.quizQuestions[room.game.currentQuestionIndex] ?? null;
}

function allActivePlayersAnswered(room) {
  return roomAllActivePlayersAnswered(room);
}

function buildSnapshot(room, role, playerKey) {
  const ownPlayer = getPlayerByCredential(room, playerKey);
  const currentQuestion = getCurrentQuestion(room);
  const isHost = isHostCredential(room, playerKey);
  const canViewRoomSocial = Boolean(isHost || ownPlayer);
  const effectiveRole = isHost ? "host" : role;
  const activePlayerIds = new Set(Object.values(room.players).filter((player) => player.connected).map((player) => player.id));
  const placements = scoreboardPlacements(room);
  const maximumRounds = maximumRoundsForPreset(room);
  const playedQuestionIds = new Set(room.game?.playedQuestionIds || []);
  const unusedQuestionCount = room.questions.filter((question) => {
    return !playedQuestionIds.has(question.id) && (question.carriedOver || room.phase === "finished");
  }).length;

  return {
    code: room.code,
    stateVersion: room.stateVersion || 0,
    serverTime: Date.now(),
    hasPassword: roomHasPassword(room),
    isHost,
    gameMode: room.gameMode || DEFAULT_GAME_MODE,
    roundPreset: normaliseRoundPreset(room.roundPreset),
    approveQuestions: room.approveQuestions,
    allowCustomProfiles: room.allowCustomProfiles !== false,
    allowCustomGahooks: room.allowCustomGahooks !== false,
    promptStyle: room.promptStyle || "fun",
    phase: room.phase,
    phaseEndsAt: room.phaseEndsAt,
    paused: Boolean(room.paused),
    pausedRemainingMs: Math.max(0, Number(room.pausedRemainingMs || 0)),
    phaseWaitingForProgress: Boolean(room.game.waitingForProgress),
    roomPoke: room.latestRoomPoke || null,
    chatMessages: canViewRoomSocial ? publicChatMessages(room) : [],
    whiteboardStrokes: canViewRoomSocial ? publicWhiteboardStrokes(room) : [],
    whiteboardRevision: canViewRoomSocial ? room.whiteboardRevision || 0 : 0,
    players: publicPlayers(room),
    bannedPlayers: publicBannedPlayers(room),
    pendingQuestions: isHost ? room.pendingQuestions.map((question) => publicPendingQuestion(room, question)) : publicPendingQuestionsForPlayer(room, playerKey),
    leaderboard: placements.ranked,
    winners: placements.winners,
    losers: placements.losers,
    winner: placements.winner,
    loser: placements.loser,
    questionCount: room.questions.length,
    availableQuestionCount: room.questions.length + room.pendingQuestions.length,
    maxQuestionsPerPlayer: room.maxQuestionsPerPlayer,
    questionsPerPlayer: room.maxQuestionsPerPlayer,
    plannedTotalQuestions: plannedQuestionCount(room),
    selectedQuestionLimit: Number.isFinite(maximumRounds) ? maximumRounds : null,
    unusedQuestionCount,
    estimatedDurationMs: estimatedGameDurationMs(room),
    currentQuestionIndex: room.game.currentQuestionIndex,
    totalQuestions: room.quizQuestions.length || room.questions.length,
    canStart: getStartCheck(room).ok,
    activePlayerCount: activePlayerIds.size,
    answerCount: Object.keys(room.game.answers).filter((playerId) => activePlayerIds.has(playerId)).length,
    rankingCount: Object.keys(room.game.rankings || {}).filter((playerId) => activePlayerIds.has(playerId)).length,
    answerSelections: publicAnswerSelections(room, ownPlayer?.id),
    currentQuestion: currentQuestion ? publicQuestion(room, currentQuestion, effectiveRole, room.phase, ownPlayer?.id || "") : null,
    ownPlayer: ownPlayer ? publicPlayer(room, ownPlayer) : null,
    ownCustomGahook: ownPlayer ? publicCustomGahook(ownPlayer) : null,
    customGahookOptions: canViewRoomSocial ? customGahookOptions() : null,
    ownQuestions: ownPlayer ? publicOwnQuestions(room, ownPlayer.id) : [],
    ownPoke: ownPlayer ? ownPlayer.latestPoke ?? null : null,
    ownAnswer: ownPlayer ? room.game.answers[ownPlayer.id] ?? null : null,
    ownHerdRanking: ownPlayer ? room.game.rankings?.[ownPlayer.id] ?? null : null,
    ownGahookUses: ownPlayer ? publicOwnGahookUses(room, ownPlayer.id) : { question: [], questionTargetId: "", round: [], reveal: [] },
    ownVote: ownPlayer && currentQuestion?.votes ? currentQuestion.votes[ownPlayer.id] ?? null : null,
    questionResults: questionResults(room),
    phaseDurations: {
      reading: READING_MS,
      answering: (currentQuestion?.mode || room.gameMode) === "herd" ? HERD_ANSWERING_MS : ANSWERING_MS,
      ranking: HERD_RANKING_MS,
      reveal: (currentQuestion?.mode || room.gameMode) === "herd" ? HERD_REVEAL_MS : REVEAL_MS
    }
  };
}

function publicQuestion(room, question, role, phase, viewerPlayerId = "") {
  const mode = question.mode || room.gameMode || DEFAULT_GAME_MODE;
  const revealAnswer = phase === "reveal" || phase === "finished";
  if (mode === "herd") {
    const voteSummary = summarizeVotes(question);
    return {
      id: question.id,
      mode,
      text: question.text,
      imageDataUrl: question.imageDataUrl,
      authorName: question.authorName,
      author: publicQuestionAuthor(room, question),
      voteScore: voteSummary.score,
      goodVotes: voteSummary.good,
      badVotes: voteSummary.bad,
      voteSelections: publicVoteSelections(room, question),
      answers: [],
      herdAnswerOptions: phase === "ranking" ? publicHerdAnswerOptions(room, viewerPlayerId) : [],
      correctAnswerId: null,
      herdResults: revealAnswer ? publicHerdResults(room, question) : null
    };
  }

  const showAnswers = phase === "reading" || phase === "answering" || revealAnswer;
  const showAnswerText = phase === "answering" || revealAnswer;
  const correct = question.answers.find((answer) => answer.correct);
  const oddballAnswerIds = mode === "oddball" && revealAnswer ?
  new Set((question.oddballResults?.groups || []).filter((group) => group.count > 0 && group.count === (question.oddballResults?.lowCount || 0)).map((group) => group.answerId)) :
  new Set();
  const voteSummary = summarizeVotes(question);

  return {
    id: question.id,
    mode,
    text: question.text,
    imageDataUrl: question.imageDataUrl,
    authorName: question.authorName,
    author: publicQuestionAuthor(room, question),
    voteScore: voteSummary.score,
    goodVotes: voteSummary.good,
    badVotes: voteSummary.bad,
    voteSelections: publicVoteSelections(room, question),
    answers: showAnswers ?
    question.answers.map((answer) => ({
      id: answer.id,
      label: answer.label,
      color: answer.color,
      shape: answer.shape,
      text: showAnswerText ? answer.text : "",
      correct: revealAnswer ? mode === "oddball" ? oddballAnswerIds.has(answer.id) : answer.correct : undefined,
      oddball: revealAnswer && mode === "oddball" ? oddballAnswerIds.has(answer.id) : undefined
    })) :
    [],
    correctAnswerId: revealAnswer ? mode === "oddball" ? [...oddballAnswerIds][0] || null : correct?.id : null,
    oddballResults: mode === "oddball" && revealAnswer ? publicOddballResults(room, question) : null
  };
}

function publicVoteSelections(room, question) {
  return validQuestionVoteEntries(question).map(([playerId, value]) => {
    const player = room.players[playerId];
    return player ? { value, player: publicPlayer(room, player) } : null;
  }).filter(Boolean);
}

function publicHerdResults(room, question) {
  const groups = question.herdResults?.groups || [];
  return {
    rankingCount: question.herdResults?.rankingCount || 0,
    selectionLimit: question.herdResults?.selectionLimit || 3,
    topGroupIds: question.herdResults?.topGroupIds || groups.slice(0, 3).map((group) => group.id),
    groups: groups.map((group) => ({
      id: group.id,
      rank: group.rank,
      rankScore: group.rankScore,
      voteScore: group.voteScore ?? group.rankScore,
      voteCount: group.voteCount || 0,
      firstPlaceVotes: group.firstPlaceVotes || 0,
      secondPlaceVotes: group.secondPlaceVotes || 0,
      thirdPlaceVotes: group.thirdPlaceVotes || 0,
      authoredPoints: group.authoredPoints,
      answerPoints: group.answerPoints ?? group.authoredPoints,
      answerText: group.answerText,
      imageDataUrl: group.imageDataUrl || "",
      variants: group.variants || [group.answerText],
      combinedAnswerCount: group.answerIds?.length || 1,
      players: group.authorIds.
      map((playerId) => room.players[playerId]).
      filter(Boolean).
      map((player) => publicPlayer(room, player)),
      voters: (group.votes || []).
      map((vote) => {
        const player = room.players[vote.playerId];
        return player ? { rank: vote.rank, weight: vote.weight, player: publicPlayer(room, player) } : null;
      }).
      filter(Boolean).
      sort((first, second) => first.rank - second.rank || first.player.name.localeCompare(second.player.name))
    })),
    playerResults: (question.herdResults?.playerResults || []).map((result) => ({
      ...result,
      player: room.players[result.playerId] ? publicPlayer(room, room.players[result.playerId]) : null
    }))
  };
}

function publicHerdAnswerOptions(room, viewerPlayerId = "") {
  const answerById = new Map(herdAnswerEntries(room).map((answer) => [answer.id, answer]));
  return (room.game.herdRankingOrder || []).map((answerId) => answerById.get(answerId)).filter(Boolean).map((answer) => ({
    id: answer.id,
    text: answer.text,
    imageDataUrl: answer.imageDataUrl || "",
    isOwn: answer.playerId === viewerPlayerId
  }));
}

function publicOddballResults(room, question) {
  const groups = question.oddballResults?.groups || [];
  return {
    lowCount: question.oddballResults?.lowCount || 0,
    groups: groups.map((group) => ({
      answerId: group.answerId,
      label: group.label,
      color: group.color,
      shape: group.shape,
      text: group.text,
      count: group.count,
      oddball: group.count > 0 && group.count === (question.oddballResults?.lowCount || 0),
      players: group.playerIds.
      map((playerId) => room.players[playerId]).
      filter(Boolean).
      map((player) => publicPlayer(room, player))
    }))
  };
}

function scoreboardPlacements(room) {
  return scorePlacements(gameEligiblePlayers(room).map((player) => publicPlayer(room, player)));
}

function leaderboard(room) {
  return scoreboardPlacements(room).ranked;
}

function getLoser(room) {
  return scorePlacements(gameEligiblePlayers(room)).loser;
}

function summarizeVotes(question) {
  const votes = validQuestionVoteEntries(question).map(([_playerId, value]) => value);
  const good = votes.filter((vote) => vote === 1).length;
  const bad = votes.filter((vote) => vote === -1).length;
  return { good, bad, total: good + bad, score: good - bad };
}

function publicQuestionResult(room, question) {
  const summary = summarizeVotes(question);
  return {
    id: question.id,
    mode: question.mode || room.gameMode || DEFAULT_GAME_MODE,
    text: question.text,
    authorName: question.authorName,
    author: publicQuestionAuthor(room, question),
    goodVotes: summary.good,
    badVotes: summary.bad,
    voteScore: summary.score
  };
}

function bestHerdAnswerResult(room) {
  if (room.gameMode !== "herd") return null;
  const candidates = room.quizQuestions.flatMap((question) => (question.herdResults?.groups || []).
  filter((group) => (group.voteCount || 0) > 0).
  map((group) => ({ question, group })));
  if (!candidates.length) return null;
  const support = (entry) => (entry.group.voteScore ?? entry.group.rankScore ?? 0) / Math.max(1, (entry.question.herdResults?.rankingCount || 0) * 3);
  candidates.sort((first, second) =>
    support(second) - support(first) ||
    (second.group.voteScore ?? second.group.rankScore ?? 0) - (first.group.voteScore ?? first.group.rankScore ?? 0) ||
    (second.group.firstPlaceVotes || 0) - (first.group.firstPlaceVotes || 0) ||
    (second.group.voteCount || 0) - (first.group.voteCount || 0) ||
    first.question.createdAt - second.question.createdAt ||
    first.group.answerText.localeCompare(second.group.answerText)
  );
  const { question, group } = candidates[0];
  const author = room.players[group.authorIds?.[0]];
  return {
    id: group.id,
    mode: "herd",
    text: group.answerText,
    imageDataUrl: group.imageDataUrl || "",
    promptText: question.text,
    answerPoints: group.answerPoints ?? group.authoredPoints ?? 0,
    voteScore: group.voteScore ?? group.rankScore ?? 0,
    support: Math.round(support({ question, group }) * 1000) / 1000,
    firstPlaceVotes: group.firstPlaceVotes || 0,
    authorName: author?.name || "Unknown player",
    author: author ? publicPlayer(room, author) : null
  };
}

function questionResults(room) {
  const bestAnswer = bestHerdAnswerResult(room);
  const playedQuestions = room.quizQuestions.filter((question) => summarizeVotes(question).total > 0);
  if (playedQuestions.length === 0) {
    return { best: null, worst: null, bestAnswer };
  }

  const sorted = [...playedQuestions].sort((a, b) => {
    const scoreDiff = summarizeVotes(b).score - summarizeVotes(a).score;
    return scoreDiff || a.createdAt - b.createdAt;
  });

  return {
    best: publicQuestionResult(room, sorted[0]),
    worst: publicQuestionResult(room, sorted[sorted.length - 1]),
    bestAnswer
  };
}

function sendState(client) {
  const room = getLobbyFromCode(client.code);
  if (!room) {
    return;
  }
  try {
    const snapshot = buildSnapshot(room, client.role, client.playerKey);
    writeSseState(client.res, snapshot);
  } catch (_error) {
    clients.delete(client.id);
  }
}

function clearBroadcastTimer(room) {
  if (room?.broadcastTimer) {
    clearTimeout(room.broadcastTimer);
    room.broadcastTimer = null;
  }
}

function flushBroadcast(room) {
  clearBroadcastTimer(room);
  for (const client of clients.values()) {
    if (client.code === room.code) {
      sendState(client);
    }
  }
}

function broadcastState(room, options = {}) {
  room.stateVersion = (room.stateVersion || 0) + 1;
  if (options.immediate) {
    flushBroadcast(room);
    return;
  }
  if (room.broadcastTimer) {
    return;
  }
  room.broadcastTimer = setTimeout(() => flushBroadcast(room), STATE_BROADCAST_MS);
}

function clearRoomExpiry(room) {
  if (room?.expireTimer) {
    clearTimeout(room.expireTimer);
    room.expireTimer = null;
  }
}

function scheduleRoomExpiry(room, { awaitingConnection = false } = {}) {
  if (!room || hasLiveRoomClient(room.code) || room.expireTimer) {
    return;
  }
  if (room.hadHostLiveClient && !awaitingConnection) {
    expireRoom(room.code);
    return;
  }
  room.expireTimer = setTimeout(() => expireRoom(room.code), ROOM_EXPIRE_MS);
}

function expireRoom(code) {
  const room = lobbies.get(code);
  if (!room || hasLiveRoomClient(code)) {
    return;
  }
  clearPhaseTimerForRoom(room);
  clearBroadcastTimer(room);
  clearRoomExpiry(room);
  Object.values(room.players).forEach((player) => {
    clearUltimateGahookState(player);
    clearUltimateCongratulationsState(player, true);
  });
  for (const [clientId, client] of clients) {
    if (client.code !== code) continue;
    clients.delete(clientId);
    client.res.end();
  }
  lobbies.delete(code);
}

function clearPhaseTimerForRoom(room) {
  if (room?.phaseTimer) {
    clearTimeout(room.phaseTimer);
    room.phaseTimer = null;
  }
  if (room?.game?.progressSettleTimer) {
    clearTimeout(room.game.progressSettleTimer);
    room.game.progressSettleTimer = null;
  }
  if (room?.game?.progressFallbackTimer) {
    clearTimeout(room.game.progressFallbackTimer);
    room.game.progressFallbackTimer = null;
  }
}

function hasLivePlayerClient(playerKey, code) {
  return [...clients.values()].some((client) => client.code === code && client.playerKey === playerKey);
}

function hasLiveRoomClient(code) {
  const room = lobbies.get(code);
  if (!room) return false;
  return [...clients.values()].some((client) => {
    if (client.code !== code || !client.playerKey) return false;
    return client.playerKey === room.hostKey || Boolean(getPlayerByCredential(room, client.playerKey));
  });
}

function serveDevReloadClient(res) {
  res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
  if (!DEV_RELOAD_ENABLED) {
    res.end("");
    return;
  }
  res.end(`(() => {
    let connectedOnce = false;
    const source = new EventSource("/__dev/events");
    source.addEventListener("open", () => {
      if (connectedOnce) location.reload();
      connectedOnce = true;
    });
    source.addEventListener("reload", () => location.reload());
  })();`);
}

function handleDevReloadEvents(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive"
  });
  res.write(": connected\n\n");
  devReloadClients.add(res);
  req.on("close", () => devReloadClients.delete(res));
}

function triggerDevReload() {
  for (const response of devReloadClients) {
    response.write("event: reload\ndata: now\n\n");
  }
}

function serveStatic(url, res) {
  let pathname = decodeURIComponent(url.pathname);
  if (
  pathname === "/" ||
  pathname === "/information" ||
  pathname === "/information/" ||
  pathname === "/host" ||
  pathname === "/play" ||
  /^\/[a-z]{4}$/i.test(pathname) ||
  /^\/host\/[a-z]{4}$/i.test(pathname) ||
  /^\/player\/[a-z]{4}$/i.test(pathname) ||
  /^\/[a-z]{4}\/host$/i.test(pathname) ||
  /^\/[a-z]{4}\/player$/i.test(pathname))
  {
    pathname = "/index.html";
  }

  const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = path.join(publicDir, safePath);

  if (!absolutePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  serveFile(absolutePath, res);
}

function serveFile(absolutePath, res) {
  fs.createReadStream(absolutePath).
  on("error", () => {
    res.writeHead(404);
    res.end("Not found");
  }).
  on("open", () => {
    res.writeHead(200, { "Content-Type": contentType(absolutePath), "Cache-Control": "no-store" });
  }).
  pipe(res);
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  if (filePath.endsWith(".webmanifest")) {
    return "application/manifest+json; charset=utf-8";
  }
  if (filePath.endsWith(".png")) {
    return "image/png";
  }
  if (filePath.endsWith(".jsx") || filePath.endsWith(".js") || filePath.endsWith(".mjs")) {
    return "text/javascript; charset=utf-8";
  }
  return "application/octet-stream";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function shuffle(items) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(0, index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}
