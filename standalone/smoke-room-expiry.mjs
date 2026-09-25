// Regression cover for the room lifecycle.
//
// 1. The room-expiry leak: resetLobby() used to cancel a room's pending expiry
//    without scheduling a replacement, so a room that was reset while no client
//    was connected stayed resident for the life of the process and permanently
//    consumed one of the 32 room slots.
// 2. The reconnect grace (2026-09-25): a room whose last live connection closes
//    is kept for GAHOOKZ_ROOM_ABANDON_GRACE_MS instead of being deleted at
//    once, and a host who stays away that long while players remain hands the
//    host role to the earliest-joined connected player.
//
// This test owns its own server so it can run with short deadlines instead of
// waiting minutes, and so it never touches a shared or live process.
import { spawn } from "node:child_process";
import { once } from "node:events";

const EXPIRE_MS = 1500;
// Deliberately different from EXPIRE_MS so a failure says which deadline ran.
const GRACE_MS = 2500;
// The server marks a closed stream disconnected after this debounce.
const CLOSE_DEBOUNCE_MS = 900;
const PORT = Number(process.env.GAHOOKZ_EXPIRY_TEST_PORT || 3199);
const BASE_URL = "http://127.0.0.1:" + PORT;
const METRICS_TOKEN = "room-expiry-smoke-token";

function assert(value, message) {
  if (!value) throw new Error(message);
}

