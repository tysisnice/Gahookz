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
const raw = (path, payload) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, ...payload }) }).then(response => response.json());
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
assert.equal(duel.winnerId, "", "A one-point lead at timeout must not break the six-ahead rule");
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

// "Off means no gahooking" reaches the Arena crowd.
//
// Measured on 2026-10-23 before this was fixed: in a room with Gahook effects
// off, a spectator could still land a "congrats"/"ARENA CHAMPION" and a
// "boo"/"GET GOT" overlay on the two duellists through /api/player/duel-react,
// while /api/player/final-poke refused those same two kinds in the same room.
// The Arena's own challenge handshake is the deliberate exception: it is the
// only way a challenge is announced, and the host has a separate switch for it.
const third = randomUUID(), fourth = randomUUID();
for (const [i, playerKey] of [third, fourth].entries()) await post("/api/player/join", { playerKey, name: "Off Arena " + i, avatarId: "frog" });
const fourthId = (await state(fourth)).ownPlayer.id;
await post("/api/host/settings", { playerKey: host, gahookEffects: "off" });
const offRefused = await raw("/api/player/poke", { playerKey: third, playerId: fourthId });
assert.equal(offRefused.ok, false, "an ordinary Gahook must be refused while effects are off");
const offChallenge = await post("/api/player/duel-challenge", { playerKey: third, playerId: fourthId });
assert.equal((await state(fourth)).ownPoke?.kind, "duel-challenge", "the Arena handshake answers to the Arena switch, not the effects policy");
await post("/api/player/duel-accept", { playerKey: fourth, duelId: offChallenge.duelId });
duel = (await state(third)).gahookDuel;
await sleep(Math.max(0, duel.gameplayStartsAt - Date.now()) + 40);
for (let taps = 0; taps < 20 && duel.status === "active"; taps += 1) {
  const tapped = await post("/api/player/duel-tap", { playerKey: third, duelId: offChallenge.duelId, targetId: duel.ownTargets[0].id });
  duel = tapped.duel;
}
assert.equal(duel.status, "finished", "the Arena itself still works with Gahook effects off");
for (const reaction of ["congrats", "boo"]) {
  const refused = await raw("/api/player/duel-react", { playerKey: second, duelId: offChallenge.duelId, reaction });
  assert.equal(refused.ok, false, "the crowd must not land an Arena " + reaction + " while Gahooks are off: " + JSON.stringify(refused));
  assert.match(refused.error, /Gahook effects off/);
}
const booedId = duel.loserId;
const beforeReaction = (await state(host)).players.find((player) => player.id === booedId).latestPokeKind;
await post("/api/host/settings", { playerKey: host, gahookEffects: "chaos" });
await post("/api/player/duel-react", { playerKey: second, duelId: offChallenge.duelId, reaction: "boo" });
assert.equal((await state(host)).players.find((player) => player.id === booedId).latestPokeKind, "boo", "with effects back on the same boo lands, so the refusal was the policy and not a broken route");
assert.notEqual(beforeReaction, "boo", "and it had not landed while they were off");
await post("/api/host/reset", { playerKey: host });
console.log(JSON.stringify({ ok: true, checked: ["challenge expiry", "45-second draw without a six-point lead", "automatic result cleanup", "main game cancels arena", "host exits player seat", "kick preserves result", "Gahook effects off refuses the crowd's Arena reactions"] }, null, 2));
