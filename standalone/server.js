import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  admitCredential,
  createPublicPlayerId,
  getCredentialForPlayer,
  getPlayerByCredential,
  initialiseRoomAuth,
  isCredentialAdmitted,
  isCredentialBanned,
  isHostCredential,
  registerPlayerCredential,
  resolvePlayer,
  unbanPlayerCredential,
  unregisterPlayerCredential } from
"./server/auth.mjs";
import { initialiseArena, tapArena, arenaProgress } from "./server/arena.mjs";
import { isSyncArtifact } from "./sync-artifacts.mjs";
import { createAdmissionController, requestAddress } from "./server/admission.mjs";
import { accountResultLocation, createAccountService } from "./server/accounts.mjs";
import { allActivePlayersAnswered as roomAllActivePlayersAnswered, allActivePlayersProgressReady as roomAllActivePlayersProgressReady, phaseProgressKey as roomPhaseProgressKey } from "./server/gameplay.mjs";
import { customGahookOptions, normaliseCustomGahook, publicCustomGahook } from "./server/custom-gahook.mjs";
import { buildMajorityResults } from "./server/majority.mjs";
import { buildHerdAssignmentPlan, buildHerdRoundResults } from "../packages/game-engine/src/index.ts";
import { DEFAULT_GAME_SETTINGS, normaliseGameSettings, toLegacyGameMode } from "../packages/contracts/src/index.ts";
import { TemplateBag, findTemplate, instantiateTemplate } from "../packages/content/src/index.ts";
import { initialiseRoomMedia, pruneRoomMedia, roomAssetDataUrl, serveRoomMedia, storeRoomImage } from "./server/media.mjs";
import { presentPlayer } from "./server/presentation.mjs";
import { MAX_ACTIVE_ROOMS, MAX_PLAYERS_PER_ROOM } from "./server/room.mjs";
import { gameEligiblePlayers, quizPoints, scorePlacements } from "./server/scoring.mjs";
import { emptyCareerStats, matchCareerDelta } from "../packages/accounts/src/index.ts";
import { addChatMessage, addReport, addWhiteboardStroke, clearWhiteboard, clearWhiteboardForPlayer, initialiseRoomSocial, publicChatMessages, publicReports, publicWhiteboardStrokes, removeChatMessage, removeChatMessagesForPlayer, resolveReport } from "./server/social.mjs";
import { GAME_MODES, SNAPSHOT_SCHEMA_VERSION } from "../packages/contracts/src/game.ts";
import { applySecurityHeaders, assertSameOrigin, readJson, sendJson, writeSseState } from "./server/transport.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
let releaseInfo = readReleaseInfo();
const envPort = typeof process !== "undefined" ? process.env?.PORT : "";
const requestedPort = Number(globalThis.GAHOOKZ_PORT || envPort || 3001);
const PORT = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort <= 65535 ? requestedPort : 3001;
const HOST = cleanHost(process.env.HOST) || "0.0.0.0";
const DEV_RELOAD_ENABLED = process.env.GAHOOKZ_DEV_RELOAD === "1";
const TRUST_PROXY = process.env.GAHOOKZ_TRUST_PROXY === "1";
const admission = createAdmissionController({ relaxed: process.env.NODE_ENV !== "production" });
const accountService = await createAccountService();
const INSTANCE_ID = cleanInstanceId(process.env.GAHOOKZ_INSTANCE_ID) || crypto.randomBytes(6).toString("hex");
// The browser release hash covers files under standalone/public only, so a
// server-only change keeps the same value. This is the separate identifier that
// says which server code is actually running.
const SERVER_REVISION = cleanRevision(process.env.GAHOOKZ_REVISION) || readWorkingTreeRevision() || "unknown";
const SERVER_BUILT_AT = String(process.env.GAHOOKZ_BUILT_AT || "").slice(0, 40);
const METRICS_TOKEN = String(process.env.GAHOOKZ_METRICS_TOKEN || "").trim();
if (process.env.GAHOOKZ_REQUIRE_POSTGRES === "1" && accountService.persistence !== "postgres") {
  throw new Error("GAHOOKZ_REQUIRE_POSTGRES is enabled but the PostgreSQL account repository is unavailable.");
}

const READING_MS = 5000;
const ANSWERING_MS = 14000;
const REVEAL_MS = 12000;
const ULTIMATE_GAHOOK_GRACE_MS = 1000;
const ULTIMATE_GAHOOK_BASE_THRESHOLD_MS = 5000;
const ULTIMATE_GAHOOK_THRESHOLD_STEP_MS = 1000;
const ULTIMATE_GAHOOK_SPAM_IDLE_MS = 1200;
const ULTIMATE_GAHOOK_MAX_STACK = 50;
const COUNTER_GAHOOK_TRIGGER_COUNT = 10;
const COUNTER_GAHOOK_REPEAT_EVERY = 2;
const COUNTER_GAHOOK_SPAM_IDLE_MS = 2200;
const COUNTER_GAHOOK_OFFER_MS = 6500;
const COUNTER_GAHOOK_OVERLAY_MS = 2750;
const GAHOOK_DUEL_CHALLENGE_MS = 6500;
const GAHOOK_ARENA_INTRO_MS = 2400;
const GAHOOK_DUEL_FINISH_MS = 10000;
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
// Overridable so the expiry regression test can observe a full lifecycle
// without waiting five minutes. Clamped so a typo cannot disable room reaping.
const ROOM_EXPIRE_MS = clamp(Number(process.env.GAHOOKZ_ROOM_EXPIRE_MS) || 5 * 60 * 1000, 250, 60 * 60 * 1000);
const LIVE_GAME_PHASES = ["reading", "answering", "reveal"];

// How far Gahook interruptions may go during the main game.
//
// Enforced here rather than by hiding a button: a client that keeps sending the
// request must not be able to steal points the host has switched off. "chaos"
// is the existing behaviour and stays the default so no room changes silently.
const GAHOOK_EFFECT_POLICIES = ["off", "visual", "chaos"];
const DEFAULT_GAHOOK_EFFECTS = "chaos";

function gahookEffectsPolicy(room) {
  return GAHOOK_EFFECT_POLICIES.includes(room?.gahookEffects) ? room.gahookEffects : DEFAULT_GAHOOK_EFFECTS;
}

/** Only "chaos" may move anybody's score. */
function gahookScoringAllowed(room) {
  return gahookEffectsPolicy(room) === "chaos";
}

/** "off" suppresses the interruption itself during a live round. */
function gahookEffectsAllowed(room) {
  return gahookEffectsPolicy(room) !== "off";
}

function lobbyArenaEnabled(room) {
  return room?.lobbyArenaEnabled !== false;
}
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
const DEFAULT_GAME_MODE = "quiz";

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

const GENERATED_MAJORITY_PRESETS = [
{ text: "Which snack disappears first at every party?", answers: ["Hot chips", "Pizza", "Chocolate", "Cheese"] },
{ text: "What is the funniest excuse for being late?", answers: ["Traffic", "Lost my keys", "Needed a snack", "My pet objected"] },
{ text: "Which tiny inconvenience causes the biggest overreaction?", answers: ["Slow Wi-Fi", "Wet socks", "Low battery", "A squeaky door"] },
{ text: "What would be the worst name for a boat?", answers: ["Unsinkable 2", "Tax Return", "Probably Fine", "Moist Vessel"] },
{ text: "Which animal has the most chaotic energy?", answers: ["Goose", "Raccoon", "Monkey", "Seagull"] },
{ text: "What is the least useful superpower at a party?", answers: ["Warm ice", "Silent karaoke", "Slow teleporting", "Invisible socks"] },
{ text: "Which food is hardest to eat while looking dignified?", answers: ["Spaghetti", "Tacos", "Corn on the cob", "A giant burger"] },
{ text: "What is the most suspicious sentence to hear from a friend?", answers: ["Trust me", "Don't look behind you", "I can explain", "It was like that already"] },
{ text: "Which household object would make the worst roommate?", answers: ["Printer", "Alarm clock", "Blender", "Vacuum"] },
{ text: "What is the best terrible prize?", answers: ["One sock", "A damp coupon", "Tiny trophy", "Mystery key"] },
{ text: "Which song choice ends karaoke night fastest?", answers: ["A ten-minute ballad", "Baby Shark", "An opera solo", "The same song again"] },
{ text: "What should never be described as moist?", answers: ["A handshake", "A pillow", "A wallet", "The carpet"] }];

const GENERATED_HERD_PRESETS = [
"What is the worst thing to hear from a pilot?",
"What should be illegal to put on pizza?",
"What would make a terrible name for a superhero?",
"What is the weirdest thing to bring to a job interview?",
"What would a goose do with unlimited money?",
"What is the least useful thing to shout during an emergency?",
"What would instantly ruin a fancy dinner?",
"What is the most suspicious item to keep in a fridge?",
"What would be the worst surprise inside a birthday cake?",
"What is a terrible slogan for a theme park?",
"What would make the moon quit its job?",
"What is the funniest reason to miss a wedding?"];

const GENERATED_HERD_ANSWERS = [
"A goose with a clipboard", "Tuesday again", "An alarming amount of cheese", "Nobody checked the manual",
"A tiny hat", "The Wi-Fi password", "One damp sock", "Ask the raccoon",
"Budget cuts", "A dramatic kazoo", "It seemed clever at the time", "Three suspicious bananas"];

const FUNNY_CODES = [
"GOOK", "BONK", "YEET", "ZOOT", "NOOB", "BOOP", "WOOT", "YOIN", "GONK", "DOOF",
"POOP", "FART", "BURP", "GOOF", "MOOP", "ZONK", "WOMP", "GLOP", "BORK", "MEEP",
"HONK", "CHON", "BLAP", "DUNK", "SUSY", "YUCK", "WACK", "PFFT", "GULP", "NOMS"];


const lobbies = new Map();
let nextClientId = 1;
const clients = new Map();
const eventTickets = new Map();
const devReloadClients = new Set();
const EVENT_TICKET_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_EVENT_TICKETS = 4096;
let shuttingDown = false;
// Draining is the deliberate pre-deploy state: keep every live game playable,
// but stop accepting new rooms so the node empties on its own. Shutdown is the
// separate, final step. Rooms are process-local, so replacing a node without
// draining it first ends whatever games it was hosting.
let draining = false;
const DRAIN_TIMEOUT_MS = clamp(Number(process.env.GAHOOKZ_DRAIN_TIMEOUT_MS) || 20_000, 0, 30 * 60 * 1000);
const DRAIN_POLL_MS = 500;