const child = spawn(process.execPath, ["--import", "tsx", new URL("./server.js", import.meta.url).pathname], {
  env: {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    DATABASE_URL: "",
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    GAHOOKZ_REQUIRE_POSTGRES: "0",
    GAHOOKZ_DRAIN_TIMEOUT_MS: "0",
    HOST: "127.0.0.1",
    PORT: String(PORT),
    NODE_ENV: "development",
    GAHOOKZ_ROOM_EXPIRE_MS: String(EXPIRE_MS),
    GAHOOKZ_ROOM_ABANDON_GRACE_MS: String(GRACE_MS),
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

async function state(code, playerKey) {
  const result = await post("/api/state", { code, playerKey, role: "room" });
  assert(result.status === 200, "State for " + code + " should load, saw " + result.status + " " + JSON.stringify(result.data));
  return result.data;
}

async function join(code, playerKey, name) {
  const result = await post("/api/player/join", { code, playerKey, name, avatarId: "frog" });
  assert(result.data?.ok, name + " should join " + code + ": " + JSON.stringify(result.data));
  return result.data.player;
}

async function createRoom(code, playerKey) {
  const result = await post("/api/room", { code, playerKey, intent: "host" });
  assert(result.data?.ok && result.data.code === code, "Room " + code + " should be created: " + JSON.stringify(result.data));
}

// A live connection exactly as the browser makes one: exchange the credential
// for a single-use ticket, then hold the event stream open and keep reading it
// so the server never treats this reader as stalled.
const openStreams = new Set();
async function openStream(code, playerKey) {
  const issued = await post("/api/events/ticket", { code, playerKey, role: "room" });
  assert(issued.data?.ok, "A stream ticket should be issued for " + code + ": " + JSON.stringify(issued.data));
  const controller = new AbortController();
  const response = await fetch(BASE_URL + "/events?ticket=" + encodeURIComponent(issued.data.ticket) + "&room=" + code, { signal: controller.signal });
  assert(response.ok, "The event stream for " + code + " should open, saw " + response.status);
  const reader = response.body.getReader();
  const pump = (async () => {
    try {
      while (!(await reader.read()).done) { /* discard */ }
    } catch {
      // Aborted by close().
    }
  })();
  const stream = {
    async close() {
      openStreams.delete(stream);
      controller.abort();
      await pump;
    }
  };
  openStreams.add(stream);
  return stream;
}

function key(label) {
  return "expiry-" + label + "-" + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

async function activeRooms() {
  const response = await fetch(BASE_URL + "/api/metrics", { headers: { authorization: "Bearer " + METRICS_TOKEN } });
  const body = await response.text();
  return Number(body.match(/^gahookz_rooms (\d+)$/m)?.[1] ?? -1);
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(BASE_URL + "/api/health");
      // Only this script's own child. Anything else on the port -- another
      // agent's disposable server, say -- must never be mutated by this test.
      if (response.ok && (await response.json()).instance === "room-expiry-smoke") return;
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

  // Waits until `ms` after `start`, so a slow request earlier in a section
  // cannot shift the moment an assertion is made.
  const until = (start, ms) => delay(Math.max(0, start + ms - Date.now()));
  // When the server acts on a host who left at `leftAt`: after the stream-close
  // debounce, plus the grace.
  const graceEnds = (leftAt) => leftAt + CLOSE_DEBOUNCE_MS + GRACE_MS;

  // --- a brief total disconnect does not end the room ------------------------
  {
    const host = key("brief-host");
    await createRoom("EXPE", host);
    let hostStream = await openStream("EXPE", host);
    await hostStream.close();
    let leftAt = Date.now();
    await until(leftAt, CLOSE_DEBOUNCE_MS + GRACE_MS / 2);
    assert(await roomExists("EXPE"), "A room must outlive its last live connection for the length of the grace");
    hostStream = await openStream("EXPE", host);
    await until(graceEnds(leftAt), 1000);
    assert(await roomExists("EXPE"), "Reconnecting inside the grace must cancel the pending expiry");
    const back = await state("EXPE", host);
    assert(back.isHost && back.hostPresence === null && back.hostChange === null, "A host who came back is simply the host again");
    await hostStream.close();
    leftAt = Date.now();
    await until(leftAt, CLOSE_DEBOUNCE_MS + GRACE_MS / 2);
    assert(await roomExists("EXPE"), "The next disconnect earns the full grace again");
    await until(graceEnds(leftAt), 1200);
    assert(!await roomExists("EXPE"), "A room nobody returns to must expire once the grace has run out");
  }

  // --- a host who stays away hands the room to a connected player ------------
  {
    const host = key("away-host");
    const early = key("away-early");
    const banned = key("away-banned");
    const first = key("away-first");
    const second = key("away-second");
    await createRoom("EXPF", host);
    // Join order is the promotion order. The two earliest must both be passed
    // over: one is disconnected, the other is banned.
    await join("EXPF", early, "Early Offline");
    const bannedPlayer = await join("EXPF", banned, "Banned Bob");
    const firstPlayer = await join("EXPF", first, "First Fiona");
    await join("EXPF", second, "Second Sam");
    const earlyStream = await openStream("EXPF", early);
    await earlyStream.close();
    const bannedStream = await openStream("EXPF", banned);
    const firstStream = await openStream("EXPF", first);
    const secondStream = await openStream("EXPF", second);
    const hostStream = await openStream("EXPF", host);
    const kicked = await post("/api/host/kick", { code: "EXPF", playerKey: host, playerId: bannedPlayer.id });
    assert(kicked.data?.ok, "The host should be able to ban a player: " + JSON.stringify(kicked.data));
    await delay(CLOSE_DEBOUNCE_MS + 200);
    const ready = await state("EXPF", first);
    assert(ready.players.find((player) => player.name === "Early Offline")?.connected === false, "Precondition: the earliest-joined player is disconnected");
    assert(!ready.players.some((player) => player.name === "Banned Bob"), "Precondition: the banned player is gone");

    await hostStream.close();
    const leftAt = Date.now();
    await until(leftAt, CLOSE_DEBOUNCE_MS + 400);
    const waiting = await state("EXPF", second);
    assert(waiting.hostPresence?.away === true, "Players must be told the host is away: " + JSON.stringify(waiting.hostPresence));
    assert(waiting.hostPresence.hostName === "", "A host-only host has no player name to show");
    assert(waiting.hostPresence.promoteAt - waiting.hostPresence.since === GRACE_MS, "The countdown must last exactly the configured grace");
    assert(!JSON.stringify(waiting).includes(host), "The absent host's credential must never appear in a snapshot");
    assert(!waiting.isHost && !(await state("EXPF", first)).isHost, "Nobody may be promoted before the grace runs out");

    await until(graceEnds(leftAt), -600);
    assert((await state("EXPF", host)).isHost, "The host keeps the role until the grace has fully run");

    await until(graceEnds(leftAt), 800);
    const promoted = await state("EXPF", first);
    assert(promoted.isHost && promoted.ownPlayer?.isHost, "The earliest-joined connected player must become host after the grace");
    assert(promoted.hostPresence === null, "The away banner ends with the promotion");
    assert(promoted.hostChange?.reason === "host-away" && promoted.hostChange.playerId === firstPlayer.id && promoted.hostChange.name === "First Fiona", "The promotion must be announced: " + JSON.stringify(promoted.hostChange));
    const bystander = await state("EXPF", second);
    assert(!bystander.isHost && bystander.hostChange?.name === "First Fiona", "Everybody is told who the new host is");
    assert(bystander.ownHostReplaced === null && promoted.ownHostReplaced === null, "Only the replaced host is told they were replaced");
    assert(!JSON.stringify(bystander).includes(host) && !JSON.stringify(bystander).includes(first), "No credential, old or new, may reach another player");

    const formerHost = await state("EXPF", host);
    assert(!formerHost.isHost && formerHost.ownHostReplaced?.name === "First Fiona", "The returning host must be told who replaced them");
    const refused = await post("/api/host/settings", { code: "EXPF", playerKey: host, roundPreset: "quick" });
    assert(refused.data?.ok === false, "The former host's credential must no longer carry host authority");
    const allowed = await post("/api/host/settings", { code: "EXPF", playerKey: first, roundPreset: "quick" });
    assert(allowed.data?.ok, "The new host must be able to run the room: " + JSON.stringify(allowed.data));
    // A host-only host comes back as a player through the normal join path.
    const rejoined = await join("EXPF", host, "Former Host");
    const afterJoin = await state("EXPF", host);
    assert(afterJoin.ownPlayer?.id === rejoined.id && !afterJoin.isHost && !afterJoin.ownPlayer.isHost, "The former host rejoins as an ordinary player");
    for (const stream of [bannedStream, firstStream, secondStream]) await stream.close();
  }

  // --- a host who comes back inside the grace keeps the room -----------------
  {
    const host = key("return-host");
    const player = key("return-player");
    await createRoom("EXPG", host);
    await join("EXPG", host, "Host Harriet");
    await join("EXPG", player, "Patient Pat");
    const playerStream = await openStream("EXPG", player);
    let hostStream = await openStream("EXPG", host);
    await hostStream.close();
    const leftAt = Date.now();
    await until(leftAt, CLOSE_DEBOUNCE_MS + 400);
    const waiting = await state("EXPG", player);
    assert(waiting.hostPresence?.away && waiting.hostPresence.hostName === "Host Harriet", "The banner names a host who was also a player");
    hostStream = await openStream("EXPG", host);
    assert((await state("EXPG", player)).hostPresence === null, "The banner must go the moment the host is back");
    await until(graceEnds(leftAt), 800);
    const later = await state("EXPG", host);
    assert(later.isHost && later.ownPlayer?.isHost && later.hostChange === null, "A host who returned inside the grace keeps the room");
    assert(!(await state("EXPG", player)).isHost, "and nobody was promoted behind their back");
    await hostStream.close();
    await playerStream.close();
  }

  // --- a hand-over during the countdown cancels it ---------------------------
  {
    const host = key("handover-host");
    const first = key("handover-first");
    const second = key("handover-second");
    await createRoom("EXPH", host);
    await join("EXPH", first, "First Fred");
    const secondPlayer = await join("EXPH", second, "Second Sue");
    const firstStream = await openStream("EXPH", first);
    const secondStream = await openStream("EXPH", second);
    const hostStream = await openStream("EXPH", host);
    await hostStream.close();
    const leftAt = Date.now();
    await until(leftAt, CLOSE_DEBOUNCE_MS + 400);
    assert((await state("EXPH", first)).hostPresence?.away, "Precondition: the countdown is running");
    const handed = await post("/api/host/make-host", { code: "EXPH", playerKey: host, playerId: secondPlayer.id });
    assert(handed.data?.ok, "The host should be able to hand over during the countdown: " + JSON.stringify(handed.data));
    const afterHandover = await state("EXPH", second);
    assert(afterHandover.isHost && afterHandover.hostPresence === null && afterHandover.hostChange?.reason === "handover", "A hand-over must end the countdown");
    await until(graceEnds(leftAt), 800);
    assert((await state("EXPH", second)).isHost && !(await state("EXPH", first)).isHost, "A cancelled countdown must not promote anybody later");
    assert((await state("EXPH", host)).ownHostReplaced === null, "A deliberate hand-over is not reported as a replacement");
    await firstStream.close();
    await secondStream.close();
  }

  // --- a reset during the countdown neither cancels nor restarts it ----------
  {
    const host = key("reset-host");
    const player = key("reset-player");
    await createRoom("EXPI", host);
    await join("EXPI", player, "Reset Rita");
    const playerStream = await openStream("EXPI", player);
    const hostStream = await openStream("EXPI", host);
    await hostStream.close();
    const leftAt = Date.now();
    await until(leftAt, CLOSE_DEBOUNCE_MS + 400);
    const before = await state("EXPI", player);
    assert(before.hostPresence?.away, "Precondition: the countdown is running");
    assert((await post("/api/host/new-game", { code: "EXPI", playerKey: host })).data?.ok, "An API-only host may still start a new game");
    const afterReset = await state("EXPI", player);
    assert(afterReset.phase === "building" && afterReset.hostPresence?.promoteAt === before.hostPresence.promoteAt, "A reset must keep the running countdown unchanged");
    await until(graceEnds(leftAt), 800);
    assert((await state("EXPI", player)).isHost, "The countdown must still promote after a reset");
    await playerStream.close();
  }

  // --- an overdue promotion happens the moment a player is back --------------
  {
    const host = key("overdue-host");
    const player = key("overdue-player");
    await createRoom("EXPJ", host);
    await join("EXPJ", player, "Late Larry");
    let playerStream = await openStream("EXPJ", player);
    const hostStream = await openStream("EXPJ", host);
    await hostStream.close();
    const hostLeftAt = Date.now();
    await until(hostLeftAt, 1500);
    // Now nobody is connected; the room's own grace restarts from here, so it
    // outlives the host's countdown by the 1.5 s the player stayed.
    await playerStream.close();
    await until(graceEnds(hostLeftAt), 600);
    assert(await roomExists("EXPJ"), "Precondition: the room is still inside its own grace");
    assert((await state("EXPJ", host)).isHost, "With nobody connected to promote, the absent host keeps the role for now");
    playerStream = await openStream("EXPJ", player);
    assert((await state("EXPJ", player)).isHost, "A player who reconnects after the host's grace ran out is promoted at once");
    await playerStream.close();
  }

  // --- draining keeps the grace, and still empties ---------------------------
  const setDrain = async (active) => {
    const response = await fetch(BASE_URL + "/api/drain", {
      method: "POST",
      headers: { authorization: "Bearer " + METRICS_TOKEN, "content-type": "application/json" },
      body: JSON.stringify({ active })
    });
    assert(response.ok, "The drain switch should answer, saw " + response.status);
  };
  {
    const host = key("drain-host");
    await createRoom("EXPK", host);
    const hostStream = await openStream("EXPK", host);
    await setDrain(true);
    await hostStream.close();
    const leftAt = Date.now();
    await until(leftAt, CLOSE_DEBOUNCE_MS + GRACE_MS / 2);
    assert(await roomExists("EXPK"), "A draining node keeps the grace: a game in progress may still come back");
    await until(graceEnds(leftAt), 1200);
    assert(!await roomExists("EXPK"), "An abandoned room must still leave a draining node once its grace ends");
    await setDrain(false);
  }

  const leftover = await activeRooms();
  assert(leftover === 0, "Every room above must have been released, saw " + leftover);

  // --- shutdown releases rooms in their grace at once -------------------------
  {
    const host = key("shutdown-host");
    await createRoom("EXPL", host);
    const hostStream = await openStream("EXPL", host);
    await hostStream.close();
    await delay(CLOSE_DEBOUNCE_MS + 300);
    assert(await roomExists("EXPL"), "Precondition: the room is inside its grace");
    await stopServer();
    const log = logs.join("");
    assert(log.includes("All rooms finished; closing cleanly."), "Shutdown must release rooms nobody is connected to, not wait out their grace:\n" + log);
  }

  console.log(JSON.stringify({
    ok: true,
    expireMs: EXPIRE_MS,
    graceMs: GRACE_MS,
    checked: [
      "idle rooms expire",
      "rooms reset by the host still expire",
      "rooms started again by the host still expire",
      "expired rooms release their room-table slot",
      "a stranger cannot extend a room deadline",
      "a room survives a brief total disconnect and expires after the grace",
      "an away host is replaced by the earliest-joined connected, unbanned player after the grace, not before",
      "the replaced host is told why, loses authority, and can rejoin as a player",
      "a host who returns inside the grace cancels the countdown",
      "a hand-over during the countdown cancels it",
      "a reset during the countdown keeps it",
      "an overdue promotion happens when a player reconnects",
      "a draining node keeps the grace and still empties",
      "shutdown releases rooms in their grace at once"
    ]
  }, null, 2));
} finally {
  for (const stream of [...openStreams]) await stream.close().catch(() => {});
  await stopServer();
}
