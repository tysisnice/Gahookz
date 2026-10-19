// P06 acceptance: small-room Herd boundary coverage (2/3/5 players) across
// Quick, Full-room (standard) and Custom presets.
//
// The existing room-flow simulation covers 4/8/12/20 players. The P06
// acceptance line — "complete Quick/Full/Custom plus 2/3/5-player boundary
// coverage" — needs the small rooms where the assignment plan changes shape:
//   2 players: 2 answers/question, the author CANNOT be excluded (1 < 2),
//              so every question is answered by both players.
//   3 players: 3 answers/question, author still cannot be excluded (2 < 3).
//   5 players: 4 answers/question, the author CAN be excluded (4 >= 4) —
//              the first room size where author-exclusion engages.
// Each game asserts, end-to-end over the real HTTP boundary:
//   1. the round count is honest for the preset (Quick caps at 8, Full plays
//      every prompt, Custom plays the configured target);
//   2. writing load is fair (spread <= 1) and every question carries
//      min(4, players) answers;
//   3. every voter always has at least one legal (not-own) answer;
//   4. voting for your own answer is rejected with ownAnswer: true, and the
//      public per-viewer ownAnswer marking matches the server's rejection.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = process.env.GAHOOKZ_BASE_URL || "http://127.0.0.1:3199";
const HERD_QUICK_MAX_ROUNDS = 8;
const HERD_MAX_AUTHORED_ANSWERS = 4;
const CUSTOM_ROUND_TARGET = 2;
const summaries = [];

async function runGame(count, preset) {
  const requestedCode = Array.from({ length: 4 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
  const host = randomUUID();
  let code = requestedCode;
  const post = async (path, body = {}) => {
    const data = await (await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, playerKey: host, ...body }) })).json();
    assert.notEqual(data.ok, false, `${count}p/${preset} ${path}: ${data.error}`);
    return data;
  };
  const postRaw = async (path, body = {}) => (await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, playerKey: host, ...body }) })).json();
  const state = (key = host) => post("/api/state", { playerKey: key, role: key === host ? "host" : "player" });

  const created = await post("/api/room");
  code = created.code || requestedCode;
  const settings = { gameMode: "herd", roundPreset: preset };
  if (preset === "custom") settings.herdRoundTarget = CUSTOM_ROUND_TARGET;
  await post("/api/host/settings", settings);

  const players = Array.from({ length: count }, () => randomUUID());
  for (const [i, key] of players.entries()) await post("/api/player/join", { playerKey: key, name: `Boundary ${i + 1}`, avatarId: "frog" });
  await post("/api/host/lock-setup");
  await post("/api/host/force-start");
  assert.equal((await state()).phase, "herd-writing", `${count}p/${preset}: Herd force-start must enter answer writing`);

  // 2. Writing load and answer capacity, read from each player's own view.
  // The plan's fair share is totalSlots/players: with a capped round count
  // (custom 2) a player may write fewer than min(4, players) answers — the
  // invariant is floor/ceil of the share, not a fixed quota.
  const answersPerQuestion = Math.min(HERD_MAX_AUTHORED_ANSWERS, count);
  const expectedRoundsForPreset = preset === "quick" ? Math.min(count, HERD_QUICK_MAX_ROUNDS) : preset === "custom" ? Math.min(CUSTOM_ROUND_TARGET, count) : count;
  const totalSlots = expectedRoundsForPreset * answersPerQuestion;
  const baseShare = Math.floor(totalSlots / count);
  const loads = [];
  for (const key of players) {
    const own = await state(key);
    const assignments = own.ownHerdAssignments;
    assert.ok(assignments.length === baseShare || assignments.length === baseShare + 1, `${count}p/${preset}: each player must write ${baseShare} or ${baseShare + 1} answers, got ${assignments.length}`);
    loads.push(assignments.length);
    for (const task of assignments) await post("/api/herd/answer", { playerKey: key, questionId: task.questionId, text: `Boundary answer by ${players.indexOf(key)} for ${task.questionId}` });
    await post("/api/player/ready", { playerKey: key, ready: true });
  }
  assert.ok(Math.max(...loads) - Math.min(...loads) <= 1, `${count}p/${preset}: writing load spread must be <= 1, got ${loads}`);

  await post("/api/host/start");
  let snapshot = await state();
  const expectedRounds = preset === "quick" ? Math.min(count, HERD_QUICK_MAX_ROUNDS) : preset === "custom" ? Math.min(CUSTOM_ROUND_TARGET, count) : count;
  assert.equal(snapshot.totalQuestions, expectedRounds, `${count}p/${preset}: honest round count`);

  // 1/3/4. Play the whole game through the real boundary.
  let rounds = 0, votes = 0, ownAnswerRejections = 0;
  for (let guard = 0; snapshot.phase !== "finished" && guard < 200; guard++) {
    if (snapshot.phase === "reading") await post("/api/host/skip");
    else if (snapshot.phase === "answering") {
      for (const [i, key] of players.entries()) {
        const own = await state(key);
        if (own.phase !== "answering" || own.ownAnswer) continue;
        const answers = own.currentQuestion.answers;
        assert.equal(answers.length, Math.min(HERD_MAX_AUTHORED_ANSWERS, count), `${count}p/${preset}: every question carries min(4, players) answers`);
        const legal = answers.filter(answer => !answer.ownAnswer);
        const ownOnes = answers.filter(answer => answer.ownAnswer);
        // 3. No voter is ever left without a legal answer.
        assert.ok(legal.length > 0, `${count}p/${preset}: player ${i} has no legal answer — dead-end round`);
        // 4. The ownAnswer marking the viewer sees must be the same answer the
        //    server refuses: try it, expect the rejection, then vote legally.
        if (ownOnes.length > 0) {
          const rejected = await postRaw("/api/answer", { playerKey: key, answerId: ownOnes[0].id });
          assert.equal(rejected.ok, false, `${count}p/${preset}: own-answer vote must be refused`);
          assert.equal(rejected.ownAnswer, true, `${count}p/${preset}: refusal must carry ownAnswer: true`);
          ownAnswerRejections += 1;
        }
        await post("/api/answer", { playerKey: key, answerId: legal[i % legal.length].id });
        votes++;
      }
      if ((await state()).phase === "answering") await post("/api/host/skip");
    } else if (snapshot.phase === "reveal") {
      rounds++;
      assert.ok(snapshot.leaderboard.every(player => Number.isInteger(player.score)), `${count}p/${preset}: integer scores`);
      await post("/api/host/skip");
    } else throw Error(`${count}p/${preset}: unexpected phase ${snapshot.phase}`);
    snapshot = await state();
  }
  assert.equal(snapshot.phase, "finished", `${count}p/${preset}`);
  assert.equal(rounds, expectedRounds, `${count}p/${preset}: rounds played`);
  assert.equal(snapshot.leaderboard.length, count, `${count}p/${preset}`);
  assert.equal(votes, rounds * count, `${count}p/${preset}: every player voted every round`);
  assert.ok(ownAnswerRejections > 0, `${count}p/${preset}: at least one own-answer attempt must have been exercised`);

  await post("/api/host/reset");
  assert.equal((await state()).phase, "lobby", `${count}p/${preset}: reset returns to lobby`);
  return { players: count, preset, rounds, votes, writingLoads: loads, ownAnswerRejections };
}

for (const count of [2, 3, 5]) {
  for (const preset of ["quick", "standard", "custom"]) {
    summaries.push(await runGame(count, preset));
  }
}
console.log(JSON.stringify({ ok: true, games: summaries.length, summaries }, null, 2));
