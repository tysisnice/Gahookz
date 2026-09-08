import test from "node:test";
import assert from "node:assert/strict";
import { ARENA_DURATION_MS, ARENA_TARGET_BUFFER, arenaProgress, initialiseArena, nextArenaTarget, tapArena } from "./arena.mjs";

function fixture(random = Math.random) {
  const duel = { challengerId: "a", challengedId: "b", status: "active", gameplayStartsAt: 1000 };
  initialiseArena(duel, random);
  return duel;
}
function tap(duel, player, now = 1001) {
  return tapArena(duel, player, duel.targets[player][0].id, now);
}

test("five MORE taps wins, including a comeback after both pass five", () => {
  const duel = fixture();
  for (let i = 0; i < 8; i++) {
    assert.equal(tap(duel, "a").winnerId, "");
    assert.equal(tap(duel, "b").winnerId, "");
  }
  for (let i = 0; i < 4; i++) assert.equal(tap(duel, "b").winnerId, "");
  for (let i = 0; i < 8; i++) assert.equal(tap(duel, "a").winnerId, "");
  assert.equal(tap(duel, "a").winnerId, "a");
  assert.deepEqual(duel.hits, { a: 17, b: 12 });
});

test("countdown, timeout, invalid ids, reordered targets and spectators cannot score", () => {
  const duel = fixture();
  const target = duel.targets.a[0];
  for (const [player, token, now] of [
    ["a", target.id, 999], ["a", target.id, duel.endsAt],
    ["a", null, 1001], ["a", {}, 1001], ["a", "forged", 1001],
    ["a", duel.targets.a[1].id, 1001], ["b", target.id, 1001], ["spectator", target.id, 1001]
  ]) assert.equal(tapArena(duel, player, token, now).ok, false);
  assert.deepEqual(duel.hits, { a: 0, b: 0 });
  assert.equal(tapArena(duel, "a", target.id, 1000).ok, true);
  assert.equal(duel.endsAt, 1000 + ARENA_DURATION_MS);
});

test("retrying an acknowledged or winning target never scores twice", () => {
  const duel = fixture();
  const token = duel.targets.a[0].id;
  assert.equal(tapArena(duel, "a", token, 1000).ok, true);
  assert.equal(tapArena(duel, "a", token, 1001).duplicate, true);
  assert.equal(duel.hits.a, 1);
  for (let i = 0; i < 3; i++) tap(duel, "a");
  const winning = duel.targets.a[0].id;
  assert.equal(tapArena(duel, "a", winning, 1001).winnerId, "a");
  duel.status = "finished";
  assert.equal(tapArena(duel, "a", winning, 1002).duplicate, true);
  assert.equal(tap(duel, "b").ok, false);
  assert.equal(duel.hits.a, 5);
});

test("targets stay private to their player and snapshots do not alias engine state", () => {
  const duel = fixture();
  const a = arenaProgress(duel, "a"), b = arenaProgress(duel, "b"), crowd = arenaProgress(duel, "");
  assert.equal(a.ownTargets.length, ARENA_TARGET_BUFFER);
  assert.equal(crowd.ownTargets.length, 0);
  assert.equal(crowd.isParticipant, false);
  assert(!a.ownTargets.some(target => b.ownTargets.some(other => other.id === target.id)));
  a.ownTargets[0].x = -1;
  a.hits.a = 99;
  assert(duel.targets.a[0].x >= 0);
  assert.equal(duel.hits.a, 0);
  duel.status = "finished";
  assert.deepEqual(arenaProgress(duel, "a").ownTargets, []);
});

test("target placement terminates even for fixed randomness and always moves", () => {
  let previous = null;
  for (let sequence = 1; sequence <= 1000; sequence++) {
    const target = nextArenaTarget(previous, sequence, () => 0.5);
    assert(target.x >= 0 && target.x <= 1 && target.y >= 0 && target.y <= 1);
    if (previous) assert(Math.hypot(target.x - previous.x, target.y - previous.y) >= 0.38);
    previous = target;
  }
});

test("2,000 seeded tap races keep scores, ordered buffers, bounded memory and winners consistent", () => {
  let seed = 0x7a9b;
  const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 2 ** 32; };
  let wins = 0, draws = 0, taps = 0;
  for (let game = 0; game < 2000; game++) {
    const duel = fixture(random);
    const skillA = 0.3 + random() * 0.4;
    let time = 1000;
    while (time < duel.endsAt) {
      const player = random() < skillA ? "a" : "b";
      const result = tap(duel, player, time);
      assert(result.ok);
      taps++;
      assert.equal(duel.revision, 1 + duel.hits.a + duel.hits.b);
      assert.equal(duel.targets[player][0].sequence, duel.hits[player] + 1);
      assert.equal(duel.targets[player].length, ARENA_TARGET_BUFFER);
      assert(duel.acceptedTargets[player].length <= ARENA_TARGET_BUFFER * 2);
      if (result.winnerId) {
        assert.equal(Math.abs(duel.hits.a - duel.hits.b), 5);
        wins++;
        break;
      }
      assert(Math.abs(duel.hits.a - duel.hits.b) < 5);
      time += 80 + Math.floor(random() * 500);
    }
    if (time >= duel.endsAt) draws++;
  }
  assert.equal(wins + draws, 2000);
  console.log(JSON.stringify({ arenaSimulations: 2000, wins, draws, taps, seed: "0x7a9b" }));
});
