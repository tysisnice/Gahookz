import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";
const code = "A" + Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
const host = randomUUID(), first = randomUUID(), second = randomUUID();
async function post(path, payload) {
  const data = await (await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, ...payload }) })).json();
  if (data.ok === false) throw Error(path + ": " + data.error);
  return data;
}
const state = playerKey => post("/api/state", { playerKey, role: playerKey === host ? "host" : "player" });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function challenge(a = first, b = second) {
  for (let i = 0; i < 10; i++) await post("/api/player/poke", { playerKey: a, playerId: b });
  const offer = (await state(b)).ownCounterOffer;
  await post("/api/player/counter-poke", { playerKey: b, offerId: offer.id });
  return post("/api/player/duel-challenge", { playerKey: a });
}
async function start(a = first, b = second) {
  const offered = await challenge(a, b);
  await post("/api/player/duel-accept", { playerKey: b, duelId: offered.duelId });
  return (await state(a)).gahookDuel;
}
await post("/api/room", { playerKey: host });
for (const [i, playerKey] of [first, second].entries()) await post("/api/player/join", { playerKey, name: "Arena Player " + i, avatarId: "frog" });

// An unanswered challenge must release the arena, so a new one can be offered.
const unaccepted = await challenge();
await sleep(Math.max(0, unaccepted.challengeExpiresAt - Date.now()) + 100);
let duel = await start();
await sleep(Math.max(0, duel.gameplayStartsAt - Date.now()) + 30);
await post("/api/player/duel-tap", { playerKey: first, duelId: duel.id, targetId: duel.ownTargets[0].id });
await sleep(Math.max(0, duel.endsAt - Date.now()) + 100);
duel = (await state(host)).gahookDuel;
assert.equal(duel.status, "finished");
assert.equal(duel.resultReason, "time");
assert.equal(duel.winnerId, "", "A one-tap lead at timeout must not break the five-ahead rule");
assert.equal(duel.loserId, "");
await sleep(Math.max(0, duel.reactionEndsAt - Date.now()) + 100);
assert.equal((await state(host)).gahookDuel, null, "The result should clear without another command");

// Starting the main game cancels the side-game and its timers.
await start();
await post("/api/host/lock-setup", { playerKey: host });
await post("/api/host/force-start", { playerKey: host });
assert.equal((await state(host)).gahookDuel, null);
await post("/api/host/reset", { playerKey: host });

// A host leaving their player seat must settle the duel for the opponent.
await post("/api/player/join", { playerKey: host, name: "Arena Host", avatarId: "crown" });
await start(host, first);
const firstId = (await state(first)).ownPlayer.id;
await post("/api/host/exit-player", { playerKey: host });
duel = (await state(first)).gahookDuel;
assert.equal(duel.status, "finished");
assert.equal(duel.winnerId, firstId);
assert.equal(duel.resultReason, "left");
assert.equal(duel.players.length, 2, "The departed profile should remain in the result");
await post("/api/host/reset", { playerKey: host });

// Kicking a competitor must not strand the remaining player's overlay.
await start();
await post("/api/host/kick", { playerKey: host, playerId: firstId });
duel = (await state(second)).gahookDuel;
assert.equal(duel.status, "finished");
assert.equal(duel.winnerId, (await state(second)).ownPlayer.id);
assert.equal(duel.players.length, 2);
assert.equal(duel.ownTargets.length, 0);
await post("/api/host/reset", { playerKey: host });
console.log(JSON.stringify({ ok: true, checked: ["challenge expiry", "45-second draw without a five-tap lead", "automatic result cleanup", "main game cancels arena", "host exits player seat", "kick preserves result"] }, null, 2));
