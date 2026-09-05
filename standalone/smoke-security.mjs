import fs from "node:fs/promises";

const BASE_URL = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3102";
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

function assert(value, message) {
  if (!value) throw new Error(message);
}

function roomCode() {
  return Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");
}

function key(label) {
  return label + "-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

async function raw(path, options = {}) {
  const response = await fetch(BASE_URL + path, options);
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : await response.text();
  return { response, data };
}

async function request(path, body, headers = {}) {
  return raw(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
}

async function post(path, body) {
  const result = await request(path, body);
  if (!result.response.ok || !result.data.ok) {
    throw new Error(path + ": " + (result.data?.error || result.response.status));
  }
  return result.data;
}

const health = await raw("/api/health");
assert(health.response.status === 200 && health.data.ok, "Health check must be available");
assert(health.data.schemaVersion === 1, "Health check must publish the snapshot schema version");
assert((health.response.headers.get("content-security-policy") || "").includes("frame-ancestors 'none'"), "CSP must prevent framing");
assert(health.response.headers.get("x-frame-options") === "DENY", "Legacy frame protection must be present");
assert(health.response.headers.get("x-content-type-options") === "nosniff", "MIME sniffing protection must be present");
assert(health.response.headers.get("referrer-policy") === "no-referrer", "Room URLs must not leak through referrers");
assert(["memory", "postgres"].includes(health.data.accountPersistence), "Health must report the active account repository");

const guestAccount = await raw("/api/account");
assert(guestAccount.response.ok && guestAccount.data.signedIn === false, "Guest account status must remain available without a login cookie");
assert(guestAccount.data.account === null, "A guest request must never receive another account's profile");

const malformed = await raw("/api/state", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{not-json"
});
assert(malformed.response.status === 400 && malformed.data.code === "invalid_json", "Malformed JSON must be a bounded client error");

const wrongMedia = await raw("/api/state", {
  method: "POST",
  headers: { "content-type": "text/plain" },
  body: "{}"
});
assert(wrongMedia.response.status === 415 && wrongMedia.data.code === "unsupported_media_type", "Non-JSON API input must be rejected");

const crossOrigin = await request("/api/state", {}, { origin: "https://attacker.invalid" });
assert(crossOrigin.response.status === 403 && crossOrigin.data.code === "invalid_origin", "Cross-origin mutations must be rejected");

const legacyState = await raw("/api/state?code=NOPE&playerKey=secret");
assert(legacyState.response.status === 405 && legacyState.data.code === "method_not_allowed", "Room state must never accept URL credentials");

const code = roomCode();
const hostKey = key("security-host");
const playerKey = key("security-player");
const password = "party-secret-" + Math.random().toString(36).slice(2);

const shortPassword = await request("/api/room", {
  code,
  playerKey: hostKey,
  intent: "host",
  passwordEnabled: true,
  password: "abc"
});
assert(shortPassword.response.status === 400 && !shortPassword.data.ok, "Protected rooms must require a non-trivial password");

const created = await post("/api/room", {
  code,
  playerKey: hostKey,
  intent: "host",
  passwordEnabled: true,
  password
});
assert(created.created && created.code === code, "A protected room should be created after password derivation");
assert(created.schemaVersion === health.data.schemaVersion, "Room creation must confirm the server/client snapshot contract");

const lobby = await raw("/api/lobby?code=" + encodeURIComponent(code));
assert(lobby.data.hasPassword === true, "Public room discovery may reveal only that a password is required");

const wrongOpen = await request("/api/room", {
  code,
  playerKey,
  intent: "join",
  password: "definitely-wrong"
});
assert(wrongOpen.response.status === 400 && wrongOpen.data.wrongPassword, "Opening a protected room with the wrong password must fail");

const wrongJoin = await request("/api/player/join", {
  code,
  playerKey,
  name: "Security Player",
  avatarId: "zap",
  password: "still-wrong"
});
assert(wrongJoin.response.status === 400 && wrongJoin.data.wrongPassword, "Joining a protected room with the wrong password must fail");

// Knowing the four-letter code is not authorisation. A protected room must not
// hand its snapshot or its live stream to a caller that never proved the
// password, because both carry player names, scores and live question content.
const outsiderKey = key("security-outsider");
const outsiderState = await request("/api/state", { code, role: "guest", playerKey: outsiderKey });
assert(
  outsiderState.response.status === 401 && outsiderState.data.roomLocked,
  "A protected room must refuse room state to a caller that has not passed the password"
);
assert(
  !Array.isArray(outsiderState.data.players),
  "A refused room-state request must not carry any part of the snapshot"
);

const outsiderTicket = await request("/api/events/ticket", { code, role: "guest", playerKey: outsiderKey });
assert(
  outsiderTicket.response.status === 401 && outsiderTicket.data.roomLocked,
  "A protected room must refuse an event ticket to a caller that has not passed the password"
);
assert(!outsiderTicket.data.ticket, "A refused ticket request must not issue a ticket");

// Passing the password admits the credential for reading, before the join form
// has been completed, which is what the browser actually does.
const admitted = await post("/api/room", { code, playerKey: outsiderKey, intent: "join", password });
assert(admitted.code === code, "The correct password must open a protected room");
const admittedState = await request("/api/state", { code, role: "guest", playerKey: outsiderKey });
assert(admittedState.response.ok, "A credential admitted by the password must be able to read room state");

await post("/api/player/join", {
  code,
  playerKey,
  name: "Security Player",
  avatarId: "zap",
  password
});
const stateResult = await request("/api/state", { code, role: "player", playerKey });
assert(stateResult.response.ok, "Scoped room state must be available over POST");
const state = stateResult.data;
assert(state.players.some((player) => player.name === "Security Player"), "Correct credentials must expose only the scoped player snapshot");

const issued = await post("/api/events/ticket", { code, role: "player", playerKey });
assert(issued.ticket && issued.ticket !== playerKey && issued.ticket !== hostKey, "SSE must use an opaque ticket rather than a room credential");

const credentialUrl = await raw("/events?code=" + encodeURIComponent(code) + "&playerKey=" + encodeURIComponent(playerKey));
assert(credentialUrl.response.status === 401 && credentialUrl.data.code === "invalid_event_ticket", "Legacy credential-bearing event URLs must be rejected");

const controller = new AbortController();
const stream = await fetch(BASE_URL + "/events?ticket=" + encodeURIComponent(issued.ticket), { signal: controller.signal });
assert(stream.status === 200 && (stream.headers.get("content-type") || "").includes("text/event-stream"), "A fresh event ticket must open one scoped stream");
controller.abort();
const replay = await raw("/events?ticket=" + encodeURIComponent(issued.ticket));
assert(replay.response.status === 401 && replay.data.code === "invalid_event_ticket", "Event tickets must be single-use");

const [app, server] = await Promise.all([
  fs.readFile(new URL("./public/app.jsx", import.meta.url), "utf8"),
  fs.readFile(new URL("./server.js", import.meta.url), "utf8")
]);
assert(app.includes("sessionStorage.setItem(roomPasswordKey(cleanCode), password)"), "Room passwords must be tab-scoped");
assert(!app.includes("localStorage.setItem(roomPasswordKey(cleanCode), password)"), "Room passwords must not be durably stored");
assert(app.includes("/api/events/ticket") && app.includes("new EventSource(\"/events?ticket=\""), "The client must exchange credentials for an opaque event ticket");
assert(!app.includes("/api/state?"), "The client must not put state credentials in a URL");
assert(app.includes('"X-Gahookz-Room": code'), "Snapshot recovery requests must retain room affinity across multiple workers");
assert(app.includes("ROOM_CONNECTION_ERROR") && app.includes("newer than the game server"), "A protocol mismatch must become a visible room error instead of an endless loading screen");
assert(server.includes("crypto.scrypt") && server.includes("crypto.timingSafeEqual"), "Room passwords must use a memory-hard derivation and constant-time verification");
assert(server.includes("accountService.authenticate(req)"), "Room commands must derive account identity from the server session");

// A kick that leaves the removed player watching the room in real time is not a
// moderation control. The ban must apply to reads as well as to joining.
const bannedKey = key("security-banned");
await post("/api/room", { code, playerKey: bannedKey, intent: "join", password });
const bannedJoin = await post("/api/player/join", { code, playerKey: bannedKey, name: "Removable", avatarId: "zap", password });
await post("/api/host/kick", { code, playerKey: hostKey, playerId: bannedJoin.player.id });

const bannedState = await request("/api/state", { code, role: "player", playerKey: bannedKey });
assert(
  bannedState.response.status === 403 && bannedState.data.banned,
  "A banned credential must be refused room state, not only refused a new join"
);
const bannedTicket = await request("/api/events/ticket", { code, role: "player", playerKey: bannedKey });
assert(
  bannedTicket.response.status === 403 && bannedTicket.data.banned && !bannedTicket.data.ticket,
  "A banned credential must be refused a live event ticket"
);
const bannedRejoin = await request("/api/room", { code, playerKey: bannedKey, intent: "join", password });
assert(
  bannedRejoin.response.status === 400 && bannedRejoin.data.banned,
  "A banned credential must not be able to re-admit itself with the room password"
);

console.log(JSON.stringify({
  ok: true,
  roomCode: code,
  checked: [
    "security headers and same-origin enforcement",
    "bounded JSON parsing errors",
    "memory-hard protected-room passwords",
    "credential-free room-state transport",
    "opaque single-use event tickets",
    "password-gated room state and event tickets",
    "bans enforced on reads, not only on joining",
    "room-affine snapshot recovery and visible connection failure"
  ]
}, null, 2));
