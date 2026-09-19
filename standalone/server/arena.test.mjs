import test from "node:test";
import assert from "node:assert/strict";
import { ARENA_DURATION_MS, ARENA_TARGET_BUFFER, arenaProgress, initialiseArena, nextArenaTarget, pressesRequiredAtLead, tapArena } from "./arena.mjs";

function fixture(random = Math.random) {
  const duel = { challengerId: "a", challengedId: "b", status: "active", gameplayStartsAt: 1000 };
  initialiseArena(duel, random);
  return duel;
}
function tap(duel, player, now = 1001) {
  return tapArena(duel, player, duel.targets[player][0].id, now);
}

test("a five-point lead wins, including a comeback after both pass five", () => {
  const duel = fixture();
  // Trading blow for blow, neither player is ever more than one ahead, so
  // every press is worth a full point at the unescalated rate.
  for (let i = 0; i < 8; i++) {
    assert.equal(tap(duel, "a").winnerId, "");
    assert.equal(tap(duel, "b").winnerId, "");
  }
  assert.deepEqual(duel.hits, { a: 8, b: 8 });

  // b pulls away. The first three points come one press each (leads 0, 1, 2);
  // the fourth costs two presses because b is then three ahead.
  for (let i = 0; i < 5; i++) assert.equal(tap(duel, "b").winnerId, "");
  assert.deepEqual(duel.hits, { a: 8, b: 12 });

  // a claws it back from four behind and on past. The first seven presses are
  // cheap — a is trailing or barely ahead for all of them — and take a to
  // 15-12; the ninth press completes the two-press point owed at a lead of 3.
  for (let i = 0; i < 9; i++) assert.equal(tap(duel, "a").winnerId, "");
  assert.deepEqual(duel.hits, { a: 16, b: 12 });

  // At four ahead the last point costs three presses, and only the third wins.
  assert.equal(tap(duel, "a").winnerId, "");
  assert.equal(tap(duel, "a").winnerId, "");
  assert.equal(tap(duel, "a").winnerId, "a");
  assert.deepEqual(duel.hits, { a: 17, b: 12 });
});

test("closing out a win costs more presses the closer it gets", () => {
  assert.equal(pressesRequiredAtLead(0), 1);
  assert.equal(pressesRequiredAtLead(2), 1);
  assert.equal(pressesRequiredAtLead(3), 2);
  assert.equal(pressesRequiredAtLead(4), 3);
  // Trailing players never pay the surcharge.
  assert.equal(pressesRequiredAtLead(-4), 1);

  const duel = fixture();
  // Three cheap points, then the escalation begins.
  for (let i = 0; i < 3; i++) assert.equal(tap(duel, "a").scored, true);
  assert.equal(duel.hits.a, 3);
  assert.deepEqual([tap(duel, "a").scored, tap(duel, "a").scored], [false, true]);
  assert.equal(duel.hits.a, 4);
  const closing = [tap(duel, "a"), tap(duel, "a"), tap(duel, "a")];
  assert.deepEqual(closing.map(result => result.scored), [false, false, true]);
  assert.equal(closing.at(-1).winnerId, "a");
  // Eight presses for five points: 1 + 1 + 1 + 2 + 3.
  assert.equal(duel.presses.a, 8);
});

test("a part-charged point is dropped when the opponent scores, and cannot be banked", () => {
  const duel = fixture();
  for (let i = 0; i < 3; i++) tap(duel, "a");          // a leads 3-0
  assert.equal(tap(duel, "a").scored, false);          // 1 of the 2 presses a now owes
  assert.equal(duel.charge.a, 1);

  tap(duel, "b");                                      // 3-1: the price drops to one press
  // The banked press is gone. If it carried, this single press would score a
  // point that a only half paid for at the harder rate.
  assert.equal(duel.charge.a, 0);
  assert.equal(tap(duel, "a").scored, true);           // 4-1, paid in full at the new rate
  assert.deepEqual(duel.hits, { a: 4, b: 1 });

  // The same reset applies in the other direction: a press spent toward a
  // cheap point does not part-pay the expensive point that follows it.
  const fresh = fixture();
  for (let i = 0; i < 3; i++) tap(fresh, "a");         // 3-0, a owes two presses
  assert.equal(tap(fresh, "a").scored, false);         // one of them paid
  tap(fresh, "b");                                     // 3-1, the price drops to one
  assert.equal(fresh.charge.a, 0);
  assert.equal(tap(fresh, "a").scored, true);          // 4-1, a cheap point at lead 2
  assert.equal(tap(fresh, "a").scored, false);         // lead 3 again: two presses, from zero
  assert.equal(tap(fresh, "a").scored, true);          // 5-1
  assert.deepEqual(fresh.hits, { a: 5, b: 1 });
});

test("the remaining presses are published so a non-scoring tap reads as the mechanic, not a bug", () => {
  const duel = fixture();
  for (let i = 0; i < 3; i++) tap(duel, "a");
  const ahead = arenaProgress(duel, "a");
  assert.equal(ahead.pressesRequired, 2);
  assert.equal(ahead.pressesDone, 0);
  tap(duel, "a");
  assert.equal(arenaProgress(duel, "a").pressesDone, 1);
  // The trailing player sees the ordinary one-press rate for themselves.
  assert.equal(arenaProgress(duel, "b").pressesRequired, 1);
  // Spectators are told nothing about either competitor's charge.
  const crowd = arenaProgress(duel, "");
  assert.equal(crowd.pressesDone, 0);
  assert.equal(crowd.isParticipant, false);
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
  // Six more presses take an unopposed a to 4-0: two cheap points, then the
  // two-press point at lead 3, then two of the three owed at lead 4.
  for (let i = 0; i < 6; i++) tap(duel, "a");
  assert.equal(duel.hits.a, 4);
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
      // Both of these count presses now, not points: a press near the win may
      // not score, but it still advances the revision and consumes a target.
      assert.equal(duel.revision, 1 + duel.presses.a + duel.presses.b);
      assert.equal(duel.targets[player][0].sequence, duel.presses[player] + 1);
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
