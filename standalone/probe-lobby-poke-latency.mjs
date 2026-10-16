// Diagnostic: measure /api/host/poke request latency and spam-window spacing
// in the lobby phase, to explain why hostPokeUntilUltimate stalls.
const BASE_URL = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const unique = () => Date.now() + Math.random().toString(36).slice(2);

async function post(path, body) {
  const t0 = Date.now();
  const r = await fetch(BASE_URL + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json();
  return { ms: Date.now() - t0, status: r.status, data };
}

const code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join("");
const hostKey = "lat-host-" + unique();
const playerKey = "lat-player-" + unique();
await post("/api/room", { code, playerKey: hostKey, intent: "host" });
const join = await post("/api/player/join", { code, playerKey, name: "Lat Target", avatarId: "fox" });
const targetId = join.data.player?.id || join.data.id || (await post("/api/state", { code, role: "host", playerKey: hostKey })).data.players[0].id;
console.log("targetId", targetId);
for (let i = 0; i < 12; i++) {
  const res = await post("/api/host/poke", { code, playerKey: hostKey, playerId: targetId });
  console.log(JSON.stringify({ i, ms: res.ms, status: res.status, kind: res.data.kind, ok: res.data.ok, error: res.data.error }));
  await new Promise((r) => setTimeout(r, 180));
}
