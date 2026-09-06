import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";
const code = Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
const hostKey = "dash-host-" + Date.now();
const runnerKey = "dash-runner-" + Date.now();
const watcherKey = "dash-watcher-" + Date.now();

async function post(route, body, expectOk = true) {
  const response = await fetch(BASE_URL + route, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (expectOk) assert.equal(data.ok, true, route + ": " + data.error);
  return data;
}

async function snapshot(playerKey) {
  const response = await fetch(BASE_URL + "/api/state", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, role: "player", playerKey })
  });
  assert.equal(response.ok, true);
  return response.json();
}

await post("/api/room", { code, playerKey: hostKey });
await post("/api/player/join", { code, playerKey: runnerKey, name: "Dash Runner", avatarId: "zap", gahookForm: "croc" });
await post("/api/player/join", { code, playerKey: watcherKey, name: "Dash Watcher", avatarId: "pop", gahookForm: "koala" });

await post("/api/player/dash", { code, playerKey: runnerKey, running: true, score: 42, playerY: -88, runId: "run-one" });
let state = await snapshot(watcherKey);
let runner = state.players.find((player) => player.name === "Dash Runner");
assert.equal(runner.gahookForm, "croc");
assert.equal(runner.dashRunning, true);
assert.equal(runner.dashScore, 42);
assert.equal(runner.dashPlayerY, -88);
assert.equal(runner.dashTopScore, 42);

await post("/api/player/dash", { code, playerKey: runnerKey, running: false, crashed: true, score: 19, playerY: 0, runId: "run-two" });
state = await snapshot(runnerKey);
runner = state.players.find((player) => player.name === "Dash Runner");
assert.equal(runner.dashRunning, false);
assert.equal(runner.dashTopScore, 42, "A later low run must not reduce the room personal best");

const stranger = await post("/api/player/dash", { code, playerKey: "not-joined", running: true, score: 999 }, false);
assert.equal(stranger.ok, false, "Only joined players may publish Dash state");

await post("/api/host/lock-setup", { code, playerKey: hostKey });
await post("/api/player/dash", { code, playerKey: runnerKey, running: true, score: 51, playerY: -20, runId: "prep-run" });
state = await snapshot(runnerKey);
runner = state.players.find((player) => player.name === "Dash Runner");
assert.equal(runner.dashTopScore, 51, "Legacy room-Dash updates remain harmless for older clients");

const source = await fs.readFile(path.join(__dirname, "public", "client", "offline.jsx"), "utf8");
const app = await fs.readFile(path.join(__dirname, "public", "app.jsx"), "utf8");
assert(source.includes('sequence[5] = "chicken"') && source.includes('sequence[9] = "croc"'));
assert(source.includes('formId === "gorilla" ? 1.3') && source.includes('formId === "croc" ? 1.2'));
assert(source.includes("drawSleepingKoala") && source.includes("drawRemoteDashPlayers"));
assert(!source.includes('window.addEventListener("keydown", handleKeyDown)'), "Dash must not capture keyboard events globally");
assert(source.includes("onKeyDown={handleKeyDown}") && source.includes("onKeyUp={handleKeyUp}"), "Dash keyboard controls should be scoped to its canvas");
assert(source.includes("tabIndex={interactive ? 0 : -1}"), "Interactive Dash canvases should be keyboard-focusable");
assert(source.includes("if (!interactive || !gameRef.current.running) return;"), "Dash must only consume jump keys during an active run");
assert(source.includes("DASH_JUMP_BUFFER_MS = 180") && source.includes("jumpQueuedUntil") && source.includes("useQueuedJump"), "Dash should buffer a jump entered just before landing");
assert(source.includes('className={`offline-game-hint ${interactive ? "is-interactive" : ""}`}') && source.includes("onPointerDown={handlePointerDown}"), "The lower Dash instruction panel should also act as a jump surface");
assert(!app.includes("RoomGahookDash"), "Room Dash should be removed from lobby and question-building screens");
assert(!app.includes('api("/api/player/dash"'), "The browser app should no longer publish room Dash state");
assert(app.includes("<RoomSocialHub"), "Waiting screens should use the social chat and whiteboard hub");

console.log(JSON.stringify({ ok: true, code, topScore: runner.dashTopScore, checked: [
  "room drop-in state",
  "remote runner position",
  "room personal best retention",
  "legacy room-state compatibility",
  "opening obstacle beats and character behavior",
  "focus-scoped keyboard controls",
  "offline-only Dash and social lobby replacement"
] }, null, 2));