// Counters, unlike gauges, survive the event they describe. Without them a
// rejection spike or an authentication failure is invisible the moment it ends.
const counters = {
  requests: 0,
  responses_2xx: 0,
  responses_4xx: 0,
  responses_5xx: 0,
  rate_limited: 0,
  event_streams_opened: 0,
  event_streams_rejected: 0,
  rooms_created: 0,
  rooms_expired: 0,
  room_access_denied: 0,
  login_failures: 0
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://" + req.headers.host);
  const address = requestAddress(req, { trustProxy: TRUST_PROXY });
  applySecurityHeaders(res, { secure: process.env.GAHOOKZ_HTTPS === "1" });
  res.setHeader("X-Gahookz-Instance", INSTANCE_ID);
  counters.requests += 1;
  res.on("finish", () => {
    const status = res.statusCode;
    if (status >= 500) counters.responses_5xx += 1;
    else if (status >= 400) counters.responses_4xx += 1;
    else if (status >= 200 && status < 300) counters.responses_2xx += 1;
    if (status === 429) counters.rate_limited += 1;
  });

  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, {
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        ok: true,
        serverTime: Date.now(),
        release: releaseInfo.version,
        builtAt: releaseInfo.builtAt,
        revision: SERVER_REVISION,
        serverBuiltAt: SERVER_BUILT_AT,
        instance: INSTANCE_ID,
        draining: draining,
        activeRooms: lobbies.size,
        accountPersistence: accountService.persistence,
        googleLoginAvailable: accountService.googleAvailable
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/ready") {
      const ready = !shuttingDown && !draining && lobbies.size < MAX_ACTIVE_ROOMS;
      sendJson(res, ready ? 200 : 503, {
        ok: ready,
        instance: INSTANCE_ID,
        draining,
        activeRooms: lobbies.size,
        roomCapacity: MAX_ACTIVE_ROOMS
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/metrics") {
      if (!metricsAuthorized(req)) {
        sendJson(res, METRICS_TOKEN ? 401 : 404, { ok: false, error: "Not found" });
        return;
      }
      sendMetrics(res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/drain") {
      if (!metricsAuthorized(req)) {
        sendJson(res, METRICS_TOKEN ? 401 : 404, { ok: false, error: "Not found" });
        return;
      }
      const body = await readJson(req);
      draining = body?.active !== false;
      console.log(draining ?
        "Draining: refusing new rooms; " + lobbies.size + " active room(s) remain." :
        "Drain cancelled; accepting new rooms again.");
      sendJson(res, 200, { ok: true, draining, activeRooms: lobbies.size, instance: INSTANCE_ID });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/account") {
      const account = await accountService.authenticate(req);
      sendJson(res, 200, accountService.publicStatus(account));
      return;
    }

    if (req.method === "GET" && url.pathname === "/auth/google/start") {
      const login = accountService.beginGoogleLogin(url.searchParams.get("returnTo"));
      res.statusCode = 302;
      res.setHeader("Set-Cookie", login.cookie);
      res.setHeader("Location", login.location);
      res.setHeader("Cache-Control", "no-store");
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/auth/google/callback") {
      try {
        const login = await accountService.finishGoogleLogin(url, req);
        res.statusCode = 302;
        res.setHeader("Set-Cookie", login.cookies);
        res.setHeader("Location", accountResultLocation(login.returnTo, "connected"));
        res.setHeader("Cache-Control", "no-store");
        res.end();
      } catch (error) {
        counters.login_failures += 1;
        console.warn("Google sign-in callback rejected:", error?.code || error?.message || error);
        res.statusCode = 302;
        res.setHeader("Set-Cookie", accountService.clearOAuthCookie());
        res.setHeader("Location", accountResultLocation(error?.returnTo, "error"));
        res.setHeader("Cache-Control", "no-store");
        res.end();
      }
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
      assertSameOrigin(req);
      admission.assertRead(address);
      handleEvents(req, res, url, address);
      return;
    }

    if (req.method === "GET" && serveRoomMedia(url, res, lobbies)) {
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/lobby") {
      admission.assertRead(address);
      const room = getLobbyFromCode(url.searchParams.get("code"));
      if (!room) {
        sendJson(res, 404, { ok: false, error: "That room does not exist.", roomMissing: true });
        return;
      }
      sendJson(res, 200, { ok: true, code: room.code, phase: room.phase, hasPassword: roomHasPassword(room) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/state") {
      sendJson(res, 405, { ok: false, error: "Use POST for room state.", code: "method_not_allowed" });
      return;
    }

    if (req.method === "POST" && url.pathname.startsWith("/api/")) {
      assertSameOrigin(req);
      const payload = await readJson(req);
      admission.assertMutation(address, url.pathname, cleanText(payload?.playerKey, 80));
      const account = await accountService.authenticate(req);
      if (url.pathname === "/api/account/logout") {
        const cookie = await accountService.logout(req);
        res.setHeader("Set-Cookie", cookie);
        sendJson(res, 200, { ok: true });
        return;
      }
      if (url.pathname === "/api/state") {
        const room = getLobbyFromCode(payload?.code);
        if (!room) {
          sendJson(res, 404, { ok: false, error: "That room does not exist.", roomMissing: true });
          return;
        }
        const playerKey = cleanText(payload?.playerKey, 80);
        if (!roomAccessGranted(room, playerKey)) {
          const denial = roomAccessDenial(room, playerKey);
          sendJson(res, denial.status, denial.body);
          return;
        }
        const role = cleanText(payload?.role, 12) || "guest";
        sendJson(res, 200, buildSnapshot(room, role, playerKey));
        return;
      }
      if (url.pathname === "/api/events/ticket") {
        const room = getLobbyFromCode(payload?.code);
        if (!room) {
          sendJson(res, 404, { ok: false, error: "That room does not exist.", roomMissing: true });
          return;
        }
        const ticketKey = cleanText(payload?.playerKey, 80);
        if (!roomAccessGranted(room, ticketKey)) {
          const denial = roomAccessDenial(room, ticketKey);
          sendJson(res, denial.status, denial.body);
          return;
        }
        const result = createEventTicket(payload);
        sendJson(res, result.ok ? 200 : result.roomMissing ? 404 : 400, result);
        return;
      }
      const result = await handleAction(url.pathname, payload, { account });
      sendJson(res, result.ok ? 200 : result.roomMissing ? 404 : 400, result);
      return;
    }

    serveStatic(url, res);
  } catch (error) {
    const statusCode = Number(error?.statusCode);
    if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599) {
      if (error.retryAfterMs) res.setHeader("Retry-After", String(Math.max(1, Math.ceil(error.retryAfterMs / 1000))));
      sendJson(res, statusCode, { ok: false, error: error.message, code: error.code || "invalid_request" });
      return;
    }
    console.error("Unhandled request error", error);
    sendJson(res, 500, { ok: false, error: "Server error" });
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

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  draining = true;
  console.log(signal + " received; refusing new rooms and draining " + lobbies.size + " active room(s).");

  // Give games in progress a bounded chance to finish before their room is
  // destroyed. The deadline must stay inside the container's stop grace period,
  // otherwise the runtime sends SIGKILL and the drain is pointless. Operators
  // wanting a real drain should call POST /api/drain first and wait for the
  // active-room gauge to reach zero, rather than lengthening this.
  const deadline = Date.now() + DRAIN_TIMEOUT_MS;
  while (lobbies.size > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, DRAIN_POLL_MS));
  }
  if (lobbies.size > 0) {
    console.warn("Drain deadline reached with " + lobbies.size + " room(s) still active; ending them now.");
  } else {
    console.log("All rooms finished; closing cleanly.");
  }

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
  server.close(async (error) => {
    clearTimeout(forceExit);
    if (error) {
      console.error("Gahookz shutdown failed:", error);
      process.exit(1);
    }
    await accountService.close().catch((closeError) => console.error("Account repository shutdown failed:", closeError));
    process.exit(0);
  });
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

function handleEvents(req, res, url, address) {
  const ticket = consumeEventTicket(url.searchParams.get("ticket"));
  if (!ticket) {
    sendJson(res, 401, { ok: false, error: "That live-state ticket is missing or expired.", code: "invalid_event_ticket" });
    return;
  }
  const routedRoom = normaliseRoomCode(url.searchParams.get("room"));
  if (routedRoom && routedRoom !== ticket.code) {
    sendJson(res, 400, { ok: false, error: "That live-state ticket belongs to a different room.", code: "event_room_mismatch" });
    return;
  }
  const { role, playerKey } = ticket;
  const room = getLobbyFromCode(ticket.code);
  if (!room) {
    sendJson(res, 404, { ok: false, error: "That room does not exist.", roomMissing: true });
    return;
  }
  // The ticket proved access when it was issued; re-check because a ban or a
  // password can land between issuing the ticket and opening the stream.
  if (!roomAccessGranted(room, playerKey)) {
    const denial = roomAccessDenial(room, playerKey);
    sendJson(res, denial.status, denial.body);
    return;
  }
  let releaseAdmission;
  try {
    releaseAdmission = admission.acquireEventStream(address, room.code);
  } catch (error) {
    counters.event_streams_rejected += 1;
    throw error;
  }
  counters.event_streams_opened += 1;
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
    releaseAdmission();
    clearInterval(heartbeat);
    clients.delete(id);

    setTimeout(() => {
      const closingPlayer = getPlayerByCredential(room, playerKey);
      if (closingPlayer) {
          if (!hasLivePlayerClient(playerKey, room.code) && getPlayerByCredential(room, playerKey)) {
            closingPlayer.connected = false;
            closingPlayer.dashRunning = false;
            handleGahookDuelDisconnect(room, closingPlayer.id);
            if (room.phase === "lobby" && room.roundPreset !== "custom") {
              room.maxQuestionsPerPlayer = questionsPerPlayerForPreset(room, room.roundPreset);
            }
            if (room.phase === "answering" && allActivePlayersAnswered(room)) {
              windowedTransitionAfterAnswers(room);
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

function pruneEventTickets(now = Date.now()) {
  for (const [token, ticket] of eventTickets) {
    if (ticket.expiresAt <= now || !lobbies.has(ticket.code)) eventTickets.delete(token);
  }
  while (eventTickets.size >= MAX_EVENT_TICKETS) {
    const oldestToken = eventTickets.keys().next().value;
    if (!oldestToken) break;
    eventTickets.delete(oldestToken);
  }
}

function createEventTicket(payload) {
  const room = getLobbyFromCode(payload?.code);
  if (!room) {
    return { ok: false, error: "That room does not exist.", roomMissing: true };
  }
  const requestedKey = cleanText(payload?.playerKey, 80);
  const player = getPlayerByCredential(room, requestedKey);
  const isHost = isHostCredential(room, requestedKey);
  const requestedRole = cleanText(payload?.role, 12).toLowerCase();
  const role = isHost ? "host" : player ? "player" : ["player", "room"].includes(requestedRole) ? "player" : "guest";
  // Keep the pre-join credential inside the server-side ticket so the same live
  // connection becomes the player's connection immediately after they join.
  const playerKey = requestedKey;
  const now = Date.now();
  pruneEventTickets(now);
  const ticket = crypto.randomBytes(24).toString("base64url");
  const expiresAt = now + EVENT_TICKET_TTL_MS;
  eventTickets.set(ticket, { code: room.code, role, playerKey, expiresAt });
  return { ok: true, ticket, expiresAt };
}

function consumeEventTicket(value) {
  const token = cleanText(value, 64);
  if (!token) return null;
  const ticket = eventTickets.get(token);
  if (!ticket || ticket.expiresAt <= Date.now()) {
    eventTickets.delete(token);
    return null;
  }
  eventTickets.delete(token);
  return ticket;
}

async function handleAction(pathname, payload, context = {}) {
  if (pathname === "/api/room") {
    return createRoomAction(payload);
  }

  const room = getLobbyFromCode(payload?.code);
  if (!room) {
    return { ok: false, error: "That room does not exist.", roomMissing: true };
  }

  return handleRoomAction(room, pathname, payload, context);
}

async function handleRoomAction(room, pathname, payload, context = {}) {
  if (pathname === "/api/player/join") {
    return joinPlayer(room, payload, context);
  }
  if (pathname === "/api/question/suggest") {
    return suggestQuestion(room, payload);
  }
  if (pathname === "/api/question" && payload && typeof payload === "object") {
    const factCheck = factCheckForTemplate(payload.templateId);
    if (factCheck) payload.__factCheck = factCheck;
    // Recorded so the prompt can emphasise the name wherever it is shown.
    // Validated against the room's own players rather than trusted, so a
    // crafted request cannot make arbitrary text bold.
    const claimed = Array.isArray(payload.namedPlayerNames) ? payload.namedPlayerNames : [];
    const realNames = new Set(Object.values(room.players).map((seat) => cleanText(seat.name, 24)));
    payload.__namedPlayerNames = claimed.
      map((name) => cleanText(name, 24)).
      filter((name) => name && realNames.has(name)).
      slice(0, 4);
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
    return updatePlayerCustomGahook(room, payload, context);
  }
  if (pathname === "/api/player/custom-gahook-slot") {
    return selectPlayerCustomGahookSlot(room, payload, context);
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
  if (pathname === "/api/player/poke" && LIVE_GAME_PHASES.includes(room.phase) && !gahookEffectsAllowed(room)) {
    return { ok: false, error: "The host has turned Gahook effects off for this game." };
  }
  if (pathname === "/api/player/duel-challenge" && !lobbyArenaEnabled(room)) {
    return { ok: false, error: "The host has turned off lobby duels." };
  }
  if (pathname === "/api/player/poke") {
    return pokeFromPlayer(room, payload);
  }
  if (pathname === "/api/player/counter-poke") {
    return counterPokeFromPlayer(room, payload);
  }
  if (pathname === "/api/player/duel-challenge") {
    return challengeGahookDuel(room, payload);
  }
  if (pathname === "/api/player/duel-accept") {
    return acceptGahookDuel(room, payload);
  }
  if (pathname === "/api/player/duel-tap") {
    return tapGahookDuel(room, payload);
  }
  if (pathname === "/api/player/duel-react") {
    return reactToGahookArena(room, payload);
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
  if (pathname === "/api/herd/answer") {
    return submitHerdAuthoredAnswer(room, payload);
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
    if (room.phase !== "building" && room.phase !== "herd-writing") {
      return { ok: false, error: room.phase === "lobby" ? "Lock in the game options first." : "This game cannot be started right now." };
    }
    const check = getStartCheck(room);
    if (!check.ok) {
      return check;
    }
    if (room.gameMode === "herd" && room.phase === "building") {
      beginHerdAnswerWriting(room);
      return { ok: true, phase: room.phase };
    }
    startGame(room, { preparedQuestions: room.phase === "herd-writing" });
    return { ok: true, phase: room.phase };
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
    const result = pokePlayer(room, payload, hostPlayer?.name || "Host", { allowPhases: ["lobby", "building", "reading", "answering", "reveal", "finished"], gahookForm: hostPlayer?.gahookForm || "monkey", senderPlayer: hostPlayer });
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
  if (pathname === "/api/host/remove-content") {
    const hostCheck = requireHost(room, payload);
    if (!hostCheck.ok) {
      return hostCheck;
    }
    return removeContent(room, payload);
  }
  if (pathname === "/api/host/report/resolve") {
    const hostCheck = requireHost(room, payload);
    if (!hostCheck.ok) {
      return hostCheck;
    }
    const result = resolveReport(room, cleanText(payload?.reportId, 80));
    if (result.ok) broadcastState(room, { immediate: true });
    return result;
  }
  if (pathname === "/api/player/report") {
    return reportContent(room, payload);
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

async function createRoomAction(payload) {
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
    refreshRoomExpiry(existingRoom, playerKey);
    return {
      ok: true,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      code: existingRoom.code,
      role: "host",
      created: false,
      roomUrl: "/" + existingRoom.code
    };
  }
  if (!existingRoom && passwordEnabled && !password) {
    return { ok: false, error: "Enter a room password first." };
  }
  if (!existingRoom && passwordEnabled && password.length < 4) {
    return { ok: false, error: "Use at least four characters for a room password." };
  }
  if (!existingRoom && (draining || shuttingDown)) {
    return { ok: false, error: "This server is finishing its current games before an update. Try again in a few minutes.", draining: true };
  }
  if (!existingRoom && lobbies.size >= MAX_ACTIVE_ROOMS) {
    return { ok: false, error: "The server has reached its active room limit. Try again shortly." };
  }

  if (existingRoom) {
    if (isCredentialBanned(existingRoom, playerKey)) {
      return { ok: false, error: "You're banned from this room.", banned: true };
    }
    if (roomHasPassword(existingRoom) && !await verifyRoomPassword(existingRoom, password)) {
      return { ok: false, error: "Wrong password.", wrongPassword: true };
    }
    // The caller has now proven it may enter, so its credential can read state
    // and open an event stream before the join form is completed.
    admitCredential(existingRoom, playerKey);
    refreshRoomExpiry(existingRoom, playerKey);
    return {
      ok: true,
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      code: existingRoom.code,
      role: playerKey && existingRoom.hostKey === playerKey ? "host" : "player",
      created: false,
      roomUrl: "/" + existingRoom.code
    };
  }

  const room = createLobby(requestedCode || generateRoomCode());
  counters.rooms_created += 1;
  room.hostKey = playerKey;
  if (passwordEnabled) {
    await setRoomPassword(room, password);
  }
  scheduleRoomExpiry(room, { awaitingConnection: true });
  return {
    ok: true,
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
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

async function joinPlayer(room, payload, context = {}) {
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
  if (roomHasPassword(room) && !await verifyRoomPassword(room, password)) {
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

  const account = context.account || null;
  const accountView = account ? accountService.publicStatus(account).account : null;
  const savedSlot = accountView?.savedCustomGahooks?.find((item) => item.slot === 0);
  let initialCustomGahook = publicCustomGahook();
  if (!existing && savedSlot?.configuration) {
    try {
      initialCustomGahook = normaliseCustomGahook(room, savedSlot.configuration, initialCustomGahook);
    } catch (error) {
      console.warn("Saved custom Gahook could not be restored:", error?.message || error);
    }
  }

  const player = existing ?? {
    id: createPublicPlayerId(),
    name,
    score: 0,
    avatarId,
    gahookForm,
    customGahook: initialCustomGahook,
    customGahookSlot: 0,
    customGahookSlots: accountView?.customGahookSlots || 1,
    accountId: account?.id || "",
    careerRoundStats: emptyCareerStats(),
    dashTopScore: 0,
    dashScore: 0,
    dashPlayerY: 0,
    dashRunning: false,
    dashRunId: "",
    dashUpdatedAt: 0,
    connected: true,
    ready: false,
    questionsSubmitted: 0,
    herdAnswersSubmitted: 0,
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
    counterSpamSenderId: "",
    counterSpamCount: 0,
    counterSpamLastAt: 0,
    counterOffer: null,
    gahookDuelWins: 0,
    avatarImageDataUrl,
    joinedAt: Date.now()
  };

  if (room.phase === "lobby" || !existing) {
    player.name = name;
    player.avatarId = avatarId;
    player.avatarImageDataUrl = avatarImageDataUrl;
    player.gahookForm = gahookForm;
  }

  if (account && (!player.accountId || ["lobby", "building", "herd-writing"].includes(room.phase))) {
    player.accountId = account.id;
    player.customGahookSlots = accountView?.customGahookSlots || 1;
  }
  player.careerRoundStats = player.careerRoundStats || emptyCareerStats();
  player.customGahookSlot = Math.max(0, Math.min((player.customGahookSlots || 1) - 1, Number(player.customGahookSlot) || 0));

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
  const result = pokePlayer(room, { playerId: target?.id || playerId }, sender.name, { allowPhases: ["lobby", "building", "reading", "answering", "reveal", "finished"], gahookForm: sender.gahookForm, senderPlayer: sender });
  if (!result.ok && claimKey) delete room.game.pokeUses[claimKey];
  return result;
}

function counterPokeFromPlayer(room, payload) {
  const sender = getPayloadPlayer(room, payload);
  if (!sender || !sender.connected) {
    return { ok: false, error: "Join the lobby before Counter Gahooking." };
  }
  if (room.phase !== "lobby" && room.phase !== "building") {
    return { ok: false, error: "Counter Gahooks are available while the room is waiting." };
  }
  const offer = sender.counterOffer;
  const now = Date.now();
  if (!offer || offer.expiresAt <= now || cleanText(payload?.offerId, 80) !== offer.id) {
    sender.counterOffer = null;
    return { ok: false, error: "That Counter Gahook chance has expired." };
  }
  const target = room.players[offer.senderPlayerId];
  if (!target?.connected || target.id === sender.id) {
    sender.counterOffer = null;
    return { ok: false, error: "That player is no longer available to counter." };
  }

  sender.counterOffer = null;
  const duelChallengeUntil = now + COUNTER_GAHOOK_OVERLAY_MS;
  const result = pokePlayer(room, { playerId: target.id }, sender.name, {
    allowPhases: ["lobby", "building"],
    kindOverride: "counter",
    message: "Spam returned",
    gahookForm: sender.gahookForm,
    senderPlayer: sender,
    duelChallengeUntil,
    now,
    skipBroadcast: true
  });
  if (!result.ok) return result;
  broadcastState(room, { immediate: true });
  return { ...result, duelChallengeUntil };
}

function challengeGahookDuel(room, payload) {
  const challenger = getPayloadPlayer(room, payload);
  if (!challenger?.connected) {
    return { ok: false, error: "Join the lobby before starting Gahook Arena." };
  }
  if (room.phase !== "lobby" && room.phase !== "building") {
    return { ok: false, error: "Gahook Arena is a lobby side-game." };
  }
  const counterPoke = challenger.latestPoke;
  const now = Date.now();
  if (counterPoke?.kind !== "counter" || (counterPoke.duelChallengeUntil || 0) <= now) {
    return { ok: false, error: "That Gahook Arena challenge chance has expired." };
  }
  const challenged = room.players[counterPoke.senderPlayerId];
  if (!challenged?.connected || challenged.id === challenger.id) {
    return { ok: false, error: "That player is no longer available for Gahook Arena." };
  }
  if (room.gahookDuel) {
    return { ok: false, error: "This room already has a Gahook Arena match." };
  }
  clearGahookDuel(room);
  const duel = {
    id: crypto.randomUUID(),
    status: "challenge",
    challengerId: challenger.id,
    challengedId: challenged.id,
    createdAt: now,
    challengeExpiresAt: now + GAHOOK_DUEL_CHALLENGE_MS,
    introEndsAt: 0,
    gameplayStartsAt: 0,
    lastHit: null,
    winnerId: "",
    loserId: "",
    resultReason: "",
    finishedAt: 0,
    reactionEndsAt: 0,
    reactionCounts: { congrats: 0, boos: 0 },
    lastReaction: null
  };
  room.gahookDuel = duel;
  scheduleGahookDuelDeadline(room);
  const result = pokePlayer(room, { playerId: challenged.id }, challenger.name, {
    allowPhases: ["lobby", "building"],
    kindOverride: "duel-challenge",
    message: "Enter Gahook Arena",
    gahookForm: challenger.gahookForm,
    senderPlayer: challenger,
    duelId: duel.id,
    duelChallengeUntil: duel.challengeExpiresAt,
    skipBroadcast: true
  });
  if (!result.ok) {
    clearGahookDuel(room);
    return result;
  }
  broadcastState(room, { immediate: true });
  return { ok: true, duelId: duel.id, challengeExpiresAt: duel.challengeExpiresAt };
}

function acceptGahookDuel(room, payload) {
  const player = getPayloadPlayer(room, payload);
  const duel = room.gahookDuel;
  const now = Date.now();
  if (!player?.connected || !duel || duel.status !== "challenge" || duel.id !== cleanText(payload?.duelId, 80)) {
    return { ok: false, error: "That Gahook Arena challenge is no longer available." };
  }
  if (duel.challengedId !== player.id || duel.challengeExpiresAt <= now) {
    return { ok: false, error: "That Gahook Arena challenge has expired." };
  }
  const challenger = room.players[duel.challengerId];
  if (!challenger?.connected || (room.phase !== "lobby" && room.phase !== "building")) {
    clearGahookDuel(room);
    return { ok: false, error: "Both players need to be in the waiting room." };
  }

  clearGahookDuelTimer(room);
  duel.status = "active";
  duel.startedAt = now;
  duel.introEndsAt = now + GAHOOK_ARENA_INTRO_MS;
  duel.gameplayStartsAt = duel.introEndsAt;
  initialiseArena(duel);
  challenger.latestPoke = null;
  player.latestPoke = null;
  scheduleGahookDuelDeadline(room);
  broadcastState(room, { immediate: true });
  return { ok: true, duelId: duel.id, introEndsAt: duel.introEndsAt };
}

function tapGahookDuel(room, payload) {
  const player = getPayloadPlayer(room, payload);
  const duel = room.gahookDuel;
  if (!player?.connected || !duel || duel.id !== cleanText(payload?.duelId, 80) || !["active", "finished"].includes(duel.status)) {
    return { ok: false, error: "That Gahook Arena match is not active." };
  }
  const now = Date.now();
  if (duel.status === "active" && now >= duel.endsAt) {
    finishGahookDuel(room, "", "", "time");
  }
  const result = tapArena(duel, player.id, payload?.targetId, now);
  if (result.ok && !result.duplicate) {
    if (result.winnerId) finishGahookDuel(room, result.winnerId, result.opponentId, "five-ahead");
    else broadcastState(room);
  }
  return { ...result, duel: publicGahookDuel(room, player.id) };
}

function reactToGahookArena(room, payload) {
  const sender = getPayloadPlayer(room, payload);
  const duel = room.gahookDuel;
  const now = Date.now();
  if (!sender?.connected || !duel || duel.status !== "finished" || duel.id !== cleanText(payload?.duelId, 80)) {
    return { ok: false, error: "That Gahook Arena celebration is over." };
  }
  if (!duel.winnerId) return { ok: false, error: "This arena ended in a draw." };
  if (now >= duel.reactionEndsAt) {
    return { ok: false, error: "That Gahook Arena celebration is over." };
  }
  if ([duel.challengerId, duel.challengedId].includes(sender.id)) {
    return { ok: false, error: "The crowd controls the Arena reactions." };
  }
  const reaction = cleanText(payload?.reaction, 20);
  const isCongrats = reaction === "congrats";
  const isBoo = reaction === "boo";
  if (!isCongrats && !isBoo) return { ok: false, error: "Choose an Arena reaction." };
  const targetId = isCongrats ? duel.winnerId : duel.loserId;
  const target = room.players[targetId];
  if (!target?.connected) return { ok: false, error: "That Arena player has left." };
  const result = pokePlayer(room, { playerId: target.id }, sender.name, {
    allowPhases: ["lobby", "building"],
    kindOverride: reaction,
    message: isCongrats ? "ARENA CHAMPION" : "GET GOT",
    senderId: sender.id,
    senderPlayer: sender,
    skipBroadcast: true
  });
  if (!result.ok) return result;
  duel.reactionCounts[isCongrats ? "congrats" : "boos"] += 1;
  duel.lastReaction = {
    id: crypto.randomUUID(),
    kind: reaction,
    senderId: sender.id,
    senderName: sender.name,
    targetId,
    at: now
  };
  broadcastState(room, { immediate: true });
  return { ok: true, reaction, count: duel.reactionCounts[isCongrats ? "congrats" : "boos"] };
}

function roundPokeFromPlayer(room, payload) {
  const sender = getPayloadPlayer(room, payload);
  if (!sender || !sender.connected) {
    return { ok: false, error: "Join the game before Gahooking." };
  }
  if (room.phase !== "reading" && room.phase !== "answering") {
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

  const result = pokePlayer(room, { playerId: target.id }, sender.name, { allowPhases: ["reading", "answering"], skipBroadcast: true, gahookForm: sender.gahookForm, senderPlayer: sender });
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

  // One logical Gahook must have one timestamp. Callers that already computed a
  // deadline from their own clock read pass it in, otherwise the overlay window
  // is a millisecond short whenever the clock ticks between the two reads.
  const now = Number(options.now) || Date.now();
  const specialKind = cleanText(options.kindOverride, 20);
  const messageOverride = cleanText(options.message, 40);
  const isFinalSpecial = specialKind === "congrats" || specialKind === "boo";
  const isInteractiveSpecial = specialKind === "counter" || specialKind === "duel-challenge";
  const senderPlayer = options.senderPlayer;
  const gahookForm = normaliseGahookForm(options.gahookForm);
  const customGahook = !isFinalSpecial && gahookForm === "custom" ? publicCustomGahook(senderPlayer) : null;
  let kind = isFinalSpecial || isInteractiveSpecial ? specialKind : "normal";
  let ultimateStack = 0;
  let ultimateUntil = 0;
  let scorePenalty = 0;
  let pointsStolen = 0;

  if (!isFinalSpecial && !isInteractiveSpecial && LIVE_GAME_PHASES.includes(room.phase) && senderPlayer?.id && senderPlayer.id !== player.id && gahookScoringAllowed(room)) {
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
  } else if (!isFinalSpecial && !isInteractiveSpecial) {
    clearExpiredUltimateGahook(player);
    const spam = registerGahookSpam(player, now);
    player.pokeCount = spam.count;
    const counterSpam = registerCounterGahookSpam(player, senderPlayer?.id || "", now);
    if (
      senderPlayer?.id &&
      senderPlayer.id !== player.id &&
      counterSpam.count >= COUNTER_GAHOOK_TRIGGER_COUNT &&
      (counterSpam.count - COUNTER_GAHOOK_TRIGGER_COUNT) % COUNTER_GAHOOK_REPEAT_EVERY === 0
    ) {
      player.counterOffer = {
        id: crypto.randomUUID(),
        senderPlayerId: senderPlayer.id,
        spamCount: counterSpam.count,
        createdAt: now,
        expiresAt: now + COUNTER_GAHOOK_OFFER_MS
      };
    }
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
    message: messageOverride || (kind === "get-got" ? "GET GOT" : ""),
    duelId: cleanText(options.duelId, 80),
    duelChallengeUntil: Math.max(0, Number(options.duelChallengeUntil) || 0),
    counterOfferId: player.counterOffer?.id || "",
    counterOfferUntil: player.counterOffer?.expiresAt || 0
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

  if (senderPlayer?.id && senderPlayer.id !== player.id) {
    incrementCareerStat(senderPlayer, "gahooksSent");
    incrementCareerStat(player, "gahooksReceived");
  }

  if (!options.skipBroadcast) {
    broadcastState(room, { immediate: true });
  }
  return {
    ok: true,
    pokeId: player.latestPoke.id,
    kind,
    scorePenalty,
    pointsStolen,
    counterAvailable: Boolean(player.counterOffer && player.counterOffer.expiresAt > now),
    counterOfferId: player.counterOffer?.id || ""
  };
}

function registerCounterGahookSpam(player, senderPlayerId, now) {
  if (!senderPlayerId) {
    player.counterSpamSenderId = "";
    player.counterSpamCount = 0;
    player.counterSpamLastAt = 0;
    return { count: 0 };
  }
  const sameSender = player.counterSpamSenderId === senderPlayerId;
  const withinStreak = now - (player.counterSpamLastAt || 0) <= COUNTER_GAHOOK_SPAM_IDLE_MS;
  if (!sameSender || !withinStreak) {
    player.counterSpamSenderId = senderPlayerId;
    player.counterSpamCount = 1;
  } else {
    player.counterSpamCount = (player.counterSpamCount || 0) + 1;
  }
  player.counterSpamLastAt = now;
  return { count: player.counterSpamCount };
}

function resetCounterGahookSpam(player) {
  player.counterSpamSenderId = "";
  player.counterSpamCount = 0;
  player.counterSpamLastAt = 0;
  player.counterOffer = null;
}

function clearGahookDuelTimer(room) {
  if (room?.gahookDuelTimer) {
    clearTimeout(room.gahookDuelTimer);
    room.gahookDuelTimer = null;
  }
}

function clearGahookDuel(room) {
  clearGahookDuelTimer(room);
  room.gahookDuel = null;
}

function scheduleGahookDuelDeadline(room) {
  clearGahookDuelTimer(room);
  const duel = room.gahookDuel;
  if (!duel) return;
  const now = Date.now();
  let deadlineAt = 0;
  if (duel.status === "challenge") {
    deadlineAt = duel.challengeExpiresAt;
  } else if (duel.status === "active") {
    deadlineAt = duel.gameplayStartsAt > now ? duel.gameplayStartsAt : duel.endsAt;
  } else if (duel.status === "finished") {
    deadlineAt = duel.reactionEndsAt || duel.finishedAt + GAHOOK_DUEL_FINISH_MS;
  }
  if (!deadlineAt) return;
  const duelId = duel.id;
  room.gahookDuelTimer = setTimeout(() => resolveExpiredGahookDuel(room, duelId), Math.max(0, deadlineAt - now));
}

function resolveExpiredGahookDuel(room, duelId) {
  const duel = room.gahookDuel;
  if (!duel || duel.id !== duelId) return;
  const now = Date.now();
  if (duel.status === "challenge") {
    if (now < duel.challengeExpiresAt) return scheduleGahookDuelDeadline(room);
    clearGahookDuel(room);
    broadcastState(room, { immediate: true });
    return;
  }
  if (duel.status === "active") {
    if (now >= duel.endsAt) {
      finishGahookDuel(room, "", "", "time");
      return;
    }
    broadcastState(room, { immediate: true });
    scheduleGahookDuelDeadline(room);
    return;
  }
  if (duel.status === "finished") {
    if (now < duel.reactionEndsAt) return scheduleGahookDuelDeadline(room);
    clearGahookDuel(room);
    broadcastState(room, { immediate: true });
  }
}

function finishGahookDuel(room, winnerId, loserId, reason) {
  const duel = room.gahookDuel;
  if (!duel || duel.status !== "active") return;
  clearGahookDuelTimer(room);
  duel.status = "finished";
  duel.revision++;
  duel.winnerId = winnerId;
  duel.loserId = loserId;
  duel.resultReason = reason;
  duel.finishedAt = Date.now();
  duel.reactionEndsAt = duel.finishedAt + GAHOOK_DUEL_FINISH_MS;
  const winner = room.players[winnerId];
  if (winner) winner.gahookDuelWins = (winner.gahookDuelWins || 0) + 1;
  scheduleGahookDuelDeadline(room);
  broadcastState(room, { immediate: true });
}

function handleGahookDuelDisconnect(room, playerId) {
  const duel = room.gahookDuel;
  if (!duel || ![duel.challengerId, duel.challengedId].includes(playerId)) return;
  if (duel.status === "active") {
    const player = room.players[playerId];
    if (player) {
      duel.departedPlayers ||= {};
      duel.departedPlayers[playerId] = { id: player.id, name: player.name, avatarId: player.avatarId, connected: false };
    }
    const winnerId = duel.challengerId === playerId ? duel.challengedId : duel.challengerId;
    finishGahookDuel(room, winnerId, playerId, "left");
  } else if (duel.status === "challenge") {
    clearGahookDuel(room);
  }
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
  if (LIVE_GAME_PHASES.includes(room.phase) && gahookScoringAllowed(room)) {
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
    if (payload?.__factCheck) question.factCheck = payload.__factCheck;
    if (payload?.__namedPlayerNames?.length) question.namedPlayerNames = payload.__namedPlayerNames;
    if (room.approveQuestions) {
      room.pendingQuestions.push(question);
    } else {
      room.questions.push(question);
    }
    incrementCareerStat(player, "questionsAuthored");
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
  if (room.phase !== "building" && room.phase !== "herd-writing") {
    return { ok: false, error: room.phase === "lobby" ? "Question making has not started yet." : "The quiz is already running." };
  }

  const ready = Boolean(payload?.ready);
  if (room.phase === "herd-writing") {
    const required = herdAssignmentsForPlayer(room, player.id);
    const completed = required.filter((assignment) => assignment.text).length;
    if (ready && completed < required.length) {
      return { ok: false, error: "Write an answer for every assigned Herd question before marking ready." };
    }
    player.ready = ready;
    player.herdAnswersSubmitted = completed;
    broadcastState(room, { immediate: true });
    return { ok: true };
  }
  if (room.gameMode !== "herd") {
    if (ready && countQuestionsForPlayer(room, player.id) < room.maxQuestionsPerPlayer) {
      return { ok: false, error: "Add your required questions before marking ready." };
    }
    if (ready && countPendingQuestionsForPlayer(room, player.id) > 0) {
      return { ok: false, error: "Wait for the host to approve your questions first." };
    }
  }

  player.ready = ready;
  player.questionsSubmitted = countQuestionsForPlayer(room, player.id);
  broadcastState(room, { immediate: true });
  return { ok: true };
}

function herdAssignmentsForPlayer(room, playerId) {
  return room.quizQuestions.flatMap((question) =>
    (question.answers || []).filter((answer) => answer.authorId === playerId).map((answer) => ({
      ...answer,
      questionId: question.id,
      question
    }))
  );
}

function submitHerdAuthoredAnswer(room, payload) {
  const player = getPayloadPlayer(room, payload);
  if (!player?.connected) {
    return { ok: false, error: "Join the room before writing Herd answers." };
  }
  if (room.phase !== "herd-writing" || room.gameMode !== "herd") {
    return { ok: false, error: "Herd answer writing is not open right now." };
  }
  const questionId = cleanText(payload?.questionId, 80);
  const answerText = cleanText(payload?.text, 80);
  if (!answerText) {
    return { ok: false, error: "Write an answer before submitting it." };
  }
  const question = room.quizQuestions.find((candidate) => candidate.id === questionId);
  const answer = question?.answers?.find((candidate) => candidate.authorId === player.id);
  if (!question || !answer) {
    return { ok: false, error: "That Herd question is not assigned to you." };
  }
  answer.text = answerText;
  answer.authorName = player.name;
  answer.authorAvatarId = player.avatarId;
  answer.authorAvatarImageDataUrl = player.avatarImageDataUrl || "";
  answer.submittedAt = Date.now();
  player.herdAnswersSubmitted = herdAssignmentsForPlayer(room, player.id).filter((assignment) => assignment.text).length;
  player.ready = false;
  broadcastState(room, { immediate: true });
  return { ok: true, questionId, answerId: answer.id, completed: player.herdAnswersSubmitted };
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

async function updatePlayerCustomGahook(room, payload, context = {}) {
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
  const requestedSlot = payload?.slot === undefined ? player.customGahookSlot || 0 : Math.trunc(Number(payload.slot));
  const account = context.account;
  const accountMatches = Boolean(account && player.accountId && account.id === player.accountId);
  const slotCount = accountMatches ? accountService.publicStatus(account).account?.customGahookSlots || 1 : 1;
  if (!Number.isInteger(requestedSlot) || requestedSlot < 0 || requestedSlot >= slotCount) {
    return { ok: false, error: accountMatches ? "That custom Gahook slot is locked." : "Sign in to use saved custom Gahook slots." };
  }
  pruneRoomMedia(room);
  const previous = player.customGahook;
  let customGahook;
  try {
    customGahook = normaliseCustomGahook(room, payload?.customGahook, player.customGahook);
  } catch (error) {
    pruneRoomMedia(room);
    return { ok: false, error: error.message || "That custom Gahook is not valid." };
  }
  player.customGahook = customGahook;
  player.customGahookSlot = requestedSlot;
  player.customGahookSlots = slotCount;
  if (accountMatches) {
    try {
      await accountService.saveCustomGahook(account.id, requestedSlot, portableCustomGahook(room, customGahook));
    } catch (error) {
      player.customGahook = previous;
      pruneRoomMedia(room);
      return { ok: false, error: error?.message || "That custom Gahook could not be saved to your account." };
    }
  }
  pruneRoomMedia(room);
  broadcastState(room, { immediate: true });
  return { ok: true, customGahook: publicCustomGahook(player), slot: requestedSlot, slotCount, persisted: accountMatches, gahookForm: normaliseGahookForm(player.gahookForm) };
}

async function selectPlayerCustomGahookSlot(room, payload, context = {}) {
  const player = getPayloadPlayer(room, payload);
  if (!player) return { ok: false, error: "Join the game before choosing a custom Gahook slot." };
  if (room.phase !== "lobby" && room.phase !== "building") return { ok: false, error: "Custom Gahook slots can be changed while the room is waiting." };
  const account = context.account;
  if (!account || account.id !== player.accountId) return { ok: false, error: "Sign in to use saved custom Gahook slots." };
  const accountView = accountService.publicStatus(account).account;
  const slot = Math.trunc(Number(payload?.slot));
  if (!Number.isInteger(slot) || slot < 0 || slot >= (accountView?.customGahookSlots || 1)) return { ok: false, error: "That custom Gahook slot is locked." };
  const saved = accountView.savedCustomGahooks.find((item) => item.slot === slot);
  let selected = publicCustomGahook();
  if (saved?.configuration) {
    try {
      selected = normaliseCustomGahook(room, saved.configuration, selected);
    } catch (error) {
      return { ok: false, error: error?.message || "That saved custom Gahook could not be loaded." };
    }
  }
  player.customGahook = selected;
  player.customGahookSlot = slot;
  player.customGahookSlots = accountView.customGahookSlots;
  pruneRoomMedia(room);
  broadcastState(room, { immediate: true });
  return { ok: true, customGahook: publicCustomGahook(player), slot, slotCount: player.customGahookSlots };
}

function portableCustomGahook(room, value) {
  const custom = publicCustomGahook(value);
  return {
    ...custom,
    frames: custom.frames.map((frame) => roomAssetDataUrl(room, frame, "image")).filter(Boolean),
    customAudioDataUrl: custom.customAudioDataUrl ? roomAssetDataUrl(room, custom.customAudioDataUrl, "audio") : ""
  };
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

  // Checked before anything is touched, so a rejected Save leaves the whole
  // room unchanged rather than half-applied. A host looking at a stale modal
  // must not silently revert a change somebody else already made.
  if (room.settingsRevision === undefined) room.settingsRevision = 0;
  const expectedRevision = payload?.settingsRevision;
  if (expectedRevision !== undefined && Number(expectedRevision) !== room.settingsRevision) {
    return {
      ok: false,
      error: "These settings changed while you were editing. Reopen the rules and try again.",
      settingsRevision: room.settingsRevision,
      stale: true
    };
  }

  const currentSettings = roomGameSettings(room);
  const normalised = normaliseGameSettings(payload || {}, currentSettings);
  if (!normalised.ok) {
    return { ok: false, error: normalised.error };
  }
  const nextSettings = normalised.settings;
  // Only a change of *game family* invalidates written content: a Quiz question
  // and a Herd prompt are different things. Switching Classic and Majority
  // changes how the same questions are scored, so it must leave the bank and
  // everybody's readiness alone.
  const familyChanged = nextSettings.gameFamily !== currentSettings.gameFamily;
  applyGameSettings(room, nextSettings);
  const presetRequested = Object.prototype.hasOwnProperty.call(payload || {}, "roundPreset") ||
    Object.prototype.hasOwnProperty.call(payload || {}, "questionPreset");
  if (familyChanged && nextSettings.gameFamily === "herd" && !presetRequested) {
    // Herd starts Quick so a first session is short. The host can still pick
    // Full room, and their choice is remembered from then on.
    room.roundPreset = "quick";
  }
  if (familyChanged) {
    // A Quiz question and a Herd prompt are different things, so the outgoing
    // family's content is parked rather than deleted, and the incoming
    // family's own content comes back.
    stashFamilyQuestions(room, currentSettings.gameFamily);
    room.questions = [];
    room.pendingQuestions = [];
    room.quizQuestions = [];
  }
  // Merge whatever is parked for the family now in force. Doing this before the
  // quota is applied is what makes raising a limit restore parked questions.
  const restored = takeFamilyQuestions(room, nextSettings.gameFamily);
  room.questions = [...(room.questions || []), ...restored.questions];
  room.pendingQuestions = [...(room.pendingQuestions || []), ...restored.pending];

  room.settingsRevision += 1;
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
  const parkedSlot = savedBankSlot(room, nextSettings.gameFamily);
  const keptByPlayer = {};
  room.questions = room.questions.filter((question) => {
    const nextCount = (keptByPlayer[question.authorId] || 0) + 1;
    if (nextCount > nextLimit) {
      // Over the per-player quota for this game. Parked, not lost.
      parkedSlot.questions.push(question);
      return false;
    }
    keptByPlayer[question.authorId] = nextCount;
    return true;
  });
  const pendingKeptByPlayer = {};
  room.pendingQuestions = room.pendingQuestions.filter((question) => {
    const approvedCount = keptByPlayer[question.authorId] || 0;
    pendingKeptByPlayer[question.authorId] = (pendingKeptByPlayer[question.authorId] || 0) + 1;
    if (approvedCount + pendingKeptByPlayer[question.authorId] > nextLimit) {
      parkedSlot.pending.push(question);
      return false;
    }
    return true;
  });
  // Readiness follows what each player actually has in play now.
  Object.values(room.players).forEach((player) => {
    player.questionsSubmitted = countQuestionsForPlayer(room, player.id);
    if (player.questionsSubmitted < nextLimit) player.ready = false;
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
    // Hidden for the room, never deleted. Blanking the field destroyed an
    // upload outright, so turning the setting back on could not restore it and
    // the player had to find and upload their picture again.
    Object.values(room.players).forEach((player) => {
      if (!room.allowCustomProfiles) {
        if (player.avatarImageDataUrl) player.hiddenAvatarImageDataUrl = player.avatarImageDataUrl;
        player.avatarImageDataUrl = "";
      } else if (player.hiddenAvatarImageDataUrl) {
        player.avatarImageDataUrl = player.hiddenAvatarImageDataUrl;
        player.hiddenAvatarImageDataUrl = "";
      }
    });
  }
  if (typeof payload?.allowCustomGahooks === "boolean") {
    room.allowCustomGahooks = payload.allowCustomGahooks;
    Object.values(room.players).forEach((player) => {
      if (!room.allowCustomGahooks) {
        if (normaliseGahookForm(player.gahookForm) === "custom") {
          player.hiddenGahookForm = "custom";
          player.gahookForm = "monkey";
        }
      } else if (player.hiddenGahookForm) {
        player.gahookForm = player.hiddenGahookForm;
        player.hiddenGahookForm = "";
      }
    });
  }
  if (payload?.herdRoundTarget !== undefined) {
    const requested = Number(payload.herdRoundTarget);
    if (Number.isFinite(requested)) {
      room.herdRoundTarget = Math.max(1, Math.min(HERD_MAX_CUSTOM_ROUNDS, Math.trunc(requested)));
    }
  }
  if (GAHOOK_EFFECT_POLICIES.includes(payload?.gahookEffects)) {
    room.gahookEffects = payload.gahookEffects;
  }
  if (typeof payload?.lobbyArenaEnabled === "boolean") {
    room.lobbyArenaEnabled = payload.lobbyArenaEnabled;
    // Turning duels off cancels anything in flight, neutrally: nobody forfeits
    // and no score changes, because the host changed the rules, not the players.
    if (!room.lobbyArenaEnabled) clearGahookDuel(room);
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
    gahookEffects: gahookEffectsPolicy(room),
    lobbyArenaEnabled: lobbyArenaEnabled(room),
    // Published from the constants so the UI states the real rules rather than
    // a guess that drifts from the server.
    gahookStealPoints: GAHOOK_STEAL_POINTS,
    getGotPenaltyPoints: GET_GOT_SCORE_PENALTY,
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

  if (room.gameMode === "herd") {
    room.maxQuestionsPerPlayer = 1;
  } else if (room.roundPreset !== "custom") {
    room.maxQuestionsPerPlayer = questionsPerPlayerForPreset(room, room.roundPreset);
  }

  // Freeze the rules this game is played under. Results must be scored and
  // explained by what was in force when setup locked, not by whatever the
  // lobby shows later; on reconnect these win over a cached lobby snapshot.
  const lockedSettings = roomGameSettings(room);
  room.lockedRules = {
    gameFamily: lockedSettings.gameFamily,
    quizScoring: lockedSettings.quizScoring,
    gameMode: toLegacyGameMode(lockedSettings),
    roundPreset: room.roundPreset,
    maxQuestionsPerPlayer: room.maxQuestionsPerPlayer,
    promptStyle: room.promptStyle || "fun",
    lockedAt: Date.now()
  };

  room.phase = "building";
  room.phaseEndsAt = null;
  Object.values(room.players).forEach((player) => {
    player.ready = false;
    player.questionsSubmitted = countQuestionsForPlayer(room, player.id);
    player.herdAnswersSubmitted = 0;
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

  const activeGamePhase = ["reading", "answering", "reveal"].includes(room.phase);
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
  handleGahookDuelDisconnect(room, playerId);
  unregisterPlayerCredential(room, playerId, { ban: true });
  delete room.players[playerId];
  room.questions = room.questions.filter((question) => question.authorId !== playerId);
  room.pendingQuestions = room.pendingQuestions.filter((question) => question.authorId !== playerId);
  room.quizQuestions = room.quizQuestions.filter((question) => question.authorId !== playerId);
  // A kicked player also authored answers on other people's Herd prompts. Those
  // survive the question filter above, so without this the content the host just
  // removed somebody for stays in the game and is still voted on.
  room.quizQuestions.forEach((question) => {
    (question.answers || []).forEach((answer) => {
      if (answer.authorId === playerId) {
        answer.text = "";
        answer.removedByHost = true;
        answer.authorName = "Removed player";
        answer.authorAvatarImageDataUrl = "";
      }
    });
  });
  removeChatMessagesForPlayer(room, playerId);
  delete room.game.answers[playerId];
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
    }
  }

  broadcastState(room, { immediate: true });
  return { ok: true };
}

// One host control for every kind of player-made content, because during a live
// party the host needs one obvious button, not a submenu per media type.
function removeContent(room, payload) {
  const kind = cleanText(payload?.kind, 20);
  const targetId = cleanText(payload?.targetId, 80);

  if (kind === "chat") {
    const result = removeChatMessage(room, targetId);
    if (result.ok) broadcastState(room, { immediate: true });
    return result;
  }

  if (kind === "herd-answer") {
    // Blank the text but keep the answer slot, so the round's answer count and
    // scoring shape stay intact mid-game.
    let removed = 0;
    for (const question of room.quizQuestions) {
      for (const answer of question.answers || []) {
        if (answer.id === targetId || answer.authorId === targetId) {
          if (answer.text) removed += 1;
          answer.text = "";
          answer.removedByHost = true;
        }
      }
    }
    if (!removed) return { ok: false, error: "That answer is no longer here." };
    pruneRoomMedia(room);
    broadcastState(room, { immediate: true });
    return { ok: true, removed };
  }

  if (kind === "player-media") {
    const player = resolvePlayer(room, targetId);
    if (!player) return { ok: false, error: "Choose a player." };
    player.avatarImageDataUrl = "";
    player.customGahook = null;
    player.latestPoke = null;
    const chatRemoved = removeChatMessagesForPlayer(room, player.id);
    clearWhiteboardForPlayer(room, player.id);
    pruneRoomMedia(room);
    broadcastState(room, { immediate: true });
    return { ok: true, player: publicPlayer(room, player), chatRemoved };
  }

  if (kind === "question") {
    const before = room.questions.length + room.pendingQuestions.length;
    room.questions = room.questions.filter((question) => question.id !== targetId);
    room.pendingQuestions = room.pendingQuestions.filter((question) => question.id !== targetId);
    if (room.questions.length + room.pendingQuestions.length === before) {
      return { ok: false, error: "That question is no longer here." };
    }
    Object.values(room.players).forEach((player) => {
      player.questionsSubmitted = countQuestionsForPlayer(room, player.id);
    });
    pruneRoomMedia(room);
    broadcastState(room, { immediate: true });
    return { ok: true };
  }

  return { ok: false, error: "Choose what to remove." };
}

function reportContent(room, payload) {
  const reporter = getPayloadPlayer(room, payload);
  const isHost = isHostCredential(room, cleanText(payload?.playerKey, 80));
  if (!reporter && !isHost) {
    return { ok: false, error: "Join the room before reporting." };
  }
  const actor = reporter || { id: "host", name: "Host" };
  const result = addReport(room, actor, payload, actor.id);
  if (!result.ok) return result;
  broadcastState(room, { immediate: true });
  return { ok: true, reported: true };
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
  handleGahookDuelDisconnect(room, playerId);
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

  const answerId = cleanText(payload?.answerId, 20);
  const selected = question?.answers.find((answer) => answer.id === answerId);
  if (!selected) {
    return { ok: false, error: "That answer does not exist." };
  }
  // Herd pays a voter for picking the room's favourite and pays an author for
  // every vote their answer receives. Without this, writing an answer and then
  // voting for it collects both from a single choice.
  if (mode === "herd" && selected.authorId && selected.authorId === player.id) {
    return { ok: false, error: "You wrote that answer. Pick someone else's.", ownAnswer: true };
  }
  incrementCareerStat(player, "answersSubmitted");

  const elapsedMs = clamp(Date.now() - room.game.answerOpenedAt, 0, ANSWERING_MS);
  if (mode === "majority" || mode === "herd") {
    if (!room.game.firstAnswerPlayerId) {
      room.game.firstAnswerPlayerId = player.id;
    }

    room.game.answers[player.id] = {
      answerId,
      correct: null,
      points: null,
      elapsedMs,
      answeredAt: Date.now()
    };

    broadcastState(room, { immediate: true });
    if (allActivePlayersAnswered(room)) {
      windowedTransitionAfterAnswers(room);
    }
    return { ok: true, answerId, pendingResult: true };
  }

  const correct = selected.correct;
  const points = quizPoints(correct, elapsedMs, ANSWERING_MS);

  if (!room.game.firstAnswerPlayerId) {
    room.game.firstAnswerPlayerId = player.id;
  }

  player.score += points;
  if (correct) incrementCareerStat(player, "correctAnswers");
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

function scoreMajorityRound(room) {
  const question = getCurrentQuestion(room);
  if (!question || question.majorityScored) return;
  const eligiblePlayerIds = Array.isArray(room.game.eligiblePlayerIds) ?
    room.game.eligiblePlayerIds :
    Object.values(room.players).filter((player) => player.connected).map((player) => player.id);
  const result = buildMajorityResults({
    answers: question.answers,
    selections: Object.entries(room.game.answers).map(([playerId, answer]) => ({
      playerId,
      answerId: answer.answerId,
      elapsedMs: answer.elapsedMs,
      answeredAt: answer.answeredAt
    })),
    eligiblePlayerIds,
    predictedAnswerId: question.predictedAnswerId,
    authorId: question.authorId,
    answeringMs: ANSWERING_MS
  });

  result.playerResults.forEach((playerResult) => {
    const player = room.players[playerResult.playerId];
    const answer = room.game.answers[playerResult.playerId];
    if (player) {
      player.score += playerResult.points;
      if (playerResult.correct) incrementCareerStat(player, "popularChoices");
    }
    if (answer) {
      answer.correct = playerResult.correct;
      answer.points = playerResult.points;
    }
  });
  if (result.authorBonusAwarded && room.players[question.authorId]) {
    room.players[question.authorId].score += result.authorBonus;
  }
  question.majorityScored = true;
  question.majorityResults = result;
}

function scoreHerdRound(room) {
  const question = getCurrentQuestion(room);
  if (!question || question.herdScored) return;
  const eligiblePlayerIds = Array.isArray(room.game.eligiblePlayerIds) ?
    room.game.eligiblePlayerIds :
    Object.values(room.players).filter((player) => player.connected).map((player) => player.id);
  const result = buildHerdRoundResults({
    answers: question.answers.map((answer) => ({ id: answer.id, text: answer.text, authorId: answer.authorId })),
    selections: Object.entries(room.game.answers).map(([playerId, answer]) => ({
      playerId,
      answerId: answer.answerId,
      elapsedMs: answer.elapsedMs,
      answeredAt: answer.answeredAt
    })),
    eligiblePlayerIds,
    answeringMs: ANSWERING_MS
  });

  result.playerResults.forEach((playerResult) => {
    const player = room.players[playerResult.playerId];
    const answer = room.game.answers[playerResult.playerId];
    if (player) {
      player.score += playerResult.points;
      if (playerResult.correct) incrementCareerStat(player, "popularChoices");
    }
    if (answer) {
      answer.correct = playerResult.correct;
      answer.points = playerResult.points;
    }
  });
  result.authorResults.forEach((authorResult) => {
    const player = room.players[authorResult.playerId];
    if (player) {
      player.score += authorResult.points;
      incrementCareerStat(player, "herdVotesReceived", authorResult.voteCount);
    }
  });
  question.herdScored = true;
  question.herdResults = result;
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
  if (!room.paused && allConnectedPlayersVoted(room, question)) {
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
    gameSettings: { ...DEFAULT_GAME_SETTINGS },
    approveQuestions: false,
    allowCustomProfiles: true,
    allowCustomGahooks: true,
    gahookEffects: DEFAULT_GAHOOK_EFFECTS,
    lobbyArenaEnabled: true,
    promptStyle: "fun",
    roundPreset: DEFAULT_ROUND_PRESET,
    maxQuestionsPerPlayer: DEFAULT_QUESTIONS_PER_PLAYER,
    players: {},
    bannedPlayers: {},
    voteKicks: {},
    latestRoomPoke: null,
    lastGameSummary: null,
    gahookDuel: null,
    gahookDuelTimer: null,
    questions: [],
    pendingQuestions: [],
    quizQuestions: [],
    game: {
      currentQuestionIndex: -1,
      answerOpenedAt: null,
      answers: {},
      firstAnswerPlayerId: null,
      pokeUses: {},
      progressReady: {},
      waitingForProgress: false,
      progressSettleTimer: null,
      progressFallbackTimer: null,
      eligiblePlayerIds: null,
      playedQuestionIds: [],
      herdAssignmentCount: 0,
      matchId: "",
      statsRecorded: false
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


// The room keeps one writable truth for what is being played: `gameSettings`,
// the canonical { gameFamily, quizScoring } pair. `room.gameMode` is derived
// from it for the many existing call sites and for old clients, and is never
// written independently -- two writable spellings of the same fact drift, and
// the drift is silent.
function roomGameSettings(room) {
  return room.gameSettings || (room.gameSettings = { ...DEFAULT_GAME_SETTINGS });
}

function applyGameSettings(room, settings) {
  room.gameSettings = { gameFamily: settings.gameFamily, quizScoring: settings.quizScoring };
  room.gameMode = toLegacyGameMode(room.gameSettings);
  return room.gameSettings;
}

// Player-written content is kept in a saved bank, keyed by game family, that is
// separate from the questions selected for a game.
//
// Three quantities used to be conflated: what people have written, what this
// game will actually play, and how many each player may submit. Treating them
// as one meant a shorter game or a switch to Herd destroyed writing that people
// had done. Parking rather than deleting also makes the quota symmetric --
// raising it again brings the parked questions straight back.
function savedQuestionBank(room) {
  if (!room.savedQuestionBank) room.savedQuestionBank = {};
  return room.savedQuestionBank;
}

function savedBankSlot(room, family) {
  const bank = savedQuestionBank(room);
  if (!bank[family]) bank[family] = { questions: [], pending: [] };
  return bank[family];
}

/** Park the room's current written content under a family, keeping nothing. */
function stashFamilyQuestions(room, family) {
  const slot = savedBankSlot(room, family);
  slot.questions.push(...(room.questions || []));
  slot.pending.push(...(room.pendingQuestions || []));
}

/** Take everything parked for a family, emptying its slot. */
function takeFamilyQuestions(room, family) {
  const slot = savedBankSlot(room, family);
  const taken = { questions: slot.questions, pending: slot.pending };
  savedQuestionBank(room)[family] = { questions: [], pending: [] };
  return taken;
}

function savedQuestionCount(room, family) {
  const slot = savedBankSlot(room, family);
  return slot.questions.length + slot.pending.length;
}


// Suggestions come from the shared catalogue, rendered here rather than in the
// browser. Two reasons: the factual answer and its explanation never enter a
// player's bundle, and the host's chosen style is applied in one place instead
// of the client and the server each picking content their own way.
//
// The bag is per room and per style, so a room works through the library before
// a prompt comes round again. It is two small objects, so it cannot grow.
function roomTemplateBag(room, style) {
  if (!room.promptBags) room.promptBags = {};
  if (!room.promptBags[style]) room.promptBags[style] = new TemplateBag(style);
  return room.promptBags[style];
}

function suggestQuestion(room, payload) {
  const player = resolvePlayer(room, cleanText(payload?.playerId, 80)) || getPlayerByCredential(room, payload?.playerKey);
  if (!player && !isHostCredential(room, payload?.playerKey)) {
    return { ok: false, error: "Join the room before asking for a suggestion." };
  }

  const style = room.promptStyle === "education" ? "educational" : "funny";
  // Only connected player seats are eligible to be named. A removed, banned or
  // disconnected seat must never appear in a prompt.
  const eligible = Object.values(room.players).
    filter((seat) => seat.connected && seat.id).
    map((seat) => ({ id: seat.id, name: cleanText(seat.name, 24) || "Player" }));

  const template = roomTemplateBag(room, style).next();
  // The requester is the prospective author of this draft, and an author is
  // always shown the key to their own question. What must never happen is a
  // key reaching somebody who is about to answer it, which is a different
  // payload entirely. An opinion prompt has no key to give.
  const instance = instantiateTemplate(template, { eligible, includeAnswerKey: true });

  return {
    ok: true,
    suggestion: {
      templateId: instance.templateId,
      templateVersion: instance.templateVersion,
      kind: instance.kind,
      text: instance.text,
      options: instance.options.map((option) => ({ id: option.id, text: option.text })),
      namedPlayerNames: instance.namedPlayerNames,
      // Null for every funny prompt. The author must choose one themselves
      // before the question can be played under Classic rules.
      intendedAnswerId: instance.factualAnswerId,
      explanation: instance.explanation
    }
  };
}

function normaliseGameMode(value, fallback = DEFAULT_GAME_MODE) {
  const mode = cleanText(value, 20).toLowerCase();
  return GAME_MODES.includes(mode) ? mode : fallback;
}

function cleanHost(value) {
  const host = String(value || "").trim();
  return /^[a-z0-9.:-]+$/i.test(host) ? host : "";
}

function cleanRevision(value) {
  return String(value ?? "").trim().replace(/[^A-Za-z0-9._+-]/g, "").slice(0, 64);
}

// Development convenience only. Production images have no .git, so they rely on
// the GAHOOKZ_REVISION build argument instead.
function readWorkingTreeRevision() {
  try {
    const gitDir = path.join(__dirname, "..", ".git");
    let head = fs.readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
    if (head.startsWith("ref: ")) {
      const ref = head.slice(5).trim();
      try {
        head = fs.readFileSync(path.join(gitDir, ref), "utf8").trim();
      } catch {
        const packed = fs.readFileSync(path.join(gitDir, "packed-refs"), "utf8");
        head = packed.split("\n").find((line) => line.endsWith(" " + ref))?.split(" ")[0] || "";
      }
    }
    return head ? cleanRevision(head).slice(0, 12) : "";
  } catch {
    return "";
  }
}

function cleanInstanceId(value) {
  const id = String(value || "").trim();
  return /^[a-z0-9_-]{1,48}$/i.test(id) ? id : "";
}

function metricsAuthorized(req) {
  if (!METRICS_TOKEN) return false;
  const match = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  const expected = crypto.createHash("sha256").update(METRICS_TOKEN).digest();
  const incoming = crypto.createHash("sha256").update(match[1]).digest();
  return crypto.timingSafeEqual(expected, incoming);
}

function sendMetrics(res) {
  const players = [...lobbies.values()].reduce((total, room) => total + Object.keys(room.players || {}).length, 0);
  const connectedPlayers = [...lobbies.values()].reduce((total, room) => total + Object.values(room.players || {}).filter((player) => player.connected).length, 0);
  const modes = Object.fromEntries(GAME_MODES.map((mode) => [mode, 0]));
  for (const room of lobbies.values()) modes[normaliseGameMode(room.gameMode)] += 1;
  const lines = [
    "# HELP gahookz_rooms Active authoritative rooms in this process.",
    "# TYPE gahookz_rooms gauge",
    "gahookz_rooms " + lobbies.size,
    "# HELP gahookz_draining 1 while this node is refusing new rooms before a deploy.",
    "# TYPE gahookz_draining gauge",
    "gahookz_draining " + (draining ? 1 : 0),
    "# HELP gahookz_players Players retained in active rooms.",
    "# TYPE gahookz_players gauge",
    "gahookz_players " + players,
    "gahookz_players_connected " + connectedPlayers,
    "# HELP gahookz_event_streams Open server-sent event connections.",
    "# TYPE gahookz_event_streams gauge",
    "gahookz_event_streams " + admission.currentEventStreams(),
    "gahookz_event_tickets " + eventTickets.size,
    ...GAME_MODES.map((mode) => 'gahookz_rooms_by_mode{mode="' + mode + '"} ' + modes[mode]),
    "# HELP gahookz_requests_total Requests and outcomes observed since start.",
    "# TYPE gahookz_requests_total counter",
    ...Object.entries(counters).map(([key, value]) => "gahookz_" + key + "_total " + value),
    "# HELP process_resident_memory_bytes Resident memory used by this Node process.",
    "# TYPE process_resident_memory_bytes gauge",
    "process_resident_memory_bytes " + process.memoryUsage().rss,
    "process_uptime_seconds " + process.uptime().toFixed(3),
    ""
  ];
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(lines.join("\n"));
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

// Reading room state is an authorisation decision, not a side effect of knowing
// the four-letter code. A banned credential is refused everywhere, and a
// protected room only answers the host, a joined player, or a credential whose
// password was already verified by /api/room.
function roomAccessGranted(room, credential) {
  if (isCredentialBanned(room, credential)) return false;
  if (!roomHasPassword(room)) return true;
  if (isHostCredential(room, credential)) return true;
  if (getPlayerByCredential(room, credential)) return true;
  return isCredentialAdmitted(room, credential);
}

function roomAccessDenial(room, credential) {
  counters.room_access_denied += 1;
  return isCredentialBanned(room, credential) ?
  { status: 403, body: { ok: false, error: "You're banned from this room.", code: "room_banned", banned: true } } :
  { status: 401, body: { ok: false, error: "This room needs its password.", code: "room_locked", roomLocked: true } };
}

function roomHasPassword(room) {
  return Boolean(room?.passwordHash);
}

async function setRoomPassword(room, password) {
  room.passwordSalt = crypto.randomBytes(16).toString("hex");
  room.passwordHash = await hashRoomPassword(password, room.passwordSalt);
}

function hashRoomPassword(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(password || ""), String(salt || ""), 32, {
      N: 16_384,
      r: 8,
      p: 1,
      maxmem: 32 * 1024 * 1024
    }, (error, derivedKey) => {
      if (error) reject(error); else resolve(derivedKey.toString("hex"));
    });
  });
}

async function verifyRoomPassword(room, password) {
  if (!roomHasPassword(room)) {
    return true;
  }
  if (!password) {
    return false;
  }
  const incoming = await hashRoomPassword(password, room.passwordSalt);
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
  if (room.gameMode === "herd") return 1;
  const normalisedPreset = normaliseRoundPreset(preset);
  if (normalisedPreset === "quick") return 1;
  if (normalisedPreset === "standard") return standardQuestionsPerPlayer(setupPlayerCount(room));
  return clamp(Number(customLimit || room.maxQuestionsPerPlayer || DEFAULT_QUESTIONS_PER_PLAYER), MIN_QUESTIONS_PER_PLAYER, MAX_QUESTIONS_PER_PLAYER);
}

// Herd played one round per player with no ceiling, so twenty players meant
// twenty rounds of writing, reading and voting. "Quick" was not quick; it was
// the same length as everything else. These are the contextual lengths:
//   Quick     - up to eight rounds
//   Full room - one prompt per eligible player, the old behaviour
//   Custom    - a chosen number of rounds, within what has been written
const HERD_QUICK_MAX_ROUNDS = 8;
const HERD_MAX_CUSTOM_ROUNDS = 20;

function herdCustomRoundTarget(room) {
  const requested = Number(room.herdRoundTarget);
  if (!Number.isFinite(requested)) return HERD_QUICK_MAX_ROUNDS;
  return Math.max(1, Math.min(HERD_MAX_CUSTOM_ROUNDS, Math.trunc(requested)));
}

function maximumRoundsForPreset(room) {
  if (room.gameMode === "herd") {
    if (room.roundPreset === "quick") return HERD_QUICK_MAX_ROUNDS;
    if (room.roundPreset === "custom") return herdCustomRoundTarget(room);
    // "Full room": every eligible player's prompt gets played.
    return Number.POSITIVE_INFINITY;
  }
  if (room.roundPreset === "quick") return QUICK_MAX_ROUNDS;
  if (room.roundPreset === "standard") return STANDARD_MAX_ROUNDS;
  return Number.POSITIVE_INFINITY;
}

function plannedQuestionCount(room) {
  if (LIVE_GAME_PHASES.includes(room.phase) || room.phase === "herd-writing" || room.phase === "finished") {
    return room.quizQuestions.length;
  }
  const playerCount = connectedSetupPlayerCount(room);
  if (playerCount === 0) return 0;
  const submittedTotal = playerCount * questionsPerPlayerForPreset(room);
  return Math.min(submittedTotal, maximumRoundsForPreset(room));
}

function estimatedGameDurationMs(room) {
  const perRound = READING_MS + ANSWERING_MS + REVEAL_MS;
  return plannedQuestionCount(room) * perRound;
}

// A question written from an educational template keeps its verified answer so
// the reveal can show a fact check. This is not a scoring key: under Majority
// and Herd the room's votes still decide the points, and a popular wrong
// answer stays the winner. The two are shown separately and never conflated.
function factCheckForTemplate(templateId) {
  const template = findTemplate(cleanText(templateId, 40));
  if (!template || template.kind !== "educational") return null;
  const answer = template.options.find((option) => option.id === template.factualAnswerId);
  if (!answer) return null;
  return { answerText: answer.text, explanation: template.explanation };
}

function normaliseQuestion(room, payload, player) {
  if (room.gameMode === "majority") {
    return normaliseMajorityQuestion(room, payload, player);
  }
  if (room.gameMode === "herd") {
    return normaliseHerdQuestion(room, payload, player);
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

function normaliseHerdQuestion(room, payload, player) {
  const text = cleanText(payload?.text, 180);
  if (text.length < 4) {
    throw new Error("Herd question needs a little more text.");
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

function normaliseMajorityQuestion(room, payload, player) {
  const text = cleanText(payload?.text, 180);
  if (text.length < 4) {
    throw new Error("Opinion question needs a little more text.");
  }

  const incomingAnswers = Array.isArray(payload?.answers) ? payload.answers : [];
  if (incomingAnswers.length > 4) {
    throw new Error("Use four answers or fewer.");
  }
  const usableAnswers = incomingAnswers.
  map((answer) => ({ text: cleanText(answer?.text, 80), predicted: Boolean(answer?.predicted) })).
  filter((answer) => answer.text);

  if (usableAnswers.length < 2) {
    throw new Error("Add at least two possible answers.");
  }
  if (usableAnswers.filter((answer) => answer.predicted).length !== 1) {
    throw new Error("Predict the one answer you think everyone will choose.");
  }

  const answers = usableAnswers.map((answer, index) => ({
    ...ANSWER_META[index],
    text: answer.text,
    correct: false,
    predicted: answer.predicted
  }));
  const predictedAnswerId = answers.find((answer) => answer.predicted)?.id || "";

  return {
    id: crypto.randomUUID(),
    mode: "majority",
    text,
    answers,
    predictedAnswerId,
    imageDataUrl: validateImage(room, payload?.imageDataUrl),
    authorId: player.id,
    authorName: player.name,
    authorAvatarId: player.avatarId,
    authorAvatarImageDataUrl: player.avatarImageDataUrl || "",
    createdAt: Date.now()
  };
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
    namedPlayerNames: question.namedPlayerNames || [],
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
      correct: answer.correct,
      predicted: Boolean(answer.predicted)
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
    namedPlayerNames: question.namedPlayerNames || [],
    imageDataUrl: question.imageDataUrl || "",
    answers: (question.answers || []).map((answer) => ({
      id: answer.id,
      label: answer.label,
      text: answer.text,
      correct: Boolean(answer.correct),
      predicted: Boolean(answer.predicted)
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

function publicHerdAssignments(room, playerId = "") {
  return room.quizQuestions.flatMap((question) =>
    (question.answers || []).filter((answer) => !playerId || answer.authorId === playerId).map((answer) => ({
      questionId: question.id,
      answerId: answer.id,
      text: answer.text || "",
      submitted: Boolean(answer.text),
      question: {
        id: question.id,
        text: question.text,
        namedPlayerNames: question.namedPlayerNames || [],
    namedPlayerNames: question.namedPlayerNames || [],
        imageDataUrl: question.imageDataUrl || "",
        author: publicQuestionAuthor(room, question)
      },
      answerAuthor: publicHerdAnswerAuthor(room, answer)
    }))
  );
}

function publicHerdPreparation(room) {
  const eligibleIds = new Set(room.game.eligiblePlayerIds || []);
  const assignments = room.quizQuestions.flatMap((question) => question.answers || []);
  return {
    completed: assignments.filter((answer) => answer.text).length,
    total: assignments.length,
    players: Object.values(room.players).filter((player) => eligibleIds.has(player.id)).map((player) => {
      const required = herdAssignmentsForPlayer(room, player.id);
      return {
        player: publicPlayer(room, player),
        completed: required.filter((assignment) => assignment.text).length,
        total: required.length,
        ready: Boolean(player.ready)
      };
    })
  };
}

function publicPlayer(room, player) {
  return presentPlayer(room, player, {
    avatarId: normaliseAvatarId(player.avatarId),
    submitted: countQuestionsForPlayer(room, player.id),
    pending: countPendingQuestionsForPlayer(room, player.id),
    isHost: getCredentialForPlayer(room, player.id) === room.hostKey
  });
}

function publicCounterGahookOffer(room, player) {
  const offer = player.counterOffer;
  if (!offer || offer.expiresAt <= Date.now()) {
    player.counterOffer = null;
    return null;
  }
  const sender = room.players[offer.senderPlayerId];
  if (!sender?.connected) {
    player.counterOffer = null;
    return null;
  }
  return {
    id: offer.id,
    senderPlayerId: sender.id,
    senderName: sender.name,
    spamCount: offer.spamCount,
    expiresAt: offer.expiresAt
  };
}

function publicGahookDuel(room, viewerPlayerId = "") {
  const duel = room.gahookDuel;
  if (!duel || (duel.status !== "active" && duel.status !== "finished")) return null;
  const challenger = room.players[duel.challengerId] || duel.departedPlayers?.[duel.challengerId];
  const challenged = room.players[duel.challengedId] || duel.departedPlayers?.[duel.challengedId];
  if (!challenger || !challenged) return null;
  const arenaPlayer = (player) => ({
    ...publicPlayer(room, player),
    customGahook: player.gahookForm === "custom" ? publicCustomGahook(player) : null
  });
  return {
    id: duel.id,
    status: duel.status,
    challengerId: duel.challengerId,
    challengedId: duel.challengedId,
    players: [arenaPlayer(challenger), arenaPlayer(challenged)],
    ...arenaProgress(duel, viewerPlayerId),
    serverTime: Date.now(),
    introEndsAt: duel.introEndsAt,
    gameplayStartsAt: duel.gameplayStartsAt,
    lastHit: duel.lastHit ? { ...duel.lastHit } : null,
    winnerId: duel.winnerId,
    loserId: duel.loserId,
    resultReason: duel.resultReason,
    finishedAt: duel.finishedAt,
    reactionEndsAt: duel.reactionEndsAt,
    reactionCounts: { ...duel.reactionCounts },
    lastReaction: duel.lastReaction ? { ...duel.lastReaction } : null
  };
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
  if (room.phase === "herd-writing" && room.gameMode === "herd") {
    const assignments = room.quizQuestions.flatMap((question) => question.answers || []);
    if (!assignments.length || assignments.some((answer) => !answer.text)) {
      return { ok: false, error: "Every assigned Herd answer needs to be written first." };
    }
    const eligibleIds = new Set(room.game.eligiblePlayerIds || []);
    const waitingOn = Object.values(room.players).filter((player) => eligibleIds.has(player.id) && !player.ready);
    return waitingOn.length ? { ok: false, error: "Every Herd answer writer needs to mark ready." } : { ok: true };
  }
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
  } else if (mode === "majority") {
    const preset = GENERATED_MAJORITY_PRESETS[generatedIndex % GENERATED_MAJORITY_PRESETS.length];
    const predictedIndex = generatedIndex % preset.answers.length;
    payload = {
      text: preset.text,
      answers: preset.answers.map((text, index) => ({ text, predicted: index === predictedIndex }))
    };
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
  if (room.phase === "herd-writing" && room.gameMode === "herd") {
    let generatedAnswerCount = 0;
    room.quizQuestions.forEach((question, questionIndex) => {
      (question.answers || []).forEach((answer, answerIndex) => {
        if (answer.text) return;
        answer.text = GENERATED_HERD_ANSWERS[(questionIndex * 4 + answerIndex) % GENERATED_HERD_ANSWERS.length];
        answer.generated = true;
        answer.submittedAt = Date.now();
        generatedAnswerCount += 1;
      });
    });
    Object.values(room.players).forEach((player) => {
      player.herdAnswersSubmitted = herdAssignmentsForPlayer(room, player.id).filter((assignment) => assignment.text).length;
      player.ready = true;
    });
    startGame(room, { preparedQuestions: true });
    return { ok: true, generatedAnswerCount, totalQuestions: room.quizQuestions.length };
  }
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
  if (room.gameMode === "herd") {
    beginHerdAnswerWriting(room);
    return { ok: true, generatedCount, totalQuestions: room.quizQuestions.length, phase: room.phase };
  }
  startGame(room);
  return { ok: true, generatedCount, totalQuestions: room.quizQuestions.length, phase: room.phase };
}

function cleanQuestionRoundState(question, options = {}) {
  const {
    votes: _votes,
    majorityScored: _majorityScored,
    majorityResults: _majorityResults,
    herdScored: _herdScored,
    herdResults: _herdResults,
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

function beginHerdAnswerWriting(room) {
  clearPhaseTimer(room);
  clearGahookDuel(room);
  const eligiblePlayerIds = shuffle(Object.values(room.players).
    filter((player) => player.connected).
    map((player) => player.id));
  room.game.eligiblePlayerIds = eligiblePlayerIds;
  room.game.playedQuestionIds = [];
  room.quizQuestions = selectQuestionsForGame(room, eligiblePlayerIds);
  const plan = buildHerdAssignmentPlan(eligiblePlayerIds, room.quizQuestions);
  room.quizQuestions.forEach((question) => {
    question.answers = (plan.byQuestionId[question.id] || []).map((assignment) => ({
      // Display slot, not the writing rotation: see HerdAnswerAssignment.
      ...ANSWER_META[assignment.displayIndex],
      text: "",
      correct: false,
      authorId: assignment.answerAuthorId,
      authorName: room.players[assignment.answerAuthorId]?.name || "Player",
      authorAvatarId: room.players[assignment.answerAuthorId]?.avatarId || AVATAR_PRESETS[0],
      authorAvatarImageDataUrl: room.players[assignment.answerAuthorId]?.avatarImageDataUrl || ""
    }));
  });
  room.game.herdAssignmentCount = plan.assignments.length;
  room.phase = "herd-writing";
  room.phaseEndsAt = null;
  Object.values(room.players).forEach((player) => {
    player.ready = false;
    player.herdAnswersSubmitted = 0;
  });
  broadcastState(room, { immediate: true });
}

function startGame(room, { preparedQuestions = false } = {}) {
  clearPhaseTimer(room);
  clearGahookDuel(room);
  room.latestRoomPoke = null;
  room.paused = false;
  room.pausedAt = null;
  room.pausedRemainingMs = 0;
  room.pausedWaitingForProgress = false;
  room.game.matchId = crypto.randomUUID();
  room.game.statsRecorded = false;
  if (!preparedQuestions) {
    room.game.eligiblePlayerIds = Object.values(room.players).
    filter((player) => player.connected).
    map((player) => player.id);
  }
  room.game.playedQuestionIds = [];
  if (!preparedQuestions) {
    room.quizQuestions = selectQuestionsForGame(room, room.game.eligiblePlayerIds);
  }
  Object.values(room.players).forEach((player) => {
    clearUltimateGahookState(player, true);
    clearUltimateCongratulationsState(player, true);
    resetUltimateGahookThreshold(player);
    resetCounterGahookSpam(player);
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

function incrementCareerStat(player, key, amount = 1) {
  if (!player) return;
  player.careerRoundStats = player.careerRoundStats || emptyCareerStats();
  if (!Object.prototype.hasOwnProperty.call(player.careerRoundStats, key)) return;
  const increment = Math.max(0, Math.trunc(Number(amount) || 0));
  player.careerRoundStats[key] = Math.max(0, Math.trunc(Number(player.careerRoundStats[key]) || 0)) + increment;
}

function recordCareerResults(room) {
  if (!room.game?.matchId || room.game.statsRecorded) return;
  room.game.statsRecorded = true;
  const eligiblePlayers = gameEligiblePlayers(room);
  const ranked = scorePlacements(eligiblePlayers).ranked;
  room.lastGameSummary = {
    matchId: room.game.matchId,
    gameMode: normaliseGameMode(room.gameMode),
    finishedAt: Date.now(),
    leaderboard: ranked.map((player) => ({
      id: player.id,
      name: cleanText(player.name, 24),
      avatarId: normaliseAvatarId(player.avatarId),
      avatarImageDataUrl: player.avatarImageDataUrl || "",
      score: Math.trunc(Number(player.score) || 0),
      rank: player.rank
    }))
  };
  for (const placement of ranked) {
    const player = room.players[placement.id];
    if (!player?.accountId) continue;
    const score = Math.max(0, Math.trunc(Number(player.score) || 0));
    const statDelta = matchCareerDelta({
      score,
      placement: placement.rank,
      playerCount: ranked.length,
      roundStats: player.careerRoundStats
    });
    void accountService.recordMatch({
      matchId: room.game.matchId,
      accountId: player.accountId,
      roomCode: room.code,
      gameMode: normaliseGameMode(room.gameMode),
      score,
      placement: placement.rank,
      playerCount: ranked.length,
      statDelta
    }).catch((error) => console.error("Career result persistence failed:", error?.message || error));
  }
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
  recordCareerResults(room);
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
    recordCareerResults(room);
    broadcastState(room, { immediate: true });
    return;
  }

  room.phase = "reading";
  room.phaseEndsAt = Date.now() + READING_MS;
  room.game.currentQuestionIndex = index;
  room.game.answerOpenedAt = null;
  room.game.answers = {};
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
  const durationMs = ANSWERING_MS;
  room.phaseEndsAt = Date.now() + durationMs;
  room.game.answerOpenedAt = Date.now();

  broadcastState(room, { immediate: true });
  room.phaseTimer = setTimeout(() => waitForProgressThen(room, "answering"), durationMs);
}

function transitionToReveal(room) {
  if (room.phase !== "answering") {
    return;
  }

  clearPhaseTimer(room);
  resetProgressWait(room);
  const question = getCurrentQuestion(room);
  const mode = question?.mode || room.gameMode || DEFAULT_GAME_MODE;
  if (mode === "majority") {
    scoreMajorityRound(room);
  } else if (mode === "herd") {
    scoreHerdRound(room);
  }
  room.game.playedQuestionIds = room.game.playedQuestionIds || [];
  if (question?.id && !room.game.playedQuestionIds.includes(question.id)) {
    room.game.playedQuestionIds.push(question.id);
  }
  room.phase = "reveal";
  const revealDuration = REVEAL_MS;
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
  transitionToReveal(room);
}

function windowedTransitionAfterAnswers(room) {
  clearPhaseTimer(room);
  if (room.paused) return;
  room.phaseTimer = setTimeout(() => transitionAfterAnswers(room), PROGRESS_SETTLE_MS);
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
  room.phaseTimer = setTimeout(() => waitForProgressThen(room, room.phase), remainingMs);
  broadcastState(room, { immediate: true });
  return { ok: true, paused: false };
}

function skipPhase(room) {
  if (room.phase === "reading") {
    beginAnswering(room);
  } else if (room.phase === "answering") {
    transitionAfterAnswers(room);
  } else if (room.phase === "reveal") {
    beginQuestion(room, room.game.currentQuestionIndex + 1);
  }
}

function resetLobby(room, options = {}) {
  clearPhaseTimer(room);
  clearProgressTimers(room);
  clearBroadcastTimer(room);
  // Deliberately no clearRoomExpiry() here. A reset does not mean somebody is
  // watching the room, and cancelling the pending deadline without scheduling a
  // replacement left the room resident forever when no client was connected.
  clearGahookDuel(room);
  room.lockedRules = null;
  const playedQuestionIds = new Set(room.game?.playedQuestionIds || []);
  const lastGameSummary = room.lastGameSummary || null;
  const unplayedQuestions = (room.questions || []).
    filter((question) => !playedQuestionIds.has(question.id) && (question.mode || room.gameMode) === room.gameMode).
    map((question) => cleanQuestionRoundState(question, { carriedOver: true }));
  const reusableQuestions = options.reuseUnusedQuestions ? unplayedQuestions : [];
  if (!options.reuseUnusedQuestions) {
    // A full reset returns to a clean lobby, but the writing people did is
    // parked under its family rather than thrown away. It comes back when the
    // room next settles on that family, and `savedQuestionCount` makes it
    // visible in the meantime so nothing disappears silently.
    const slot = savedBankSlot(room, roomGameSettings(room).gameFamily);
    slot.questions.push(...unplayedQuestions);
    slot.pending.push(...(room.pendingQuestions || []));
  }
  Object.values(room.players).forEach((player) => {
    clearUltimateGahookState(player);
    clearUltimateCongratulationsState(player, true);
    resetUltimateGahookThreshold(player);
    player.score = 0;
    player.ready = false;
    player.herdAnswersSubmitted = 0;
    player.pokeCount = 0;
    player.latestPoke = null;
    resetCounterGahookSpam(player);
    player.shamePokes = 0;
    player.congratulationsCount = 0;
    player.dashScore = 0;
    player.dashPlayerY = 0;
    player.dashRunning = false;
    player.dashRunId = "";
    player.dashUpdatedAt = 0;
    player.careerRoundStats = emptyCareerStats();
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
  room.questions = reusableQuestions;
  room.pendingQuestions = [];
  room.quizQuestions = [];
  room.latestRoomPoke = null;
  room.lastGameSummary = lastGameSummary;
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
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    code: room.code,
    stateVersion: room.stateVersion || 0,
    serverTime: Date.now(),
    hasPassword: roomHasPassword(room),
    isHost,
    gameMode: room.gameMode || DEFAULT_GAME_MODE,
    gahookEffects: gahookEffectsPolicy(room),
    lobbyArenaEnabled: lobbyArenaEnabled(room),
    // Published from the constants so the UI states the real rules rather than
    // a guess that drifts from the server.
    gahookStealPoints: GAHOOK_STEAL_POINTS,
    getGotPenaltyPoints: GET_GOT_SCORE_PENALTY,
    pendingQuestionCount: (room.pendingQuestions || []).length,
    herdRoundTarget: room.herdRoundTarget || 8,
    gameFamily: roomGameSettings(room).gameFamily,
    quizScoring: roomGameSettings(room).quizScoring,
    settingsRevision: room.settingsRevision || 0,
    lockedRules: room.lockedRules || null,
    savedQuestionCount: savedQuestionCount(room, roomGameSettings(room).gameFamily),
    savedQuestionCountOtherFamily: savedQuestionCount(room, roomGameSettings(room).gameFamily === "quiz" ? "herd" : "quiz"),
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
    gahookDuel: publicGahookDuel(room, ownPlayer?.id || ""),
    chatMessages: canViewRoomSocial ? publicChatMessages(room) : [],
    whiteboardStrokes: canViewRoomSocial ? publicWhiteboardStrokes(room) : [],
    whiteboardRevision: canViewRoomSocial ? room.whiteboardRevision || 0 : 0,
    players: publicPlayers(room),
    bannedPlayers: publicBannedPlayers(room),
    reports: isHost ? publicReports(room) : [],
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
    answerSelections: publicAnswerSelections(room, ownPlayer?.id),
    currentQuestion: currentQuestion ? publicQuestion(room, currentQuestion, effectiveRole, room.phase, ownPlayer?.id || "") : null,
    ownPlayer: ownPlayer ? publicPlayer(room, ownPlayer) : null,
    ownCustomGahook: ownPlayer ? publicCustomGahook(ownPlayer) : null,
    customGahookOptions: canViewRoomSocial ? {
      ...customGahookOptions(),
      slotCount: Math.max(1, Number(ownPlayer?.customGahookSlots) || 1),
      selectedSlot: Math.max(0, Number(ownPlayer?.customGahookSlot) || 0),
      accountLinked: Boolean(ownPlayer?.accountId)
    } : null,
    ownQuestions: ownPlayer ? publicOwnQuestions(room, ownPlayer.id) : [],
    ownHerdAssignments: ownPlayer && room.phase === "herd-writing" ? publicHerdAssignments(room, ownPlayer.id) : [],
    herdAnswerReview: isHost && room.phase === "herd-writing" ? publicHerdAssignments(room) : [],
    herdPreparation: room.phase === "herd-writing" ? publicHerdPreparation(room) : null,
    ownPoke: ownPlayer ? ownPlayer.latestPoke ?? null : null,
    ownCounterOffer: ownPlayer ? publicCounterGahookOffer(room, ownPlayer) : null,
    ownAnswer: ownPlayer ? room.game.answers[ownPlayer.id] ?? null : null,
    ownGahookUses: ownPlayer ? publicOwnGahookUses(room, ownPlayer.id) : { question: [], questionTargetId: "", round: [], reveal: [] },
    ownVote: ownPlayer && currentQuestion?.votes ? currentQuestion.votes[ownPlayer.id] ?? null : null,
    questionResults: questionResults(room),
    lastGameSummary: room.lastGameSummary || null,
    phaseDurations: {
      reading: READING_MS,
      answering: ANSWERING_MS,
      reveal: REVEAL_MS
    }
  };
}

function publicQuestion(room, question, role, phase, viewerPlayerId = "") {
  const mode = question.mode || room.gameMode || DEFAULT_GAME_MODE;
  const revealAnswer = phase === "reveal" || phase === "finished";
  const showAnswers = phase === "reading" || phase === "answering" || revealAnswer;
  const showAnswerText = phase === "answering" || revealAnswer;
  const correct = question.answers.find((answer) => answer.correct);
  const majorityAnswerId = mode === "majority" && revealAnswer ? question.majorityResults?.winningAnswerId || null : null;
  const herdAnswerId = mode === "herd" && revealAnswer ? question.herdResults?.winningAnswerId || null : null;
  const voteSummary = summarizeVotes(question);

  return {
    id: question.id,
    mode,
    text: question.text,
    namedPlayerNames: question.namedPlayerNames || [],
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
      ownAnswer: mode === "herd" && Boolean(viewerPlayerId) && answer.authorId === viewerPlayerId,
      correct: revealAnswer ?
      mode === "majority" ? answer.id === majorityAnswerId :
      mode === "herd" ? answer.id === herdAnswerId :
      answer.correct :
      undefined,
      author: revealAnswer && mode === "herd" ? publicHerdAnswerAuthor(room, answer) : null,
      authoredPoints: revealAnswer && mode === "herd" ? question.herdResults?.authorResults?.find((result) => result.answerId === answer.id)?.points || 0 : undefined,
      predicted: revealAnswer && mode === "majority" ? answer.id === question.predictedAnswerId : undefined
    })) :
    [],
    correctAnswerId: revealAnswer ?
    mode === "majority" ? majorityAnswerId :
    mode === "herd" ? herdAnswerId :
    correct?.id :
    null,
    majorityResults: mode === "majority" && revealAnswer ? publicMajorityResults(room, question) : null,
    herdResults: mode === "herd" && revealAnswer ? publicHerdResults(room, question) : null
  };
}

function publicHerdAnswerAuthor(room, answer) {
  const player = room.players[answer.authorId];
  return {
    id: answer.authorId,
    name: player?.name || answer.authorName || "Player",
    avatarId: normaliseAvatarId(player?.avatarId || answer.authorAvatarId),
    avatarImageDataUrl: player?.avatarImageDataUrl || answer.authorAvatarImageDataUrl || ""
  };
}

function publicHerdResults(room, question) {
  const results = question.herdResults || {};
  return {
    answeredCount: results.answeredCount || 0,
    eligiblePlayerCount: results.eligiblePlayerCount || 0,
    topCount: results.topCount || 0,
    winningAnswerId: results.winningAnswerId || null,
    tiedByVotes: Boolean(results.tiedByVotes),
    tieBrokenBySpeed: Boolean(results.tieBrokenBySpeed),
    tieBreakReason: results.tieBreakReason || "none",
    // Shown as a separate "Fact check" at the reveal. The room's vote still
    // decides the points; a popular wrong answer stays the winner and is never
    // relabelled as factually correct.
    factCheck: question?.factCheck || null,
    groups: (results.groups || []).map((group) => ({
      answerId: group.id,
      text: group.text,
      count: group.count || 0,
      fastestElapsedMs: group.fastestElapsedMs,
      averageElapsedMs: group.averageElapsedMs,
      winner: group.id === results.winningAnswerId,
      author: publicHerdAnswerAuthor(room, question.answers.find((answer) => answer.id === group.id) || group),
      players: (group.playerIds || []).map((playerId) => room.players[playerId]).filter(Boolean).map((player) => publicPlayer(room, player))
    })),
    playerResults: (results.playerResults || []).map((result) => ({
      ...result,
      player: room.players[result.playerId] ? publicPlayer(room, room.players[result.playerId]) : null
    })),
    authorResults: (results.authorResults || []).map((result) => ({
      ...result,
      player: room.players[result.playerId] ? publicPlayer(room, room.players[result.playerId]) : null
    }))
  };
}

function publicVoteSelections(room, question) {
  return validQuestionVoteEntries(question).map(([playerId, value]) => {
    const player = room.players[playerId];
    return player ? { value, player: publicPlayer(room, player) } : null;
  }).filter(Boolean);
}

function publicMajorityResults(room, question) {
  const results = question.majorityResults || {};
  return {
    answeredCount: results.answeredCount || 0,
    eligiblePlayerCount: results.eligiblePlayerCount || 0,
    topCount: results.topCount || 0,
    winningAnswerId: results.winningAnswerId || null,
    tiedByVotes: Boolean(results.tiedByVotes),
    tieBrokenBySpeed: Boolean(results.tieBrokenBySpeed),
    tieBreakReason: results.tieBreakReason || "none",
    // Shown as a separate "Fact check" at the reveal. The room's vote still
    // decides the points; a popular wrong answer stays the winner and is never
    // relabelled as factually correct.
    factCheck: question?.factCheck || null,
    predictedAnswerId: results.predictedAnswerId || null,
    predictionMatched: Boolean(results.predictionMatched),
    unanimous: Boolean(results.unanimous),
    authorBonus: results.authorBonus || 0,
    authorBonusAwarded: Boolean(results.authorBonusAwarded),
    groups: (results.groups || []).map((group) => ({
      answerId: group.answerId,
      label: group.label,
      color: group.color,
      shape: group.shape,
      text: group.text,
      count: group.count || 0,
      fastestElapsedMs: group.fastestElapsedMs,
      averageElapsedMs: group.averageElapsedMs,
      winner: group.answerId === results.winningAnswerId,
      players: (group.playerIds || []).
      map((playerId) => room.players[playerId]).
      filter(Boolean).
      map((player) => publicPlayer(room, player))
    })),
    playerResults: (results.playerResults || []).map((result) => ({
      ...result,
      player: room.players[result.playerId] ? publicPlayer(room, room.players[result.playerId]) : null
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
    namedPlayerNames: question.namedPlayerNames || [],
    authorName: question.authorName,
    author: publicQuestionAuthor(room, question),
    goodVotes: summary.good,
    badVotes: summary.bad,
    voteScore: summary.score
  };
}

function questionResults(room) {
  const playedQuestions = room.quizQuestions.filter((question) => summarizeVotes(question).total > 0);
  if (playedQuestions.length === 0) {
    return { best: null, worst: null };
  }

  const sorted = [...playedQuestions].sort((a, b) => {
    const scoreDiff = summarizeVotes(b).score - summarizeVotes(a).score;
    return scoreDiff || a.createdAt - b.createdAt;
  });

  return {
    best: publicQuestionResult(room, sorted[0]),
    worst: publicQuestionResult(room, sorted[sorted.length - 1])
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

// Only the room's own host may push the expiry deadline further out. Anyone who
// knows the code may ensure a deadline exists, but must not be able to hold an
// idle room open indefinitely by re-opening it every few minutes.
function refreshRoomExpiry(room, credential) {
  if (isHostCredential(room, credential)) clearRoomExpiry(room);
  scheduleRoomExpiry(room, { awaitingConnection: true });
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
  clearGahookDuel(room);
  clearBroadcastTimer(room);
  clearRoomExpiry(room);
  counters.rooms_expired += 1;
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
  pathname === "/legal" ||
  pathname === "/legal/" ||
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

  if (!absolutePath.startsWith(publicDir + path.sep)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  // A Syncthing conflict copy is a stale duplicate of a real browser file. The
  // development container bind-mounts the synchronised tree, so without this the
  // previous build of the whole app stays downloadable at a predictable URL.
  if (isSyncArtifact(absolutePath)) {
    res.writeHead(404);
    res.end("Not found");
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
