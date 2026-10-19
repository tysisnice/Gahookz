// The host Gahook claim gate, driven over HTTP.
//
// A host who created the room but never joined the lobby used to skip the
// per-question claim gate entirely: the gate only applied when
// getPlayerByCredential(room, room.hostKey) was non-null, so during a live
// phase a null host could poke a connected player an unlimited number of
// times and drive them to Ultimate with no per-question Gahook limit.
// Live-phase host pokes now require a joined host; the joined-host claim gate
// is unchanged. Every assertion checks the HTTP status as well as the body,
// because a refusal that answered 200 would be invisible to a body-only check.
import assert from "node:assert/strict";

const BASE_URL = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const unique = () => Date.now() + Math.random().toString(36).slice(2);

async function request(path, body) {
  const response = await fetch(BASE_URL + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return { status: response.status, data: await response.json() };
}

function makeRoom() {
  return Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");
}

async function buildQuizRoom({ hostJoins }) {
  const code = makeRoom();
  const hostKey = "poke-host-" + unique();
  const players = Array.from({ length: 2 }, (_, index) => ({
    key: "poke-player-" + index + "-" + unique(),
    name: "Poke " + (index + 1)
  }));
  const post = async (path, body) => {
    const result = await request(path, { code, ...body });
    assert.equal(result.status, 200, path + " answered " + result.status + ": " + result.data.error);
    assert.equal(result.data.ok, true, path + " failed: " + result.data.error);
    return result.data;
  };
  await post("/api/room", { playerKey: hostKey, intent: "host" });
  await post("/api/host/settings", { playerKey: hostKey, maxQuestionsPerPlayer: 1 });
  for (const player of players) {
    await post("/api/player/join", { playerKey: player.key, name: player.name, avatarId: "fox" });
  }
  if (hostJoins) {
    await post("/api/player/join", { playerKey: hostKey, name: "Host Hank", avatarId: "owl" });
  }
  await post("/api/host/lock-setup", { playerKey: hostKey });
  const writers = hostJoins ? [hostKey, ...players.map((player) => player.key)] : players.map((player) => player.key);
  for (const key of writers) {
    await post("/api/question", { playerKey: key, text: "Poke claim question " + key.slice(0, 4) + "?", answers: [{ text: "Yes", correct: true }, { text: "No", correct: false }] });
    await post("/api/player/ready", { playerKey: key, ready: true });
  }
  await post("/api/host/start", { playerKey: hostKey });
  const snapshot = await request("/api/state", { code, role: "host", playerKey: hostKey });
  assert.equal(snapshot.status, 200, "State answered " + snapshot.status);
  assert(["reading", "answering", "reveal"].includes(snapshot.data.phase), "Expected a live phase, got " + snapshot.data.phase);
  const targetId = snapshot.data.players.find((player) => player.name === players[0].name).id;
  const otherId = snapshot.data.players.find((player) => player.name === players[1].name).id;
  return { code, hostKey, targetId, otherId };
}

async function pokeCountOf(code, hostKey, playerId) {
  const snapshot = await request("/api/state", { code, role: "host", playerKey: hostKey });
  assert.equal(snapshot.status, 200, "State answered " + snapshot.status);
  return snapshot.data.players.find((player) => player.id === playerId).pokeCount;
}

// --- A host who never joined the lobby cannot Gahook during a live round. ---
{
  const { code, hostKey, targetId } = await buildQuizRoom({ hostJoins: false });
  assert.equal(await pokeCountOf(code, hostKey, targetId), 0, "The target starts with no Gahooks");
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const poke = await request("/api/host/poke", { code, playerKey: hostKey, playerId: targetId });
    assert.notEqual(poke.status, 200, "Poke " + attempt + " answered 200 for a host who never joined the lobby");
    assert.equal(poke.status, 400, "Poke " + attempt + " answered " + poke.status + ": " + poke.data.error);
    assert.equal(poke.data.ok, false, "Poke " + attempt + " must refuse");
    assert.match(String(poke.data.error || ""), /\S/, "A refusal must say something the host can act on");
    assert.equal(poke.data.error, "Join the game before Gahooking during a round.", "Poke " + attempt + " refused with the wrong error: " + poke.data.error);
    assert.equal(await pokeCountOf(code, hostKey, targetId), 0, "A refused poke must not add to the target's Gahook count (poke " + attempt + ")");
  }
}

// --- A joined host keeps the existing one-claim-per-question gate. ---
{
  const { code, hostKey, targetId, otherId } = await buildQuizRoom({ hostJoins: true });
  const first = await request("/api/host/poke", { code, playerKey: hostKey, playerId: targetId });
  assert.equal(first.status, 200, "The first live-phase poke answered " + first.status + ": " + first.data.error);
  assert.equal(first.data.ok, true, "The first live-phase poke must succeed: " + first.data.error);
  assert.equal(await pokeCountOf(code, hostKey, targetId), 1, "The accepted poke should land exactly one Gahook");
  const second = await request("/api/host/poke", { code, playerKey: hostKey, playerId: otherId });
  assert.equal(second.status, 400, "A second poke in the same question answered " + second.status + ": " + second.data.error);
  assert.equal(second.data.ok, false, "The second poke must refuse");
  assert.match(second.data.error, /already used your Gahook for this question/, "The second poke must carry the claim-gate error: " + second.data.error);
  assert.equal(await pokeCountOf(code, hostKey, otherId), 0, "The refused poke must not land on the second target");
}

console.log(JSON.stringify({ ok: true, baseUrl: BASE_URL, unjoinedHostLivePoke: "refused", joinedHostClaimGate: "one per question" }, null, 2));
