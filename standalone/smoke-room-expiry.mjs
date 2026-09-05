// Regression cover for the room-expiry leak: resetLobby() used to cancel a
// room's pending expiry without scheduling a replacement, so a room that was
// reset while no client was connected stayed resident for the life of the
// process and permanently consumed one of the 32 room slots.
//
// This test owns its own server so it can run with a short expiry instead of
// waiting five minutes, and so it never touches a shared or live process.
import { spawn } from "node:child_process";
import { once } from "node:events";

const EXPIRE_MS = 1500;
const PORT = Number(process.env.GAHOOKZ_EXPIRY_TEST_PORT || 3197);
const BASE_URL = "http://127.0.0.1:" + PORT;
const METRICS_TOKEN = "room-expiry-smoke-token";

function assert(value, message) {
  if (!value) throw new Error(message);
}

const child = spawn(process.execPath, ["--import", "tsx", new URL("./server.js", import.meta.url).pathname], {
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(PORT),
    NODE_ENV: "development",
    GAHOOKZ_ROOM_EXPIRE_MS: String(EXPIRE_MS),
    GAHOOKZ_METRICS_TOKEN: METRICS_TOKEN,
    GAHOOKZ_INSTANCE_ID: "room-expiry-smoke"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

const logs = [];
child.stdout.on("data", (chunk) => logs.push(String(chunk)));
child.stderr.on("data", (chunk) => logs.push(String(chunk)));

async function stopServer() {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), delay(5000)]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function post(path, body) {
  const response = await fetch(BASE_URL + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: response.status, data: await response.json().catch(() => null) };
}

// Existence is checked with GET /api/lobby because, unlike POST /api/room, it
// does not touch the room's expiry timer and so cannot mask the leak.
async function roomExists(code) {
  const response = await fetch(BASE_URL + "/api/lobby?code=" + encodeURIComponent(code));
  return response.status === 200;
}

async function activeRooms() {
  const response = await fetch(BASE_URL + "/api/metrics", { headers: { authorization: "Bearer " + METRICS_TOKEN } });
  const body = await response.text();
  return Number(body.match(/^gahookz_rooms (\d+)$/m)?.[1] ?? -1);
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(BASE_URL + "/api/health");
      if (response.ok) return;
    } catch {
      // The server is still binding its port.
    }
    await delay(100);
  }
  throw new Error("Room-expiry test server never became healthy.\n" + logs.join(""));
}

try {
  await waitForServer();

  const hostA = "expiry-control-" + Math.random().toString(36).slice(2);
  const hostB = "expiry-reset-" + Math.random().toString(36).slice(2);
  const hostC = "expiry-newgame-" + Math.random().toString(36).slice(2);

  const control = await post("/api/room", { code: "EXPA", playerKey: hostA, intent: "host" });
  const reset = await post("/api/room", { code: "EXPB", playerKey: hostB, intent: "host" });
  const newGame = await post("/api/room", { code: "EXPC", playerKey: hostC, intent: "host" });
  assert(control.data?.ok && reset.data?.ok && newGame.data?.ok, "The three test rooms must be created");

  assert((await post("/api/host/reset", { code: "EXPB", playerKey: hostB })).data?.ok, "Host reset must succeed");
  assert((await post("/api/host/new-game", { code: "EXPC", playerKey: hostC })).data?.ok, "Host new-game must succeed");

  assert(await roomExists("EXPA"), "The control room must still exist before its deadline");
  assert(await roomExists("EXPB"), "The reset room must still exist before its deadline");
  assert(await roomExists("EXPC"), "The new-game room must still exist before its deadline");

  await delay(EXPIRE_MS * 3);

  assert(!await roomExists("EXPA"), "A room with no live client must expire");
  assert(!await roomExists("EXPB"), "A room reset with no live client must still expire");
  assert(!await roomExists("EXPC"), "A room started again with no live client must still expire");

  const remaining = await activeRooms();
  assert(remaining === 0, "Expired rooms must be released from the room table, saw " + remaining);

  // An idle room must not be held open indefinitely by a stranger who only
  // knows the code and re-opens it before every deadline.
  const hostD = "expiry-pin-" + Math.random().toString(36).slice(2);
  await post("/api/room", { code: "EXPD", playerKey: hostD, intent: "host" });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await delay(EXPIRE_MS / 2);
    await post("/api/room", { code: "EXPD", playerKey: "stranger-key", intent: "join" });
  }
  assert(!await roomExists("EXPD"), "A stranger re-opening a room must not extend its expiry deadline");

  console.log(JSON.stringify({
    ok: true,
    expireMs: EXPIRE_MS,
    checked: [
      "idle rooms expire",
      "rooms reset by the host still expire",
      "rooms started again by the host still expire",
      "expired rooms release their room-table slot",
      "a stranger cannot extend a room deadline"
    ]
  }, null, 2));
} finally {
  await stopServer();
}
