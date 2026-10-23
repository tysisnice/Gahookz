import fs from "node:fs/promises";

const BASE_URL = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";
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

// Read the browser client as a whole rather than a single file. These assert
// properties of the client, so they must not depend on which module a function
// lives in; the network layer moved to client/net.ts without any behavioural
// change, and a file-bound check would have reported that as a security
// regression. The live single-use-ticket behaviour is already covered above.
const clientDir = new URL("./public/client/", import.meta.url);
const clientSourceNames = (await fs.readdir(clientDir)).
  filter((name) => /\.(jsx|ts)$/.test(name) && !name.endsWith(".test.ts"));
const [appEntry, server, ...clientSources] = await Promise.all([
  fs.readFile(new URL("./public/app.jsx", import.meta.url), "utf8"),
  fs.readFile(new URL("./server.js", import.meta.url), "utf8"),
  ...clientSourceNames.map((name) => fs.readFile(new URL(name, clientDir), "utf8"))
]);
const app = [appEntry, ...clientSources].join("\n");

// Device storage lives in client/session.ts, which never reaches for a store
// itself: it is handed one, so which store a value lands in is decided here,
// in daylight, rather than inside a helper.
const sessionSource = clientSources[clientSourceNames.indexOf("session.ts")] || "";
assert(sessionSource, "client/session.ts must exist: it owns this device's credentials");
const sessionCode = sessionSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
assert(!/\b(localStorage|sessionStorage)\b/.test(sessionCode), "client/session.ts must take a store, not pick one");
assert(app.includes("const tabStore = () => sessionStorage;") && app.includes("writeRoomPassword(tabStore, code, password)"),
  "Room passwords must be tab-scoped");
assert(!/writeRoomPassword\(\s*localStore/.test(app) && !/localStorage\.setItem\(\s*roomPasswordKey/.test(app),
  "Room passwords must not be durably stored");
// One module owns these keys; a second writer is how a credential ends up
// somewhere nobody is checking.
for (const key of ["gahookz-client-key", "gahookz-last-join", "gahookz-room-password-"]) {
  const owners = clientSourceNames.filter((name, index) => name !== "session.ts" && clientSources[index].includes(key));
  assert(!appEntry.includes(key) && owners.length === 0,
    "Only client/session.ts may name " + key + " (also in: " + [...owners, ...(appEntry.includes(key) ? ["app.jsx"] : [])].join(", ") + ")");
}
assert(app.includes("/api/events/ticket"), "The client must exchange credentials for an opaque event ticket");
assert(app.includes("\"/events?ticket=\""), "The event stream URL must begin with the opaque ticket");
for (const secret of ["playerKey", "password", "hostKey"]) {
  assert(!new RegExp("/events\\?[^\"']*" + secret).test(app), "The event stream URL must not carry " + secret);
}
assert(!app.includes("/api/state?"), "The client must not put state credentials in a URL");
assert(app.includes('"X-Gahookz-Room": target.code'), "Snapshot recovery requests must retain room affinity across multiple workers");
// Every room snapshot goes through the one network boundary. A second caller
// with its own fetch is exactly how the recovery poll came to stack requests
// that nobody ever answered: client/net.test.ts covers the boundary and cannot
// see a bypass, so this is the tripwire for one.
const outsideNet = [appEntry, ...clientSources.filter((_source, index) => clientSourceNames[index] !== "net.ts")].join("\n");
assert(!/fetch\(\s*["']\/api\/state["']/.test(outsideNet), "Room snapshots must be fetched through client/net.ts, never a second caller");
assert(app.includes("ROOM_CONNECTION_ERROR") && app.includes("newer than the game server"), "A protocol mismatch must become a visible room error instead of an endless loading screen");
assert(server.includes("crypto.scrypt") && server.includes("crypto.timingSafeEqual"), "Room passwords must use a memory-hard derivation and constant-time verification");
assert(server.includes("accountService.authenticate(req)"), "Room commands must derive account identity from the server session");

// Where a room keeps a player's picture is enumerated once, in
// server/player-media.mjs, and walked twice: the pruner decides what to keep,
// moderation decides what to clear. They used to be written out separately and
// had drifted in both directions -- a kicked player's picture was retained and
// re-broadcast to the whole room, while the results screen pointed at bytes
// the pruner was free to collect. A second copy of the list is the regression.
const mediaModule = await fs.readFile(new URL("./server/media.mjs", import.meta.url), "utf8");
assert(mediaModule.includes("retainedPlayerMedia"), "The pruner must take its retain list from server/player-media.mjs");
assert(!mediaModule.includes("avatarImageDataUrl"), "The pruner must not keep a second copy of where a room holds player media");
assert(server.includes("clearPlayerMedia(room, playerId)"), "Kicking a player must clear their media through the one enumeration");
assert(server.includes("clearPlayerMedia(room, player.id, { kinds: [AVATAR] })"), 'Randomizing a name and picture must clear every copy of that picture');

// Which routes the host's Gahook policy governs is enumerated once, in
// server/gahook-policy.mjs, and gahook-policy.test.mjs walks server.js's own
// call graph to prove no Gahook-sending route is missing from it. It used to be
// a hand-written set of seven paths in server.js, and two routes that send
// Gahooks were not in it: with effects off, a spectator could still land an
// Arena "congrats" and "boo" on the duellists. A second copy of the list, or a
// second home for the escalation constants, is the regression.
assert(!server.includes("EFFECT_GATED_GAHOOK_ROUTES"), "The effects policy must be enforced from the one route table in server/gahook-policy.mjs");
assert(server.includes("gahookRouteRefusal(room, pathname)"), "Every room command must pass the one Gahook policy gate");
assert(!/const (ULTIMATE_GAHOOK|COUNTER_GAHOOK_TRIGGER|ULTIMATE_CONGRATS|GET_GOT_SCORE|GAHOOK_STEAL)[A-Z_]* =/.test(server), "The Gahook escalation constants must have one home: server/gahook-escalation.mjs");
assert(server.includes("escalateGahook(player, {"), "What a Gahook escalates into must be decided in server/gahook-escalation.mjs");

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
